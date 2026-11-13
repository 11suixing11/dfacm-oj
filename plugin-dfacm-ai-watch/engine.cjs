'use strict';

const { analyze } = require('./detector.cjs');
const { eligible, recordId } = require('./config.cjs');

function createEngine({ store, config, now = Date.now, log = () => {} }) {
    const events = new Map(); let timer = null; let running = null; let stopped = false; let started = false;
    function schedule(delay) {
        if (!started || stopped || timer || running || !config.enabled) return;
        timer = setTimeout(() => { timer = null; void tick(); }, delay);
        timer.unref?.();
    }
    function enqueue(record) {
        if (stopped || !eligible(record, config)) return;
        const key = `${record.domainId}:${recordId(record)}`;
        if (!events.has(key) && events.size >= 1000) events.delete(events.keys().next().value);
        // Keep only IDs in memory. The durable scanner recovers any dropped hint.
        events.set(key, { domainId: record.domainId, rid: recordId(record) });
        if (timer) { clearTimeout(timer); timer = null; }
        schedule(50);
    }
    let nextTask = 0;
    async function run() {
        const deadline = now() + config.tickBudgetMs;
        const totals = { scanned: 0, captured: 0, analyzed: 0, error: false };
        const exhausted = () => stopped || now() >= deadline;
        const tasks = [];
        for (const domainId of config.domains) tasks.push(async () => {
            const captured = await store.captureSources(domainId, deadline); totals.captured += captured.captured;
        });
        // Durable reconciliation runs independently of event delivery and discovery.
        for (const mode of ['waiting', 'retained']) for (const domainId of config.domains) tasks.push(async () => {
            await store.reconcile(domainId, mode, deadline);
        });
        for (const method of ['repair', 'scan']) for (const domainId of config.domains) tasks.push(async () => {
            const scan = await store[method](domainId, deadline); totals.scanned += scan.scanned;
        });
        tasks.push(async () => {
            for (const [key, hint] of [...events.entries()].slice(0, config.batchSize)) {
                if (exhausted()) break;
                const record = await store.getRecord(hint.domainId, hint.rid, deadline);
                if (record) { await store.ensureRecord(record); await store.updateVerdict(record); }
                // Keep a newer event that arrived during the database read.
                if (events.get(key) === hint) events.delete(key);
            }
        });
        tasks.push(async () => {
            for (const candidate of await store.pending()) {
                if (exhausted()) break;
                const claimed = await store.claim(candidate);
                if (!claimed) continue;
                try { const context = await store.context(claimed); await store.complete(claimed, analyze(context)); totals.analyzed++; }
                catch (error) { await store.fail(claimed); totals.error = true; log('analysis', error); }
            }
        });
        // Resume at the next phase/domain when a slow query consumes the budget;
        // otherwise early domains or discovery can permanently starve repair.
        for (let count = 0; count < tasks.length && !exhausted(); count++) {
            const task = tasks[nextTask]; nextTask = (nextTask + 1) % tasks.length;
            try { await task(); }
            catch (error) { totals.error = true; log('scan', error); }
        }
        if (!stopped) await store.heartbeat(totals).catch(error => log('heartbeat', error));
        return totals;
    }
    function tick() {
        if (running) return running;
        if (stopped || !config.enabled) return Promise.resolve({ stopped: true });
        running = run().finally(() => { running = null; schedule(events.size ? 50 : config.intervalMs); });
        return running;
    }
    function start() { if (started || stopped) return; started = true; schedule(0); }
    function stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; events.clear(); }
    return { enqueue, tick, start, stop, idle: () => running || Promise.resolve() };
}

module.exports = { createEngine };
