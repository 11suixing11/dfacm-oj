'use strict';

// Rebuild the checked-in, self-hosted browser bundle. No production npm install.
const fs = require('node:fs/promises');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const esbuild = require('esbuild');

const VERSION = '7.1.3';
const INTEGRITY = 'Mn8VNqLX80C93UFh0s9aKqhHUSh0BwK8pczyQ+nNDKutJeM0/SVLkJoizTfX9sdmwGiS6+hkAHAg9YC10Us0gg==';

function entries(archive) {
    const files = new Map();
    for (let offset = 0; offset + 512 <= archive.length;) {
        const header = archive.subarray(offset, offset + 512);
        const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
        if (!name) break;
        const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8);
        if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > archive.length) throw new Error('Invalid npm archive');
        files.set(name, archive.subarray(offset + 512, offset + 512 + size).toString('utf8'));
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
}

async function main() {
    const response = await fetch(`https://registry.npmjs.org/fullcalendar/-/fullcalendar-${VERSION}.tgz`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`npm HTTP ${response.status}`);
    const tarball = Buffer.from(await response.arrayBuffer());
    if (createHash('sha512').update(tarball).digest('base64') !== INTEGRITY) throw new Error('FullCalendar archive integrity mismatch');
    const files = entries(gunzipSync(tarball));
    const read = (name) => {
        const value = files.get(`package/${name}`);
        if (value === undefined) throw new Error(`Archive missing ${name}`);
        return value;
    };
    const javascript = ['all/global.js', 'themes/classic/global.js', 'locales/zh-cn/global.js'].map(read).join('\n;\n');
    // The upstream palette uses :root. Keep every custom property on our page.
    const css = ['skeleton.css', 'themes/classic/theme.css', 'themes/classic/palette.css'].map(read).join('\n')
        .replace(/:root\s*\{/g, '.dfacm-cal__grid {')
        .replace(/\[data-color-scheme=dark\]/g, 'html.theme--dark .dfacm-cal__grid');
    const banner = `/*! FullCalendar ${VERSION}, MIT; includes Preact and temporal-polyfill. See FULLCALENDAR-LICENSE.txt. */\n`;
    const output = new Map([
        [`fullcalendar-${VERSION}.js`, banner + (await esbuild.transform(javascript, { loader: 'js', target: 'es2020', minify: true, legalComments: 'inline' })).code],
        [`fullcalendar-${VERSION}.css`, banner + (await esbuild.transform(css, { loader: 'css', minify: true, legalComments: 'inline' })).code],
        ['FULLCALENDAR-LICENSE.txt', read('LICENSE.md') + '\n\nBundled dependency: Preact\nMIT License\nCopyright (c) 2015-present Jason Miller\n\n' + read('LICENSE.md').slice(read('LICENSE.md').indexOf('Permission is hereby granted')) + '\n\nBundled dependency: temporal-polyfill\nhttps://github.com/fullcalendar/temporal-polyfill\n\n' + read('LICENSE.md')],
    ]);
    const directory = path.join(__dirname, 'vendor');
    await fs.mkdir(directory, { recursive: true });
    for (const [name, content] of output) await fs.writeFile(path.join(directory, name), content, 'utf8');
    const manifest = {
        version: VERSION, source: `https://registry.npmjs.org/fullcalendar/-/fullcalendar-${VERSION}.tgz`,
        integrity: `sha512-${INTEGRITY}`, esbuild: esbuild.version,
        sha256: Object.fromEntries([...output].map(([name, content]) => [name, createHash('sha256').update(content).digest('hex')])),
    };
    await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`FullCalendar ${VERSION}: archive verified, browser assets rebuilt`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
