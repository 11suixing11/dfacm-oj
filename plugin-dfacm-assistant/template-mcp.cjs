'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function createTemplateServer(resourceRoot) {
    const templates = new Map();
    const root = path.join(resourceRoot, 'references/templates');
    for (const name of fs.readdirSync(root).filter(name => /^[a-z0-9-]+\.md$/.test(name)).sort()) {
        templates.set(name, fs.readFileSync(path.join(root, name), 'utf8'));
    }
    const loaded = new Set();
    return function handle(message) {
        if (!message || message.jsonrpc !== '2.0' || !Object.hasOwn(message, 'id')) return null;
        const result = (value) => ({ jsonrpc: '2.0', id: message.id, result: value });
        if (message.method === 'initialize') return result({
            protocolVersion: '2024-11-05', capabilities: { tools: {} },
            serverInfo: { name: 'acm-trainer-templates', version: '1.0.0' },
        });
        if (message.method === 'ping') return result({});
        if (message.method === 'tools/list') return result({ tools: [{
            name: 'read_template', description: '只读 acm-trainer 算法模板。仅调用命中的 1–2 个模板。',
            inputSchema: { type: 'object', properties: { name: { type: 'string', enum: [...templates.keys()] } }, required: ['name'], additionalProperties: false },
            annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        }] });
        if (message.method === 'resources/list') return result({ resources: [] });
        if (message.method === 'resources/templates/list') return result({ resourceTemplates: [] });
        if (message.method === 'tools/call') {
            const args = message.params?.arguments;
            if (message.params?.name !== 'read_template' || !args || Array.isArray(args)
                || Object.keys(args).length !== 1 || !templates.has(args.name)
                || !loaded.has(args.name) && loaded.size >= 2) {
                return result({ isError: true, content: [{ type: 'text', text: '仅允许读取白名单内最多两个算法模板。' }] });
            }
            loaded.add(args.name);
            return result({ content: [{ type: 'text', text: templates.get(args.name) }] });
        }
        return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported template operation' } };
    };
}

if (require.main === module) {
    try {
        const handle = createTemplateServer(process.argv[2]);
        // Newline-delimited JSON is the MCP stdio transport. No filesystem
        // paths or environment values can be requested through this server.
        readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
            if (Buffer.byteLength(line) > 65536) { process.exitCode = 1; process.stdin.destroy(); return; }
            try {
                const response = handle(JSON.parse(line));
                if (response) process.stdout.write(JSON.stringify(response) + '\n');
            } catch { process.exitCode = 1; process.stdin.destroy(); }
        });
    } catch { process.exitCode = 1; }
}

module.exports = { createTemplateServer };
