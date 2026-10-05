const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

function stripLocalTarget(target) {
    let value = String(target).trim();
    if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1);
    value = value.split('#', 1)[0];
    return value;
}

function isLocalTarget(target) {
    return target
        && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)
        && !target.startsWith('#');
}

function readCleanText() {
    const source = read('deploy/culture/debrand_public.js');
    const start = source.indexOf('function cleanText');
    const end = source.indexOf('\n}\n\nsetSystem', start);
    assert.ok(start >= 0 && end > start, 'debrand_public.js cleanText function not found');
    const context = vm.createContext({ NAME: 'd&f算法网' });
    vm.runInContext(`${source.slice(start, end + 2)}\nthis.cleanText = cleanText;`, context);
    return context.cleanText;
}

test('repository README presents the current public identity', () => {
    const readme = read('README.md');
    assert.match(readme, /^# d&f算法网/m);
    assert.match(readme, /每个人都能在算法竞赛这条路上找到属于自己的 final/);
    assert.match(readme, /https:\/\/dfacm\.website/);
    assert.match(readme, /https:\/\/swpuacm\.xyz/);
    assert.match(readme, /github\.com\/11suixing11\/dfacm-oj/);
});

test('Caddy keeps both domains and their www entries', () => {
    const caddy = read('deploy/Caddyfile.example');
    assert.match(
        caddy,
        /dfacm\.website,\s*www\.dfacm\.website,\s*swpuacm\.xyz,\s*www\.swpuacm\.xyz\s*\{/,
    );
});

test('each public plugin README starts with the d&f brand', () => {
    const pluginReadmes = [
        'plugin-swpu-broadcast/README.md',
        'plugin-swpu-ops/README.md',
        'plugin-swpu-regcode/README.md',
        'plugin-swpu-shop/README.md',
        'plugin-swpu-train/README.md',
    ];
    for (const file of pluginReadmes) {
        assert.match(read(file), /^# d&f算法网/m, `${file} is missing the public brand title`);
    }
});

test('the active theme uses the DFACM public marker', () => {
    assert.match(read('theme/00-brand.css'), /==== DFACM brand overlay/);
});

test('README images and relative Markdown links point to tracked files', () => {
    const readme = read('README.md');
    const imageTargets = [
        ...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g),
        ...readme.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi),
    ].map((match) => match[1])
        .filter(isLocalTarget)
        .map(stripLocalTarget);

    assert.ok(imageTargets.length >= 5, 'README should keep its main product screenshots');
    for (const target of imageTargets) {
        assert.ok(exists(target), `README image target is missing: ${target}`);
    }

    const markdownTargets = [...readme.matchAll(/\[[^\]]+\]\((<[^>]+>|[^)\s]+)\)/g)]
        .map((match) => match[1])
        .filter(isLocalTarget)
        .map(stripLocalTarget)
        .filter((target) => /\.md$/i.test(target));

    assert.ok(markdownTargets.length > 0, 'README should link to local Markdown documentation');
    for (const target of new Set(markdownTargets)) {
        assert.ok(exists(target), `README Markdown target is missing: ${target}`);
    }
});

test('deployment docs no longer claim school-team or school-contest ownership', () => {
    const deployment = read('deploy/deployment.md');
    assert.doesNotMatch(
        deployment,
        /西南石油大学|校内|校赛|选拔赛|集训队|school\s+selection|school\s+team|university[-\s]+owned/i,
    );
});

test('public migration keeps swpuacm.xyz compatibility URLs intact', () => {
    const cleanText = readCleanText();
    const urls = [
        'swpuacm.xyz',
        'SWPUACM.XYZ',
        'www.swpuacm.xyz',
        'WWW.SWPUACM.XYZ/path',
        'https://swpuacm.xyz/',
        'HTTPS://WWW.SWPUACM.XYZ/path?q=1',
    ];
    for (const value of urls) assert.equal(cleanText(value), value, `compatibility URL changed: ${value}`);

    assert.equal(cleanText('SWPU OJ'), 'd&f算法网');
    const mixed = cleanText('https://SWPUACM.XYZ/p/2 and www.swpuacm.xyz');
    assert.match(mixed, /https:\/\/SWPUACM\.XYZ\/p\/2/);
    assert.match(mixed, /www\.swpuacm\.xyz/);
});

test('public migration removes former school branding', () => {
    const cleanText = readCleanText();
    const cleaned = cleanText('西南石油大学 ACM 团队 SWPU OJ 校内选拔赛 校赛');
    assert.doesNotMatch(cleaned, /西南石油大学|SWPU\s*(?:OJ|ACM)|校内选拔赛|校赛/i);
    assert.match(cleaned, /d&f算法网|专题挑战赛|专题赛/);
});
