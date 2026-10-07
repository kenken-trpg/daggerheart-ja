/**
 * The approved Japanese wordings, shared by lang-sync.mjs and packs-sync.mjs.
 *
 * Two things live here because both tools need the same answer to "what do we
 * call this in Japanese": the CSV glossaries checked in under
 * lang/translation/glossary/, and the wordings lang/ja.json already ships,
 * which are the house style and outrank any glossary.
 *
 * Matching is on the English string rather than the key, so a wording approved
 * once carries over to every key -- and every compendium field -- that reuses
 * it. That is what lets `packs:terms` hold the compendium to the UI's wording.
 */

import fs from 'fs/promises';
import path from 'path';

const GLOSSARY_DIR = path.join('lang', 'translation', 'glossary');

export { GLOSSARY_DIR };

/**
 * Normalizing absorbs the punctuation drift between the SRD, the CSV exports
 * and en.json, so "Hope." and "hope" are the same term.
 */
export const normalize = string =>
    String(string)
        .toLowerCase()
        .replace(/[−–—]/g, '-')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ')
        .replace(/[.。]$/, '')
        .trim();

export function parseCsv(text) {
    const rows = [];
    let row = [],
        field = '',
        quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char !== '"') field += char;
            else if (text[i + 1] === '"') (field += '"'), i++;
            else quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === ',') (row.push(field), (field = ''));
        else if (char === '\n') (row.push(field), rows.push(row), (row = []), (field = ''));
        else if (char !== '\r') field += char;
    }
    if (field || row.length) (row.push(field), rows.push(row));
    return rows;
}

/**
 * Every CSV in lang/translation/glossary/ maps an English string to a Japanese
 * one in its first two columns. Later files win, so an SRD-wide glossary can be
 * dropped in front of a narrower correction file by name. Each entry remembers
 * which file it came from, so a disagreement can be attributed to its source.
 *
 * `only` narrows the load to the glossaries whose filename contains it, which
 * is how one external translation gets compared on its own rather than through
 * the merged stack of every glossary present.
 */
export async function loadGlossaries(only) {
    let files = [];
    try {
        files = (await fs.readdir(GLOSSARY_DIR)).filter(f => f.endsWith('.csv')).toSorted();
    } catch {
        return { glossary: new Map(), sources: [] };
    }
    if (only) files = files.filter(file => file.includes(only));
    return loadGlossaryFiles(files.map(file => path.join(GLOSSARY_DIR, file)));
}

/**
 * The same load, from paths given outright rather than discovered in
 * GLOSSARY_DIR.
 *
 * An outside translation has to be weighed before it is taken in -- the
 * translator's permission may not be given, and the wordings may collide with
 * wordings already shipped across thousands of fields. Dropping the CSV into
 * GLOSSARY_DIR to find that out would make every other tool compare against it
 * too: `packs:terms` and `check` would start reporting against a source that
 * has not been adopted, and `prepare` would pre-fill from it. So a file can be
 * read where it lies, which keeps the decision reversible by not making one.
 *
 * Entries are labelled by basename, so a report attributes a wording to the
 * same name whether the file was placed or merely pointed at.
 */
export async function loadGlossaryFiles(paths) {
    const glossary = new Map();
    const sources = [];
    for (const file of paths) {
        const rows = parseCsv((await fs.readFile(file, 'utf8')).replace(/^\ufeff/, ''));
        const label = path.basename(file);
        let entries = 0;
        for (const [english, japanese] of rows.slice(1)) {
            if (!english?.trim() || !japanese?.trim()) continue;
            glossary.set(normalize(english), { japanese: japanese.trim(), file: label });
            entries++;
        }
        sources.push({ file: label, entries, path: file });
    }
    return { glossary, sources };
}

export function establishedWordings(en, ja) {
    const established = new Map();
    for (const key of Object.keys(ja)) {
        if (typeof en[key] !== 'string' || typeof ja[key] !== 'string' || en[key] === ja[key]) continue;
        established.set(normalize(en[key]), { japanese: ja[key], file: 'lang/ja.json' });
    }
    return established;
}

/** Flatten a nested localization object into dotted keys. */
export function flatten(object, prefix = '', out = {}) {
    for (const [key, value] of Object.entries(object)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, `${prefix}${key}.`, out);
        else out[prefix + key] = value;
    }
    return out;
}
