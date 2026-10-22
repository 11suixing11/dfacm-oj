'use strict';

const path = require('node:path');
const os = require('node:os');
const esbuild = require('esbuild');

async function checkBuild() {
    const root = path.resolve(__dirname, '..');
    const backend = esbuild.buildSync({ entryPoints: [path.join(root, 'index.ts')], platform: 'node',
        format: 'cjs', bundle: true, write: false, external: ['hydrooj'],
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } });
    // Same federation import and CSS output handling as ui-default 4.58.5.
    const frontend = await esbuild.build({ stdin: {
        contents: `import ${JSON.stringify(path.join(root, 'frontend/assistant.page.ts'))}; import ${JSON.stringify(path.join(root, 'frontend/account-settings.page.ts'))};`,
        resolveDir: os.tmpdir(), sourcefile: 'stdin.ts', loader: 'ts',
    }, format: 'iife', bundle: true, outdir: os.tmpdir(), write: false, target: ['chrome65'],
    plugins: [{ name: 'hydro-federation', setup(builder) {
        builder.onResolve({ filter: /^@hydrooj\/ui-default/ }, () => ({ path: 'api', namespace: 'ui-default' }));
        builder.onLoad({ filter: /.*/, namespace: 'ui-default' }, () => ({ contents: 'module.exports = window.HydroExports;', loader: 'tsx' }));
    } }] });
    return { backend, frontend };
}

if (require.main === module) {
    checkBuild().then(({ backend, frontend }) => {
        console.log(`Backend build passed (${backend.outputFiles[0].contents.length} bytes); native frontend build passed (${frontend.outputFiles.map((file) => path.extname(file.path)).join(', ')}).`);
    }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { checkBuild };
