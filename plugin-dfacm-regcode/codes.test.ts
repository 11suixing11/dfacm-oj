import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCodeStore } from './codes.ts';
import type { CodeCollection, CodeDocument, IssuedCode } from './codes.ts';

// Each database operation matches and mutates synchronously, before its returned
// promise settles, just as a single MongoDB document operation is atomic.
class MemoryCollection implements CodeCollection {
    docs = new Map<string, CodeDocument>();
    indexes: unknown[] = [];
    afterReservation?: () => Promise<void>;

    matches(doc: CodeDocument, filter: Record<string, unknown>) {
        return Object.entries(filter).every(([field, expected]) => {
            const actual = (doc as unknown as Record<string, unknown>)[field];
            if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
                const conditions = expected as Record<string, unknown>;
                const value = actual instanceof Date ? actual.getTime() : actual as number;
                if ('$gt' in conditions) {
                    const limit = conditions.$gt instanceof Date ? conditions.$gt.getTime() : conditions.$gt as number;
                    if (!(value > limit)) return false;
                }
                if ('$lt' in conditions && !(value < (conditions.$lt as number))) return false;
                return true;
            }
            return actual === expected;
        });
    }

    update(doc: CodeDocument, update: Record<string, unknown>) {
        const fields = doc as unknown as Record<string, unknown>;
        Object.assign(fields, structuredClone(update.$set || {}));
        for (const [key, value] of Object.entries((update.$inc || {}) as Record<string, number>)) {
            fields[key] = (fields[key] as number || 0) + value;
        }
        for (const key of Object.keys(update.$unset || {})) delete fields[key];
    }

    async createIndex(keys: Record<string, number>, options: { expireAfterSeconds: number }) {
        this.indexes.push({ keys, options });
        return 'expireAt_1';
    }

    async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: { upsert: boolean }) {
        let doc = [...this.docs.values()].find((entry) => this.matches(entry, filter));
        const matchedCount = doc ? 1 : 0;
        if (!doc && options?.upsert) {
            doc = { _id: filter._id as string } as CodeDocument;
            this.docs.set(doc._id, doc);
        }
        if (doc) this.update(doc, update);
        return { matchedCount };
    }

    async deleteOne(filter: Record<string, unknown>) {
        const doc = [...this.docs.values()].find((entry) => this.matches(entry, filter));
        if (doc) this.docs.delete(doc._id);
        return { deletedCount: doc ? 1 : 0 };
    }

    async findOne(filter: Record<string, unknown>) {
        const doc = [...this.docs.values()].find((entry) => this.matches(entry, filter));
        return doc ? structuredClone(doc) : null;
    }

    async findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>) {
        const doc = [...this.docs.values()].find((entry) => this.matches(entry, filter));
        if (!doc) return null;
        this.update(doc, update);
        const reserved = structuredClone(doc);
        await this.afterReservation?.();
        return reserved;
    }

    async findOneAndDelete(filter: Record<string, unknown>) {
        const doc = [...this.docs.values()].find((entry) => this.matches(entry, filter));
        if (!doc) return null;
        this.docs.delete(doc._id);
        return structuredClone(doc);
    }
}

function fixture() {
    const collection = new MemoryCollection();
    let time = Date.parse('2026-10-02T12:00:00Z');
    const store = createCodeStore(collection, { now: () => time });
    return { collection, store, advance(ms: number) { time += ms; } };
}

function wrongCode(issued: IssuedCode) {
    return issued.code === '111111' ? '222222' : '111111';
}

test('stores a salted digest and a purpose-bound generation, with a TTL index', async () => {
    const { collection, store } = fixture();
    await store.ensureIndexes();
    assert.deepEqual(collection.indexes, [{ keys: { expireAt: 1 }, options: { expireAfterSeconds: 0 } }]);
    const issued = await store.prepare('student@example.com', 'login', 42);
    const doc = collection.docs.get(issued.key)!;
    assert.match(issued.code, /^[1-9]\d{5}$/);
    assert.match(doc.codeHash, /^[0-9a-f]{64}$/);
    assert.match(doc.salt, /^[0-9a-f]{32}$/);
    assert.equal('code' in doc, false);
    assert.equal(doc.uid, 42);
    assert.equal(doc.generation, issued.generation);
    assert.equal(doc.status, 'pending');
});

