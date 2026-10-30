/* Keep the generation and judge identity in Mongo so a final callback can
 * finish after a frontend restart. All writes still use Hydro's callbacks. */
'use strict';
const inflight=new Map();
const waiting=[0,20,21,22,23,24,25];
async function beginDelivery(record,task,judger,id) {
    // Controlled rejudges write to history while preserving the current record;
    // retain Hydro's existing callback path for that separate workflow.
    if(task.meta?.rejudge==='controlled')return;
    task.dfacmDeliveryId ||= id;
    await record.update(task.domainId,task.rid,{dfacmDelivery:{id:task.dfacmDeliveryId,judger,meta:task.meta||{},type:task.type}});
}
async function completeDelivery({record,task,callbacks,ObjectId,domainId,judger,message,context}) {
    if(!/^[a-f0-9]{24}$/.test(message.rid)||!/^[a-f0-9]{24}$/.test(message.dfacmDeliveryId))throw new Error('Invalid judge delivery identity');
    const rid=new ObjectId(message.rid),key=domainId+'/'+message.rid;
    const previous=inflight.get(key)||Promise.resolve();
    const operation=previous.catch(()=>null).then(async()=>{
        const current=await record.get(domainId,rid);
        if(!current||current.dfacmDelivery?.id!==message.dfacmDeliveryId||current.dfacmDelivery?.judger!==judger)return 'stale';
        if(!waiting.includes(current.status)&&current.judgeAt)return 'accepted';
        const body={};
        for(const field of ['status','score','time','memory','subtasks','message','compilerText'])if(message[field]!==undefined)body[field]=message[field];
        if(!Number.isInteger(body.status)||waiting.includes(body.status)||!Array.isArray(message.dfacmCases))throw new Error('Incomplete final judge result');
        const delivery=current.dfacmDelivery;
        const reporter=context||new callbacks(global.app,{domainId,rid,meta:delivery.meta,type:delivery.type});
        if(context)await reporter.next({});
        // Replace intermediate case updates with the complete final case list.
        // Removing queued copies also avoids retrying a completed generation.
        await task.deleteMany({domainId,rid});
        const snapshot={testCases:[]};
        if(Array.isArray(message.dfacmJudgeTexts))snapshot.judgeTexts=message.dfacmJudgeTexts;
        if(Array.isArray(message.dfacmCompilerTexts))snapshot.compilerTexts=message.dfacmCompilerTexts;
        await record.update(domainId,rid,snapshot);
        await reporter.end({...body,judger,cases:message.dfacmCases});
        return 'accepted';
    });
    inflight.set(key,operation);
    try{return await operation;}finally{if(inflight.get(key)===operation)inflight.delete(key);}
}
async function reconcileDeliveries({record,task,domainId,judger,available}) {
    if(!Array.isArray(available)||available.some(id=>!/^[a-f0-9]{24}$/.test(id)))throw new Error('Invalid available judge deliveries');
    const held=new Set(available);let recovered=0;
    const rows=await record.coll.find({domainId,status:{$in:waiting},'dfacmDelivery.judger':judger}).toArray();
    for(const row of rows) {
        if(held.has(row.dfacmDelivery.id)||await task.count({domainId,rid:row._id}))continue;
        // This judge has neither a running task nor a durable result for the
        // current generation. Requeue that exact record after a daemon crash.
        const meta=row.dfacmDelivery.meta;
        await record.reset(domainId,row._id,false);
        await record.judge(domainId,row._id,0,{detail:true},meta);
        recovered++;
    }
    return recovered;
}
module.exports={beginDelivery,completeDelivery,reconcileDeliveries};
