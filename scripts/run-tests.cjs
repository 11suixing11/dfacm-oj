const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function collect(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules') return [];
        const full = path.join(directory, entry.name);
        return entry.isDirectory() ? collect(full) : /\.test\.(ts|cjs|mjs)$/.test(entry.name) ? [full] : [];
    });
}
const files = ['plugin-swpu-regcode', 'plugin-swpu-ops', 'tests', 'scripts'].flatMap((name) => collect(path.join(root, name))).sort();
if (!files.length) throw new Error('No regression tests found');
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
