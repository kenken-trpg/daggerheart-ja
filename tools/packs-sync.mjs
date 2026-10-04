/**
 * Compendium (packs) translation maintenance, the counterpart to lang-sync.mjs.
 *
 * Where lang-sync tracks UI strings against upstream's en.json, this tracks the
 * compendium content against upstream's src/packs, and writes it in the shape
 * Babele loads: babele/ja/<collection>.json, keyed by document `_id`.
 *
 * `export`  rebuilds those files from the fetched upstream packs, carrying every
 *           existing translation over. It never drops a translation, the same
 *           guarantee lang-sync's `apply` gives.
 * `prepare` writes everything still untranslated to a working file for a
 *           translator to fill in.
 * `apply`   merges that working file back into babele/ja/.
 * `report` shows coverage per pack: translated, untranslated, and entries
 *          upstream has since removed.
 * `check`  verifies that a translation has not broken what must survive it --
 *          Foundry enrichers (@UUID[...], @Lookup[...], [[/dr ...]]) have to
 *          appear in the translation exactly as often as in the original.
 *
 * An untranslated field is left OUT of the file, never written as "". Babele
 * applies whatever the file contains, so an empty string blanks the original --
 * the entry renders with no name at all. This cost a live debugging session.
 *
 * Keys are `_id`, not names, because upstream renames entries and adds hundreds
 * per quarter; an id survives a rename. The cost is that the files stop being
 * readable, so each entry carries `_note` with the English original. Babele
 * ignores keys its mapping does not know, so `_note` rides along harmlessly.
 *
 * Nothing here reaches the network; run tools/fetch-reference.mjs first.
 */

import fs from 'fs/promises';
import path from 'path';

const REFERENCE_PACKS = path.join('lang', '.reference', 'packs');
const PINNED = path.join('lang', '.reference', 'pinned.json');
const BABELE_DIR = path.join('babele', 'ja');
const PENDING = path.join('lang', 'translation', 'packs-pending.json');

/*
 * Source directory -> the compendium collection Babele keys files by. Mostly the
 * directory name, except the four packs upstream nests under items/.
 */
const PACKS = {
    classes: 'daggerheart.classes',
    subclasses: 'daggerheart.subclasses',
    domains: 'daggerheart.domains',
    ancestries: 'daggerheart.ancestries',
    communities: 'daggerheart.communities',
    'items/weapons': 'daggerheart.weapons',
    'items/armors': 'daggerheart.armors',
    'items/consumables': 'daggerheart.consumables',
    'items/loot': 'daggerheart.loot',
    adversaries: 'daggerheart.adversaries',
    environments: 'daggerheart.environments',
    journals: 'daggerheart.journals',
    rolltables: 'daggerheart.rolltables',
    beastforms: 'daggerheart.beastforms',
    transformations: 'daggerheart.transformations'
};

/* Which packs `export` currently writes. Widened one at a time as each is proven. */
const ENABLED = ['transformations', 'communities', 'ancestries', 'adversaries', 'environments'];

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

const ENRICHER = /@[A-Za-z]+\[[^\]]*\]|\[\[[^\]]*\]\]/g;

/**
 * Read one source pack directory, splitting the folder definitions out of the
 * documents. Babele translates folders by NAME under a separate `folders` key,
 * so a folder is not an entry; leaving it in makes the file claim an id the
 * compendium does not have.
 */
async function readPack(pack) {
    const dir = path.join(REFERENCE_PACKS, pack);
    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json')).sort();
    const all = await Promise.all(files.map(f => readJson(path.join(dir, f))));
    return {
        documents: all.filter(d => !String(d._key ?? '').startsWith('!folders!')),
        folders: all.filter(d => String(d._key ?? '').startsWith('!folders!'))
    };
}

/*
 * The only two effect-change keys that hold prose. Every other key carries a
 * number, a dice expression or a roll formula ("1 + @system.tier",
 * "ceil(@system.traits.agility.value / 2)"), and translating one would break the
 * effect rather than localize it. This is an allowlist on purpose: a heuristic
 * that tried to spot formulas would still let "d10" and "2" through.
 */
const TRANSLATABLE_CHANGE_KEYS = new Set(['system.advantageSources', 'system.disadvantageSources']);

