'use strict';

// Small Mongo-compatible in-memory adapter for the standalone demo and tests.
// Production uses Hydro's Mongo collections, not this adapter.
function scalar(value) {
    if (value instanceof Date) return value.getTime();
    if (value?.toHexString) return value.toHexString();
    return value;
}
function clone(value) {
    if (value instanceof Date) return new Date(value);
    if (value instanceof RegExp) return new RegExp(value);
    if (value?.toHexString) return value;
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
}
function field(doc, key) { return key.split('.').reduce((value, part) => value?.[part], doc); }
function setField(doc, key, value) {
    const parts = key.split('.'); const last = parts.pop();
    const parent = parts.reduce((value, part) => { value[part] ??= {}; return value[part]; }, doc);
    parent[last] = clone(value);
}
function deleteField(doc, key) { const parts = key.split('.'); const last = parts.pop(); const parent = parts.reduce((v, p) => v?.[p], doc); if (parent) delete parent[last]; }
function equal(left, right) { return right === null ? left === null || left === undefined : scalar(left) === scalar(right); }
function matches(doc, query) {
    return Object.entries(query).every(([key, expected]) => {
        if (key === '$or') return expected.some(branch => matches(doc, branch));
        if (key === '$and') return expected.every(branch => matches(doc, branch));
        const actual = field(doc, key);
        if (expected instanceof RegExp) return typeof actual === 'string' && expected.test(actual);
        if (expected && typeof expected === 'object' && !(expected instanceof Date) && !expected.toHexString && !Array.isArray(expected)) {
            return Object.entries(expected).every(([operator, value]) => {
                if (operator === '$exists') return (actual !== undefined) === value;
                if (operator === '$in') return value.some(v => equal(actual, v));
                if (operator === '$nin') return !value.some(v => equal(actual, v));
                if (operator === '$ne') return !equal(actual, value);
                if (operator === '$gt') return scalar(actual) > scalar(value);
                if (operator === '$gte') return scalar(actual) >= scalar(value);
                if (operator === '$lt') return scalar(actual) < scalar(value);
                if (operator === '$lte') return scalar(actual) <= scalar(value);
                throw new Error(`Unsupported demo query operator: ${operator}`);
            });
        }
        return equal(actual, expected);
    });
}
function project(doc, projection) {
    if (!projection) return clone(doc);
    if (Object.values(projection).some(v => v === 1)) {
        const result = projection._id === 0 ? {} : { _id: clone(doc._id) };
        for (const [key, included] of Object.entries(projection)) if (included && field(doc, key) !== undefined) setField(result, key, field(doc, key));
        return result;
    }
    const result = clone(doc); for (const [key, included] of Object.entries(projection)) if (!included) deleteField(result, key); return result;
}
function expression(doc, value) {
    if (typeof value === 'string' && value.startsWith('$')) return field(doc, value.slice(1)) ?? null;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expression(doc, item)]));
    return value;
}

function memoryCollection(initial = []) {
    const docs = new Map(initial.map(doc => [scalar(doc._id), clone(doc)]));
    function update(doc, change, inserted = false) {
        if (inserted) for (const [key, value] of Object.entries(change.$setOnInsert || {})) setField(doc, key, value);
        for (const [key, value] of Object.entries(change.$set || {})) setField(doc, key, value);
        for (const [key, value] of Object.entries(change.$inc || {})) setField(doc, key, (field(doc, key) || 0) + value);
        for (const key of Object.keys(change.$unset || {})) deleteField(doc, key);
        for (const [key, value] of Object.entries(change.$push || {})) {
            let items = [...(field(doc, key) || [])]; items.push(...clone(value.$each || [value]));
            if (value.$slice !== undefined) items = value.$slice < 0 ? items.slice(value.$slice) : items.slice(0, value.$slice);
            setField(doc, key, items);
        }
    }
    function select(query) { return [...docs.values()].filter(doc => matches(doc, query)); }
    return {
        docs,
        async insertOne(doc) {
            const id = scalar(doc._id);
            if (docs.has(id)) throw Object.assign(new Error('Duplicate ID'), { code: 11000 });
            docs.set(id, clone(doc)); return { insertedId: doc._id };
        },
        async findOne(query, options = {}) { const found = select(query)[0]; return found ? project(found, options.projection) : null; },
        find(query, options = {}) {
            let rows = select(query); let maximum = Infinity;
            const cursor = {
                sort(sort) { rows.sort((a, b) => { for (const [key, dir] of Object.entries(sort)) { const left = scalar(field(a, key)); const right = scalar(field(b, key)); if (left < right) return -dir; if (left > right) return dir; } return 0; }); return cursor; },
                limit(value) { maximum = value; return cursor; }, maxTimeMS() { return cursor; },
                async toArray() { return rows.slice(0, maximum).map(doc => project(doc, options.projection)); },
            }; return cursor;
        },
        async updateOne(query, change, options = {}) {
            const found = select(query)[0];
            if (found) { update(found, change); return { modifiedCount: 1, matchedCount: 1, upsertedCount: 0 }; }
            if (!options.upsert) return { modifiedCount: 0, matchedCount: 0, upsertedCount: 0 };
            const inserted = {};
            for (const [key, value] of Object.entries(query)) if (!key.startsWith('$') && (value === null || typeof value !== 'object' || value instanceof Date || value?.toHexString)) setField(inserted, key, value);
            if (docs.has(scalar(inserted._id))) throw Object.assign(new Error('Duplicate ID'), { code: 11000 });
            update(inserted, change, true); docs.set(scalar(inserted._id), inserted);
            return { modifiedCount: 0, matchedCount: 0, upsertedCount: 1 };
        },
        async findOneAndUpdate(query, change, options = {}) {
            const found = select(query)[0]; if (!found) return null;
            const before = clone(found); update(found, change);
            return options.returnDocument === 'after' ? clone(found) : before;
        },
        aggregate(pipeline) {
            let rows = [...docs.values()];
            for (const stage of pipeline) {
                if (stage.$match) rows = rows.filter(doc => matches(doc, stage.$match));
                else if (stage.$group) {
                    const groups = new Map();
                    for (const doc of rows) {
                        const id = expression(doc, stage.$group._id); const key = JSON.stringify(id);
                        const value = groups.get(key) || { _id: id, count: 0 }; value.count++; groups.set(key, value);
                    } rows = [...groups.values()];
                } else throw new Error('Unsupported demo aggregate stage');
            } return { async toArray() { return clone(rows); } };
        },
    };
}

module.exports = { memoryCollection, matches };
