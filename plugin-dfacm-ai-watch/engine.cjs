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
    async function run() {
        const began = now(); const totals = { scanned: 0, captured: 0, analyzed: 0, error: false };
        try {
            // Archive AI output before analyzing a just-arrived submission.
            for (const domainId of config.domains) {
                const captured = await store.captureSources(domainId); totals.captured += captured.captured;
            }
            for (const [key, hint] of [...events.entries()].slice(0, config.batchSize)) {
                if (stopped) break;
                const record = await store.getRecord(hint.domainId, hint.rid);
                if (record) { await store.ensureRecord(record); await store.updateVerdict(record); }
                // A result event can arrive while the database read is in flight.
                // Keep that newer hint so the final verdict is not lost.
                if (events.get(key) === hint) events.delete(key);
            }
            for (const domainId of config.domains) {
                if (stopped) break;
                const scan = await store.scan(domainId); totals.scanned += scan.scanned;
            }
            for (const candidate of await store.pending()) {
                if (stopped) break;
                const claimed = await store.claim(candidate);
                if (!claimed) continue;
                try { const context = await store.context(claimed); await store.complete(claimed, analyze(context)); totals.analyzed++; }
                catch (error) { await store.fail(claimed); totals.error = true; log('analysis', error); }
                if (now() - began >= Math.max(config.intervalMs, 1500)) break;
            }
        } catch (error) { totals.error = true; log('scan', error); }
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