/** Collect name/description off a plain object, skipping what is empty. */
function nameAndDescription(source = {}) {
    const entry = {};
    if (source.name) entry.name = source.name;
    if (source.description) entry.description = source.description;
    return entry;
}

/** Map over a keyed container, keeping only the members with something to translate. */
function keyedFields(container = {}, pick = nameAndDescription) {
    return Object.entries(container ?? {}).reduce((acc, [key, value]) => {
        const entry = pick(value);
        if (Object.keys(entry).length) acc[key] = entry;
        return acc;
    }, {});
}

/**
 * An ActiveEffect's translatable shape. `changes` is positional: Babele matches
 * an array translation by index, so the array must stay the same length as the
 * original and carry null where nothing is translated.
 */
function effectFields(effect) {
    const entry = nameAndDescription(effect);

    const changes = effect.system?.changes ?? [];
    if (changes.some(change => TRANSLATABLE_CHANGE_KEYS.has(change.key) && change.value)) {
        entry.changes = changes.map(change =>
            TRANSLATABLE_CHANGE_KEYS.has(change.key) && change.value ? change.value : null
        );
    }

    return entry;
}

/**
 * The translatable shape of one document, as the Babele mapping sees it.
 * Field names here must match babele/ja/mappings.json.
 *
 * Fields deliberately left out, checked against the data rather than assumed:
 *   system.featureForm       the enum 'passive'
 *   system.loreReference     lowercase slugs (warborne, frostborne, ...)
 *   system.type / size       enums (solo, horde, ... / large, medium, ...)
 *   system.features          UUIDs pointing at other documents
 *   potentialAdversaries[].adversaries  the same, as a list
 * Translating any of these breaks the reference rather than localizing it.
 */
function translatableFields(document) {
    const fields = { name: document.name ?? '' };
    const system = document.system ?? {};

    for (const field of ['description', 'motivesAndTactics', 'impulses', 'notes']) {
        if (system[field]) fields[field] = system[field];
    }

    const attack = nameAndDescription(system.attack ?? {});
    if (Object.keys(attack).length) fields.attack = attack;

    const experiences = keyedFields(system.experiences);
    if (Object.keys(experiences).length) fields.experiences = experiences;

    const potentialAdversaries = keyedFields(system.potentialAdversaries, group =>
        group?.label ? { label: group.label } : {}
    );
    if (Object.keys(potentialAdversaries).length) fields.potentialAdversaries = potentialAdversaries;

    const actions = keyedFields(system.actions);
    if (Object.keys(actions).length) fields.actions = actions;

    const effects = (document.effects ?? []).reduce((acc, effect) => {
        const entry = effectFields(effect);
        if (Object.keys(entry).length) acc[effect._id] = entry;
        return acc;
    }, {});
    if (Object.keys(effects).length) fields.effects = effects;

    /* Embedded items are documents in their own right, so they recurse. */
    const items = (document.items ?? []).reduce((acc, item) => {
        const entry = translatableFields(item);
        /* `name` is always present; an item with only a name still needs translating. */
        if (Object.keys(entry).length) acc[item._id] = entry;
        return acc;
    }, {});
    if (Object.keys(items).length) fields.items = items;

    return fields;
}

/**
 * Keep the translations that exist for one document, dropping everything else.
 * Fields with no translation must be absent, not empty -- see the header.
 *
 * It recurses on whatever the ORIGINAL says is a container, at any depth. An
 * earlier version assumed containers were always exactly two levels deep, which
 * worked for `experiences.<id>.name` and quietly shredded the one-level
 * `attack.name`: it walked the string "Claws" character by character and wrote
 * {"0": "\u722a"}.
 */
function carryOver(original, existing) {
    if (Array.isArray(original)) {
        /*
         * Positional (effect changes): keep the length, carry over only the
         * positions that have a translation, null everywhere else.
         */
        const carried = original.map((slot, index) => (slot ? existing?.[index] || null : null));
        return carried.some(Boolean) ? carried : undefined;
    }

    if (original && typeof original === 'object') {
        const kept = {};
        for (const [field, value] of Object.entries(original)) {
            const carried = carryOver(value, existing?.[field]);
            if (typeof carried !== 'undefined') kept[field] = carried;
        }
        return Object.keys(kept).length ? kept : undefined;
    }

    return typeof existing === 'string' && existing ? existing : undefined;
}

