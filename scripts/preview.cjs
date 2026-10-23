// Local preview only: no emails, accounts, submissions or requests to the live OJ.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { render, previewNote } = require('./preview/pages.cjs');
const fixtures = require('./preview/fixtures.cjs');
const flow = require('./preview/training-flow.cjs');
const { REASONS, NOTE_MAX_LENGTH } = require('../plugin-dfacm-train/mistakes.cjs');
const root = path.resolve(__dirname, '..');
const files = new Map([
  ['/', 'landing/index.html'], ['/home.html', 'landing/index.html'],
  ['/reg', 'plugin-dfacm-regcode/reg.html'], ['/reg.html', 'plugin-dfacm-regcode/reg.html'],
  ['/workbench', 'plugin-dfacm-train/workbench.html'], ['/mistakes', 'plugin-dfacm-train/mistakes.html'],
  ['/preview/layout.css', 'scripts/preview/layout.css'], ['/preview/brand.css', 'theme/00-brand.css'],
  ['/preview/ui.js', 'scripts/preview/ui.js'], ['/preview/training.css', 'plugin-dfacm-train/frontend/training.css'],
  ['/preview/catalog.css', 'plugin-dfacm-train/frontend/catalog.css'],
  ...['swpu-display.woff2', 'swpu-mono.woff2'].map(name => ['/' + name, 'landing/' + name]),
  ...fs.readdirSync(path.join(root, 'landing/assets')).map(name => ['/' + name, 'landing/assets/' + name]),
]);
const types = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function instrument(html, pathname) {
  const options = pathname === '/workbench' ? '<label>工作台状态 <select id="preview-scenario"><option value="normal">正常</option><option value="empty">新用户</option><option value="error">加载失败</option><option value="slow">慢速加载</option><option value="long">长题名</option></select></label>'
    : pathname === '/' ? '<label>首页状态 <select id="preview-member"><option value="0">游客</option><option value="1">登录示例</option></select></label>' : '';
  let result = html.replace('<body>', '<body' + (pathname === '/' ? ' class="preview-landing"' : '') + '>' + previewNote().replace('</aside>', options + '</aside>'));
  result = result.replace('<head>', '<head><link rel="stylesheet" href="/preview/layout.css">');
  return result.replace('</body>', '<script src="/preview/ui.js" defer></script></body>');
}

function trainingBundle() {
  let esbuild;
  try { esbuild = require('../plugin-dfacm-train/node_modules/esbuild'); }
  catch { throw new Error('请先在 plugin-dfacm-train 目录运行 npm ci，再启动预览。'); }
  return esbuild.buildSync({ entryPoints: [path.join(root, 'scripts/preview/training-entry.js')], bundle: true,
    write: false, platform: 'browser', format: 'iife', target: ['chrome65'] }).outputFiles[0].text;
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    const ref = new URL(req.headers.referer || '/', 'http://127.0.0.1');
    const scenario = url.searchParams.get('scenario') || ref.searchParams.get('scenario');
    res.setHeader('Cache-Control', 'no-store');
    function send(status, type, body) {
      res.writeHead(status, { 'Content-Type': type });
      res.end(req.method === 'HEAD' ? '' : body);
    }
    const json = (value, status = 200) => send(status, 'application/json; charset=utf-8', JSON.stringify(value));
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json({ ok: false, message: '本地预览未连接后端；未保存笔记、提交代码、发送邮件或创建账号。' }, 503);
    }
    if (pathname === '/workbench/data') {
      if (scenario === 'error') return json({ ok: false }, 503);
      if (scenario === 'slow') {
        const timer = setTimeout(() => { if (!res.destroyed) json(flow.workbenchPayload()); }, 2200);
        res.on('close', () => clearTimeout(timer));
        return;
      }
      return json(flow.workbenchPayload(scenario));
    }
    if (pathname === '/workbench/context') return json(flow.refresh(url));
    if (pathname === '/workbench/recent') {
      const training = flow.workbenchPayload().data.trainings[0];
      return json({ ok: true, data: { trainings: [{ ...training, lastActiveAt: '2026-10-23T10:20:00+08:00' }] } });
    }
    if (pathname === '/mistakes/data') {
      const filter = url.searchParams.get('filter') || 'open';
      const items = fixtures.mistakes.filter((item) => filter === 'all' || item.resolved === (filter === 'done'));
      return json({ ok: true, filter, page: 1, pages: 1, pageSize: 20, total: items.length, open: 2,
        reasons: REASONS, noteMaxLength: NOTE_MAX_LENGTH, items });
    }
    if (pathname === '/preview/problems.json') return json(fixtures.problems);
    if (pathname === '/preview/training.js') {
      try { return send(200, types['.js'], trainingBundle()); }
      catch (error) { return send(503, types['.js'], 'console.error(' + JSON.stringify(error.message) + ')'); }
    }
    const record = flow.recordPage(url);
    if (record) return send(200, types['.html'], record);
    let generated = render(pathname, url);
    if (generated) {
      generated = flow.decorate(generated, url);
      if (pathname === '/p' && (ref.searchParams.get('member') === '1' || url.searchParams.get('member') === '1')) {
        generated = generated.replace('</nav>', '<a href="/user/42" class="nav__item">预览同学</a></nav>');
      }
      return send(200, types['.html'], generated);
    }
    const file = files.get(pathname);
    if (file) {
      const content = fs.readFileSync(path.join(root, file));
      return send(200, types[path.extname(file)] || 'application/octet-stream',
        path.extname(file) === '.html' ? instrument(content.toString('utf8'), pathname) : content);
    }
    send(404, types['.html'], '<!doctype html><meta charset="utf-8"><title>本地预览</title><p>此页面由 Hydro 提供，本地预览没有连接该服务。</p><a href="/workbench">返回训练工作台</a>');
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  createServer().listen(port, '127.0.0.1', () => console.log('本地前端预览：http://127.0.0.1:' + port));
}
module.exports = { createServer };
