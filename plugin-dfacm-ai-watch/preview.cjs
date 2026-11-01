'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createDemo } = require('./demo.cjs');
const { createHandlers } = require('./http.cjs');
const { WatchError } = require('./config.cjs');

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
async function readBody(request) {
    const chunks = []; let bytes = 0;
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 8192) throw new WatchError('TOO_LARGE', '请求过大。', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch { throw new WatchError('INVALID_JSON', 'JSON 无效。'); }
}

async function createPreviewServer(options = {}) {
    const demo = await createDemo(options); const session = {};
    class PreviewHandler {
        constructor(request, pathname, query) {
            this.args = { domainId: 'system', rid: pathname.split('/').pop(), file: pathname.split('/').pop() };
            this.domain = { _id: 'system' }; this.user = { _id: 2, hasPriv: () => true }; this.session = session;
            this.request = { body: {}, query, headers: request.headers }; this.response = { headers: {}, addHeader(key, value) { this.headers[key] = value; } };
        }
        async limitRate() {}
        url(name, args = {}) {
            if (name === 'dfacm_ai_watch') return '/manage/ai-watch';
            if (name === 'dfacm_ai_watch_data') return '/manage/ai-watch/data';
            if (name === 'dfacm_ai_watch_report') return `/manage/ai-watch/report/${args.rid}`;
            if (name === 'dfacm_ai_watch_asset') return `/manage/ai-watch/assets/${args.file}`;
            return `/record/${args.rid}`;
        }
    }
    const handlers = createHandlers({ Handler: PreviewHandler, store: demo.store, config: demo.config, adminPrivilege: 1, root: __dirname });
    const server = http.createServer(async (request, response) => {
        try {
            const url = new URL(request.url, 'http://127.0.0.1');
            const host = String(request.headers.host || '');
            if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) throw new WatchError('HOST', '仅允许本机访问演示。', 403);
            if (['POST', 'PUT', 'DELETE'].includes(request.method) && request.headers.origin !== `http://${host}`) throw new WatchError('ORIGIN', '请求来源无效。', 403);
            if (url.pathname === '/') { response.writeHead(302, { Location: '/manage/ai-watch' }); response.end(); return; }
            if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
            if (/^\/record\/[a-f0-9]{24}$/i.test(url.pathname) && request.method === 'GET') {
                const record = await demo.store.getRecord('system', url.pathname.split('/').pop());
                if (!record) throw new WatchError('NOT_FOUND', '模拟提交不存在。', 404);
                const title = `P${record.pid} · UID ${record.uid}`;
                response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                response.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/manage/ai-watch/assets/watch-0.1.0.css"></head><body><main class="ai-watch"><header class="aw-header"><div><p class="aw-eyebrow">本地演示 · 模拟原始提交</p><h1>${escapeHtml(title)}</h1></div><a href="/manage/ai-watch">返回提交审核</a></header><section class="aw-code"><pre>${escapeHtml(record.code || '源码不可用。')}</pre></section></main></body></html>`);
                return;
            }
            let Type;
            if (url.pathname === '/manage/ai-watch') Type = handlers.WatchPageHandler;
            else if (url.pathname === '/manage/ai-watch/data') Type = handlers.WatchDataHandler;
            else if (/^\/manage\/ai-watch\/report\/[a-f0-9]{24}$/i.test(url.pathname)) Type = handlers.WatchReportHandler;
            else if (/^\/manage\/ai-watch\/assets\/[^/]+$/.test(url.pathname)) Type = handlers.WatchAssetHandler;
            if (url.pathname === '/manage/ai-watch/demo-submit' && request.method === 'POST') {
                const { csrfValid } = require('./http.cjs');
                const h = new PreviewHandler(request, url.pathname, {}); const body = await readBody(request);
                if (!csrfValid(h, body.csrf)) throw new WatchError('CSRF', '会话已过期。', 403);
                const record = await demo.newSubmission();
                response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                response.end(JSON.stringify({ ok: true, rid: record._id })); return;
            }
            if (!Type) throw new WatchError('NOT_FOUND', '页面不存在。', 404);
            const handler = new Type(request, url.pathname, Object.fromEntries(url.searchParams));
            if (request.method === 'POST') handler.request.body = await readBody(request);
            const method = request.method === 'GET' ? 'get' : request.method === 'POST' ? 'post' : null;
            if (!method || !handler[method]) throw new WatchError('METHOD', '方法不支持。', 405);
            await handler[method]();
            const result = handler.response;
            if (result.template) {
                const values = { ...result.body, demo: true };
                const template = fs.readFileSync(path.join(__dirname, 'templates/watch_content.html'), 'utf8');
                const content = template.replace(/{{\s*(\w+)\s*}}/g, (_match, key) => escapeHtml(values[key] ?? ''));
                result.body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>提交审核 · Hydro OJ</title></head><body>${content}</body></html>`;
                result.type = 'text/html; charset=utf-8';
            }
            response.writeHead(result.status || 200, { ...result.headers, 'Content-Type': result.type || 'application/json; charset=utf-8' });
            response.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
        } catch (error) {
            response.writeHead(error.status || 500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ ok: false, code: error.code || 'INTERNAL', message: error instanceof WatchError ? error.message : '演示服务出错。' }));
        }
    });
    demo.engine.start(); server.on('close', () => demo.engine.stop()); server.on('error', () => demo.engine.stop());
    return { server, demo };
}

if (require.main === module) {
    const port = Number(process.env.PORT || 4177);
    createPreviewServer().then(({ server }) => {
        server.on('error', error => { console.error(`Preview could not start: ${error.code || 'INTERNAL'}`); process.exitCode = 1; });
        server.listen(port, '127.0.0.1', () => console.log(`Hydro submission review demo: http://127.0.0.1:${port}/manage/ai-watch`));
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { createPreviewServer };