/** Walk a nested entry, yielding [path, originalText, translatedText]. */
function* leaves(original, translated, trail = []) {
    for (const [field, value] of Object.entries(original)) {
        if (Array.isArray(value)) {
            /* Only the positions holding text count; the nulls are untranslatable slots. */
            for (const [index, slot] of value.entries()) {
                if (slot) yield [[...trail, field, index].join('.'), slot, translated?.[field]?.[index] ?? ''];
            }
        } else if (value && typeof value === 'object') {
            yield* leaves(value, translated?.[field] ?? {}, [...trail, field]);
        } else {
            yield [[...trail, field].join('.'), value, translated?.[field] ?? ''];
        }
    }
}

async function buildPack(pack) {
    const collection = PACKS[pack];
    const file = path.join(BABELE_DIR, `${collection}.json`);
    const previous = await readJson(file).catch(error => {
        if (error.code === 'ENOENT') return { entries: {} };
        throw error;
    });

    const { documents, folders } = await readPack(pack);
    const entries = {};
    for (const document of documents) {
        const original = translatableFields(document);
        entries[document._id] = {
            /* Not a mapped field: it is here so a diff of this file can be read. */
            _note: document.name,
            ...(carryOver(original, previous.entries?.[document._id]) ?? {})
        };
    }

    /* Folders are keyed by their English name, which is how Babele looks them up. */
    const folderNames = Object.fromEntries(
        folders.map(folder => [folder.name, previous.folders?.[folder.name] ?? ''])
    );

    return { collection, file, previous, documents, entries, folderNames };
}

/** Drop the not-yet-translated entries of a flat name->translation map. */
const strip = map => Object.fromEntries(Object.entries(map).filter(([, value]) => value));

