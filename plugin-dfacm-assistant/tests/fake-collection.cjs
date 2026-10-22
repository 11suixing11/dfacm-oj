'use strict';

function memoryCollection() {
    const docs = new Map();
    function matches(doc, query) {
        return Object.entries(query).every(([key, value]) => {
            const actual = doc[key];
            if (value && typeof value === 'object' && !(value instanceof Date)) {
                if ('$exists' in value) return (actual !== undefined) === value.$exists;
                if ('$in' in value) return value.$in.includes(actual);
                if ('$lte' in value) return actual <= value.$lte;
                if ('$gt' in value) return actual > value.$gt;
            }
            return actual === value;
        });
    }
    return {
        docs,
        async findOne(query) { return structuredClone([...docs.values()].find((doc) => matches(doc, query)) || null); },
        async updateOne(query, update, options = {}) {
            const found = [...docs.values()].find((doc) => matches(doc, query));
            if (found) { Object.assign(found, structuredClone(update.$set)); return { modifiedCount: 1 }; }
            if (!options.upsert) return { modifiedCount: 0 };
            if (docs.has(query._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
            const created = { _id: query._id, ...structuredClone(update.$set) };
            docs.set(created._id, created); return { upsertedCount: 1 };
        },
        async insertOne(doc) { if (docs.has(doc._id)) throw Object.assign(new Error('duplicate'), { code: 11000 }); docs.set(doc._id, structuredClone(doc)); },
        async deleteOne(query) { const doc = [...docs.values()].find((doc) => matches(doc, query)); if (doc) docs.delete(doc._id); return { deletedCount: doc ? 1 : 0 }; },
    };
}

module.exports = { memoryCollection };
