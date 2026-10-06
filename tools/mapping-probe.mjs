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

/** Find a pack document by id or, since entries are name-keyed, by name. */
async function document(pack, key) {
    const dir = new URL(`${pack}/`, REFERENCE);
    let byName = null;
    for (const file of await fs.readdir(dir)) {
        if (!file.endsWith('.json')) continue;
        const data = JSON.parse(await fs.readFile(new URL(file, dir), 'utf8'));
        if (data._id === key) return data;
        if (data.name === key && !byName) byName = data;
    }
    if (byName) return byName;
    throw new Error(`${key} not in ${pack}`);
}

/*
 * Entries are keyed by English name, with the id as the fallback when two
 * documents in a pack share one -- the same rule packs-sync writes by.
 */
async function translationsFor(collection, id, name) {
    const entries = JSON.parse(await fs.readFile(new URL(`${collection}.json`, TRANSLATIONS), 'utf8')).entries;
    return entries[id] ?? (name ? entries[name] : undefined) ?? {};
}

const checks = [];
const check = (label, actual, expected) =>
    checks.push({ label, pass: JSON.stringify(actual) === JSON.stringify(expected), actual, expected });

/* --- weapons: system.attack on the Item ------------------------------- */
{
    const data = await document('items/weapons', 'ijodu5yNBoMxpkHV');
    const out = translate('Item', data, await translationsFor('daggerheart.weapons', 'ijodu5yNBoMxpkHV', data.name));
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
    const out = translate('Item', data, await translationsFor('daggerheart.domains', 'R0LNheiZycZlZzV3', data.name));
    const action = out.system.actions.K26kfjmTEH9zPMMO;
    const before = data.system.actions.K26kfjmTEH9zPMMO;
    check('area name', action.areas[0].name, 'グリンの書');
    check('area shape untouched', action.areas[0].shape, before.areas[0].shape);
    check('area size untouched', action.areas[0].size, before.areas[0].size);
}
{
    const data = await document('domains', 'dT95m0Jam8sWbeuC');
    const out = translate('Item', data, await translationsFor('daggerheart.domains', 'dT95m0Jam8sWbeuC', data.name));
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
    const out = translate('Item', data, await translationsFor('daggerheart.beastforms', 'mZ4Wlqtss2FlNNvL', data.name));
    check('beastform examples', out.system.examples, 'タカ、フクロウ、カラスなど');
    check('advantageOn values', Object.values(out.system.advantageOn).map(a => a.value).sort(), [
        '恐れさせる',
        '発見する',
        '欺く'
    ].sort());
    check('advantageOn key count', Object.keys(out.system.advantageOn).length, Object.keys(data.system.advantageOn).length);
    check('beastform mainTrait untouched', out.system.mainTrait, data.system.mainTrait);
}

/* --- classes: bare string arrays and a twice-keyed tree --------------- */
{
    const data = await document('classes', '0Qw2heB75eXNV4SM');
    const out = translate('Item', data, await translationsFor('daggerheart.classes', '0Qw2heB75eXNV4SM', data.name));
    check('backgroundQuestions[2] translated', out.system.backgroundQuestions[2], 'あなたが最近敗れ、どうしても再戦したい相手は誰ですか？');
    check('backgroundQuestions[0] translated', out.system.backgroundQuestions[0],
        '直接にも間接にも、あなたが今の型で戦う術を学んだのは、形成期をどこで過ごしたからですか？');
    check('backgroundQuestions length', out.system.backgroundQuestions.length, data.system.backgroundQuestions.length);
    check('connections[2] translated', out.system.connections[2], 'あなたが私に言ったことを、私はまだ許していません。それは何で、なぜ言ったのですか？');
    check('connections[1] translated', out.system.connections[1],
        '旅の中で、私はあなたの何を頼りにしていますか？それについてあなたはどう感じていますか？');
    const tier = out.system.levelupOptionTiers['4'].kX18xCR6KbTS3iTP;
    const tierBefore = data.system.levelupOptionTiers['4'].kX18xCR6KbTS3iTP;
    check('levelup label', tier.label, 'コンボダイスを1段階永続的に上げる（d4からd6、d6からd8など）。');
    check('levelup subType untouched', tier.subType, tierBefore.subType);
    check('levelup minCost untouched', tier.minCost, tierBefore.minCost);
    /* the same option appears in two tiers, so both copies must read the same */
    check('tier 2 label matches tier 4', out.system.levelupOptionTiers['2'].UXJXoQH2UH12UaWS.label, tier.label);
}