const commands = {
    async export() {
        const pinned = await readJson(PINNED);
        await fs.mkdir(BABELE_DIR, { recursive: true });

        for (const pack of ENABLED) {
            const { collection, file, previous, documents, entries, folderNames } = await buildPack(pack);
            const retired = Object.keys(previous.entries ?? {}).filter(id => !entries[id]);

            await fs.writeFile(
                file,
                `${JSON.stringify(
                    {
                        label: collection.split('.')[1],
                        collection,
                        /* Which upstream version this file was last derived from. */
                        _upstream: `${pinned.upstream}@${pinned.version}`,
                        ...(Object.values(folderNames).some(Boolean) ? { folders: strip(folderNames) } : {}),
                        entries
                    },
                    null,
                    4
                )}\n`
            );

            console.log(
                `${collection}: ${documents.length} entries${retired.length ? `, ${retired.length} dropped by upstream` : ''}`
            );
        }
    },

    /**
     * Write every field that still has no translation to a working file, in the
     * same shape as the Babele files so `apply` can merge it straight back.
     */
    async prepare() {
        const pending = {};
        let count = 0;

        for (const pack of ENABLED) {
            const { collection, file, documents } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));
            const entries = {};

            for (const document of documents) {
                const original = translatableFields(document);
                const translation = current.entries?.[document._id] ?? {};
                const missing = {};

                for (const [where, source, value] of leaves(original, translation)) {
                    if (!source || value) continue;
                    /* `en` is the text to translate; fill `ja` in beside it. */
                    missing[where] = { en: source, ja: '' };
                    count += 1;
                }

                if (Object.keys(missing).length) {
                    entries[document._id] = { _note: document.name, ...missing };
                }
            }

            if (Object.keys(entries).length) pending[collection] = entries;
        }

        await fs.writeFile(PENDING, `${JSON.stringify(pending, null, 4)}\n`);
        console.log(`${count} field(s) to translate -> ${PENDING}`);
        console.log('Fill in the empty "ja" values, then run: node tools/packs-sync.mjs apply');
    },

    /** Merge the filled-in working file back into the Babele files. */
    async apply() {
        const pending = await readJson(PENDING).catch(error => {
            if (error.code === 'ENOENT') throw new Error(`${PENDING} is missing. Run \`prepare\` first.`);
            throw error;
        });

        let applied = 0;
        for (const pack of ENABLED) {
            const { collection, file, documents, entries, folderNames } = await buildPack(pack);
            const filled = pending[collection] ?? {};

            for (const [id, fields] of Object.entries(filled)) {
                for (const [where, value] of Object.entries(fields)) {
                    if (where === '_note' || !value?.ja) continue;
                    /* "actions.<id>.name" -> entries[id].actions.<id>.name */
                    /*
                     * "effects.<id>.changes.2" -> entries[id].effects[<id>].changes[2].
                     * A numeric segment means the container must be an array, not an
                     * object: Babele matches array translations by index, and an
                     * object there would silently translate nothing.
                     */
                    const trail = where.split('.');
                    const isIndex = segment => /^\d+$/.test(segment);
                    const last = trail.pop();
                    const target = trail.reduce(
                        (node, key, position) => (node[key] ??= isIndex(trail[position + 1] ?? last) ? [] : {}),
                        (entries[id] ??= {})
                    );
                    target[isIndex(last) ? Number(last) : last] = value.ja;
                    applied += 1;
                }
            }

            const pinned = await readJson(PINNED);
            await fs.writeFile(
                file,
                `${JSON.stringify(
                    {
                        label: collection.split('.')[1],
                        collection,
                        _upstream: `${pinned.upstream}@${pinned.version}`,
                        ...(Object.values(folderNames).some(Boolean) ? { folders: strip(folderNames) } : {}),
                        entries
                    },
                    null,
                    4
                )}\n`
            );
            console.log(`${collection}: ${documents.length} entries written`);
        }

        console.log(`\n${applied} translation(s) applied`);
    },

    async report() {
        let totals = { translated: 0, untranslated: 0, retired: 0 };
        for (const pack of ENABLED) {
            const { collection, file, documents } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));
            let translated = 0;
            let untranslated = 0;
            /*
             * Count against the upstream documents, not against the file: a field
             * only counts when upstream actually has text there to translate.
             */
            for (const document of documents) {
                const original = translatableFields(document);
                const translation = current.entries?.[document._id] ?? {};
                for (const [, source, value] of leaves(original, translation)) {
                    if (!source) continue;
                    if (value) translated += 1;
                    else untranslated += 1;
                }
            }
            const ids = new Set(documents.map(d => d._id));
            const retired = Object.keys(current.entries ?? {}).filter(id => !ids.has(id)).length;
            totals.retired += retired;
            totals.translated += translated;
            totals.untranslated += untranslated;
            const total = translated + untranslated;
            const percent = total ? Math.round((translated / total) * 100) : 100;
            console.log(
                `${collection.padEnd(28)} ${String(percent).padStart(3)}%  ${translated}/${total} fields` +
                    (retired ? `  (${retired} retired upstream)` : '')
            );
        }
        console.log(
            `\npacks enabled:    ${ENABLED.length}/${Object.keys(PACKS).length}` +
                `\ntranslated:       ${totals.translated}` +
                `\nto translate:     ${totals.untranslated}` +
                `\nretired upstream: ${totals.retired}`
        );
    },

    async check() {
        let problems = 0;
        for (const pack of ENABLED) {
            const { collection, file, documents } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));

            for (const document of documents) {
                const original = translatableFields(document);
                const translation = current.entries?.[document._id] ?? {};

                for (const [where, source, value] of leaves(original, translation)) {
                    if (!value) continue;

                    const inSource = (String(source).match(ENRICHER) ?? []).sort();
                    const inValue = (String(value).match(ENRICHER) ?? []).sort();
                    if (inSource.join('\u0000') !== inValue.join('\u0000')) {
                        problems += 1;
                        console.log(`${collection} ${document._id} ${where}`);
                        console.log(`  original:    ${inSource.join(' ') || '(none)'}`);
                        console.log(`  translation: ${inValue.join(' ') || '(none)'}`);
                    }
                }
            }
        }
        console.log(problems ? `\n${problems} problem(s)` : 'enrichers match in every translated field');
    }
};

const command = commands[process.argv[2]];
if (!command) {
    console.error(`Usage: node tools/packs-sync.mjs [${Object.keys(commands).join('|')}]`);
    process.exit(1);
}
await command();
