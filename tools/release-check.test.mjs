import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkArchive, checkRelease, checkSource, payloadFiles, RELEASE_PATHS } from './release-check.mjs';

function fixture(t) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'daggerheart-release-test-'));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    const write = (file, content) => {
        fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
        fs.writeFileSync(path.join(cwd, file), typeof content === 'string' ? content : JSON.stringify(content));
    };
    const manifest = {
        id: 'daggerheart-ja', version: '0.1.1', url: 'https://github.com/example/module',
        manifest: 'https://raw.githubusercontent.com/example/module/main/module.json',
        download: 'https://github.com/example/module/releases/download/0.1.1/module.zip',
        flags: { hotReload: {} },
    };
    write('module.json', manifest);
    write('package.json', { version: manifest.version });
    for (const file of ['lang/ja.json', 'styles/test.css', 'scripts/test.mjs', 'babele/ja/test.json', 'README.md', 'LICENSE', 'NOTICE']) write(file, 'original');
    const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
    git('tag', manifest.version);
    const bump = version => {
        manifest.version = version;
        manifest.download = `https://github.com/example/module/releases/download/${version}/module.zip`;
        write('module.json', manifest);
        write('package.json', { version });
    };
    const archive = () => {
        const directory = path.join(cwd, 'assets');
        fs.mkdirSync(directory, { recursive: true });
        for (const file of payloadFiles(cwd)) {
            fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
            fs.copyFileSync(path.join(cwd, file), path.join(directory, file));
        }
        const released = { ...manifest };
        delete released.flags;
        fs.writeFileSync(path.join(directory, 'module.json'), JSON.stringify(released));
        execFileSync('zip', ['-qr', 'module.zip', ...RELEASE_PATHS], { cwd: directory });
        return directory;
    };
    return { cwd, write, manifest, git, bump, archive };
}

test('unchanged published payload passes even after a development-only commit', t => {
    const f = fixture(t);
    f.write('tools/dev.mjs', 'dev only');
    f.git('add', '.');
    f.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'dev');
    assert.equal(checkSource(f.cwd).pending, false);
});

for (const [name, change] of [
    ['translation change', f => f.write('lang/ja.json', 'updated')],
    ['new payload file', f => f.write('babele/ja/new.json', 'new')],
    ['deleted payload file', f => fs.unlinkSync(path.join(f.cwd, 'scripts/test.mjs'))],
    ['README change', f => f.write('README.md', 'updated')],
]) {
    test(`same version rejects ${name}, including in PR mode`, t => {
        const f = fixture(t);
        change(f);
        assert.throws(() => checkSource(f.cwd, { allowUnreleased: true }), /differs from tag/);
    });
}

test('bumped version passes PR check but missing tag fails distribution check', t => {
    const f = fixture(t);
    f.bump('0.1.2');
    assert.equal(checkSource(f.cwd, { allowUnreleased: true }).pending, true);
    assert.throws(() => checkSource(f.cwd), /tag 0.1.2 is missing/);
});

test('package version, download URL and canonical tag names are required', t => {
    const f = fixture(t);
    f.write('package.json', { version: '0.1.2' });
    assert.throws(() => checkSource(f.cwd), /versions must match/);
    f.bump('0.1.2');
    f.write('module.json', { ...f.manifest, download: 'https://github.com/example/module/releases/download/0.1.1/module.zip' });
    assert.throws(() => checkSource(f.cwd), /Manifest URLs/);
    f.bump('0.1.2');
    f.git('tag', 'v0.1.2');
    assert.throws(() => checkSource(f.cwd), /tag 0.1.2 is missing/);
});

test('an older untagged version cannot pass PR mode', t => {
    const f = fixture(t);
    f.bump('0.1.0');
    assert.throws(() => checkSource(f.cwd, { allowUnreleased: true }), /older/);
});

test('published archive matches source after removal of development flags', t => {
    const f = fixture(t);
    assert.doesNotThrow(() => checkArchive(f.cwd, f.archive()));
});

test('a ZIP with stale translations fails despite correct version and assets', t => {
    const f = fixture(t);
    const directory = f.archive();
    f.write('lang/ja.json', 'new translation');
    assert.throws(() => checkArchive(f.cwd, directory), /stale or changed content: lang\/ja.json/);
});

test('missing ZIP entries and stale attached manifest fail', t => {
    const f = fixture(t);
    const directory = f.archive();
    execFileSync('zip', ['-qd', 'module.zip', 'NOTICE'], { cwd: directory });
    assert.throws(() => checkArchive(f.cwd, directory), /file list differs/);
    fs.writeFileSync(path.join(directory, 'module.json'), JSON.stringify({ ...f.manifest, version: '0.1.0' }));
    assert.throws(() => checkArchive(f.cwd, directory), /Published module.json differs/);
});

test('draft, prerelease and missing or empty release assets fail', () => {
    const manifest = { version: '0.1.2' };
    const release = {
        tagName: manifest.version, isDraft: false, isPrerelease: false,
        assets: [{ name: 'module.json', size: 100 }, { name: 'module.zip', size: 200 }],
    };
    assert.doesNotThrow(() => checkRelease(release, manifest));
    assert.throws(() => checkRelease({ ...release, isDraft: true }, manifest), /public, stable/);
    assert.throws(() => checkRelease({ ...release, isPrerelease: true }, manifest), /public, stable/);
    assert.throws(() => checkRelease({ ...release, assets: [release.assets[0]] }, manifest), /missing module.zip/);
    assert.throws(() => checkRelease({ ...release, assets: [{ name: 'module.json', size: 0 }] }, manifest), /missing module.json/);
});
