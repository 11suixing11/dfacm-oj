'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { WatchError, RID, listFilters } = require('./config.cjs');

const CSRF_KEY = 'dfacmAiWatchCsrf';
const ASSETS = new Map([
    ['watch-0.1.0.css', ['watch.css', 'text/css; charset=utf-8']],
    ['watch-0.1.0.js', ['watch.js', 'application/javascript; charset=utf-8']],
]);

function csrfToken(handler) {
    if (!handler.session) throw new WatchError('SESSION_REQUIRED', '请重新登录管理员账户。', 403);
    const uid = handler.user?._id; const current = handler.session[CSRF_KEY];
    if (current?.uid === uid && /^[a-f0-9]{64}$/.test(current.token || '')) return current.token;
    const token = randomBytes(32).toString('hex'); handler.session[CSRF_KEY] = { uid, token }; return token;
}
function csrfValid(handler, sent) {
    const expected = handler.session?.[CSRF_KEY];
    if (expected?.uid !== handler.user?._id || typeof expected?.token !== 'string' || typeof sent !== 'string') return false;
    const left = Buffer.from(expected.token); const right = Buffer.from(sent);
    return left.length === 64 && left.length === right.length && timingSafeEqual(left, right);
}
function privateHeaders(handler) {
    handler.response.addHeader('Cache-Control', 'private, no-store'); handler.response.addHeader('Vary', 'Cookie');
    handler.response.addHeader('X-Content-Type-Options', 'nosniff');
}
function json(handler, payload, status = 200) {
    privateHeaders(handler); handler.response.status = status; handler.response.type = 'application/json'; handler.response.body = payload;
}
function failure(handler, error, log) {
    if (!(error instanceof WatchError)) log?.('http', error);
    const safe = error instanceof WatchError ? error : new WatchError('REQUEST_FAILED', '审核服务暂时不可用，请稍后重试。', 500);
    json(handler, { ok: false, code: safe.code, message: safe.message }, safe.status);
}
function createHandlers({ Handler, store, config, adminPrivilege, root, log = () => {} }) {
    function authorize(handler) {
        const uid = handler.user?._id;
        if (!Number.isSafeInteger(uid) || uid <= 0 || !handler.user.hasPriv(adminPrivilege)) {
            throw new WatchError('FORBIDDEN', '此页面仅对具有全域管理权限的管理员开放。', 403);
        }
        // Take the domain from Hydro's route context; a query cannot select another domain.
        const domainId = String(handler.domain?._id || handler.ctx?.domain?._id || handler.args?.domainId || '');
        if (!config.domains.includes(domainId)) throw new WatchError('DOMAIN_DISABLED', '该域尚未启用提交审核。', 403);
        return domainId;
    }
    const url = (handler, name, domainId, extra = {}) => handler.url(name, { domainId, ...extra });
    function decorate(handler, domainId, rows) {
        return rows.map(row => ({ ...row,
            detailUrl: url(handler, 'dfacm_ai_watch_report', domainId, { rid: row.rid }),
            recordUrl: url(handler, 'record_detail', domainId, { rid: row.rid }),
        }));
    }

    class WatchPageHandler extends Handler {
        async get() {
            try {
                const domainId = authorize(this); privateHeaders(this);
                this.response.template = 'dfacm_ai_watch.html';
                this.response.body = { page_name: 'dfacm_ai_watch', domainId,
                    dataUrl: url(this, 'dfacm_ai_watch_data', domainId), csrf: csrfToken(this), demo: false,
                    cssUrl: url(this, 'dfacm_ai_watch_asset', domainId, { file: 'watch-0.1.0.css' }),
                    jsUrl: url(this, 'dfacm_ai_watch_asset', domainId, { file: 'watch-0.1.0.js' }),
                };
            } catch (error) { failure(this, error, log); }
        }
    }
    class WatchDataHandler extends Handler {
        async get() {
            try {
                const domainId = authorize(this);
                await this.limitRate('dfacm_ai_watch_data', 60, 90, `u${this.user._id}`);
                const filters = listFilters(this.request.query || this.args);
                const [data, health] = await Promise.all([store.list(domainId, filters), store.health(domainId)]);
                json(this, { ok: true, ...data, reports: decorate(this, domainId, data.reports), health, generatedAt: new Date().toISOString() });
            } catch (error) { failure(this, error, log); }
        }
    }
    class WatchReportHandler extends Handler {
        async get() {
            try {
                const domainId = authorize(this); const rid = String(this.args.rid || '').toLowerCase();
                if (!RID.test(rid)) throw new WatchError('INVALID_RECORD', '提交 ID 无效。');
                await this.limitRate('dfacm_ai_watch_report', 60, 90, `u${this.user._id}`);
                const payload = await store.evidence(domainId, rid);
                payload.report = decorate(this, domainId, [payload.report])[0];
                const peer = payload.evidence.peer;
                if (peer) peer.recordUrl = url(this, 'record_detail', domainId, { rid: peer.rid });
                json(this, { ok: true, ...payload, csrf: csrfToken(this) });
            } catch (error) { failure(this, error, log); }
        }
        async post() {
            try {
                const domainId = authorize(this); const body = this.request.body || {};
                if (!csrfValid(this, body.csrf)) throw new WatchError('CSRF', '会话已过期，请刷新页面后重试。', 403);
                const rid = String(this.args.rid || '').toLowerCase();
                if (!RID.test(rid)) throw new WatchError('INVALID_RECORD', '提交 ID 无效。');
                await this.limitRate('dfacm_ai_watch_review', 60, 30, `u${this.user._id}`);
                const report = await store.review(domainId, rid, { status: body.status, note: body.note,
                    revision: body.revision, reviewer: this.user._id });
                json(this, { ok: true, report: decorate(this, domainId, [report])[0] });
            } catch (error) { failure(this, error, log); }
        }
    }
    class WatchAssetHandler extends Handler {
        async get() {
            try {
                authorize(this); const asset = ASSETS.get(String(this.args.file || ''));
                if (!asset) throw new WatchError('NOT_FOUND', '资源不存在。', 404);
                privateHeaders(this); this.response.type = asset[1];
                this.response.body = fs.readFileSync(path.join(root, 'public', asset[0]), 'utf8');
            } catch (error) { failure(this, error, log); }
        }
    }
    return { WatchPageHandler, WatchDataHandler, WatchReportHandler, WatchAssetHandler };
}

module.exports = { createHandlers, csrfToken, csrfValid, ASSETS };
