/* Reload the builtin judge's output limit after all active submissions drain. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {MongoClient,BSON}=require('mongodb');
const yaml=require('js-yaml');
const judgeCfg=require('/usr/local/share/.config/yarn/global/node_modules/@hydrooj/hydrojudge/src/config');
const root=process.env.TRAINING_REPAIR_ROOT;
const action=process.env.TRAINING_REPAIR_ACTION||'audit';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=(async()=>{
    const client=new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json','utf8')).uri);await client.connect();
    try{
        const db=client.db('hydro'),coll=db.collection('system');
        const doc=await coll.findOne({_id:'config'}),cfg=yaml.load(doc.value);
        const processes=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:4<<20}));
        const worker=processes.find(p=>p.name==='hydrooj');
        const standalone=yaml.load(fs.readFileSync('/root/.hydro/judge.yaml','utf8'));
        const summary={builtinConfigured:cfg.hydrojudge?.stdio_size??'32m',builtinLoaded:judgeCfg.getConfig('stdio_size'),standalone:standalone.stdio_size,processes:processes.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,instance:p.pm2_env.NODE_APP_INSTANCE}))};
        console.log('TRAINING_OUTPUT_SETTINGS',JSON.stringify(summary));
        if(action==='verify'){
            if(cfg.hydrojudge?.stdio_size!=='128m'||judgeCfg.getConfig('stdio_size')!=='128m')throw new Error('Builtin output limit not reloaded');
            if(!worker||worker.pm2_env.status!=='online')throw new Error('Hydro service missing');
            console.log('TRAINING_OUTPUT_SETTINGS_VERIFIED');return;
        }
        if(action!=='apply')return;
        if(cfg.hydrojudge?.stdio_size==='128m'){console.log('TRAINING_OUTPUT_SETTINGS_ALREADY_APPLIED');return;}
        if(cfg.hydrojudge?.stdio_size!==undefined&&cfg.hydrojudge.stdio_size!=='32m')throw new Error('Unexpected existing output cap');
        if(!worker||worker.pm2_env.status!=='online')throw new Error('Hydro service missing');
        const queue=await db.collection('task').countDocuments({type:'judge'});
        const pending=await db.collection('record').countDocuments({status:{$in:[0,20,21,22,23,24,25]}});
        if(queue||pending)throw new Error('Active submissions must drain before reload');
        const backup=path.join(root,'output-config-before-'+Date.now()+'.json'),fd=fs.openSync(backup,'wx',0o600);
        try{fs.writeFileSync(fd,BSON.EJSON.stringify(doc));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
        cfg.hydrojudge={...(cfg.hydrojudge||{}),stdio_size:'128m'};
        const next=yaml.dump(cfg),result=await coll.updateOne({_id:'config',value:doc.value},{$set:{value:next}});
        if(result.matchedCount!==1)throw new Error('Concurrent configuration edit');
        execFileSync('pm2',['restart','hydrooj'],{stdio:'pipe'});
        const report={at:new Date().toISOString(),backup,beforeSha256:sha(doc.value),afterSha256:sha(next),before:'32m',after:'128m',queueBefore:queue,pendingBefore:pending};
        fs.writeFileSync(path.join(root,'output-settings-apply-result.json'),JSON.stringify(report,null,2),{mode:0o600});
        console.log('TRAINING_OUTPUT_SETTINGS_APPLIED',JSON.stringify(report));
    }finally{await client.close();}
})();
