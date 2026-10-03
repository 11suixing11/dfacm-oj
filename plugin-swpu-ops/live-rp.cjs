'use strict';

// Live RP recalculation. Hydro's task.daily recomputes RP at 03:00 only, so a
// freshly solved problem would not show on the ranking page until the next
// night. This hook watches judged submissions and reruns the domain RP script
// shortly after, debounced so a contest burst triggers at most one run per
// window. Registered on pm2 instance 0 only; the compute is idempotent.

const RP_DEBOUNCE_MS = 30000;

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
    const runs = [];
    const failures = [];
    const pending = new Set();
    let timer = null;

    function resolveScript() {
        if (script) return script;
        return (global.Hydro && global.Hydro.script && global.Hydro.script.rp) || null;
    }

    async function run() {
        timer = null;
        const domains = [...pending];
        pending.clear();
        const rp = resolveScript();
        if (process.env.SWPU_RP_DEBUG) {
            const keys = (global.Hydro && global.Hydro.script) ? Object.keys(global.Hydro.script) : null;
            console.debug('swpu-ops: rp run for', domains, 'script found:', !!rp, 'registry:', keys);
        }
        if (!rp || typeof rp.run !== 'function') return;
        for (const domainId of domains) {
            try {
                await rp.run({ domainId }, () => {});
                runs.push({ domainId, at: new Date().toISOString() });
                logger.info('rp recalculated:', domainId);
            } catch (e) {
                failures.push({ domainId, message: e && e.message });
                logger.error('rp recalculation failed:', e);
            }
        }
    }

    function hook(rdoc) {
        if (process.env.SWPU_RP_DEBUG) console.debug('swpu-ops: record/change', rdoc && rdoc.status, rdoc && rdoc.domainId, 'instance:', instance);
        if (instance !== undefined && instance !== '0') return;
        if (!rdoc || !(rdoc.status > 0)) return; // only judged results change RP
        pending.add((rdoc && rdoc.domainId) || 'system');
        if (!timer) timer = setTimeout(run, debounceMs);
    }

    return { hook, runs, failures, stop: () => { if (timer) { clearTimeout(timer); timer = null; } } };
}

module.exports = { createLiveRp, RP_DEBOUNCE_MS };
