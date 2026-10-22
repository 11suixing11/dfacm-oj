'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { createJobStore } = require('./jobs.cjs');
const { validateAnswer, submissionDto, assistanceLevel } = require('./protocol.cjs');
const { request, answer, SOURCE, CE_SOURCE, CE_LOG, ceAnswer } = require('./tests/fixtures.cjs');
const { render } = require('./tests/render.cjs');
const { createAccountProviderStore, ACCOUNT_KEY_HEADER } = require('./account-store.cjs');
const { memoryCollection } = require('./tests/fake-collection.cjs');
const { randomBytes } = require('node:crypto');

const RID = '1234567890abcdef12345678';
const CSRF = 'preview-fixture-token';
const ACCOUNT_CSRF = 'f'.repeat(64);
const js = esbuild.buildSync({ stdin: {
    contents: "const { mountAssistant } = require('./frontend/panel.js'); const { mountAccountSettings } = require('./frontend/account-settings.js'); mountAssistant({document,config:window.__ASSISTANT_PREVIEW__,fetchImpl:window.fetch.bind(window),storage:window.sessionStorage,clipboard:window.navigator.clipboard}); mountAccountSettings({document,config:window.__AI_SETTINGS_PREVIEW__,fetchImpl:window.fetch.bind(window),storage:window.sessionStorage});",
    resolveDir: __dirname, sourcefile: 'preview-entry.js',
}, bundle: true, platform: 'browser', format: 'iife', write: false, target: ['chrome100'] }).outputFiles[0].text;
function createPreviewJobs() {
    return createJobStore({ generate: async (input, _config, _signal, report) => {
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        const raw = input.submission?.verdict === 'CE' ? ceAnswer() : answer(input.mode, input.level);
        report({ stage: 'connecting', preview: {} }); await pause(180);
        report({ stage: 'generating', preview: input.mode === 'solve' ? { meaning: raw.meaning } : { summary: raw.summary } }); await pause(260);
        report({ stage: 'generating', preview: input.mode === 'solve' ? { meaning: raw.meaning, approach: raw.approach } : { summary: raw.summary } }); await pause(260);
        report({ stage: 'validating', preview: {} });
        const value = validateAnswer(raw, input);
        // Demonstration fixture; no supplier was called and no usage is invented.
        value.usage = null; return value;
    } });
}
const css = fs.readFileSync(path.join(__dirname, 'frontend/assistant.css'), 'utf8')
    + '\n' + fs.readFileSync(path.join(__dirname, 'frontend/account-settings.css'), 'utf8');
