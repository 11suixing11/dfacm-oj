'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PUBLIC_FILES } = require('./public-files.cjs');
const { relativeFile } = require('./deployment.cjs');

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const RULES = [
    ['private key', /-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/i],
    ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
    ['API credential', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/],
    ['cloud credential', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['credential connection string', /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|https?):\/\/[^\s/:@]+:[^\s/@]+@/i],
    ['personal home path', /(?:[A-Za-z]:[\\/]+Users[\\/]+[^\s\\/'"`]+|\/(?:Users|home)\/[^\s/'"`]+)/i],
    ['public or private IPv4 address', /\b(?!(?:127\.0\.0\.1|0\.0\.0\.0|192\.0\.2\.\d{1,3}|198\.51\.100\.\d{1,3}|203\.0\.113\.\d{1,3})\b)(?:\d{1,3}\.){3}\d{1,3}\b/],
    ['real server backup path', /ai-watch-(?:scope-)?before\.(?!XXXXXXXX\b)[A-Za-z0-9]{8}\b/],
    ['email address', /\b[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com\b|(?:[A-Za-z0-9-]+\.)*example\.(?:com|org|net)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
];

function violations(text) {
    const found = RULES.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
    for (const match of text.matchAll(/\b(?:https?|mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/([^\s/'"`<>]+)/gi)) {
        // A template expression is a runtime host, not a literal deployment
        // address. Static loopback hosts can also have templated ports.
        if (match[1].startsWith('${')) continue;
        const host = match[1].split(':')[0].replace(/[})]+$/, '').toLowerCase();
        if (!/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|github\.com|(?:[a-z0-9-]+\.)*example\.(?:com|org|net)|(?:[a-z0-9-]+\.)*example)$/.test(host)) {
            if (!found.includes('unapproved service address')) found.push('unapproved service address');
        }
    }
    return found;
}

function git(root, args, encoding = 'utf8') {
    const result = spawnSync('git', args, { cwd: root, encoding, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) throw new Error('Git inspection failed');
    return result.stdout;
}

function scanPublic(root, options = {}) {
    root = path.resolve(root);
    const issues = [];
    const allowed = new Set(PUBLIC_FILES);
    const addText = (location, data) => {
        if (data.length > MAX_TEXT_BYTES || data.includes(0)) {
            issues.push({ file: location, reasons: ['non-text or oversized public file'] }); return;
        }
        const reasons = violations(data.toString('utf8'));
        if (reasons.length) issues.push({ file: location, reasons });
    };
    for (const file of PUBLIC_FILES) {
        try { addText(file, fs.readFileSync(relativeFile(root, file))); }
        catch { issues.push({ file, reasons: ['missing or unsafe public file'] }); }
    }
    let commits = 0;
    if (options.git) {
        const top = git(root, ['rev-parse', '--show-toplevel']).trim();
        if (fs.realpathSync(top) !== fs.realpathSync(root)) throw new Error('Run Git privacy checks in the standalone addon repository');
        const indexFiles = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
        for (const file of indexFiles) {
            if (!allowed.has(file)) issues.push({ file, reasons: ['not in public file list'] });
            else addText('index:' + file, git(root, ['show', ':' + file], null));
        }
        const history = git(root, ['rev-list', '--all']).split(/\r?\n/).filter(Boolean);
        commits = history.length;
        const objects = new Set();
        for (const commit of history) {
            const meta = git(root, ['show', '-s', '--format=%ae%n%ce%n%B', commit]);
            const [authorEmail, committerEmail] = meta.split(/\r?\n/);
            if (![authorEmail, committerEmail].every(value => /^[^\s@]+@users\.noreply\.github\.com$/.test(value))) {
                issues.push({ file: 'commit:' + commit.slice(0, 12), reasons: ['commit email is not GitHub noreply'] });
            }
            const metaIssues = violations(meta);
            if (metaIssues.length) issues.push({ file: 'commit:' + commit.slice(0, 12), reasons: metaIssues });
            for (const entry of git(root, ['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean)) {
                const [info, file] = entry.split('\t');
                const [mode, type, object] = info.split(' ');
                if (!allowed.has(file)) issues.push({ file: 'history:' + file, reasons: ['not in public file list'] });
                if (type !== 'blob' || !['100644', '100755'].includes(mode)) issues.push({ file: 'history:' + file, reasons: ['unsafe Git file type'] });
                else if (!objects.has(object)) { objects.add(object); addText('history:' + file, git(root, ['cat-file', 'blob', object], null)); }
            }
        }
    }
    return { passed: issues.length === 0, files: PUBLIC_FILES.length, commits, issues };
}

module.exports = { violations, scanPublic };

if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        if (args.some(value => value !== '--git')) throw new Error('Usage: node scripts/check-public.cjs [--git]');
        const result = scanPublic(path.resolve(__dirname, '..'), { git: args.includes('--git') });
        console.log(JSON.stringify(result, null, 2));
        if (!result.passed) process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
