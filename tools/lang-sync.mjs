/**
 * Japanese translation maintenance helper.
 *
 * The English original lives upstream (Foundryborne/daggerheart), not in this
 * repository, so these commands read it from lang/.reference/en.json, which
 * `npm run reference` fetches and pins.
 *
 * `report`  shows how far lang/ja.json has drifted from the upstream original after a
 *           new upstream release: keys to translate, keys upstream has dropped, and
 *           values still sitting on the English fallback.
 * `prepare` writes that drift to lang/translation/pending.json, pre-filling any
 *           value an approved glossary in lang/translation/glossary/ already
 *           answers, so only the genuinely new strings need a translator.
 * `diff`    compares an external Japanese translation (any glossary CSV) against
 *           the wordings lang/ja.json already uses and writes only the keys where
 *           the two disagree, so an outside translation can be reviewed key by key
 *           instead of being trusted wholesale.
 * `apply`   merges lang/translation/pending.json back into lang/ja.json and
 *           rebuilds it in en.json's key order, dropping retired keys.
 *
 * Nothing here reaches out to the network. Glossaries are plain CSV checked in
 * by hand, so every imported wording stays reviewable in git history.
 */

import fs from 'fs/promises';
import path from 'path';

import { establishedWordings, flatten, GLOSSARY_DIR, loadGlossaries, loadGlossaryFiles, normalize } from './glossary.mjs';
import { freshness, hash, readSources, writeSources } from './sources.mjs';

const LANG = 'lang';
/*
 * The English original is upstream's, not ours, so it is fetched rather than
 * committed (tools/fetch-reference.mjs). Everything here reads it as the
 * reference for which keys exist and in what order.
 */
const REFERENCE = path.join(LANG, '.reference', 'en.json');
const TRANSLATION = path.join(LANG, 'translation');
const PENDING = path.join(TRANSLATION, 'pending.json');

/* Strings that are the same in both languages by design. */
const NOT_TRANSLATABLE = /^(\s*|Daggerheart|Wiki|Discord|Lv|[A-Z]{1,3}|(?:\{\w+\}|\W)+)$/;

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

/* Read the fetched upstream original, with a pointer to how to get it. */
async function readReference() {
    try {
        return await readJson(REFERENCE);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        throw new Error(`${REFERENCE} is missing. Run \`npm run reference\` to fetch it from upstream.`);
    }
}

/** Rebuild a flat key->value map into en.json's nested shape and key order. */
function nest(reference, values, prefix = '') {
    const out = {};
    for (const [key, value] of Object.entries(reference)) {
        const full = prefix + key;
        if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = nest(value, values, `${full}.`);
        else out[key] = values[full] ?? value;
    }
    return out;
}

async function analyze() {
    const en = flatten(await readReference());
    const ja = flatten(await readJson(path.join(LANG, 'ja.json')));

    const untranslated = Object.keys(en).filter(key => !(key in ja));
    const retired = Object.keys(ja).filter(key => !(key in en));
    const fallback = Object.keys(en).filter(
        key => key in ja && typeof en[key] === 'string' && en[key] === ja[key] && !NOT_TRANSLATABLE.test(en[key])
    );

    /* ja.json's own en->ja pairs are the house style, and outrank any glossary. */
    const established = establishedWordings(en, ja);

    /*
     * Keys whose English upstream has rewritten since the Japanese was written.
     * The key set says nothing about these -- see tools/sources.mjs.
     */
    const record = await readSources('ui');
    const reworded = [];
    const unstamped = [];
    for (const key of Object.keys(en)) {
        if (typeof en[key] !== 'string' || typeof ja[key] !== 'string') continue;
        if (en[key] === ja[key]) continue;
        const state = freshness(record, key, en[key]);
        if (state === 'reworded') reworded.push(key);
        else if (state === 'unstamped') unstamped.push(key);
    }

    return { en, ja, untranslated, retired, fallback, established, reworded, unstamped, record };
}

const options = process.argv.slice(3);
const flag = name => {
    const hit = options.find(option => option === `--${name}` || option.startsWith(`--${name}=`));
    return hit === undefined ? undefined : (hit.split('=')[1] ?? true);
};