const escape = (text) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function page(record = false, account = false) {
    const endpoint = record ? `/record/${RID}/assistant` : '/p/P1001/assistant';
    const boot = account ? 'null' : JSON.stringify({ endpoint, csrf: CSRF, page: record ? 'record' : 'problem', userScope: 'preview:42',
        accountConfig: '/home/ai/config', accountSettings: '/home/settings/account#ai' });
    const accountBoot = account ? JSON.stringify({ endpoint: '/home/ai/config', csrf: ACCOUNT_CSRF, uid: 42, legacyScope: 'preview:42' }) : 'null';
    return `<!doctype html><html lang="zh-CN" class="theme--light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>题目助手 · d&f算法网本地预览</title><link rel="stylesheet" href="/assistant.css"><style>
*{box-sizing:border-box}body{margin:0;background:#f1f4f8;color:#29364a;font:15px/1.8 "Segoe UI","Microsoft Yahei",sans-serif}nav{padding:15px 4vw;background:#fff;border-bottom:1px solid #dce4ed;display:flex;gap:26px;align-items:center}nav strong{color:#395c83;font-size:20px}a{color:#3b628c;text-decoration:none}main{max-width:1100px;margin:28px auto;padding:0 20px}.preview-note{font-size:13px;color:#695a34;background:#fff6df;border:1px solid #eadab3;padding:9px 14px;border-radius:7px;margin-bottom:20px}.row{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:24px}.section{background:#fff;border:1px solid #dce4ed;border-radius:12px;padding:24px}h1{font-size:25px;margin:0 0 12px}.meta{font-size:13px;color:#758195;display:flex;gap:18px;border-bottom:1px solid #e1e7ef;padding-bottom:16px;margin-bottom:18px}h2{font-size:18px}pre{white-space:pre;overflow:auto;background:#f4f6fa;border:1px solid #e1e7ef;padding:14px;font:13px/1.7 Consolas,monospace;border-radius:6px}aside p{font-size:13px;color:#738195}aside a{display:block;margin:12px 0}button#theme{margin-left:auto;border:1px solid #dce4ed;background:transparent;border-radius:6px;padding:6px 10px;font:inherit;font-size:13px;color:inherit;cursor:pointer}.theme--dark body{background:#151d27;color:#e4ebf4}.theme--dark nav,.theme--dark .section{background:#202832;border-color:#3c4b5d}.theme--dark pre{background:#18212c;border-color:#3c4b5d;color:inherit}.theme--dark .preview-note{background:#302c24;color:#d1c39d;border-color:#514a38}.theme--dark a{color:#88b1df}.theme--dark .meta{border-color:#3c4b5d}@media(max-width:750px){.row{display:block}aside{display:none}nav{gap:14px;padding:12px 18px}nav strong{font-size:16px}main{padding:0 12px;margin-top:16px}.section{padding:18px}}
</style></head><body><nav><strong>d&f算法网</strong><a href="/p/P1001">题目</a><a href="/record/${RID}">评测记录</a><a href="/home/settings/account#ai">账户设置</a><button id="theme" type="button">切换主题</button></nav><main class="main"><div class="preview-note">本地交互预览 · 使用求和题演示数据，未连接 AgentRouter 或线上 OJ。账户保存仅在此预览服务的内存中；请使用演示 Key。</div><div class="row"><div class="medium-9 columns"><article class="section ${account ? 'dfacm-ai-settings' : ''}" ${account ? 'id="ai"' : ''}>
${account ? '<h1>账户设置 · AI 设置</h1><p class="dfacm-ai-settings__intro">保存一次后，题目助手会自动使用此预览账户配置。请使用演示 Key；重启预览服务会清除数据。</p><div data-dfacm-ai-settings></div>'
    : record ? `<h1>评测记录 · WA</h1><div class="meta"><span>P1001 整数求和</span><span>C++17</span><span>当前用户的提交</span></div><pre>${escape(SOURCE)}</pre>`
    : '<h1>P1001 · 整数求和</h1><div class="meta"><span>时间限制：1000 ms</span><span>内存限制：256 MB</span></div><h2>题目描述</h2><p>给定 n 个整数，求它们的总和。</p><h2>输入格式</h2><p>第一行一个整数 n，第二行 n 个整数。</p><h2>输出格式</h2><p>输出一个整数，表示总和。</p><h2>数据范围</h2><p>1 ≤ n ≤ 10⁵，−10⁹ ≤ aᵢ ≤ 10⁹，单组数据。</p><h2>样例</h2><pre>3\n1000000000 1000000000 1000000000</pre><pre>3000000000</pre>'}
</article></div><aside class="section"><h2>这道题</h2><a href="/p/P1001">返回题目</a><a href="/record/${RID}">查看失败提交</a><p>点击右下角“题目助手”展开浮窗，再次点击即可收起。窗内选择查看题解或诊断代码，关闭后可以继续查看。</p></aside></div></main><script>window.__ASSISTANT_PREVIEW__=${boot};window.__AI_SETTINGS_PREVIEW__=${accountBoot};document.getElementById('theme').onclick=()=>document.documentElement.classList.toggle('theme--dark');</script><script src="/assistant.js"></script></body></html>`;
}

