/**
 * Drive Babele's own mapping code over the real pack documents and the real
 * translation files, outside Foundry.
 *
 * This is not a mock of Babele: it imports Babele's DocumentMappings, converter
 * registry and FieldMapping and runs them. What it leaves out is the browser --
 * the compendium runtime, embedded-document traversal and anything visual -- so
 * it answers "does this mapping reach this field" and nothing more.
 *
 * Usage: node tools/mapping-probe.mjs <path to the installed babele module>
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const BABELE = process.argv[2];
if (!BABELE) {
    console.error('Usage: node tools/mapping-probe.mjs <.../Data/modules/babele>');
    process.exit(1);
}

/* The slice of the Foundry API Babele's mapping layer calls. */
const isPlainObject = value =>
    !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) !== null
        ? Object.getPrototypeOf(value) === Object.prototype
        : false;

function mergeObject(original, other = {}, { inplace = true } = {}) {
    const target = inplace ? original : structuredClone(original);
    for (const [key, value] of Object.entries(other)) {
        if (isPlainObject(value) && isPlainObject(target[key])) {
            target[key] = mergeObject(target[key], value, { inplace: false });
        } else {
            target[key] = value;
        }
    }
    return target;
}

const getProperty = (object, key) =>
    String(key ?? '')
        .split('.')
        .filter(Boolean)
        .reduce((node, segment) => (node == null ? undefined : node[segment]), object);

class Collection extends Map {
    get contents() {
        return [...this.values()];
    }
}

globalThis.foundry = { utils: { mergeObject, getProperty, parseUuid: () => null, Collection } };

const { DocumentMappings } = await import(path.join(BABELE, 'script/mapping/document-mappings.js'));
const { ConverterRegistry } = await import(path.join(BABELE, 'script/converter/converter-registry.js'));
const { IdentityExtractorRegistry } = await import(
    path.join(BABELE, 'script/identity/identity-extractor-registry.js')
);
const { Converters } = await import(path.join(BABELE, 'script/converter/converters.js'));
const { StructuredDataConverter } = await import(path.join(BABELE, 'script/converter/structured-data-converter.js'));
const { DocumentConverter } = await import(path.join(BABELE, 'script/converter/document-converter.js'));
const { ReferencedDocumentFieldConverter } = await import(
    path.join(BABELE, 'script/converter/referenced-document-field-converter.js')
);

/* The two converters this module registers, imported from the module itself. */
const converterSource = await fs.readFile(new URL('../scripts/babele.mjs', import.meta.url), 'utf8');
const converters = await import(
    `data:text/javascript;base64,${Buffer.from(
        `${converterSource.replace(/Hooks\.once[\s\S]*$/, '')}\nexport { stringArray, leafFields };`
    ).toString('base64')}`
);

const converterRegistry = new ConverterRegistry({
    ...Converters.legacyRegistrations(),
    document: new DocumentConverter(),
    structured: new StructuredDataConverter(),
    referencedDocumentField: new ReferencedDocumentFieldConverter(),
    stringArray: converters.stringArray,
    leafFields: converters.leafFields
});
const identityExtractors = new IdentityExtractorRegistry(IdentityExtractorRegistry.defaultExtractors());

const mappingFile = JSON.parse(await fs.readFile(new URL('../babele/ja/mappings.json', import.meta.url), 'utf8'));
const mappings = new DocumentMappings(undefined, {
    loadedMappings: [mappingFile],
    identityExtractors,
    converterRegistry
});

const REFERENCE = new URL('../lang/.reference/packs/', import.meta.url);
const TRANSLATIONS = new URL('../babele/ja/', import.meta.url);

async function document(pack, id) {
    const dir = new URL(`${pack}/`, REFERENCE);
    for (const file of await fs.readdir(dir)) {
        if (!file.endsWith('.json')) continue;
        const data = JSON.parse(await fs.readFile(new URL(file, dir), 'utf8'));
        if (data._id === id) return data;
    }
    throw new Error(`${id} not in ${pack}`);
}

