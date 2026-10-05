/**
 * Compendium (packs) translation maintenance, the counterpart to lang-sync.mjs.
 *
 * Where lang-sync tracks UI strings against upstream's en.json, this tracks the
 * compendium content against upstream's src/packs, and writes it in the shape
 * Babele loads: babele/ja/<collection>.json, keyed by document name.
 *
 * `export`  rebuilds those files from the fetched upstream packs, carrying every
 *           existing translation over. It never drops a translation, the same
 *           guarantee lang-sync's `apply` gives.
 * `prepare` writes everything still untranslated to a working file for a
 *           translator to fill in.
 * `apply`   merges that working file back into babele/ja/.
 * `report` shows coverage per pack: translated, untranslated, entries upstream
 *          has since removed, and fields whose English upstream has rewritten
 *          since the Japanese was written (tools/sources.mjs).
 * `stamp`  baselines that record, declaring the translations present correct
 *          for the English they currently sit against.
 * `terms`  holds the compendium to the wordings the UI and the glossaries
 *          already use, and to itself.
 * `check`  verifies that a translation has not broken what must survive it --
 *          Foundry enrichers (@UUID[...], @Lookup[...], [[/dr ...]]) have to
 *          appear in the translation exactly as often as in the original.
 *
 * An untranslated field is left OUT of the file, never written as "". Babele
 * applies whatever the file contains, so an empty string blanks the original --
 * the entry renders with no name at all. This cost a live debugging session.
 *
 * Keys are the English document name, with the `_id` as the fallback when two
 * documents in a pack share one -- see entryKeys(). Names are what Babele's
 * `referencedDocumentField` looks documents up by, so an id-keyed file cannot
 * answer it. Each entry also carries `_note` with the English name, so a diff
 * stays readable; Babele ignores keys its mapping does not know.
 *
 * Nothing here reaches the network; run tools/fetch-reference.mjs first.
 */

import fs from 'fs/promises';
import path from 'path';

import { establishedWordings, flatten, loadGlossaries, normalize } from './glossary.mjs';
import { freshness, hash, readSources, writeSources } from './sources.mjs';

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
const ENABLED = [
    'transformations',
    'communities',
    'ancestries',
    'adversaries',
    'environments',
    'domains',
    'subclasses',
    'classes',
    'beastforms',
    'items/weapons',
    'items/armors',
    'items/consumables',
    'items/loot',
    'rolltables',
    'journals'
];

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

const ENRICHER = /@[A-Za-z]+\[[^\]]*\]|\[\[[^\]]*\]\]/g;

/*
 * Folders are keyed by their English NAME, not by an id, so they cannot live
 * beside the documents in a pending file keyed by id. This reserved key holds
 * them; a document id is 16 characters and can never collide with it.
 */
const FOLDERS = '_folders';

/*
 * Documents that must never be written to a translation file, whatever the
 * pack's state, with the reason they are blocked.
 *
 * The DPCGL treats a translation as Adaptive Content (1.7) and licenses it in
 * the Permitted Formats (2.1b), and Foundry is a whitelisted VTT (1.9.1) -- but
 * 1.9.3 carves Campaign Frames out of all of it: they may be shared only as
 * actual-play streaming, video or podcast, and "may not be Shared in any other
 * format or republished, printed, distributed, or adapted into new written
 * works or derivative works without separate written permission from DRP". 1.5c
 * also lists them under Prohibited Content. A Japanese translation shipped in a
 * module is both another format and a derivative work.
 *
 * This is a list rather than a note in the README because `journals` is enabled
 * as a pack: without it, one `export` would write the frame out.
 */
const BLOCKED = {
    journals: {
        'Witherwild Campaign Frame':
            'DPCGL 1.9.3: a Campaign Frame may not be adapted or shared in this format'
    }
};

/** Whether this document is blocked from export, and why. */
const blockedReason = (pack, document) => BLOCKED[pack]?.[document.name] ?? null;

/*
 * Pages withheld from an otherwise translatable journal.
 *
 * Foundryborne's Credits page carries the DPCGL 4.3 copyright notice verbatim,
 * ending "There are no previous modifications by others". Translating that page
 * would replace a required notice with our rendering of it, and that sentence is
 * false the moment this module translates anything. The notice stays in English
 * where upstream put it; this module's own 4.1(a)-(e) statement lives in NOTICE.
 */
