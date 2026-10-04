'use strict';

// Periodic RP sweep plus the service-account purge that makes the v1.12.0 ops
// rule self-enforcing. Two facts drive the design (both verified against the
// installed Hydro source): the RP script scores `document.status`, not
// `record`, and calcLevel's stored rank ignores `join`, so a single leftover
// solved-status row for the judge service account (hydsvc-0074) would give it
// phantom RP and displace every real member's stored rank. And nothing outside
// the record flow fires events — contest deletion, admin edits and manual
// database fixes are invisible to live-rp — while Hydro's own task.daily only
// recomputes at 03:00. The hourly sweep bounds that staleness; the purge right
// before every RP run means a service account can never feed the calculation.

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
// The 75-second pm2 readiness window is brand-sensitive; sweeping on top of a
// booting process only muddies logs, so the first pass waits past it.
const SWEEP_STARTUP_DELAY_MS = 3 * 60 * 1000;
const HISTORY_LIMIT = 100;
const DOC_TYPE_PROBLEM = 10;
// The ranking domains every real member should be joined to (the v1.12.0
// policy, extended to every registration path — see createAutoJoin below).
const JOIN_DOMAINS = ['system', 'poj'];

// Plain console shim: this module is also loaded by node:test without hydrooj.
const logger = {
    info: (...a) => console.info('swpu-ops [I]', ...a),
    error: (...a) => console.error('swpu-ops [E]', ...a),
};

// Service accounts whose document.status rows are garbage by policy. Defaults
// to the judge account (uid 3); empty string disables the purge entirely.
function serviceUidsFromEnv(env = process.env) {
    const raw = (env.SWPU_SERVICE_UIDS === undefined ? '3' : env.SWPU_SERVICE_UIDS).trim();
    if (!raw) return [];
    const uids = raw.split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    return [...new Set(uids)].sort((a, b) => a - b);
}

// Deletes every document.status row of the service accounts, across all
// domains and doc types (problem statuses, training enrollments, ...). Throws
// on database errors so callers can refuse to compute on a polluted source.
function createSanitize(coll, uids) {
    if (!coll || typeof coll.deleteMany !== 'function') throw new TypeError('sanitize needs the document.status collection');
    const targets = [...uids];
    return async function sanitize() {
        if (!targets.length) return { deletedCount: 0, disabled: true };
        const result = await coll.deleteMany({ uid: { $in: targets } });
        return { deletedCount: (result && result.deletedCount) || 0, uids: targets };
    };
}

// Removes the problem-status row a service-account record just produced (or is
// about to produce — callers pair this with the pre-run sanitize for the race).
function createPurgeDoc(coll) {
    if (!coll || typeof coll.deleteMany !== 'function') throw new TypeError('purgeDoc needs the document.status collection');
    return async function purgeDoc(domainId, uid, docId) {
        return coll.deleteMany({ domainId, docType: DOC_TYPE_PROBLEM, docId, uid });
    };
}

// Serializes RP computations across the live hook and the sweep: two
// concurrent rating runs would reset each other's rpInfo mid-write. Work
// submitted while a computation runs queues behind it (the compute is fast
// and idempotent, so waiting beats skipping for the latency-sensitive path).
function createRpLock() {
    let tail = Promise.resolve();
    return function acquire(work) {
        const result = tail.then(work, work);
        tail = result.then(() => {}, () => {});
        return result;
    };
}

// Membership reconciliation. The v1.12.0 fix auto-joins members at
// /reg/complete, but that is only one of the paths that create accounts:
// a GitHub (or any OAuth) first login funnels into Hydro core's
// UserRegisterWithCodeHandler, which sets no join flag, and neither does
// admin-created accounts. The ranking board lists only join=true members, so
// such members stay invisible even after solving. This hook closes that gap
// at the one chokepoint every login path ends in: Hydro's serial
// `auth/login` event (fired by successfulAuth on every real login and at the
// end of registration; logout calls it with uid 0, which the uid check
// skips). Existing domain docs keep their role; only the join flag is set.
// Service accounts are skipped — the judge account's join is deliberately
// withdrawn and must never come back.
function createAutoJoin({ coll, domainModel, domains = JOIN_DOMAINS, uids = [] }) {
    if (!coll || typeof coll.findOne !== 'function') throw new TypeError('autoJoin needs the domain.user collection');
    if (!domainModel || typeof domainModel.setUserRole !== 'function') throw new TypeError('autoJoin needs DomainModel');
    const excluded = [...uids];
    return async function autoJoin(udoc) {
        const uid = udoc && udoc._id;
        if (!(uid > 1) || excluded.includes(uid)) return false;
        let changed = false;
        for (const domainId of domains) {
            const dudoc = await coll.findOne({ domainId, uid });
            if (dudoc && dudoc.join) continue;
            if (dudoc) await coll.updateOne({ domainId, uid }, { $set: { join: true } });
            else await domainModel.setUserRole(domainId, uid, 'default', true);
            changed = true;
        }
        return changed;
    };
}

