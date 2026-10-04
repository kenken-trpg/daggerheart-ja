/**
 * Fetch the upstream English original that the translation tracks.
 *
 * The fork used to carry lang/en.json because it *was* the system. This module
 * is not, so the original is upstream's file and is fetched rather than
 * committed: keeping a copy would mean maintaining two sources of truth and
 * would put upstream's strings in our history for no reason.
 *
 * The fetched version is pinned in lang/.reference/pinned.json, so a later
 * `report` says which upstream release the translation is currently measured
 * against. Taking a new upstream release is this command plus
 * `lang:report` / `lang:prepare` / `lang:apply` -- there is no merge, which is
 * the whole point of being a module.
 *
 *   node tools/fetch-reference.mjs           # latest system.json on main
 *   node tools/fetch-reference.mjs 2.10.9    # a specific tag
 */

import fs from 'fs/promises';
import path from 'path';

const UPSTREAM = 'Foundryborne/daggerheart';
const REFERENCE_DIR = path.join('lang', '.reference');

const raw = (ref, file) => `https://raw.githubusercontent.com/${UPSTREAM}/${ref}/${file}`;

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return response.text();
}

const ref = process.argv[2] ?? 'main';

/*
 * system.json is read for the version, so the pin records what upstream calls
 * this code rather than a commit hash nobody can place. On `main` the version
 * is whatever is unreleased, which is correct: it is what en.json belongs to.
 */
const system = JSON.parse(await fetchText(raw(ref, 'system.json')));
const en = await fetchText(raw(ref, 'lang/en.json'));

/* Parse before writing, so a fetch that returned an error page fails here. */
const keys = (function count(object) {
    return Object.values(object).reduce((total, value) => {
        return total + (value && typeof value === 'object' && !Array.isArray(value) ? count(value) : 1);
    }, 0);
})(JSON.parse(en));

await fs.mkdir(REFERENCE_DIR, { recursive: true });
await fs.writeFile(path.join(REFERENCE_DIR, 'en.json'), en);
await fs.writeFile(
    path.join(REFERENCE_DIR, 'pinned.json'),
    `${JSON.stringify(
        {
            upstream: UPSTREAM,
            ref,
            version: system.version,
            keys,
            fetched: new Date().toISOString().slice(0, 10)
        },
        null,
        4
    )}\n`
);

console.log(`fetched ${UPSTREAM}@${ref} (system ${system.version}), ${keys} keys -> ${REFERENCE_DIR}/en.json`);
