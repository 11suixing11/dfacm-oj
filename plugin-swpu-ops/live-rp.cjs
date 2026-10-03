'use strict';

// Live RP recalculation. Hydro's task.daily recomputes RP at 03:00 only, so a
// freshly solved problem would not show on the ranking page until the next
// night. This hook watches judged submissions and reruns the domain RP script
// shortly after, debounced so a contest burst triggers at most one run per
// window. Registered on pm2 instance 0 only; the compute is idempotent.

const RP_DEBOUNCE_MS = 30000;
const FINAL_STATUSES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 30, 31, 32, 33]);
const RESERVED_CONTESTS = new Set(['000000000000000000000000', '000000000000000000000001']);
const HISTORY_LIMIT = 100;

// Plain console shim: this module is also loaded by node:test without hydrooj.
const logger = {
    info: (...a) => console.info('swpu-ops [I]', ...a),
    error: (...a) => console.error('swpu-ops [E]', ...a),
};

function createLiveRp(options = {}) {
    const {
        debounceMs = RP_DEBOUNCE_MS,
        // Injectable for tests; defaults to Hydro's global script registry.
        script = null,
        instance = process.env.NODE_APP_INSTANCE,
    } = options;
    if (!Number.isSafeInteger(debounceMs) || debounceMs < 1) throw new TypeError('debounceMs must be a positive integer');
    const runs = [];
    const failures = [];
    const pending = new Set();
    let timer = null;
    let running = false;
    let stopped = false;

    function remember(history, entry) {
        history.push(entry);
        if (history.length > HISTORY_LIMIT) history.shift();
    }

    function schedule() {
        if (!stopped && !running && !timer && pending.size) timer = setTimeout(run, debounceMs);
    }

    function resolveScript() {
        if (script) return script;
        return (global.Hydro && global.Hydro.script && global.Hydro.script.rp) || null;
    }

    async function run() {
        timer = null;
        if (stopped || running) return;
        running = true;
        const domains = [...pending];
        pending.clear();
        try {
            const rp = resolveScript();
            if (!rp || typeof rp.run !== 'function') return;
            for (const domainId of domains) {
                if (stopped) break;
                const startedAt = Date.now();
                try {
                    await rp.run({ domainId }, () => {});
                    remember(runs, { domainId, at: new Date().toISOString(), durationMs: Date.now() - startedAt });
                    logger.info('rp recalculated:', domainId);
                } catch (e) {
                    remember(failures, { domainId, message: e && e.message });
                    logger.error('rp recalculation failed:', e);
                }
            }
        } finally {
            running = false;
            // Changes arriving during a slow run become one later run per domain.
            // Never start a second RP computation while the current one is writing.
            schedule();
        }
    }

    function hook(rdoc, _set, _push, body) {
        if (process.env.SWPU_RP_DEBUG) console.debug('swpu-ops: record/change', rdoc && rdoc.status, rdoc && rdoc.domainId, 'instance:', instance);
        if (stopped || (instance !== undefined && instance !== '0')) return;
        if (!rdoc || !FINAL_STATUSES.has(rdoc.status) || (body && body.key !== 'end')) return;
        if (rdoc.uid <= 0 || rdoc.pid <= 0 || RESERVED_CONTESTS.has(String(rdoc.contest))) return;
        pending.add((rdoc && rdoc.domainId) || 'system');
        schedule();
    }

    function stop() {
        stopped = true;
        pending.clear();
        if (timer) clearTimeout(timer);
        timer = null;
    }

    return { hook, runs, failures, stop };
}

module.exports = { createLiveRp, RP_DEBOUNCE_MS };
