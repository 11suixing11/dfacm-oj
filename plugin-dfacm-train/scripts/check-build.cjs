'use strict';

const path = require('node:path');
const os = require('node:os');
const esbuild = require('esbuild');

async function checkBuild() {
    const root = path.resolve(__dirname, '..');
    const backend = esbuild.buildSync({ entryPoints: [path.join(root, 'index.ts')], bundle: true, platform: 'node',
        format: 'cjs', write: false, external: ['hydrooj'], tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } });
    const frontend = await esbuild.build({ entryPoints: [path.join(root, 'frontend/training.page.ts')],
        bundle: true, format: 'iife', target: ['chrome65'], outdir: os.tmpdir(), write: false,
        plugins: [{ name: 'hydro-federation', setup(builder) {
            builder.onResolve({ filter: /^@hydrooj\/ui-default/ }, () => ({ path: 'api', namespace: 'ui-default' }));
            builder.onLoad({ filter: /.*/, namespace: 'ui-default' }, () => ({ contents: 'module.exports = window.HydroExports;', loader: 'tsx' }));
        } }],
    });
    return { backend, frontend };
}

if (require.main === module) checkBuild().then(({ backend, frontend }) => {
    console.log(`Backend: ${backend.outputFiles[0].contents.length} bytes; native frontend: ${frontend.outputFiles.map((file) => path.extname(file.path)).join(', ')}.`);
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { checkBuild };