const commands = {
    async report() {
        const { en, ja, untranslated, retired, fallback, reworded, unstamped } = await analyze();
        const { sources } = await loadGlossaries();
        console.log(`en.json keys:     ${Object.keys(en).length}`);
        console.log(`to translate:     ${untranslated.length}`);
        console.log(`retired upstream: ${retired.length}`);
        console.log(`English fallback: ${fallback.length}`);
        console.log(`reworded upstream: ${reworded.length}`);
        if (unstamped.length) console.log(`unstamped:        ${unstamped.length} (run \`lang-sync stamp\`)`);
        console.log(
            `glossaries:       ${sources.length ? sources.map(s => `${s.file} (${s.entries})`).join(', ') : 'none'}`
        );
        for (const key of [...untranslated, ...fallback].slice(0, 20)) console.log(`  ${key}: ${en[key]}`);
        /*
         * Reworded keys are listed in full, not capped: each one is a shipped
         * Japanese string that now answers a different English sentence, and
         * nothing else in this tool will mention it again.
         */
        for (const key of reworded) {
            console.log(`  reworded ${key}`);
            console.log(`    en: ${en[key]}`);
            console.log(`    ja: ${ja[key]}`);
        }
    },

    async prepare() {
        const { en, ja, untranslated, retired, fallback, established, reworded } = await analyze();
        const { glossary, sources } = await loadGlossaries();

        const pending = {};
        let prefilled = 0;
        for (const key of [...untranslated, ...fallback]) {
            const english = String(en[key]);
            const known = (established.get(normalize(english)) ?? glossary.get(normalize(english)))?.japanese;
            if (known) prefilled++;
            pending[key] = { en: english, ja: known ?? '' };
        }

        /*
         * A reworded key already has Japanese, so it carries `was`: the wording
         * that answered the old English. Leaving `ja` empty keeps the shipped
         * translation in place until someone decides on the new one -- `apply`
         * skips empty values -- so this never blanks a string by itself.
         */
        for (const key of reworded) pending[key] = { en: String(en[key]), was: ja[key], ja: '' };

        await fs.writeFile(PENDING, `${JSON.stringify({ retired, pending }, null, 4)}\n`);
        console.log(
            `${PENDING}: ${Object.keys(pending).length} entries` +
                `${reworded.length ? ` (${reworded.length} reworded upstream)` : ''}, ${prefilled} pre-filled from`
        );
        console.log(`  established ja.json wordings and ${sources.length} glossary file(s)`);
        console.log(`Fill in the empty "ja" values, then run: node tools/lang-sync.mjs apply`);
    },

    /**
     * Review an outside Japanese translation against the one in lang/ja.json.
     *
     * Only the keys where the two disagree are written out, each carrying the
     * wording already shipped and the one the glossary proposes, so adopting a
     * foreign translation stays a per-key decision with both options visible.
     * Normalized comparison keeps pure punctuation drift out of the list.
     *
     *   --only=<substring>  compare against just the glossaries whose filename matches
     *   --from=<path>       compare against a CSV that has NOT been placed in
     *                       the glossary directory, so no other tool starts
     *                       using a source that has not been adopted
     *   --count             report only, writing nothing: the terms that would
     *                       change, and how many keys each one touches
     *   --adopt             pre-fill `ja` with the suggestion, so rejecting means
     *                       clearing a value instead of copying one
     */
    async diff() {
        const { en, ja } = await analyze();
        const only = flag('only');
        const from = flag('from');
        const countOnly = Boolean(flag('count'));
        const adopt = Boolean(flag('adopt'));

        if (only && from) {
            console.error('--only= and --from= name the same thing twice; pass one.');
            process.exit(1);
        }

        const { glossary, sources } = from
            ? await loadGlossaryFiles([from])
            : await loadGlossaries(typeof only === 'string' ? only : undefined);

        if (!sources.length) {
            console.error(
                only ? `No glossary in ${GLOSSARY_DIR} matches "${only}".` : `No glossary found in ${GLOSSARY_DIR}.`
            );
            process.exit(1);
        }

        const pending = {};
        const bySource = new Map();
        for (const [key, english] of Object.entries(en)) {
            if (typeof english !== 'string' || typeof ja[key] !== 'string') continue;
            const entry = glossary.get(normalize(english));
            if (!entry || normalize(entry.japanese) === normalize(ja[key])) continue;
            pending[key] = {
                en: english,
                current: ja[key],
                suggest: entry.japanese,
                source: entry.file,
                ja: adopt ? entry.japanese : ''
            };
            bySource.set(entry.file, (bySource.get(entry.file) ?? 0) + 1);
        }

        const total = Object.keys(pending).length;

        /* Grouped by wording, because the decision is per term and not per key. */
        const byTerm = new Map();
        for (const entry of Object.values(pending)) {
            const term = byTerm.get(normalize(entry.en)) ?? { en: entry.en, suggest: entry.suggest, keys: 0 };
            term.keys += 1;
            byTerm.set(normalize(entry.en), term);
        }

        console.log(`compared against: ${sources.map(source => `${source.file} (${source.entries})`).join(', ')}`);

        if (countOnly) {
            console.log(`${byTerm.size} term(s) differ, across ${total} key(s)\n`);
            for (const term of [...byTerm.values()].toSorted((a, b) => b.keys - a.keys))
                console.log(`${String(term.keys).padStart(5)}  ${term.en}\n         new: ${term.suggest}`);
            console.log(`\nNothing written. Drop --count to write the ${total} key(s) to ${PENDING}.`);
            return;
        }

        await fs.writeFile(PENDING, `${JSON.stringify({ retired: [], pending }, null, 4)}\n`);
        console.log(`${PENDING}: ${total} key(s) where the glossary differs from lang/ja.json`);
        for (const [file, count] of bySource) console.log(`  ${count} from ${file}`);
        console.log(
            adopt
                ? 'Suggestions are pre-filled. Clear the "ja" value of every one you reject, then run: node tools/lang-sync.mjs apply'
                : 'Copy "suggest" into "ja" for each one you accept, then run: node tools/lang-sync.mjs apply'
        );
        for (const [key, entry] of Object.entries(pending).slice(0, 20))
            console.log(`  ${key}\n    now: ${entry.current}\n    new: ${entry.suggest}`);
    },

    async apply() {
        const reference = await readReference();
        const ja = flatten(await readJson(path.join(LANG, 'ja.json')));
        const { pending } = await readJson(PENDING);

        const en = flatten(reference);
        const record = await readSources('ui');

        let applied = 0;
        for (const [key, entry] of Object.entries(pending)) {
            if (!entry.ja?.trim()) continue;
            ja[key] = entry.ja;
            /* Record which English this wording answers, for `report` to re-check. */
            if (typeof en[key] === 'string') record[key] = hash(en[key]);
            applied++;
        }
        /* Keys upstream has dropped keep no record. */
        for (const key of Object.keys(record)) if (!(key in en)) delete record[key];
        await writeSources('ui', record);

        /* Nesting against en.json drops retired keys and restores upstream ordering. */
        await fs.writeFile(path.join(LANG, 'ja.json'), `${JSON.stringify(nest(reference, ja), null, 4)}\n`);
        const skipped = Object.keys(pending).length - applied;
        console.log(`lang/ja.json updated: ${applied} applied${skipped ? `, ${skipped} left as-is` : ''}`);
    },

    /**
     * Declare every translation currently in lang/ja.json correct for the
     * English it sits against, recording the hash so later rewrites stand out.
     *
     * This is a baseline, needed once because the translations predate the
     * recording. After that `apply` keeps the record up to date on its own, and
     * running `stamp` again would bless whatever drift has accumulated -- so it
     * reports what it is about to accept and takes --force to do it.
     */
    async stamp() {
        const { en, ja, reworded, unstamped } = await analyze();
        if (reworded.length && !flag('force')) {
            console.error(`${reworded.length} key(s) are reworded upstream; stamping would accept the old Japanese.`);
            console.error('Retranslate them (prepare/apply), or pass --force to accept them as they are.');
            process.exit(1);
        }

        const record = await readSources('ui');
        let stamped = 0;
        for (const key of Object.keys(en)) {
            if (typeof en[key] !== 'string' || typeof ja[key] !== 'string' || en[key] === ja[key]) continue;
            const next = hash(en[key]);
            if (record[key] === next) continue;
            record[key] = next;
            stamped++;
        }
        for (const key of Object.keys(record)) if (!(key in en)) delete record[key];
        await writeSources('ui', record);
        console.log(`${stamped} key(s) stamped${unstamped.length ? ` (${unstamped.length} had no record)` : ''}`);
    }
};

const command = process.argv[2] ?? 'report';
if (!commands[command]) {
    console.error(`Usage: node tools/lang-sync.mjs [${Object.keys(commands).join('|')}]`);
    process.exit(1);
}
await commands[command]();
