'use strict';

// Minimal in-memory stand-in for the mongodb collection API surface used by
// swpu-train: equality/$ne/$in/$gt filters, updateOne with
// $set/$unset/$inc/$setOnInsert + upsert, sort/skip/limit cursors.
// Dates are cloned as Dates; rid values are plain strings in unit tests.

function matches(doc, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = doc[key];
        if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
            // $ne also matches documents where the field is absent (mongo semantics).
            if ('$ne' in expected && actual === expected.$ne) return false;
            if ('$in' in expected && !expected.$in.includes(actual)) return false;
            if ('$gt' in expected && !(actual > expected.$gt)) return false;
            if ('$lt' in expected && !(actual < expected.$lt)) return false;
            return true;
        }
        return actual === expected;
    });
}

function applyUpdate(doc, update, inserting) {
    for (const [key, value] of Object.entries(update.$set || {})) doc[key] = value;
    for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
    for (const key of Object.keys(update.$unset || {})) delete doc[key];
    if (inserting) for (const [key, value] of Object.entries(update.$setOnInsert || {})) doc[key] = value;
    return doc;
}

function clone(value) {
    if (value instanceof Date) return new Date(value.getTime());
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
        // class instances (ObjectId-likes) pass through by reference
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return value;
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
    }
    return value;
}

class FakeCursor {
    constructor(docs) { this.docs = docs; }
    sort(spec) {
        const [key, dir] = Object.entries(spec)[0];
        this.docs.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
        return this;
    }
    skip(n) { this.docs = this.docs.slice(n); return this; }
    limit(n) { this.docs = this.docs.slice(0, n); return this; }
    project() { return this; }
    async toArray() { return this.docs.map((doc) => clone(doc)); }
}

class FakeCollection {
    constructor() { this.docs = []; }
    findSync(filter) { return this.docs.filter((doc) => matches(doc, filter)); }
    async updateOne(filter, update, options = {}) {
        const doc = this.docs.find((candidate) => matches(candidate, filter));
        if (!doc) {
            if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
            const inserted = {};
            for (const [key, expected] of Object.entries(filter)) {
                if (expected == null || typeof expected !== 'object' || expected instanceof Date) inserted[key] = expected;
            }
            this.docs.push(applyUpdate(inserted, update, true));
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        applyUpdate(doc, update, false);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }
    async findOne(filter) {
        const doc = this.docs.find((candidate) => matches(candidate, filter));
        return doc ? clone(doc) : null;
    }
    find(filter) { return new FakeCursor(this.findSync(filter)); }
    async countDocuments(filter) { return this.findSync(filter).length; }
    async deleteOne(filter) {
        const index = this.docs.findIndex((candidate) => matches(candidate, filter));
        if (index >= 0) this.docs.splice(index, 1);
        return { deletedCount: index >= 0 ? 1 : 0 };
    }
    async createIndex() { return 'ok'; }
}

module.exports = { FakeCollection };