test('a pending email cannot authenticate and becomes usable after activation', async () => {
    const { collection, store } = fixture();
    const issued = await store.prepare('student@example.com', 'login', 42);
    assert.deepEqual(await store.consume('student@example.com', 'login', issued.code, 42), { ok: false, reason: 'pending' });
    assert.equal(collection.docs.get(issued.key)!.attempts, 0);
    assert.equal(await store.activate(issued), true);
    assert.deepEqual(await store.consume('student@example.com', 'login', issued.code, 42), {
        ok: true, uid: 42, generation: issued.generation,
    });
});

test('explicitly rejects an expired document even before MongoDB TTL cleanup', async () => {
    const { collection, store, advance } = fixture();
    const issued = await store.prepare('student@example.com', 'reg');
    await store.activate(issued);
    advance(5 * 60 * 1000);
    assert.equal(collection.docs.has(issued.key), true);
    assert.deepEqual(await store.consume('student@example.com', 'reg', issued.code), { ok: false, reason: 'expired' });
    assert.equal(collection.docs.get(issued.key)!.attempts, 0);
});

test('a slow successful send starts its validity period at activation', async () => {
    const { store, advance } = fixture();
    const issued = await store.prepare('student@example.com', 'reg');
    advance(60 * 1000);
    await store.activate(issued);
    advance(4 * 60 * 1000 + 1);
    assert.equal((await store.consume('student@example.com', 'reg', issued.code)).ok, true);
});

test('an expired pending code cannot be activated or resurrected', async () => {
    const { store, advance } = fixture();
    const issued = await store.prepare('student@example.com', 'reg');
    advance(5 * 60 * 1000);
    assert.equal(await store.activate(issued), false);
    assert.deepEqual(await store.consume('student@example.com', 'reg', issued.code), { ok: false, reason: 'expired' });
});

test('five wrong guesses exhaust the budget, including for the correct sixth request', async () => {
    const { collection, store } = fixture();
    const issued = await store.prepare('student@example.com', 'reg');
    await store.activate(issued);
    for (let attempt = 0; attempt < 5; attempt++) {
        assert.equal((await store.consume('student@example.com', 'reg', wrongCode(issued))).ok, false);
    }
    assert.equal(collection.docs.get(issued.key)!.attempts, 5);
    assert.deepEqual(await store.consume('student@example.com', 'reg', issued.code), { ok: false, reason: 'attempts' });
});

test('the fifth budget slot can still authenticate when its code is correct', async () => {
    const { store } = fixture();
    const issued = await store.prepare('student@example.com', 'reg');
    await store.activate(issued);
    for (let attempt = 0; attempt < 4; attempt++) await store.consume('student@example.com', 'reg', wrongCode(issued));
    assert.equal((await store.consume('student@example.com', 'reg', issued.code)).ok, true);
});

test('concurrent wrong guesses reserve at most five attempts', async () => {
    const { collection, store } = fixture();
    const issued = await store.prepare('student@example.com', 'reg');
    await store.activate(issued);
    const results = await Promise.all(Array.from({ length: 20 }, () => store.consume('student@example.com', 'reg', wrongCode(issued))));
    assert.equal(results.every((result) => !result.ok), true);
    assert.equal(collection.docs.get(issued.key)!.attempts, 5);
});

test('concurrent correct requests yield exactly one successful consumption', async () => {
    const { collection, store } = fixture();
    const issued = await store.prepare('student@example.com', 'login', 42);
    await store.activate(issued);
    const results = await Promise.all(Array.from({ length: 5 }, () => store.consume('student@example.com', 'login', issued.code, 42)));
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(collection.docs.has(issued.key), false);
    assert.deepEqual(await store.consume('student@example.com', 'login', issued.code, 42), { ok: false, reason: 'missing' });
});

