'use strict';

const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');

// Load the published Hydro framework, so HTTP tests use its actual argument
// decorators and string conversion instead of bypassing them with no-op stubs.
const framework = path.dirname(require.resolve('@hydrooj/framework/package.json'));
function load(entry) {
    const compiled = esbuild.buildSync({ entryPoints: [path.join(framework, entry)], platform: 'node',
        format: 'cjs', bundle: true, write: false, packages: 'external' }).outputFiles[0].text;
    const runtime = new Module(path.join(framework, 'assistant-runtime.cjs'), module);
    runtime.filename = path.join(framework, 'assistant-runtime.cjs');
    runtime.paths = module.paths;
    runtime._compile(compiled, runtime.filename);
    return runtime.exports;
}

module.exports = { ...load('decorators.ts'), ...load('validator.ts') };