const BLOCKED_PAGES = {
    journals: {
        'Welcome - Information': {
            Credits: 'carries the DPCGL 4.3 copyright notice; it stays as upstream wrote it'
        }
    }
};

const blockedPageReason = (pack, document, page) =>
    BLOCKED_PAGES[pack]?.[document.name]?.[page.name] ?? null;

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
    const documents = all.filter(d => !String(d._key ?? '').startsWith('!folders!'));
    const blocked = documents.filter(d => blockedReason(pack, d));
    return {
        documents: documents.filter(d => !blockedReason(pack, d)),
        folders: all.filter(d => String(d._key ?? '').startsWith('!folders!')),
        blocked
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

/*
 * A localization key sitting where prose would. Every beastform's granted attack
 * is named "DAGGERHEART.ITEMS.Beastform.attackName", which the system resolves
 * through game.i18n at runtime -- so lang/ja.json already translates it, and
 * replacing the key here would leave the literal key on the sheet. 22 of the 25
 * object-valued effect changes are this, so recognizing the shape of an object
 * is not enough on its own.
 */
const I18N_KEY = /^[A-Z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const isI18nKey = value => typeof value === 'string' && I18N_KEY.test(value);

/** Collect name/description off a plain object, skipping what is empty. */
function nameAndDescription(source = {}) {
    const entry = {};
    if (source.name) entry.name = source.name;
    if (source.description) entry.description = source.description;
    return entry;
}

/**
 * The names of a nested `areas` / `countdown` list, positionally.
 *
 * These sit inside an action, which is itself inside a keyed container, so the
 * Babele mapping nests a `structured` converter in the action's mapping. The
 * list is matched by index, hence the nulls.
 */
function nestedNames(list = []) {
    if (!Array.isArray(list) || !list.length) return undefined;
    const names = list.map(entry => entry?.name || null);
    return names.some(Boolean) ? names.map(name => (name ? { name } : null)) : undefined;
}

/** An action's translatable shape: its own prose plus any nested named lists. */
function actionFields(action = {}) {
    const entry = nameAndDescription(action);
    const areas = nestedNames(action.areas);
    if (areas) entry.areas = areas;
    const countdown = nestedNames(action.countdown);
    if (countdown) entry.countdown = countdown;
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

    if (effect.system?.duration?.description) {
        entry.durationDescription = effect.system.duration.description;
    }

    /*
     * A change's value is normally a formula, but a few grant a whole weapon and
     * hold an object there. The allowlist covers the prose keys; the object case
     * is recognized by shape, since its own `name` is the only prose in it.
     */
    const changes = effect.system?.changes ?? [];
    const changeEntry = change => {
        if (TRANSLATABLE_CHANGE_KEYS.has(change.key) && typeof change.value === 'string' && change.value) {
            return change.value;
        }
        const granted = change.value;
        if (granted && typeof granted === 'object' && !Array.isArray(granted) && granted.name && !isI18nKey(granted.name)) {
            return { name: granted.name };
        }
        return null;
    };
    const carried = changes.map(changeEntry);
    if (carried.some(Boolean)) entry.changes = carried;

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
function translatableFields(document, pack = null) {
    const fields = { name: document.name ?? '' };

    /*
     * A RollTable is not an Actor or an Item and has no `system`. Its results
     * are keyed by _id, and the 240 that carry a `documentUuid` are left out on
     * purpose: Babele's `referencedDocumentField` resolves their name from the
     * document they point at, so translating the items packs covers them and
     * writing a name here would only duplicate -- and could contradict -- it.
     */
    /*
     * A JournalEntry's pages are their own documents; Babele's built-in
     * JournalEntryPage mapping takes `name` and `text.content`, and keys the
     * pages by their English name.
     */
    if (Array.isArray(document.pages)) {
        const pages = document.pages.reduce((acc, page) => {
            if (blockedPageReason(pack, document, page)) return acc;
            const entry = {};
            if (page.name) entry.name = page.name;
            if (page.text?.content) entry.text = page.text.content;
            if (Object.keys(entry).length) acc[page.name] = entry;
            return acc;
        }, {});
        if (Object.keys(pages).length) fields.pages = pages;

        return fields;
    }

    if (Array.isArray(document.results)) {
        if (document.description) fields.description = document.description;

        const results = document.results.reduce((acc, result) => {
            if (result.documentUuid) return acc;
            const entry = {};
            if (result.name) entry.name = result.name;
            if (result.description) entry.description = result.description;
            if (Object.keys(entry).length) acc[result._id] = entry;
            return acc;
        }, {});
        if (Object.keys(results).length) fields.results = results;

        return fields;
    }
    const system = document.system ?? {};

    for (const field of ['description', 'motivesAndTactics', 'impulses', 'notes']) {
        if (system[field]) fields[field] = system[field];
    }

    if (system.examples) fields.examples = system.examples;

    const attack = actionFields(system.attack ?? {});
    if (Object.keys(attack).length) fields.attack = attack;

    /*
     * A beastform's advantages are free text (a Tagify StringField), not an
     * enum, and the same values get joined into system.advantageSources -- one
     * of the two allowlisted change keys -- so both must use the same wording.
     */
    const advantageOn = keyedFields(system.advantageOn, group =>
        group?.value ? { value: group.value } : {}
    );
    if (Object.keys(advantageOn).length) fields.advantageOn = advantageOn;

    for (const field of ['backgroundQuestions', 'connections']) {
        const list = system[field];
        if (Array.isArray(list) && list.some(Boolean)) fields[field] = list.map(entry => entry || null);
    }

    /*
     * Keyed by tier and then by a random id, so neither level can be named in a
     * Babele mapping; the leafFields converter walks the shape instead.
     */
    const tiers = Object.entries(system.levelupOptionTiers ?? {}).reduce((acc, [tier, options]) => {
        const kept = keyedFields(options, option => (option?.label ? { label: option.label } : {}));
        if (Object.keys(kept).length) acc[tier] = kept;
        return acc;
    }, {});
    if (Object.keys(tiers).length) fields.levelupOptionTiers = tiers;

    const experiences = keyedFields(system.experiences);
    if (Object.keys(experiences).length) fields.experiences = experiences;

    const potentialAdversaries = keyedFields(system.potentialAdversaries, group =>
        group?.label ? { label: group.label } : {}
    );
    if (Object.keys(potentialAdversaries).length) fields.potentialAdversaries = potentialAdversaries;

    const actions = keyedFields(system.actions, actionFields);
    if (Object.keys(actions).length) fields.actions = actions;

    const effects = (document.effects ?? []).reduce((acc, effect) => {
        const entry = effectFields(effect);
        if (Object.keys(entry).length) acc[effect._id] = entry;
        return acc;
    }, {});
    if (Object.keys(effects).length) fields.effects = effects;

    /* Embedded items are documents in their own right, so they recurse. */
    const items = (document.items ?? []).reduce((acc, item) => {
        const entry = translatableFields(item, pack);
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
        const carried = original.map((slot, index) => {
            if (!slot) return null;
            /* A slot can itself be a container (an area's name, a granted weapon). */
            if (typeof slot === 'object') return carryOver(slot, existing?.[index]) ?? null;
            return existing?.[index] || null;
        });
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
                if (!slot) continue;
                if (typeof slot === 'object') {
                    yield* leaves(slot, translated?.[field]?.[index] ?? {}, [...trail, field, index]);
                } else {
                    yield [[...trail, field, index].join('.'), slot, translated?.[field]?.[index] ?? ''];
                }
            }
        } else if (value && typeof value === 'object') {
            yield* leaves(value, translated?.[field] ?? {}, [...trail, field]);
        } else {
            yield [[...trail, field].join('.'), value, translated?.[field] ?? ''];
        }
    }
}

/**
 * The key each document gets in its translation file: its English name, falling
 * back to its id when two documents in the pack share a name.
 *
 * Keying by id reads better and survives upstream renames, and that is how this
 * started -- but it quietly broke Babele's `referencedDocumentField`, which is
 * how a rolltable result takes its name from the item it points at. That
 * converter looks the referenced document up with `{ name }` alone, with no id
 * to match on, so an id-keyed file can never answer it. Babele's own exporter
 * prefers the name for the same reason.
 *
 * Only `ancestries` (Amphibious x2) and `beastforms` (Carrier x3) collide.
 */
function entryKeys(documents) {
    const used = new Set();
    const keys = new Map();
    for (const document of documents) {
        const key = document.name && !used.has(document.name) ? document.name : document._id;
        used.add(key);
        keys.set(document._id, key);
    }
    return keys;
}

async function buildPack(pack) {
    const collection = PACKS[pack];
    const file = path.join(BABELE_DIR, `${collection}.json`);
    const previous = await readJson(file).catch(error => {
        if (error.code === 'ENOENT') return { entries: {} };
        throw error;
    });

    const { documents, folders, blocked } = await readPack(pack);
    const keys = entryKeys(documents);
    const entries = {};
    for (const document of documents) {
        const original = translatableFields(document, pack);
        /* Files written before the switch to name keys are still keyed by id. */
        const carried = previous.entries?.[keys.get(document._id)] ?? previous.entries?.[document._id];
        entries[keys.get(document._id)] = {
            /* Not a mapped field: it is here so a diff of this file can be read. */
            _note: document.name,
            ...(carryOver(original, carried) ?? {})
        };
    }

    /* Folders are keyed by their English name, which is how Babele looks them up. */
    const folderNames = Object.fromEntries(
        folders.map(folder => [folder.name, previous.folders?.[folder.name] ?? ''])
    );

    /* The original shape, so `apply` can tell a keyed container from an array. */
    const originals = Object.fromEntries(documents.map(d => [keys.get(d._id), translatableFields(d, pack)]));

    return { collection, file, previous, documents, entries, folderNames, originals, keys, blocked };
}

/** Drop the not-yet-translated entries of a flat name->translation map. */
const strip = map => Object.fromEntries(Object.entries(map).filter(([, value]) => value));

/** One readable line: markup out, whitespace collapsed, long text cut. */
const plain = text =>
    String(text ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);

/**
 * The key one translated field gets in its source-hash record: the document's
 * entry key and the field path inside it, which is exactly how `audit` names a
 * field. Folder names use the reserved `_folders` entry key.
 */
/* `stamp` collects every pack's record before writing any of them. */
const pendingStamps = new Map();

const sourceKey = (entry, where) => `${entry} :: ${where}`;

/** Every translated field of one pack, as [recordKey, englishSource] pairs. */
function* translatedFields(pack, documents, keys, current) {
    for (const document of documents) {
        const original = translatableFields(document, pack);
        const translation = current.entries?.[keys.get(document._id)] ?? {};
        for (const [where, source, value] of leaves(original, translation)) {
            if (!source || !value) continue;
            yield [sourceKey(keys.get(document._id), where), source, value, document];
        }
    }
    for (const [name, value] of Object.entries(current.folders ?? {})) {
        if (!value) continue;
        yield [sourceKey(FOLDERS, name), name, value, null];
    }
}

const commands = {
    async export() {
        const pinned = await readJson(PINNED);
        await fs.mkdir(BABELE_DIR, { recursive: true });

        for (const pack of ENABLED) {
            const { collection, file, previous, documents, entries, folderNames, blocked } = await buildPack(pack);
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
                `${collection}: ${documents.length} entries${retired.length ? `, ${retired.length} dropped by upstream` : ''}` +
                    blocked.map(d => `\n  withheld: ${d.name} -- ${blockedReason(pack, d)}`).join('') +
                    documents
                        .flatMap(d => (d.pages ?? []).map(page => [d, page]))
                        .filter(([d, page]) => blockedPageReason(pack, d, page))
                        .map(([d, page]) => `\n  withheld: ${d.name} / ${page.name} -- ${blockedPageReason(pack, d, page)}`)
                        .join('')
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
            const { collection, file, documents, folderNames, keys } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));
            const record = await readSources(collection);
            const entries = {};

            for (const document of documents) {
                const original = translatableFields(document, pack);
                const translation = current.entries?.[keys.get(document._id)] ?? {};
                const missing = {};

                for (const [where, source, value] of leaves(original, translation)) {
                    if (!source) continue;
                    if (value) {
                        /*
                         * A field whose English upstream has rewritten needs a
                         * translator as much as an empty one does. It carries
                         * `was`, the wording that answered the old English, and
                         * an empty `ja` -- so the shipped translation stays put
                         * until someone replaces it, since `apply` skips empties.
                         */
                        if (freshness(record, sourceKey(keys.get(document._id), where), source) !== 'reworded') continue;
                        missing[where] = { en: source, was: value, ja: '' };
                        count += 1;
                        continue;
                    }
                    /* `en` is the text to translate; fill `ja` in beside it. */
                    missing[where] = { en: source, ja: '' };
                    count += 1;
                }

                if (Object.keys(missing).length) {
                    entries[keys.get(document._id)] = { _note: document.name, ...missing };
                }
            }

            /*
             * Folder names are shown in the compendium browser but were never
             * offered for translation: `prepare` only walked the documents, so
             * 89 names across the enabled packs could only ever be filled in by
             * editing the translation file by hand.
             */
            const folders = {};
            for (const [name, value] of Object.entries(folderNames)) {
                if (value) continue;
                folders[name] = { en: name, ja: '' };
                count += 1;
            }
            if (Object.keys(folders).length) entries[FOLDERS] = { _note: 'folders', ...folders };

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
            const { collection, file, documents, entries, folderNames, originals, keys } = await buildPack(pack);
            const filled = pending[collection] ?? {};

            for (const [id, fields] of Object.entries(filled)) {
                if (id === FOLDERS) {
                    for (const [name, value] of Object.entries(fields)) {
                        if (name === '_note' || !value?.ja) continue;
                        folderNames[name] = value.ja;
                        applied += 1;
                    }
                    continue;
                }

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
                    const last = trail.pop();

                    /*
                     * Whether a container is an array is read off the ORIGINAL, not
                     * guessed from the key. `system.levelupOptionTiers` is keyed by
                     * tier -- "2", "3", "4" -- so a numeric-looking segment built an
                     * array there and the converter, handed an array where it
                     * expected an object, translated nothing.
                     */
                    let source = originals[id] ?? {};
                    const target = trail.reduce((node, key) => {
                        source = source?.[key];
                        return (node[key] ??= Array.isArray(source) ? [] : {});
                    }, (entries[id] ??= {}));
                    target[Array.isArray(source) ? Number(last) : last] = value.ja;
                    applied += 1;
                }
            }

            /*
             * Record which English each field now in the file was translated
             * from, so a later upstream rewrite shows up in `report` instead of
             * leaving the Japanese to answer a sentence that is gone. Written
             * from the file's whole contents, not just this run's additions, so
             * a field translated by hand gets a record too.
             */
            const record = {};
            const current = { entries, folders: folderNames };
            for (const [key, source] of translatedFields(pack, documents, keys, current)) {
                record[key] = hash(source);
            }
            await writeSources(collection, record);

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
        let totals = { translated: 0, untranslated: 0, retired: 0, reworded: 0, unstamped: 0 };
        const rewordings = [];
        for (const pack of ENABLED) {
            const { collection, file, documents, folderNames, keys } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));
            let translated = 0;
            let untranslated = 0;
            /*
             * Count against the upstream documents, not against the file: a field
             * only counts when upstream actually has text there to translate.
             */
            for (const document of documents) {
                const original = translatableFields(document, pack);
                const translation = current.entries?.[keys.get(document._id)] ?? {};
                for (const [, source, value] of leaves(original, translation)) {
                    if (!source) continue;
                    if (value) translated += 1;
                    else untranslated += 1;
                }
            }
            /* Folder names count too: they are shown in the compendium browser. */
            for (const value of Object.values(folderNames)) {
                if (value) translated += 1;
                else untranslated += 1;
            }

            /*
             * Fields whose English upstream has rewritten since the Japanese was
             * written. The counts above cannot see these: the field is filled, so
             * it counts as translated, and the entry is live, so it is not retired.
             */
            const record = await readSources(collection);
            let reworded = 0;
            for (const [key, source, value] of translatedFields(pack, documents, keys, current)) {
                const state = freshness(record, key, source);
                if (state === 'unstamped') totals.unstamped += 1;
                if (state !== 'reworded') continue;
                reworded += 1;
                rewordings.push([collection, key, source, value]);
            }
            totals.reworded += reworded;

            const live = new Set(keys.values());
            const retired = Object.keys(current.entries ?? {}).filter(key => !live.has(key)).length;
            totals.retired += retired;
            totals.translated += translated;
            totals.untranslated += untranslated;
            const total = translated + untranslated;
            const percent = total ? Math.round((translated / total) * 100) : 100;
            console.log(
                `${collection.padEnd(28)} ${String(percent).padStart(3)}%  ${translated}/${total} fields` +
                    (retired ? `  (${retired} retired upstream)` : '') +
                    (reworded ? `  (${reworded} reworded upstream)` : '')
            );
        }
        console.log(
            `\npacks enabled:    ${ENABLED.length}/${Object.keys(PACKS).length}` +
                `\ntranslated:       ${totals.translated}` +
                `\nto translate:     ${totals.untranslated}` +
                `\nretired upstream: ${totals.retired}` +
                `\nreworded upstream: ${totals.reworded}` +
                (totals.unstamped ? `\nunstamped:        ${totals.unstamped} (run \`packs-sync stamp\`)` : '')
        );

        /* Listed in full: nothing else in this tool will mention them again. */
        for (const [collection, key, source, value] of rewordings) {
            console.log(`\nreworded ${collection} / ${key}`);
            console.log(`   en: ${plain(source)}`);
            console.log(`   ja: ${plain(value)}`);
        }
    },

    /*
     * Print every translated string next to the English it claims to translate.
     *
     * `check` compares enrichers, and `report` counts: neither can tell that a
     * translation is the right text for the wrong document. One of the step-5
     * probes put Raging River's name and impulses on Abandoned Grove, and it
     * survived a live run, a report and a check, because every mechanism it
     * touched worked. Only reading the pairs finds that.
     */
    async audit() {
        let shown = 0;
        for (const pack of ENABLED) {
            const { collection, file, documents, keys } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));

            for (const document of documents) {
                const original = translatableFields(document, pack);
                const translation = current.entries?.[keys.get(document._id)] ?? {};
                for (const [where, source, value] of leaves(original, translation)) {
                    if (!value) continue;
                    shown += 1;
                    console.log(`${collection} / ${keys.get(document._id)} :: ${where}`);
                    console.log(`   en: ${plain(source)}`);
                    console.log(`   ja: ${plain(value)}`);
                }
            }

            for (const [name, value] of Object.entries(current.folders ?? {})) {
                if (!value) continue;
                shown += 1;
                console.log(`${collection} / folders :: ${name}`);
                console.log(`   en: ${name}`);
                console.log(`   ja: ${plain(value)}`);
            }
        }
        console.log(`\n${shown} translated field(s) to read`);
    },

    /**
     * Baseline the source-hash record from the files as they stand, declaring
     * every translation present correct for the English it sits against.
     *
     * Needed once, because the translations predate the recording; after that
     * `apply` keeps the record current. Running it again would bless whatever
     * upstream has rewritten in the meantime, so it refuses when `report` would
     * have something to say, unless --force says to accept it.
     */
    async stamp() {
        const force = process.argv.includes('--force');
        let stamped = 0;
        let reworded = 0;

        for (const pack of ENABLED) {
            const { collection, file, documents, keys } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));
            const previous = await readSources(collection);
            const record = {};

            for (const [key, source] of translatedFields(pack, documents, keys, current)) {
                if (freshness(previous, key, source) === 'reworded') reworded += 1;
                record[key] = hash(source);
                stamped += 1;
            }
            if (!force) {
                /* Nothing is written until every pack has been looked at. */
                pendingStamps.set(collection, record);
                continue;
            }
            await writeSources(collection, record);
        }

        if (!force && reworded) {
            console.error(`${reworded} field(s) are reworded upstream; stamping would accept the old Japanese.`);
            console.error('Retranslate them (prepare/apply), or pass --force to accept them as they are.');
            process.exit(1);
        }
        for (const [collection, record] of pendingStamps) await writeSources(collection, record);
        console.log(`${stamped} field(s) stamped across ${ENABLED.length} pack(s)`);
    },

    /**
     * Hold the compendium to the Japanese the project already uses.
     *
     * `report` counts, `audit` prints pairs for reading, and `check` guards the
     * enrichers and the licence boundary. None of them notices that the same
     * English term became two different Japanese words in two packs, which is
     * the mistake a 10,000-field translation makes most often and the one a
     * reader notices first.
     *
     * Three disagreements are reported:
     *   - against lang/ja.json, whose wordings are the house style
     *   - against the CSV glossaries in lang/translation/glossary/
     *   - against the compendium itself, when one English string has two
     *     translations across the packs
     *
     * Only short fields are compared -- names, labels, impulses. Prose repeats
     * no exact sentences, so comparing it would report nothing but noise.
     */
    async terms() {
        const en = flatten(await readJson(path.join('lang', '.reference', 'en.json')));
        const ja = flatten(await readJson(path.join('lang', 'ja.json')));
        const established = establishedWordings(en, ja);
        const { glossary, sources } = await loadGlossaries();

        /* Longer than this is prose, where an exact-string comparison says nothing. */
        const SHORT = 60;

        const seen = new Map();
        let problems = 0;

        for (const pack of ENABLED) {
            const { collection, file, documents, keys } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));

            for (const [key, source, value] of translatedFields(pack, documents, keys, current)) {
                const text = plain(source);
                if (!text || text.length > SHORT) continue;
                const term = normalize(text);

                const approved = established.get(term) ?? glossary.get(term);
                if (approved && normalize(approved.japanese) !== normalize(value)) {
                    problems += 1;
                    console.log(`${collection} / ${key}`);
                    console.log(`   en:       ${text}`);
                    console.log(`   here:     ${plain(value)}`);
                    console.log(`   ${approved.file}: ${approved.japanese}`);
                }

                const first = seen.get(term);
                if (!first) seen.set(term, { collection, key, value });
                else if (normalize(first.value) !== normalize(value)) {
                    problems += 1;
                    console.log(`${collection} / ${key}`);
                    console.log(`   en:   ${text}`);
                    console.log(`   here: ${plain(value)}`);
                    console.log(`   ${first.collection} / ${first.key}: ${plain(first.value)}`);
                }
            }
        }

        console.log(
            problems
                ? `\n${problems} disagreement(s) against ${sources.map(s => s.file).join(', ') || 'no glossary'} and lang/ja.json`
                : `terms agree with lang/ja.json, ${sources.map(s => s.file).join(', ') || 'no glossary'}, and each other`
        );
    },

    async check() {
        let problems = 0;
        for (const pack of ENABLED) {
            const { collection, file, documents, keys, blocked } = await buildPack(pack);
            const current = await readJson(file).catch(() => ({ entries: {} }));

            /*
             * A withheld document must not be in the file at all, however it got
             * there -- a stale entry from before it was blocked counts. This is
             * a licence boundary, so it is checked rather than assumed.
             */
            for (const document of blocked) {
                for (const key of [document.name, document._id]) {
                    if (!current.entries?.[key]) continue;
                    problems += 1;
                    console.log(`${collection}: withheld document '${document.name}' is present as '${key}'`);
                    console.log(`  ${blockedReason(pack, document)}`);
                }
            }

            for (const document of documents) {
                const entry = current.entries?.[keys.get(document._id)];
                for (const page of document.pages ?? []) {
                    const reason = blockedPageReason(pack, document, page);
                    if (!reason || !entry?.pages?.[page.name]) continue;
                    problems += 1;
                    console.log(`${collection}: withheld page '${document.name} / ${page.name}' is present`);
                    console.log(`  ${reason}`);
                }
            }

            /*
             * A translation whose English upstream has rewritten is as wrong as
             * a broken enricher, and harder to see: it reads fine. `report`
             * lists these; `check` fails on them, because `check` is what runs
             * before a release.
             */
            const record = await readSources(collection);
            for (const [key, source] of translatedFields(pack, documents, keys, current)) {
                if (freshness(record, key, source) !== 'reworded') continue;
                problems += 1;
                console.log(`${collection}: '${key}' was translated from English that upstream has since rewritten`);
                console.log(`  now: ${plain(source)}`);
            }

            for (const document of documents) {
                const original = translatableFields(document, pack);
                const translation = current.entries?.[keys.get(document._id)] ?? {};

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
        console.log(problems ? `\n${problems} problem(s)` : 'enrichers match, and no withheld document is present');
    }
};

const command = commands[process.argv[2]];
if (!command) {
    console.error(`Usage: node tools/packs-sync.mjs [${Object.keys(commands).join('|')}]`);
    process.exit(1);
}
await command();
