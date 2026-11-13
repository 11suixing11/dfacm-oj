'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.argv[2] || 4176);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const page = path.join(__dirname, 'dist', 'index.html');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (['/', '/index.html', '/practice/pta-oop/'].includes(pathname)) {
    response.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fs.readFileSync(page));
    return;
  }
  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  response.writeHead(503, { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ error: { message: '本地预览可练习客观题并查看参考代码；代码评测需要在网站发布后使用。' } }));
});
server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/practice/pta-oop/`));