// Hourly backstop for the same policy: reconcile every real member's join
// flag in the ranking domains, whatever path created the account (or removed
// the flag). Missing domain docs are inserted with the default role; existing
// docs keep their role and only gain join=true.
function createJoinReconcile({ userColl, domainUserColl, domains = JOIN_DOMAINS, uids = [] }) {
    if (!userColl || typeof userColl.find !== 'function') throw new TypeError('reconcile needs the user collection');
    if (!domainUserColl || typeof domainUserColl.find !== 'function') throw new TypeError('reconcile needs the domain.user collection');
    const excluded = [...uids];
    return async function reconcile() {
        const members = (await userColl.find({ _id: { $gt: 1 } }, { projection: { _id: 1 } }).toArray())
            .map((d) => d._id)
            .filter((uid) => !excluded.includes(uid));
        let created = 0;
        let joined = 0;
        for (const domainId of domains) {
            const present = new Set(
                (await domainUserColl.find({ domainId }, { projection: { uid: 1 } }).toArray()).map((d) => d.uid),
            );
            for (const uid of members) {
                if (present.has(uid)) continue;
                await domainUserColl.updateOne(
                    { domainId, uid },
                    { $setOnInsert: { domainId, uid, join: true, role: 'default' } },
                    { upsert: true },
                );
                created++;
            }
            const result = await domainUserColl.updateMany(
                { domainId, uid: { $gt: 1, $nin: excluded }, join: { $ne: true } },
                { $set: { join: true } },
            );
            joined += (result && result.modifiedCount) || 0;
        }
        return { created, joined };
    };
}

function createRpSweep(options = {}) {
    const {
        intervalMs = SWEEP_INTERVAL_MS,
        startupDelayMs = SWEEP_STARTUP_DELAY_MS,
        // Injectable for tests; defaults to Hydro's global script registry.
        script = null,
        sanitize = null,
        reconcile = null,
        lock = null,
        instance = process.env.NODE_APP_INSTANCE,
    } = options;
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) throw new TypeError('intervalMs must be a positive integer');
    if (!Number.isSafeInteger(startupDelayMs) || startupDelayMs < 0) throw new TypeError('startupDelayMs must be a non-negative integer');
    const sweeps = [];
    const failures = [];
    let timer = null;
    let running = false;
    let stopped = false;

    function remember(history, entry) {
        history.push(entry);
        if (history.length > HISTORY_LIMIT) history.shift();
    }

    function resolveScript() {
        if (script) return script;
        return (global.Hydro && global.Hydro.script && global.Hydro.script.rp) || null;
    }

    // One full pass: purge service-account rows, then recompute every domain
    // (rp.run with no domainId iterates all domains itself). Returns whether a
    // recalculation actually ran; a failed purge aborts the pass, never
    // computing on a source that may still hold service-account rows.
    async function runOnce(trigger) {
        if (stopped || running) return false;
        running = true;
        try {
            const work = async () => {
                const rp = resolveScript();
                if (!rp || typeof rp.run !== 'function') return false;
                if (sanitize) {
                    const purge = await sanitize();
                    if (purge && purge.deletedCount > 0) logger.info('purged service-account status rows:', purge.deletedCount);
                }
                if (reconcile) {
                    const result = await reconcile();
                    if (result && (result.created || result.joined)) {
                        logger.info('reconciled ranking-domain joins:', JSON.stringify(result));
                    }
                }
                const startedAt = Date.now();
                await rp.run({}, () => {});
                remember(sweeps, { trigger, at: new Date().toISOString(), durationMs: Date.now() - startedAt });
                logger.info('rp sweep recalculated all domains (' + trigger + ')');
                return true;
            };
            if (lock) return await lock(work);
            return await work();
        } catch (e) {
            remember(failures, { trigger, at: new Date().toISOString(), message: (e && e.message) || String(e) });
            logger.error('rp sweep failed (' + trigger + '):', e);
            return false;
        } finally {
            running = false;
        }
    }

    // Chained setTimeout instead of setInterval: a pass that outlives its
    // interval can never stack, and each arm is trivially cancellable.
    function arm(delay) {
        if (stopped) return;
        timer = setTimeout(async () => {
            timer = null;
            await runOnce('scheduled');
            arm(intervalMs);
        }, delay);
    }

    function start() {
        if (stopped || timer) return;
        if (instance !== undefined && instance !== '0') return;
        logger.info('rp sweep armed: first pass in '
            + Math.round(startupDelayMs / 1000) + 's, then every '
            + Math.round(intervalMs / 60000) + 'min');
        arm(startupDelayMs);
    }

    function stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = null;
    }

    return { start, stop, runOnce, sweeps, failures };
}

module.exports = {
    createAutoJoin,
    createJoinReconcile,
    createPurgeDoc,
    createRpLock,
    createRpSweep,
    createSanitize,
    serviceUidsFromEnv,
    JOIN_DOMAINS,
    SWEEP_INTERVAL_MS,
    SWEEP_STARTUP_DELAY_MS,
};
