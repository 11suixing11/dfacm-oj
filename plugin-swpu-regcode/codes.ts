import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';

export type CodePurpose = 'reg' | 'login';
export type CodeFailureReason = 'missing' | 'expired' | 'invalid' | 'attempts' | 'pending' | 'binding';

export interface CodeDocument {
    _id: string;
    purpose: CodePurpose;
    uid: number | null;
    generation: string;
    salt: string;
    codeHash: string;
    status: 'pending' | 'active';
    attempts: number;
    createdAt: Date;
    expireAt: Date;
}

// Structural interface so this module can use Hydro's collection without loading Hydro.
export interface CodeCollection {
    createIndex(keys: Record<string, number>, options: { expireAfterSeconds: number }): Promise<unknown>;
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: { upsert: boolean }): Promise<{ matchedCount?: number }>;
    deleteOne(filter: Record<string, unknown>): Promise<unknown>;
    findOne(filter: Record<string, unknown>): Promise<CodeDocument | null>;
    findOneAndUpdate(
        filter: Record<string, unknown>, update: Record<string, unknown>,
        options: { returnDocument: 'after'; includeResultMetadata: false },
    ): Promise<CodeDocument | null>;
    findOneAndDelete(filter: Record<string, unknown>, options: { includeResultMetadata: false }): Promise<CodeDocument | null>;
}

export interface IssuedCode {
    readonly key: string;
    readonly generation: string;
    // Only returned to the mail sender; never stored in the collection.
    readonly code: string;
}

export type ConsumeCodeResult =
    | { ok: true; uid: number | null; generation: string }
    | { ok: false; reason: CodeFailureReason };

export interface CodeStoreOptions {
    now?: () => number;
    ttlMs?: number;
    maxAttempts?: number;
}

function digest(doc: Pick<CodeDocument, 'salt' | 'generation' | 'purpose' | 'uid'>, code: string) {
    // A salted digest prevents accidental plaintext disclosure. Six-digit codes remain
    // low entropy: a database reader can still brute-force them, so keep a short TTL.
    return createHash('sha256')
        .update([doc.salt, doc.generation, doc.purpose, String(doc.uid), code].join('\0'))
        .digest('hex');
}

function keyFor(mailKey: string, purpose: CodePurpose) {
    if (purpose !== 'reg' && purpose !== 'login') throw new TypeError('Invalid code purpose');
    if (!mailKey || mailKey !== mailKey.trim().toLowerCase() || !mailKey.includes('@')) {
        throw new TypeError('mailKey must be a normalized email');
    }
    // Login uses Hydro's account lookup key; registration uses the exact
    // lowercased delivery address, preventing a different mailbox being bound.
    return `${purpose}:${mailKey}`;
}

function bindingFor(purpose: CodePurpose, uid?: number) {
    if (purpose === 'reg') {
        if (uid !== undefined) throw new TypeError('Registration codes cannot bind an existing uid');
        return null;
    }
    if (!Number.isSafeInteger(uid) || (uid as number) <= 0) {
        throw new TypeError('Login codes require a positive uid');
    }
    return uid as number;
}

export function createCodeStore(collection: CodeCollection, options: CodeStoreOptions = {}) {
    const now = options.now || Date.now;
    const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    const maxAttempts = options.maxAttempts ?? 5;
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new TypeError('ttlMs must be a positive integer');
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) throw new TypeError('maxAttempts must be a positive integer');

    async function failure(key: string, purpose: CodePurpose, uid: number | null): Promise<ConsumeCodeResult> {
        const doc = await collection.findOne({ _id: key });
        if (!doc) return { ok: false, reason: 'missing' };
        if (doc.purpose !== purpose || doc.uid !== uid) return { ok: false, reason: 'binding' };
        if (!(doc.expireAt instanceof Date) || doc.expireAt.getTime() <= now()) return { ok: false, reason: 'expired' };
        if (doc.status !== 'active') return { ok: false, reason: 'pending' };
        if (doc.attempts >= maxAttempts) return { ok: false, reason: 'attempts' };
        return { ok: false, reason: 'invalid' };
    }

    return {
        ensureIndexes() {
            return collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
        },

        async prepare(mailKey: string, purpose: CodePurpose, uid?: number): Promise<IssuedCode> {
            const key = keyFor(mailKey, purpose);
            const boundUid = bindingFor(purpose, uid);
            const code = String(randomInt(100000, 1000000));
            const generation = randomUUID();
            const issuedAt = now();
            const doc: CodeDocument = {
                _id: key,
                purpose,
                uid: boundUid,
                generation,
                salt: randomBytes(16).toString('hex'),
                codeHash: '',
                status: 'pending',
                attempts: 0,
                createdAt: new Date(issuedAt),
                expireAt: new Date(issuedAt + ttlMs),
            };
            doc.codeHash = digest(doc, code);
            const { _id, ...fields } = doc;
            await collection.updateOne({ _id }, { $set: fields, $unset: { code: '' } }, { upsert: true });
            return { key, generation, code };
        },

        async activate(issued: IssuedCode): Promise<boolean> {
            const activatedAt = now();
            const result = await collection.updateOne(
                { _id: issued.key, generation: issued.generation, status: 'pending', expireAt: { $gt: new Date(activatedAt) } },
                { $set: { status: 'active', expireAt: new Date(activatedAt + ttlMs) } },
            );
            return result.matchedCount === 1;
        },

        async discard(issued: IssuedCode): Promise<void> {
            await collection.deleteOne({ _id: issued.key, generation: issued.generation });
        },

        async consume(mailKey: string, purpose: CodePurpose, code: string, expectedUid?: number): Promise<ConsumeCodeResult> {
            const key = keyFor(mailKey, purpose);
            const uid = bindingFor(purpose, expectedUid);
            // Reserving a budget slot and returning its document is one atomic operation.
            // Even concurrent wrong guesses can reserve at most maxAttempts slots.
            const doc = await collection.findOneAndUpdate(
                { _id: key, purpose, uid, status: 'active', expireAt: { $gt: new Date(now()) }, attempts: { $lt: maxAttempts } },
                { $inc: { attempts: 1 } },
                { returnDocument: 'after', includeResultMetadata: false },
            );
            if (!doc) return failure(key, purpose, uid);
            const enteredCode = String(code).trim();
            const expectedHash = Buffer.from(doc.codeHash, 'hex');
            const actualHash = Buffer.from(digest(doc, enteredCode), 'hex');
            const matches = /^\d{6}$/.test(enteredCode)
                && expectedHash.length === actualHash.length
                && timingSafeEqual(expectedHash, actualHash);
            if (!matches) return { ok: false, reason: doc.attempts >= maxAttempts ? 'attempts' : 'invalid' };
            // Only one request can delete this generation. Recheck expiration using a
            // fresh timestamp because the budget reservation may have crossed expiry.
            const consumed = await collection.findOneAndDelete(
                { _id: key, generation: doc.generation, purpose, uid, status: 'active', expireAt: { $gt: new Date(now()) } },
                { includeResultMetadata: false },
            );
            if (!consumed) return failure(key, purpose, uid);
            return { ok: true, uid: consumed.uid, generation: consumed.generation };
        },
    };
}
