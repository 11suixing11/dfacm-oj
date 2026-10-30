'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { MongoClient } = require('mongodb');
const judgeCfg = require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/hydrojudge/src/config');
const yaml = require('js-yaml');
const system = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/system').default;
module.exports = (async () => {
    console.log('XCPC_BUILTIN_LIMITS', JSON.stringify({ testcasesMax: judgeCfg.getConfig('testcases_max'), totalTimeLimit: judgeCfg.getConfig('total_time_limit'), disabled: judgeCfg.getConfig('disable') }));
    console.log('XCPC_HYDRO_FILES', fs.readdirSync('/root/.hydro').filter(n => /yaml|json/.test(n)));
    const ps = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
    console.log('XCPC_PROCESSES', JSON.stringify(ps.map(p => ({ name: p.name, pid: p.pid, instance: p.pm2_env.NODE_APP_INSTANCE, status: p.pm2_env.status }))));
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json', 'utf8')).uri);
    await client.connect();
    try {
        const coll = client.db('hydro').collection('system');
        const doc = await coll.findOne({ _id: 'config' });
        const v = typeof doc.value === 'string' ? yaml.load(doc.value) : doc.value;
        console.log('XCPC_CONFIG_KEYS', JSON.stringify({ valueType: typeof doc.value, keys: Object.keys(v) }));
        for (const [key, val] of Object.entries(v)) if (/judge/.test(key)) console.log('XCPC_JUDGE_ADDON', JSON.stringify({ key, keys: Object.keys(val || {}), testcasesMax: val?.testcases_max, totalTimeLimit: val?.total_time_limit, disabled: val?.disable }));
        console.log('XCPC_BUILTIN_SYSTEM_SETTINGS', JSON.stringify({ testcasesMax: system.get('hydrojudge.testcases_max'), totalTimeLimit: system.get('hydrojudge.total_time_limit') }));
        if (process.env.XCPC_REPAIR_ACTION === 'apply') throw new Error('Read-only diagnostic. Use judge-builtin-settings.cjs for guarded YAML changes.');
    } finally { await client.close(); }
})();