/* --- effects: an object-valued change, and duration prose ------------- */
{
    const data = await document('classes', 'WgUrpNTlX92k0Xs3');
    const entry = await translationsFor('daggerheart.classes', 'WgUrpNTlX92k0Xs3', data.name);
    const effect = data.effects.find(e => e._id === 'bGHd7NfUn4fL6u1g');
    const out = translate('ActiveEffect', effect, entry.effects.bGHd7NfUn4fL6u1g);
    check('granted weapon name', out.system.changes[1].value.name, 'ブローラーの一撃'.replace('ロー', 'ロウ'));
    check('granted weapon formula untouched', out.system.changes[1].value.damageFormula, effect.system.changes[1].value.damageFormula);
    check('granted weapon trait untouched', out.system.changes[1].value.trait, effect.system.changes[1].value.trait);
    check('sibling change untouched', out.system.changes[0].value, effect.system.changes[0].value);
}
{
    const data = await document('items/consumables', 'eAXHdzA5qNPldOpn');
    const entry = await translationsFor('daggerheart.consumables', 'eAXHdzA5qNPldOpn', data.name);
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

/* --- rolltables: Babele's own defaults, plus what must NOT be written ---- */
{
    const table = JSON.parse(
        await fs.readFile(new URL('rolltables/tables_Random_Objectives_I5L1dlgxXTNrCCkL.json', REFERENCE), 'utf8')
    );
    const entry = await translationsFor('daggerheart.rolltables', 'I5L1dlgxXTNrCCkL', table.name);
    const out = translate('RollTable', table, entry);
    check('table name', out.name, 'ランダム目標');
    const first = out.results.find(r => r._id === 'LDuVbmdvhJiEOe7U');
    check('text result description', first.description, '<p>重要なアイテムを入手する（手に入れる、または盗む）。</p>');
    check('text result range untouched', first.range, table.results.find(r => r._id === 'LDuVbmdvhJiEOe7U').range);
    check('a later result is translated too', out.results.find(r => r._id === 'bTkZgxqEr4lNxzeK').description,
        '<p>魔法の装置を起動する。</p>');
    check('result count', out.results.length, table.results.length);
}
{
    /*
     * The 240 results that point at a document must stay out of the translation
     * file: their name follows the referenced document, so writing one here
     * would duplicate the items packs and could contradict them.
     */
    const items = JSON.parse(
        await fs.readFile(new URL('rolltables/tables_Core_Set_Items_S61Shlt2I5CbLRjz.json', REFERENCE), 'utf8')
    );
    const entry = await translationsFor('daggerheart.rolltables', 'S61Shlt2I5CbLRjz', items.name);
    check('no result names were exported', Object.keys(entry.results ?? {}).length, 0);
    check('every result of this table is a reference', items.results.every(r => !!r.documentUuid), true);
    const out = translate('RollTable', items, entry);
    check('table description', out.description, '<p>以下の表には、ダガーハート・コアセットのアイテムが含まれます。</p>');
}

/* --- the two documents that share a name must not share an entry ------- */
{
    const file = JSON.parse(await fs.readFile(new URL('daggerheart.ancestries.json', TRANSLATIONS), 'utf8'));
    const dir = new URL('ancestries/', REFERENCE);
    const amphibious = [];
    for (const name of await fs.readdir(dir)) {
        if (!name.endsWith('.json')) continue;
        const data = JSON.parse(await fs.readFile(new URL(name, dir), 'utf8'));
        if (data.name === 'Amphibious') amphibious.push(data._id);
    }
    check('two documents are named Amphibious', amphibious.length, 2);
    check('the name key exists', typeof file.entries['Amphibious'], 'object');
    const idKeyed = amphibious.filter(id => file.entries[id]);
    check('the second one fell back to an id key', idKeyed.length, 1);
    check('they are separate entries',
        file.entries['Amphibious'] !== file.entries[idKeyed[0]], true);
}

/* --- journals: pages through Babele's defaults, and what is withheld ----- */
{
    const dir = new URL('journals/', REFERENCE);
    const files = await fs.readdir(dir);
    const entries = JSON.parse(await fs.readFile(new URL('daggerheart.journals.json', TRANSLATIONS), 'utf8')).entries;

    const welcome = JSON.parse(
        await fs.readFile(new URL(files.find(f => f.includes('Welcome')), dir), 'utf8')
    );
    const out = translate('JournalEntry', welcome, entries['Welcome - Information']);
    const dice = out.pages.find(p => p.name === 'ダイスロール');
    check('journal page name', !!dice, true);
    check('page body translated', dice?.text?.content?.includes('希望・恐怖・有利・不利'), true);
    check('the link inside it survived',
        dice?.text?.content?.includes('https://foundryvtt.com/packages/dice-so-nice'), true);
    const automation = out.pages.find(p => p.name === '自動処理／手動');
    check('every permitted page is translated', !!automation, true);
    check('page count', out.pages.length, welcome.pages.length);

    /*
     * The licence boundary, asserted rather than trusted: DPCGL 1.9.3 keeps the
     * campaign frame out of any written derivative, so it must not appear in
     * the translation file under any key.
     */
    const frame = JSON.parse(
        await fs.readFile(new URL(files.find(f => f.includes('Witherwild')), dir), 'utf8')
    );
    check('the campaign frame exists upstream', frame.name, 'Witherwild Campaign Frame');
    check('and is absent from the translation file',
        [frame.name, frame._id].some(key => key in entries), false);
    check('only the two permitted journals were written', Object.keys(entries).sort(),
        ['Daggerheart SRD', 'Welcome - Information']);

    /*
     * Upstream's Credits page is where the DPCGL 4.3 notice actually lives, so
     * it must stay in English and out of the translation file.
     */
    check('the credits page exists upstream',
        welcome.pages.some(page => page.name === 'Credits'), true);
    check('and is not in the translation file',
        'Credits' in (entries['Welcome - Information']?.pages ?? {}), false);
    check('the notice it carries is the one this module had to restate',
        welcome.pages.find(page => page.name === 'Credits').text.content
            .includes('There are no previous modifications by others'), true);
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