test('UID mismatch cannot reserve attempts or consume another account code', async () => {
    const { collection, store } = fixture();
    const issued = await store.prepare('student@example.com', 'login', 42);
    await store.activate(issued);
    assert.deepEqual(await store.consume('student@example.com', 'login', issued.code, 43), { ok: false, reason: 'binding' });
    assert.equal(collection.docs.get(issued.key)!.attempts, 0);
    assert.equal((await store.consume('student@example.com', 'login', issued.code, 42)).ok, true);
});

test('registration and login have independent records and cannot consume each other', async () => {
    const { store } = fixture();
    const registered = await store.prepare('student@example.com', 'reg');
    await store.activate(registered);
    assert.deepEqual(await store.consume('student@example.com', 'login', registered.code, 42), { ok: false, reason: 'missing' });
    const login = await store.prepare('student@example.com', 'login', 42);
    await store.activate(login);
    assert.notEqual(registered.key, login.key);
    assert.equal((await store.consume('student@example.com', 'reg', registered.code)).ok, true);
    assert.equal((await store.consume('student@example.com', 'login', login.code, 42)).ok, true);
});

test('a stale failed mail cannot delete or activate a newer generation', async () => {
    const { collection, store } = fixture();
    const old = await store.prepare('student@example.com', 'reg');
    const current = await store.prepare('student@example.com', 'reg');
    await store.activate(current);
    await store.discard(old);
    assert.equal(await store.activate(old), false);
    assert.equal(collection.docs.get(current.key)!.generation, current.generation);
    assert.equal((await store.consume('student@example.com', 'reg', current.code)).ok, true);
});

test('a fresh generation invalidates the old code and resets an exhausted budget', async () => {
    const { collection, store } = fixture();
    const old = await store.prepare('student@example.com', 'reg');
    await store.activate(old);
    await Promise.all(Array.from({ length: 5 }, () => store.consume('student@example.com', 'reg', wrongCode(old))));
    const current = await store.prepare('student@example.com', 'reg');
    assert.notEqual(current.generation, old.generation);
    assert.equal(collection.docs.get(current.key)!.attempts, 0);
    assert.notEqual(collection.docs.get(current.key)!.codeHash, old.code);
    assert.deepEqual(await store.consume('student@example.com', 'reg', old.code), { ok: false, reason: 'pending' });
    await store.activate(current);
    assert.equal((await store.consume('student@example.com', 'reg', current.code)).ok, true);
});

test('expiration is rechecked between reservation and atomic consumption', async () => {
    const { store, collection, advance } = fixture();
    const issued = await store.prepare('student@example.com', 'reg');
    await store.activate(issued);
    collection.afterReservation = async () => { advance(5 * 60 * 1000); };
    assert.deepEqual(await store.consume('student@example.com', 'reg', issued.code), { ok: false, reason: 'expired' });
    assert.equal(collection.docs.has(issued.key), true);
});

test('a reserved old generation cannot delete a newer issued code', async () => {
    const { store, collection } = fixture();
    const old = await store.prepare('student@example.com', 'reg');
    await store.activate(old);
    let current: IssuedCode;
    collection.afterReservation = async () => {
        collection.afterReservation = undefined;
        current = await store.prepare('student@example.com', 'reg');
        await store.activate(current);
    };
    assert.equal((await store.consume('student@example.com', 'reg', old.code)).ok, false);
    assert.equal(collection.docs.get(old.key)!.generation, current!.generation);
    assert.equal((await store.consume('student@example.com', 'reg', current!.code)).ok, true);
});

test('validates normalized keys and mandatory login bindings', async () => {
    const { store } = fixture();
    await assert.rejects(store.prepare('Student@example.com', 'reg'), /normalized email/);
    await assert.rejects(store.prepare('student@example.com', 'login'), /positive uid/);
    await assert.rejects(store.prepare('student@example.com', 'reg', 42), /cannot bind/);
    await assert.rejects(store.consume('student@example.com', 'login', '111111'), /positive uid/);
});
