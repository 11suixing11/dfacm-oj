const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
for (const name of ['plugin-swpu-regcode', 'plugin-swpu-ops']) {
    esbuild.buildSync({
        entryPoints: [path.join(root, name, 'index.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node22',
        write: false,
        external: ['hydrooj', 'schemastery'],
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
        logLevel: 'warning',
    });
    console.log(`${name}: compilation OK`);
}
