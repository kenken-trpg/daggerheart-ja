/**
 * Fetch the upstream material that this translation tracks.
 *
 * The fork used to carry these files because it *was* the system. This module
 * is not, so they are upstream's and are fetched rather than committed: keeping
 * copies would mean maintaining two sources of truth and would put upstream's
 * content in our history for no reason.
 *
 * Two things come across, both from one tarball so they cannot disagree:
 *
 *   lang/en.json       the UI strings, which tools/lang-sync.mjs measures against
 *   src/packs/ **.json the compendium content, which tools/packs-sync.mjs reads
 *
 * The version is pinned in lang/.reference/pinned.json, so a later report says
 * which upstream release the translation is currently measured against. Taking a
 * new upstream release is this command plus the sync tools -- there is no merge,
 * which is the whole point of being a module.
 *
 *   node tools/fetch-reference.mjs           # latest on main
 *   node tools/fetch-reference.mjs 2.10.9    # a specific tag
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

const UPSTREAM = 'Foundryborne/daggerheart';
const REFERENCE_DIR = path.join('lang', '.reference');

const ref = process.argv[2] ?? 'main';

/*
 * One tarball rather than per-file requests: src/packs alone is ~1,800 files,
 * and fetching them individually would be both slow and rate-limited.
 */
const tarball = `https://codeload.github.com/${UPSTREAM}/tar.gz/${ref}`;
const response = await fetch(tarball);
if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${tarball}`);

const work = await fs.mkdtemp(path.join(os.tmpdir(), 'dh-reference-'));
const archive = path.join(work, 'upstream.tar.gz');
await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()));

/* --strip-components=1 drops the `daggerheart-<ref>/` wrapper directory. */
await run('tar', ['-xzf', archive, '-C', work, '--strip-components=1']);

const en = await fs.readFile(path.join(work, 'lang', 'en.json'), 'utf8');
const system = JSON.parse(await fs.readFile(path.join(work, 'system.json'), 'utf8'));

/* Parse before writing, so a fetch that returned an error page fails here. */
const keys = (function count(object) {
    return Object.values(object).reduce((total, value) => {
        return total + (value && typeof value === 'object' && !Array.isArray(value) ? count(value) : 1);
    }, 0);
})(JSON.parse(en));

await fs.rm(REFERENCE_DIR, { recursive: true, force: true });
await fs.mkdir(REFERENCE_DIR, { recursive: true });
await fs.writeFile(path.join(REFERENCE_DIR, 'en.json'), en);
await fs.rename(path.join(work, 'src', 'packs'), path.join(REFERENCE_DIR, 'packs'));

const packFiles = await (async function walk(dir) {
    const found = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found.push(...(await walk(full)));
        else if (entry.name.endsWith('.json')) found.push(full);
    }
    return found;
})(path.join(REFERENCE_DIR, 'packs'));

await fs.writeFile(
    path.join(REFERENCE_DIR, 'pinned.json'),
    `${JSON.stringify(
        { upstream: UPSTREAM, ref, version: system.version, keys, packFiles: packFiles.length, fetched: new Date().toISOString().slice(0, 10) },
        null,
        4
    )}\n`
);

await fs.rm(work, { recursive: true, force: true });

console.log(`fetched ${UPSTREAM}@${ref} (system ${system.version}): ${keys} UI keys, ${packFiles.length} pack files -> ${REFERENCE_DIR}/`);
