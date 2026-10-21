'use strict';

// Render the production template locally. Network source fixtures are opt-in.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const nunjucks = require('nunjucks');
const { loadCalendar, mergeCalendar } = require('./calendar.cjs');
const { pageData, buildIcs } = require('./presentation.cjs');

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(__dirname, 'templates')), { autoescape: true });
const template = fs.readFileSync(path.join(__dirname, 'templates/calendar.html'), 'utf8')
    .replace('{% extends "layout/basic.html" %}', '').replace('{% block content %}', '').replace('{% endblock %}', '');
const assets = new Map([
    ['fullcalendar-7.1.3.js', ['vendor/fullcalendar-7.1.3.js', 'application/javascript']],
    ['fullcalendar-7.1.3.css', ['vendor/fullcalendar-7.1.3.css', 'text/css']],
    ['calendar-1.36.0.js', ['public/calendar.js', 'application/javascript']],
    ['calendar-1.36.0.css', ['public/calendar.css', 'text/css']],
]);
const port = Number(process.env.PORT || 4174);
http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const asset = assets.get(url.pathname.replace('/calendar/assets/', ''));
    if (url.pathname.startsWith('/calendar/assets/') && asset) {
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
        return res.end(fs.readFileSync(path.join(__dirname, asset[0])));
    }
    const now = new Date(process.env.CALENDAR_PREVIEW_NOW || Date.now());
    const manual = loadCalendar(fs.readFileSync(path.join(__dirname, 'calendar.json'), 'utf8'));
    const extra = process.env.CALENDAR_PREVIEW_DATA ? JSON.parse(fs.readFileSync(process.env.CALENDAR_PREVIEW_DATA, 'utf8')) : [];
    const parsed = mergeCalendar(manual, extra);
    const options = Object.fromEntries(['type', 'types', 'q'].map((key) => [key, url.searchParams.get(key) || '']));
    if (url.pathname === '/calendar/feed.ics') {
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' });
        return res.end(buildIcs(parsed, { ...options, now }));
    }
    if (!['/', '/calendar'].includes(url.pathname)) { res.writeHead(404); return res.end(); }
    const view = pageData(parsed, now, options, [
        { id: 'cf', label: 'Codeforces', status: 'fresh' },
        { id: 'atcoder', label: 'AtCoder', status: 'fresh' },
        { id: 'clist', label: 'CLIST', status: 'unconfigured' },
    ]);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const content = env.renderString(template, view);
    res.end(`<!doctype html><html lang="zh-CN" class="theme--light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>赛事日历 · 本地预览</title><style>body{margin:0;background:#f4f7fb;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif}.section{max-width:1120px;margin:28px auto;background:#fff;border-radius:12px}.section__body{padding:28px}.data-table{width:100%;border-collapse:collapse;font-size:13px}.data-table td,.data-table th{text-align:left;padding:12px;border-bottom:1px solid #dce4ef}html.theme--dark body{background:#0c1728}html.theme--dark .section{background:#16233d}@media(max-width:680px){.section{margin:0;border-radius:0}.section__body{padding:20px 15px}}</style><body>${content}</body></html>`);
}).listen(port, '127.0.0.1', () => console.log(`日历预览：http://127.0.0.1:${port}/calendar`));