function json(res, data, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function publicJob(job) { return job.status === 'ready' ? { ...job, html: render(job) } : job; }

function createPreviewServer() {
    const jobs = createPreviewJobs();
    const previewKey = randomBytes(32);
    const accounts = createAccountProviderStore({ collection: memoryCollection(), loadKey: async () => previewKey });
    return http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        try {
            if (url.pathname === '/home/ai/config') {
                if (req.method === 'GET') return json(res, { ok: true, config: await accounts.getSettings(42), csrf: ACCOUNT_CSRF });
                if (req.method === 'POST') {
                    const apiKey = req.headers[ACCOUNT_KEY_HEADER]; delete req.headers[ACCOUNT_KEY_HEADER];
                    let text = ''; for await (const chunk of req) { text += chunk.toString('utf8'); if (text.length > 10000) throw new Error('预览输入过长。'); }
                    const args = new URLSearchParams(text);
                    if (args.get('csrf') !== ACCOUNT_CSRF) return json(res, { ok: false, message: '预览会话已过期，请刷新。' }, 403);
                    const config = args.get('action') === 'clear' ? await accounts.clearSettings(42, args.get('revision'))
                        : await accounts.saveSettings(42, { provider: args.get('provider'), baseUrl: args.get('base_url'), model: args.get('model'), apiKey }, args.get('revision'));
                    return json(res, { ok: true, config, csrf: ACCOUNT_CSRF });
                }
            }
            if (req.method === 'GET' && ['/p/P1001/assistant', `/record/${RID}/assistant`].includes(url.pathname)) {
                return json(res, { ok: true, job: publicJob(jobs.get(url.searchParams.get('job'), 'preview:42', url.pathname)) });
            }
            if (req.method === 'POST' && ['/p/P1001/assistant', `/record/${RID}/assistant`].includes(url.pathname)) {
                let body = '';
                for await (const chunk of req) {
                    body += chunk.toString('utf8');
                    if (body.length > 100000) throw new Error('预览输入过长。');
                }
                const args = new URLSearchParams(body);
                if (args.get('csrf') !== CSRF) return json(res, { ok: false, message: '预览会话已过期，请刷新。' }, 403);
                if (args.get('provider') === 'account') {
                    if (!(await accounts.getSettings(42)).configured) return json(res, { ok: false, code: 'AI_NOT_CONFIGURED', message: '请先在预览账户设置中保存演示供应商和演示 Key。' }, 400);
                } else if (args.get('provider') && args.get('provider') !== 'site') {
                    return json(res, { ok: false, message: '本地预览只演示供应商设置，不调用个人 API；请在线上 OJ 使用。' }, 400);
                }
                const mode = url.pathname.includes('/record/') ? 'debug' : args.get('mode');
                if (!['solve', 'debug'].includes(mode)) throw new Error('请选择题解或诊断。');
                if (mode === 'debug' && args.get('code') && ![SOURCE, CE_SOURCE].includes(args.get('code'))) {
                    return json(res, { ok: false, message: '本地预览使用页面中的求和错误代码；其他代码需连接真实模型后诊断。' }, 400);
                }
                const input = request(mode, mode === 'solve' ? assistanceLevel(args.get('level')) : undefined);
                if (mode === 'debug') {
                    const code = args.get('code') || SOURCE;
                    const ce = code === CE_SOURCE;
                    input.submission = submissionDto({ code, verdict: ce ? 'CE' : 'WA', compilerOutput: ce ? args.get('compiler_output') || CE_LOG : '',
                        origin: args.get('code') ? 'manual' : 'record' });
                }
                const model = args.get('provider') === 'account' ? await accounts.getModelConfig(42) : { model: 'fixture' };
                return json(res, { ok: true, job: publicJob(jobs.start(input, 'preview:42', url.pathname, model, 'preview')) });
            }
            if (req.method !== 'GET') return json(res, { ok: false, message: '预览不包含此操作。' }, 405);
            if (url.pathname === '/assistant.js') { res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(js); }
            if (url.pathname === '/assistant.css') { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(css); }
            if (['/home/ai', '/home/settings/account'].includes(url.pathname)) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(page(false, true));
            }
            if (url.pathname === '/' || url.pathname === '/p/P1001' || url.pathname === `/record/${RID}`) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                return res.end(page(url.pathname.includes('/record/')));
            }
            res.writeHead(404); res.end('Not found');
        } catch (error) { json(res, { ok: false, code: error.code, message: error.message || '预览请求失败。' }, error.status || 400); }
    });
}

if (require.main === module) {
    const port = Number(process.env.ASSISTANT_PREVIEW_PORT || 4175);
    createPreviewServer().listen(port, '127.0.0.1', () => process.stdout.write(`题目助手本地预览：http://127.0.0.1:${port}/p/P1001\n`));
}
module.exports = { createPreviewServer };
