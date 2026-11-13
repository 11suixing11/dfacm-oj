const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

// Same-host POSIX advisory lock: the kernel releases it when the pipe/holder dies.
// Keep the lock file in place; unlinking a flock file permits two different locks.
function createStateStore(filename) {
    const filenameAbsolute = path.resolve(filename);
    const directory = path.dirname(filenameAbsolute);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    return {
        path: filenameAbsolute,
        async load() {
            try { return JSON.parse(fs.readFileSync(filenameAbsolute, 'utf8')); }
            catch (error) { if (error.code === 'ENOENT') return null; throw error; }
        },
        async save(value) {
            const temporary = `${filenameAbsolute}.${randomUUID()}.tmp`;
            let fd;
            try {
                fd = fs.openSync(temporary, 'wx', 0o600);
                fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
                fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
                fs.renameSync(temporary, filenameAbsolute);
                const dirfd = fs.openSync(directory, 'r');
                try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
            } finally {
                if (fd !== undefined) fs.closeSync(fd);
                try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
            }
        },
        async lock() {
            const lockfile = `${filenameAbsolute}.lock`;
            const fd = fs.openSync(lockfile, 'a', 0o600); fs.closeSync(fd);
            const child = spawn('flock', ['-n', '-E', '73', lockfile, process.execPath, '-e',
                'process.stdout.write("LOCKED\\n"); process.stdin.resume();'], { stdio: ['pipe', 'pipe', 'pipe'] });
            let stderr = ''; child.stderr.on('data', (data) => { stderr += data; });
            const exited = new Promise((resolve) => child.once('close', resolve));
            await new Promise((resolve, reject) => {
                child.once('error', reject);
                child.once('exit', (code) => reject(new Error(`Verification state locked or flock unavailable (${code}): ${stderr}`)));
                child.stdout.once('data', () => resolve());
            });
            return async () => { child.stdin.end(); await exited; };
        },
    };
}
module.exports = { createStateStore };
