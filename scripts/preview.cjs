// Local static preview only: no emails, accounts, or requests to the live OJ.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = new Map([
  ['/', 'landing/index.html'], ['/home.html', 'landing/index.html'],
  ['/reg', 'plugin-swpu-regcode/reg.html'], ['/reg.html', 'plugin-swpu-regcode/reg.html'],
  ...['swpu-display.woff2', 'swpu-mono.woff2'].map(name => ['/' + name, 'landing/' + name]),
  ...fs.readdirSync(path.join(root, 'landing/assets')).map(name => ['/' + name, 'landing/assets/' + name]),
]);
const types = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png' };
const port = Number(process.env.PORT || 4173);
http.createServer((req, res) => {
  const file = files.get(new URL(req.url, 'http://localhost').pathname);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, message: '本地预览未连接后端，未发送邮件或创建账号。' }));
  }
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><meta charset="utf-8"><title>本地预览</title><p>此页面由 Hydro 提供，本地静态预览不包含 OJ 后端。</p><a href="/">返回首页</a>');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(path.join(root, file)).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('本地前端预览：http://127.0.0.1:' + port));
