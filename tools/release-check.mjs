/** Verify that Foundry's version, Git tag and downloadable payload agree. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

// The ZIP builder and checker use the same list. Development files are excluded.
export const RELEASE_PATHS = [
    'module.json', 'lang/ja.json', 'styles', 'scripts', 'babele', 'README.md', 'LICENSE', 'NOTICE',
];
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const run = (command, args, cwd) => execFileSync(command, args, { cwd, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const git = (cwd, ...args) => run('git', args, cwd).toString().trim();
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const newer = (a, b) => {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
};

export function payloadFiles(cwd) {
    const walk = name => {
        const stat = fs.lstatSync(path.join(cwd, name));
        if (stat.isSymbolicLink()) throw new Error(`Release payload must not contain symlinks: ${name}`);
        return stat.isDirectory()
            ? fs.readdirSync(path.join(cwd, name)).flatMap(child => walk(`${name}/${child}`))
            : [name];
    };
    return RELEASE_PATHS.flatMap(walk).sort();
}

export function checkSource(cwd, { allowUnreleased = false } = {}) {
    const manifest = readJson(path.join(cwd, 'module.json'));
    const version = manifest.version;
    if (!VERSION.test(version)) throw new Error('Use a release version such as 0.1.2 (no v prefix).');
    if (readJson(path.join(cwd, 'package.json')).version !== version) {
        throw new Error('module.json and package.json versions must match.');
    }
    const repo = new URL(manifest.url).pathname.slice(1).replace(/\/$/, '');
    if (manifest.url !== `https://github.com/${repo}` ||
        manifest.manifest !== `https://raw.githubusercontent.com/${repo}/main/module.json` ||
        manifest.download !== `https://github.com/${repo}/releases/download/${version}/module.zip`) {
        throw new Error('Manifest URLs must point to this repository and the current release version.');
    }
    const tags = git(cwd, 'tag', '--list').split('\n').filter(tag => VERSION.test(tag));
    if (tags.some(tag => newer(tag, version))) throw new Error(`Version ${version} is older than an existing release tag.`);
    const files = payloadFiles(cwd);
    if (!tags.includes(version)) {
        if (!allowUnreleased) {
            throw new Error(`Release tag ${version} is missing. Publish a GitHub Release for this version; pushing main alone does not distribute it.`);
        }
        console.log(`PENDING: ${version} is a new version; publish it after merging. Tags must be fetched before checking.`);
        return { manifest, files, pending: true };
    }
    // Compare names and bytes, so additions and deletions cannot slip through.
    const taggedFiles = git(cwd, 'ls-tree', '-r', '--name-only', version, '--', ...RELEASE_PATHS).split('\n').filter(Boolean).sort();
    if (!isDeepStrictEqual(files, taggedFiles) || files.some(file =>
        !fs.readFileSync(path.join(cwd, file)).equals(run('git', ['show', `${version}:${file}`], cwd)))) {
        throw new Error(`Release payload differs from tag ${version}. Bump module.json/package.json and the download URL before distributing changes.`);
    }
    console.log(`PASS: source payload matches release tag ${version}.`);
    return { manifest, files, pending: false };
}

export function checkArchive(cwd, directory) {
    const expected = readJson(path.join(cwd, 'module.json'));
    delete expected.flags; // Release workflow removes development-only hotReload flags.
    const attached = readJson(path.join(directory, 'module.json'));
    if (!isDeepStrictEqual(attached, expected)) throw new Error('Published module.json differs from the source manifest.');
    const archive = path.join(directory, 'module.zip');
    const files = payloadFiles(cwd);
    const entries = run('unzip', ['-Z1', archive], cwd).toString().trim().split('\n').filter(name => !name.endsWith('/')).sort();
    if (!isDeepStrictEqual(entries, files)) throw new Error('Published ZIP file list differs from the release payload.');
    for (const file of files) {
        const content = run('unzip', ['-p', archive, file], cwd);
        if (file === 'module.json') {
            if (!isDeepStrictEqual(JSON.parse(content), expected)) throw new Error('ZIP manifest differs from the source manifest.');
        } else if (!content.equals(fs.readFileSync(path.join(cwd, file)))) {
            throw new Error(`Published ZIP contains stale or changed content: ${file}`);
        }
    }
    console.log(`PASS: published manifest and ZIP match all ${files.length} source files.`);
}

export function checkRelease(release, manifest) {
    if (release.tagName !== manifest.version || release.isDraft || release.isPrerelease) {
        throw new Error('The current version must have a public, stable GitHub Release.');
    }
    for (const name of ['module.json', 'module.zip']) {
        if (!release.assets.some(asset => asset.name === name && asset.size > 0)) {
            throw new Error(`Published release ${manifest.version} is missing ${name}. Check the Release workflow.`);
        }
    }
}

export function checkPublished(cwd, manifest) {
    const repo = new URL(manifest.url).pathname.slice(1);
    const release = JSON.parse(run('gh', ['release', 'view', manifest.version, '--repo', repo,
        '--json', 'tagName,isDraft,isPrerelease,assets'], cwd));
    checkRelease(release, manifest);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daggerheart-release-check-'));
    try {
        run('gh', ['release', 'download', manifest.version, '--repo', repo, '--dir', directory,
            '--pattern', 'module.json', '--pattern', 'module.zip'], cwd);
        checkArchive(cwd, directory);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const args = process.argv.slice(2);
        if (args.some(arg => !['--files', '--allow-unreleased', '--published'].includes(arg))) throw new Error('Unknown release-check option.');
        if (args.includes('--files')) console.log(RELEASE_PATHS.join('\n'));
        else {
            const result = checkSource(process.cwd(), { allowUnreleased: args.includes('--allow-unreleased') });
            if (args.includes('--published')) {
                if (result.pending) throw new Error('Cannot check publication of an unreleased version.');
                checkPublished(process.cwd(), result.manifest);
            }
        }
    } catch (error) {
        console.error(`FAIL: ${error.message}`);
        process.exitCode = 1;
    }
}
