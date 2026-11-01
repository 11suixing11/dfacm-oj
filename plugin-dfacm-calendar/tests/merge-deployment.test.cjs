'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { patchCaddy, patchHome, patchAddons, DEST, COLLECTOR } = require('../scripts/merge-deployment.cjs');
const snippet = fs.readFileSync(path.join(__dirname, '../../plugin-dfacm-ai-contests/deploy/caddy.inc'), 'utf8');

test('merge limits the AI reverse proxy to APIs and preserves unrelated Caddy directives', () => {
    const old = '  # d&f AI competition hub: the service listens on loopback and keeps /calendar free.\n'
        + '  @aiContestRoot path /ai-contests\n  redir @aiContestRoot /ai-contests/ 308\n'
        + '  handle_path /ai-contests/* {\n    reverse_proxy http://127.0.0.1:8765 {\n'
        + '      header_up -Cookie\n      header_up -Authorization\n    }\n  }\n';
    const before = 'dfacm.website, swpuacm.xyz {\n  encode zstd gzip\n' + old + '  @regpage path /reg\n  reverse_proxy 127.0.0.1:8888\n}\n';
    const next = patchCaddy(before, snippet);
    assert.equal(next, before.replace(old, snippet));
    assert.equal(patchCaddy(next, snippet), next);
    assert.throws(() => patchCaddy(before.replace('127.0.0.1:8765', '127.0.0.1:9876'), snippet));
    assert.throws(() => patchCaddy(before.replace(old, old + old), snippet));
});

test('merge replaces both home links and keeps all existing registration links', () => {
    const home = '<nav class="links"><a href="/reg">注册</a><a href="/ai-contests/">AI 赛讯</a></nav>'
        + '<main>Existing custom content</main><nav id="mmenu"><a href="/ai-contests/">AI 赛讯</a><a href="/shop">商城</a></nav>';
    const next = patchHome(home);
    assert.equal(next, home.replaceAll('<a href="/ai-contests/">AI 赛讯</a>', '<a href="/calendar">赛事日历</a>'));
    assert.equal(patchHome(next), next);
    assert.throws(() => patchHome(home.replace('href="/ai-contests/"', 'href="/unknown"')));
    assert.throws(() => patchHome(home.replace('<main>', '<a href="/ai-contests/custom">Legacy</a><main>')));
});

test('merge removes only the obsolete AI navigation addon and retains AI watch', () => {
    const addons = ['@hydrooj/ui-default', '/root/.hydro/addons/dfacm-assistant', DEST, COLLECTOR, '/root/.hydro/addons/dfacm-ai-watch'];
    const next = patchAddons(JSON.stringify(addons));
    assert.deepEqual(JSON.parse(next), addons.filter(addon => addon !== COLLECTOR));
    assert.equal(patchAddons(next), next);
    assert.throws(() => patchAddons(JSON.stringify(addons.filter(addon => addon !== DEST))));
    assert.throws(() => patchAddons(JSON.stringify([...addons, DEST])));
});
