const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    assertServiceAccounts, createAutoJoin, createJoinReconcile, createPurgeDoc, createRpLock, createRpSweep, createSanitize,
    dryRunFromEnv, serviceUidsFromEnv, JOIN_DOMAINS, SWEEP_INTERVAL_MS, SWEEP_STARTUP_DELAY_MS,
} = require('../rp-sweep.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const script = { run: async () => true };

test('sweep defaults cover the judge account once per hour after boot', () => {
    assert.equal(SWEEP_INTERVAL_MS, 60 * 60 * 1000);
    assert.equal(SWEEP_STARTUP_DELAY_MS, 3 * 60 * 1000);
    assert.deepEqual(serviceUidsFromEnv({}), [3]);
});

test('SWPU_SERVICE_UIDS parses, dedupes and can disable the purge', () => {
    assert.deepEqual(serviceUidsFromEnv({ SWPU_SERVICE_UIDS: '' }), []);
    assert.deepEqual(serviceUidsFromEnv({ SWPU_SERVICE_UIDS: ' 7,3, 3,0,-2,x ' }), [3, 7]);
});

// The purge feeds the RP calculation, which only reads problem statuses. An
// unscoped uid-only delete also took out training enrolments and every other
// document.type row for that account.
test('sanitize is scoped to problem statuses, not the whole account', async () => {
    const deleted = [];
    const coll = { deleteMany: async (filter) => { deleted.push(filter); return { deletedCount: 2 }; } };
    const result = await createSanitize(coll, [3, 7])();
    assert.equal(result.deletedCount, 2);
    assert.deepEqual(deleted, [{ uid: { $in: [3, 7] }, docType: 10 }]);
    // The wide behaviour stays reachable for operators who really want it.
    const wide = [];
    const wideColl = { deleteMany: async (filter) => { wide.push(filter); return { deletedCount: 0 }; } };
    await createSanitize(wideColl, [3], { docType: null })();
    assert.deepEqual(wide, [{ uid: { $in: [3] } }]);
});

test('sanitize reports its blast radius without deleting when dry-run', async () => {
    const deleted = [];
    const coll = {
        deleteMany: async (filter) => { deleted.push(filter); return { deletedCount: 9 }; },
        countDocuments: async (filter) => { assert.deepEqual(filter, { uid: { $in: [3] }, docType: 10 }); return 42; },
    };
    const result = await createSanitize(coll, [3], { dryRun: true })();
    assert.deepEqual(deleted, [], 'dry run must not delete');
    assert.equal(result.deletedCount, 0);
    assert.equal(result.wouldDelete, 42);
    assert.equal(result.dryRun, true);
});

test('the purge refuses a uid that is not recognisably a service account', () => {
    // A retired judge uid reassigned to a person must not have that account's
    // statuses wiped every hour.
    assert.throws(
        () => assertServiceAccounts([{ _id: 3, uname: 'zhangsan' }], [3]),
        /does not look like a service account/,
    );
    assert.throws(
        () => assertServiceAccounts([{ _id: 3, uname: 'admin' }], [3]),
        /SWPU_SERVICE_UIDS/,
    );
    // The real judge account and an absent uname both pass.
    assert.doesNotThrow(() => assertServiceAccounts([{ _id: 3, uname: 'hydsvc-0074' }], [3]));
    assert.doesNotThrow(() => assertServiceAccounts([{ _id: 3, uname: '' }], [3]));
    assert.doesNotThrow(() => assertServiceAccounts([{ _id: 4, uname: 'zhangsan' }], [3]));
    assert.doesNotThrow(() => assertServiceAccounts(null, [3]));
});

test('dry-run and service-account parsing read the environment', () => {
    assert.equal(dryRunFromEnv({}), false);
    for (const value of ['1', 'true', 'TRUE', 'yes']) assert.equal(dryRunFromEnv({ SWPU_SERVICE_UIDS_DRYRUN: value }), true, value);
    for (const value of ['0', 'false', '', 'no', 'maybe']) assert.equal(dryRunFromEnv({ SWPU_SERVICE_UIDS_DRYRUN: value }), false, value);
});

test('sanitize with an empty list is a disabled no-op', async () => {
    const coll = { deleteMany: async () => { throw new Error('must not be called'); } };
    const result = await createSanitize(coll, [])();
    assert.equal(result.deletedCount, 0);
    assert.equal(result.disabled, true);
});

test('purgeDoc targets exactly the problem status row of the record', async () => {
    const deleted = [];
    const coll = { deleteMany: async (filter) => { deleted.push(filter); return { deletedCount: 1 }; } };
    await createPurgeDoc(coll)('system', 3, '4326');
    assert.deepEqual(deleted, [{ domainId: 'system', docType: 10, docId: '4326', uid: 3 }]);
});

test('a manual pass purges before computing', async () => {
    const order = [];
    const sweep = createRpSweep({
        script: { run: async () => { order.push('rp'); } },
        sanitize: async () => { order.push('purge'); return { deletedCount: 3 }; },
    });
    assert.equal(await sweep.runOnce('manual'), true);
    assert.deepEqual(order, ['purge', 'rp']);
    assert.equal(sweep.sweeps.length, 1);
    assert.equal(sweep.sweeps[0].trigger, 'manual');
});

test('a failed purge aborts the pass without computing', async () => {
    const ran = [];
    const sweep = createRpSweep({
        script: { run: async () => { ran.push(1); } },
        sanitize: async () => { throw new Error('db down'); },
    });
    assert.equal(await sweep.runOnce('manual'), false);
    assert.deepEqual(ran, []);
    assert.equal(sweep.sweeps.length, 0);
    assert.equal(sweep.failures.length, 1);
    assert.match(sweep.failures[0].message, /db down/);
});

test('missing script registry is a no-op and never touches the database', async () => {
    delete global.Hydro;
    const sweep = createRpSweep({ sanitize: async () => { throw new Error('must not purge without a script'); } });
    assert.equal(await sweep.runOnce('manual'), false);
    assert.equal(sweep.failures.length, 0);
});

test('a pass never overlaps itself', async () => {
    let blocked = true;
    const waiters = [];
    const sweep = createRpSweep({
        script: { run: async () => {
            if (!blocked) return;
            await new Promise((r) => waiters.push(r));
        } },
    });
    const first = sweep.runOnce('scheduled');
    assert.equal(await sweep.runOnce('manual'), false);
    blocked = false;
    for (const resolve of waiters.splice(0)) resolve();
    assert.equal(await first, true);
    assert.equal(await sweep.runOnce('manual'), true);
    sweep.stop();
});

test('scheduled passes start after the startup delay and re-arm at the interval', async () => {
    const order = [];
    const sweep = createRpSweep({
        startupDelayMs: 10,
        intervalMs: 40,
        script: { run: async () => { order.push('rp'); await sleep(5); } },
        sanitize: async () => { order.push('purge'); return { deletedCount: 0 }; },
        instance: '0',
    });
    sweep.start();
    await sleep(30);
    assert.deepEqual(order, ['purge', 'rp']);
    await sleep(50);
    assert.deepEqual(order, ['purge', 'rp', 'purge', 'rp']);
    sweep.stop();
    await sleep(60);
    assert.deepEqual(order, ['purge', 'rp', 'purge', 'rp']);
});

test('non-zero pm2 instances never arm the timer', async () => {
    const ran = [];
    const sweep = createRpSweep({
        startupDelayMs: 5, intervalMs: 10,
        script: { run: async () => { ran.push(1); } },
        instance: '1',
    });
    sweep.start();
    await sleep(40);
    assert.deepEqual(ran, []);
    sweep.stop();
});

test('stop cancels the armed pass before it fires', async () => {
    const ran = [];
    const sweep = createRpSweep({
        startupDelayMs: 10, intervalMs: 10,
        script: { run: async () => { ran.push(1); } },
        instance: '0',
    });
    sweep.start();
    sweep.stop();
    await sleep(40);
    assert.deepEqual(ran, []);
});

test('createRpLock serializes concurrent RP computations', async () => {
    const order = [];
    const lock = createRpLock();
    const first = lock(async () => { order.push('a-start'); await sleep(10); order.push('a-end'); });
    const second = lock(async () => { order.push('b-start'); order.push('b-end'); });
    await first;
    await second;
    assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
});

test('the lock chain survives a failed job', async () => {
    const lock = createRpLock();
    await assert.rejects(() => lock(async () => { throw new Error('boom'); }), /boom/);
    assert.equal(await lock(async () => 'ok'), 'ok');
});

function autoJoinFixture(docs) {
    const writes = [];
    const coll = {
        findOne: async (filter) => docs.find((d) => d.domainId === filter.domainId && d.uid === filter.uid) || null,
        updateOne: async (filter, update) => {
            writes.push(['update', filter, update]);
            const doc = docs.find((d) => d.domainId === filter.domainId && d.uid === filter.uid);
            if (doc) Object.assign(doc, update.$set);
            return { modifiedCount: doc ? 1 : 0 };
        },
    };
    const domainModel = {
        setUserRole: async (domainId, uid, role, join) => {
            writes.push(['setUserRole', domainId, uid, role, join]);
            docs.push({ domainId, uid, role, join });
        },
    };
    return { coll, domainModel, writes };
}

test('auto-join creates missing domain docs and flags existing ones', async () => {
    const docs = [
        { domainId: 'system', uid: 4, role: 'acmer', join: false },
        { domainId: 'system', uid: 7, role: 'default', join: true },
        { domainId: 'poj', uid: 7, role: 'default', join: true },
    ];
    const { coll, domainModel, writes } = autoJoinFixture(docs);
    const autoJoin = createAutoJoin({ coll, domainModel, uids: [3] });
    assert.equal(await autoJoin({ _id: 4 }), true);
    // existing doc: role preserved, only join set
    assert.deepEqual(writes[0], ['update', { domainId: 'system', uid: 4 }, { $set: { join: true } }]);
    assert.equal(docs[0].role, 'acmer');
    // poj doc missing: official setUserRole upsert
    assert.deepEqual(writes[1], ['setUserRole', 'poj', 4, 'default', true]);
    // fully joined user is a no-op
    writes.length = 0;
    assert.equal(await autoJoin({ _id: 7 }), false);
    assert.deepEqual(writes, []);
});

test('auto-join skips guests, the system account and service accounts', async () => {
    const { coll, domainModel, writes } = autoJoinFixture([]);
    const autoJoin = createAutoJoin({ coll, domainModel, uids: [3] });
    assert.equal(await autoJoin({ _id: 0 }), false);
    assert.equal(await autoJoin({ _id: 1 }), false);
    assert.equal(await autoJoin({ _id: 3 }), false);
    assert.equal(await autoJoin(null), false);
    assert.deepEqual(writes, []);
});

test('JOIN_DOMAINS are the two ranking domains', () => {
    assert.deepEqual(JOIN_DOMAINS, ['system', 'poj']);
});

function reconcileFixture(users, domainUsers) {
    const writes = [];
    const userColl = { find: () => ({ toArray: async () => users.map((u) => ({ _id: u })) }) };
    const domainUserColl = {
        find: (filter) => ({
            toArray: async () => domainUsers.filter((d) => d.domainId === filter.domainId),
        }),
        updateOne: async (filter, update) => {
            writes.push(['upsert', filter, update]);
            if (!domainUsers.some((d) => d.domainId === filter.domainId && d.uid === filter.uid)) {
                domainUsers.push({ ...update.$setOnInsert });
            }
            return { modifiedCount: 1 };
        },
        updateMany: async (filter, update) => {
            writes.push(['many', filter, update]);
            let count = 0;
            for (const d of domainUsers) {
                if (d.domainId === filter.domainId && d.uid > 1 && !filter.uid.$nin.includes(d.uid) && !d.join) {
                    d.join = true;
                    count++;
                }
            }
            return { modifiedCount: count };
        },
    };
    return { userColl, domainUserColl, writes };
}

test('reconcile inserts missing docs, flags existing ones and skips service accounts', async () => {
    const domainUsers = [
        { domainId: 'system', uid: 2, role: 'root', join: true },
        { domainId: 'system', uid: 3, role: 'default', join: false },
        { domainId: 'poj', uid: 2, role: 'default', join: true },
    ];
    const { userColl, domainUserColl, writes } = reconcileFixture([2, 3, 4, 5], domainUsers);
    const reconcile = createJoinReconcile({ userColl, domainUserColl, uids: [3] });
    const result = await reconcile();
    // members = [2,4,5]; system missing {4,5}, poj missing {4,5} → 4 inserts
    assert.deepEqual(result, { created: 4, joined: 0 });
    // uid 3 is a service account: never inserted, never joined
    assert.ok(!domainUsers.some((d) => d.uid === 3 && d.domainId === 'poj'));
    assert.equal(domainUsers[1].join, false);
    // inserts carry the default role and join
    assert.deepEqual(writes[0], ['upsert', { domainId: 'system', uid: 4 }, { $setOnInsert: { domainId: 'system', uid: 4, join: true, role: 'default' } }]);
    assert.deepEqual(writes[3], ['upsert', { domainId: 'poj', uid: 4 }, { $setOnInsert: { domainId: 'poj', uid: 4, join: true, role: 'default' } }]);
    // system updateMany excludes service uids
    const systemMany = writes.find(([kind, f]) => kind === 'many' && f.domainId === 'system');
    assert.deepEqual(systemMany[1], { domainId: 'system', uid: { $gt: 1, $nin: [3] }, join: { $ne: true } });
    // inserted docs are visible afterwards
    assert.ok(domainUsers.some((d) => d.domainId === 'poj' && d.uid === 5 && d.join && d.role === 'default'));
});

test('reconcile flags existing unjoined docs via updateMany', async () => {
    const domainUsers = [
        { domainId: 'system', uid: 2, role: 'root', join: false },
        { domainId: 'poj', uid: 2, role: 'default', join: true },
    ];
    const { userColl, domainUserColl, writes } = reconcileFixture([2, 4], domainUsers);
    const reconcile = createJoinReconcile({ userColl, domainUserColl, uids: [3] });
    const result = await reconcile();
    // system missing {4}, poj missing {4} (poj uid 2 already present) → 2 inserts
    assert.deepEqual(result, { created: 2, joined: 1 });
    assert.equal(domainUsers[0].join, true);
    assert.equal(domainUsers[0].role, 'root');
    const many = writes.find(([kind, f]) => kind === 'many' && f.domainId === 'system');
    assert.ok(many);
});

test('a sweep pass sanitizes, reconciles and then recomputes', async () => {
    const order = [];
    const sweep = createRpSweep({
        script: { run: async () => { order.push('rp'); } },
        sanitize: async () => { order.push('purge'); return { deletedCount: 0 }; },
        reconcile: async () => { order.push('reconcile'); return { created: 1, joined: 0 }; },
    });
    assert.equal(await sweep.runOnce('manual'), true);
    assert.deepEqual(order, ['purge', 'reconcile', 'rp']);
});

test('a failed reconcile aborts the pass without computing', async () => {
    const ran = [];
    const sweep = createRpSweep({
        script: { run: async () => { ran.push(1); } },
        sanitize: async () => ({ deletedCount: 0 }),
        reconcile: async () => { throw new Error('db down'); },
    });
    assert.equal(await sweep.runOnce('manual'), false);
    assert.deepEqual(ran, []);
    assert.match(sweep.failures[0].message, /db down/);
});
