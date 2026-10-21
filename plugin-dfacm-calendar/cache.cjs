'use strict';

const { readFile, writeFile, rename } = require('node:fs/promises');

const TTL_MS = 60 * 60 * 1000;
const STALE_MAX_MS = 24 * TTL_MS;
const RETRY_MS = 10 * 60 * 1000;

// Each upstream keeps its own last successful result. A failed source never
// erases another source, and requests only await local disk hydration.
function createCachedSource({ id, label, file, fetchEvents, legacy, validate = () => true, now = Date.now }) {
    let memory = null;
    let hydrating = null;
    let refreshing = null;
    let retryAt = 0;
    let failed = false;
    let generation = 0;
    let forceRefresh = false;
    let hydrated = false;

    function valid(value) {
        return value && Number.isFinite(value.fetchedAt) && value.fetchedAt <= now() + 60000
            && Array.isArray(value.events) && value.events.every(validate) && now() - value.fetchedAt < STALE_MAX_MS;
    }

    async function hydrate() {
        if (hydrated) return;
        if (hydrating) return hydrating;
        const currentGeneration = generation;
        hydrating = (async () => {
            let disk;
            try { disk = JSON.parse(await readFile(file, 'utf8')); } catch { /* cold start */ }
            if (!valid(disk) && legacy) {
                try { disk = await legacy(); } catch { /* no legacy cache */ }
            }
            if (currentGeneration === generation && !memory && valid(disk)) memory = disk;
        })().finally(() => { hydrated = true; hydrating = null; });
        return hydrating;
    }

    function refresh() {
        if (refreshing || now() < retryAt) return;
        forceRefresh = false;
        const currentGeneration = generation;
        retryAt = now() + RETRY_MS;
        refreshing = (async () => {
            const events = await fetchEvents(now());
            if (!Array.isArray(events) || !events.every(validate)) throw new Error('Invalid calendar source result');
            if (currentGeneration !== generation) return;
            memory = { fetchedAt: now(), events };
            failed = false;
            retryAt = now() + TTL_MS;
            const temporary = `${file}.${process.pid}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify(memory), { encoding: 'utf8', mode: 0o600 });
                await rename(temporary, file);
            } catch { /* an unwritable cache must not break the calendar */ }
        })().catch(() => {
            if (currentGeneration === generation) failed = true;
        }).finally(() => {
            refreshing = null;
            // A credentials change may have happened during the old request.
            if (forceRefresh) refresh();
        });
    }

    async function get(at = now()) {
        if (!memory) await hydrate();
        const age = memory ? at - memory.fetchedAt : Infinity;
        if (forceRefresh || failed || age >= TTL_MS) refresh();
        return memory && age < STALE_MAX_MS ? memory.events : [];
    }

    function status() {
        const age = memory ? now() - memory.fetchedAt : Infinity;
        return {
            id, label,
            status: age < TTL_MS && !failed ? 'fresh' : age < STALE_MAX_MS ? 'stale' : failed ? 'unavailable' : 'pending',
            updatedAt: memory ? new Date(memory.fetchedAt).toISOString() : null,
        };
    }

    function invalidate({ refresh: shouldRefresh = true } = {}) {
        generation++;
        retryAt = 0;
        failed = false;
        forceRefresh = shouldRefresh;
    }

    return { get, status, invalidate, settled: () => refreshing || Promise.resolve() };
}

module.exports = { createCachedSource, TTL_MS, STALE_MAX_MS, RETRY_MS };
