// Hydro 5.0.7 CLI loader method bodies; only external model/framework boundaries are replaced.
const methods = {
    "_next": "async _next(body) {\n    const {\n      $set,\n      $push,\n      $unset,\n      $inc\n    } = processPayload(body);\n    if (this.meta?.rejudge === \"controlled\") {\n      await import_record.default.collHistory.updateOne({\n        _id: this.relatedId\n      }, {\n        $set,\n        $push,\n        $unset,\n        $inc\n      }, { upsert: true });\n    } else {\n      const rdoc = await import_record.default.update(this.task.domainId, new import_mongodb.ObjectId(this.task.rid), $set, $push, $unset, $inc);\n      body.key = \"next\";\n      if (rdoc) this.ctx.broadcast(\"record/change\", rdoc, $set, $push, body);\n    }\n  }",
    "_end": "async _end(body) {\n    const { $set, $push } = processPayload(body);\n    const $unset = { progress: \"\" };\n    $set.judgeAt = /* @__PURE__ */ new Date();\n    $set.judger = body.judger ?? 1;\n    if (this.meta?.rejudge === \"controlled\") {\n      await import_record.default.collHistory.updateOne({\n        _id: this.relatedId\n      }, {\n        $set,\n        $push,\n        $unset\n      }, { upsert: true });\n      this.resolve(null);\n      return;\n    }\n    const rdoc = await import_record.default.update(this.task.domainId, new import_mongodb.ObjectId(this.task.rid), $set, $push, $unset);\n    if (rdoc) {\n      body.key = \"end\";\n      import_bus.default.broadcast(\"record/change\", rdoc, null, null, body);\n      await JudgeResultCallbackContext.postJudge(rdoc, this);\n    }\n    this.resolve(rdoc);\n  }",
    "next": "next(body) {\n    this.operationPromise = this.operationPromise.then(() => this._next(body));\n    return this.operationPromise;\n  }",
    "end": "end(body) {\n    if (!body) this.resolve(null);\n    else this.operationPromise = this.operationPromise.then(() => this._end(body));\n    return this.operationPromise;\n  }"
};
const { randomBytes } = require('node:crypto');
const clone = x => structuredClone(x);
const get = (o, k) => k.split('.').reduce((v, p) => v?.[p], o);
function matches(row, query) {
    return Object.entries(query).every(([key, value]) => {
        if (key === '$or') return value.some(q => matches(row, q));
        const actual = get(row, key);
        if (value && typeof value === 'object' && '$exists' in value) return (actual !== undefined) === value.$exists;
        if (value && typeof value === 'object' && '$ne' in value) return String(actual) !== String(value.$ne);
        return String(actual) === String(value);
    });
}
function set(o, k, v) { const parts = k.split('.'); const last = parts.pop(); for (const p of parts) o = o[p] ||= {}; o[last] = v; }
function collection(rows = []) {
    return { rows, find: q => ({ toArray: async () => rows.filter(r => matches(r, q)).map(r => ({ ...r })) }),
        findOne: async q => rows.find(r => matches(r, q)) || null,
        insertOne: async row => { if (rows.some(r => String(r._id) === String(row._id))) { const e = new Error('duplicate'); e.code = 11000; throw e; } rows.push(row); },
        updateOne: async (q, update, options = {}) => {
            let row = rows.find(r => matches(r, q));
            if (!row && options.upsert) { row = { ...q }; rows.push(row); }
            if (!row) return { matchedCount: 0 };
            for (const [k,v] of Object.entries(update.$set || {})) set(row, k, v);
            for (const [k,v] of Object.entries(update.$push || {})) { row[k] ||= []; row[k].push(...(v.$each || [v])); }
            for (const [k,v] of Object.entries(update.$inc || {})) row[k] = (row[k] || 0) + v;
            for (const k of Object.keys(update.$unset || {})) delete row[k];
            return { matchedCount: 1 };
        },
        deleteOne: async q => { const i = rows.findIndex(r => matches(r, q)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
    };
}
function nativeFixture() {
    class ObjectId {
        constructor(value = randomBytes(12).toString('hex')) { this.value = String(value); }
        toString() { return this.value; } toHexString() { return this.value; }
    }
    const coll = collection(), collHistory = collection();
    let ordinary = 0;
    const RecordModel = { coll, collHistory, update: async () => { ordinary++; return { status: 1 }; } };
    const processPayload = body => ({ $set: Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'cases')), $push: body.cases ? { testCases: { $each: body.cases } } : {}, $unset: {}, $inc: {} });
    class JudgeResultCallbackContext {
        constructor(ctx, task) {
            this.ctx = ctx; this.task = task; this.meta = task.meta || {}; this.relatedId = new ObjectId();
            this.operationPromise = Promise.resolve(null); this.finishPromise = new Promise(resolve => { this.resolve = resolve; });
        }
        then(...args) { return this.finishPromise.then(...args); }
        static async postJudge() {}
    }
    for (const [name, source] of Object.entries(methods)) JudgeResultCallbackContext.prototype[name] = new Function('processPayload', 'import_record', 'import_mongodb', 'import_bus', 'JudgeResultCallbackContext', `return ({${source}})[${JSON.stringify(name)}]`)(processPayload, { default: RecordModel }, { ObjectId }, { default: { broadcast() {} } }, JudgeResultCallbackContext);
    const api = { ObjectId, RecordModel, JudgeResultCallbackContext, version: '5.0.7', UserModel: { getById: async () => ({ _id: 3, uname: 'hydsvc-0074' }) } };
    const task = { rid: new ObjectId(), domainId: 'system', uid: 3, pid: 1, lang: 'cc.cc17o2', code: '// dfacm-verification:batch-one:entry-one\nint main() {}', type: 'judge', meta: { rejudge: 'controlled', verificationBatch: 'batch-one', verificationEntry: 'entry-one' } };
    coll.rows.push({ _id: task.rid, domainId: task.domainId, uid: task.uid, pid: task.pid, lang: task.lang, code: task.code, status: 0 });
    return { api, task, coll, collHistory, callback: t => new JudgeResultCallbackContext({ broadcast() {} }, t || task), get ordinary() { return ordinary; } };
}
module.exports = { nativeFixture, collection, matches };
