/**
 * Check that this module's Babele mappings reach the fields they claim to, and
 * leave the formulas, enums and references beside them alone.
 *
 * Usage: npm run packs:probe -- <.../Data/modules/babele>
 */

import fs from 'node:fs/promises';
import { translate, mergeObject } from './babele-harness.mjs';

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