const translationsFor = async (collection, id) =>
    JSON.parse(await fs.readFile(new URL(`${collection}.json`, TRANSLATIONS), 'utf8')).entries[id] ?? {};

/*
 * The embedded-document converters (`items`, `effects`) ask the current
 * compendium for the mapping set, so the runtime needs one. Embedded recursion
 * itself was proven in the live run; here it only has to not throw.
 */
const runtime = {
    currentCompendium: {
        documentMappings: mappings,
        translationMatchStrategies: () => undefined,
        translateField: () => undefined
    }
};

function translate(documentType, data, translations) {
    const mapping = mappings.mappingFor(documentType);
    mapping.prepare(data, translations, runtime);
    return mergeObject(structuredClone(data), mapping.map(data, translations, runtime), { inplace: false });
}

const checks = [];
const check = (label, actual, expected) =>
    checks.push({ label, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

/* --- weapons: system.attack on the Item ------------------------------- */
{
    const data = await document('items/weapons', 'ijodu5yNBoMxpkHV');
    const out = translate('Item', data, await translationsFor('daggerheart.weapons', 'ijodu5yNBoMxpkHV'));
    check('weapon name', out.name, 'アーンタリ・ボウ');
    check('weapon attack.name', out.system.attack.name, '攻撃');
    check('weapon attack.range untouched', out.system.attack.range, data.system.attack.range);
    check(
        'weapon attack damage formula untouched',
        out.system.attack.damage.main.value,
        data.system.attack.damage.main.value
    );
    check('weapon attack keys intact', Object.keys(out.system.attack).sort(), Object.keys(data.system.attack).sort());
}

/* --- domains: a name two converters deep inside a keyed action -------- */
{
    const data = await document('domains', 'R0LNheiZycZlZzV3');
    const out = translate('Item', data, await translationsFor('daggerheart.domains', 'R0LNheiZycZlZzV3'));
    const action = out.system.actions.K26kfjmTEH9zPMMO;
    const before = data.system.actions.K26kfjmTEH9zPMMO;
    check('area name', action.areas[0].name, 'グリンの書');
    check('area shape untouched', action.areas[0].shape, before.areas[0].shape);
    check('area size untouched', action.areas[0].size, before.areas[0].size);
}
{
    const data = await document('domains', 'dT95m0Jam8sWbeuC');
    const out = translate('Item', data, await translationsFor('daggerheart.domains', 'dT95m0Jam8sWbeuC'));
    const action = out.system.actions.ZM96wFu3YuAeUXel;
    check('countdown name', action.countdown[0].name, '集団変装');
    check(
        'countdown progress untouched',
        action.countdown[0].progress,
        data.system.actions.ZM96wFu3YuAeUXel.countdown[0].progress
    );
}

/* --- beastforms: a bare string field and a keyed free-text container -- */
{
    const data = await document('beastforms', 'mZ4Wlqtss2FlNNvL');
    const out = translate('Item', data, await translationsFor('daggerheart.beastforms', 'mZ4Wlqtss2FlNNvL'));
    check('beastform examples', out.system.examples, 'タカ、フクロウ、カラスなど');
    check('advantageOn values', Object.values(out.system.advantageOn).map(a => a.value).sort(), [
        '威嚇する',
        '発見する',
        '欺く'
    ].sort());
    check('advantageOn key count', Object.keys(out.system.advantageOn).length, Object.keys(data.system.advantageOn).length);
    check('beastform mainTrait untouched', out.system.mainTrait, data.system.mainTrait);
}

/* --- classes: bare string arrays and a twice-keyed tree --------------- */
{
    const data = await document('classes', '0Qw2heB75eXNV4SM');
    const out = translate('Item', data, await translationsFor('daggerheart.classes', '0Qw2heB75eXNV4SM'));
    check('backgroundQuestions[2] translated', out.system.backgroundQuestions[2], 'あなたが最近敗れ、どうしても再戦したい相手は誰ですか？');
    check('backgroundQuestions[0] left alone', out.system.backgroundQuestions[0], data.system.backgroundQuestions[0]);
    check('backgroundQuestions length', out.system.backgroundQuestions.length, data.system.backgroundQuestions.length);
    check('connections[2] translated', out.system.connections[2], 'あなたが私に言ったことを、私はまだ許していません。それは何で、なぜ言ったのですか？');
    check('connections[1] left alone', out.system.connections[1], data.system.connections[1]);
    const tier = out.system.levelupOptionTiers['4'].kX18xCR6KbTS3iTP;
    const tierBefore = data.system.levelupOptionTiers['4'].kX18xCR6KbTS3iTP;
    check('levelup label', tier.label, 'コンボ・ダイを永続的に1段階上げる（d4からd6、d6からd8など）。');
    check('levelup subType untouched', tier.subType, tierBefore.subType);
    check('levelup minCost untouched', tier.minCost, tierBefore.minCost);
    check('untranslated tier 2 label intact', out.system.levelupOptionTiers['2'].UXJXoQH2UH12UaWS.label, tierBefore.label);
}

/* --- effects: an object-valued change, and duration prose ------------- */
{
    const data = await document('classes', 'WgUrpNTlX92k0Xs3');
    const entry = await translationsFor('daggerheart.classes', 'WgUrpNTlX92k0Xs3');
    const effect = data.effects.find(e => e._id === 'bGHd7NfUn4fL6u1g');
    const out = translate('ActiveEffect', effect, entry.effects.bGHd7NfUn4fL6u1g);
    check('granted weapon name', out.system.changes[1].value.name, 'ブローラーの一撃'.replace('ロー', 'ロウ'));
    check('granted weapon formula untouched', out.system.changes[1].value.damageFormula, effect.system.changes[1].value.damageFormula);
    check('granted weapon trait untouched', out.system.changes[1].value.trait, effect.system.changes[1].value.trait);
    check('sibling change untouched', out.system.changes[0].value, effect.system.changes[0].value);
}
{
    const data = await document('items/consumables', 'eAXHdzA5qNPldOpn');
    const entry = await translationsFor('daggerheart.consumables', 'eAXHdzA5qNPldOpn');
    const effect = data.effects.find(e => e._id === 'nryJhrF26hyFQUxH');
    const out = translate('ActiveEffect', effect, entry.effects.nryJhrF26hyFQUxH);
    check('duration description', out.system.duration.description, '<p>HPをマークするまで。</p>');
    check('duration type untouched', out.system.duration.type, effect.system.duration.type);
}

/* --- the scalar change path proven in step 5 still translates ---------- */
{
    const adversaries = JSON.parse(
        await fs.readFile(new URL('daggerheart.adversaries.json', TRANSLATIONS), 'utf8')
    ).entries;

    let probed = 0;
    for (const [documentId, entry] of Object.entries(adversaries)) {
        for (const [itemId, item] of Object.entries(entry.items ?? {})) {
            for (const [effectId, effectEntry] of Object.entries(item.effects ?? {})) {
                const index = (effectEntry.changes ?? []).findIndex(change => typeof change === 'string');
                if (index < 0) continue;
                const actor = await document('adversaries', documentId);
                const effect = actor.items.find(i => i._id === itemId).effects.find(e => e._id === effectId);
                const out = translate('ActiveEffect', effect, effectEntry);
                check(
                    `scalar change translated (${entry._note} / ${effectEntry.changes[index]})`,
                    out.system.changes[index].value,
                    effectEntry.changes[index]
                );
                check(
                    'scalar change key untouched',
                    out.system.changes[index].key,
                    effect.system.changes[index].key
                );
                probed += 1;
            }
        }
    }
    check('at least one scalar change was probed', probed > 0, true);
}

let failed = 0;
for (const { label, pass, actual, expected } of checks) {
    console.log(`${pass ? 'ok  ' : 'FAIL'}  ${label}`);
    if (!pass) {
        failed += 1;
        console.log(`        expected ${JSON.stringify(expected)}`);
        console.log(`        actual   ${JSON.stringify(actual)}`);
    }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
