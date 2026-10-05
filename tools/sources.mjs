/**
 * What English text each translation was made from.
 *
 * Both `lang:report` and `packs:report` compare key sets: a key upstream has
 * added shows up as untranslated, a key upstream has dropped shows up as
 * retired. Neither can see the third case -- upstream rewrites the English
 * under a key that already has a translation. The Japanese then stays, silently
 * answering a sentence that is no longer there, and every check passes: the key
 * exists, the field is filled, the enrichers match.
 *
 * So each applied translation records a hash of the English it was made from,
 * in lang/translation/sources/. When the hash no longer matches the fetched
 * upstream original, the translation is reworded-stale and is reported as its
 * own category -- not untranslated (it has text) and not retired (the key
 * lives), but needing a second look.
 *
 * These files are maintenance records, not shipped content: they live outside
 * babele/ so Babele never loads them, and they are written only by `apply` and
 * `stamp`.
 *
 * Hashes are truncated sha256. Collisions do not matter here: a false match
 * would have to be a rewrite whose hash equals the original's, and the cost of
 * a miss is one unflagged string, not a corrupt file.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const DIR = path.join('lang', 'translation', 'sources');

export const hash = text => crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);

const file = name => path.join(DIR, `${name}.json`);

/** The recorded hashes for one scope ("ui", or a pack collection). */
export async function readSources(name) {
    try {
        return JSON.parse(await fs.readFile(file(name), 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

export async function writeSources(name, record) {
    await fs.mkdir(DIR, { recursive: true });
    /* Sorted so a diff of this file shows what changed, not a reshuffle. */
    const sorted = Object.fromEntries(Object.entries(record).toSorted(([a], [b]) => (a < b ? -1 : 1)));
    await fs.writeFile(file(name), `${JSON.stringify(sorted, null, 4)}\n`);
}

/**
 * How one translated field stands against the English it was made from:
 * `fresh`    the recorded hash matches the current original
 * `reworded` it does not -- upstream has rewritten the English
 * `unstamped` nothing was recorded, so this cannot be judged
 */
export function freshness(record, key, source) {
    const recorded = record[key];
    if (!recorded) return 'unstamped';
    return recorded === hash(source) ? 'fresh' : 'reworded';
}
