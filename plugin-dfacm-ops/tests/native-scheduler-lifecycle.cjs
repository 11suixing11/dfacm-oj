'use strict';

// Manual native acceptance: invoked separately from the ordinary *.test.cjs suite.
// Hydro/Cordis are real; only database, RP execution and RP-owned timers are isolated.
// Run with Node 22 >=22.13 and the existing pinned native installation:
// NODE_PATH=/abs/native/node_modules DFACM_NATIVE_OUTPUT=/abs/local-evidence \
//   /abs/node22/bin/node plugin-dfacm-ops/tests/native-scheduler-lifecycle.cjs
// Mongo must be the local isolated validation service at 127.0.0.1:27713.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async () => {
  const meta = JSON.parse(fs.readFileSync(process.env.D1_NATIVE_META));
  const phase = process.env.D1_NATIVE_PHASE;
  const native = require('hydrooj');
  const root = global.app;
  const service = root.get('db');
  assert.match(meta.database, /^dfacm_d1_native_[a-f0-9]{24}$/);
  assert.equal(service.db.databaseName, meta.database);
  const config = JSON.parse(fs.readFileSync(path.join(process.env.HYDRO_PROFILE,'config.json')));
  assert.equal(config.uri, `mongodb://127.0.0.1:27713/${meta.database}`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(process.env.HYDRO_PROFILE,'addon.json'))), []);
  assert.equal(require('hydrooj/package.json').version,'5.0.7');
  assert.equal(require('cordis/package.json').version,'4.0.0-rc.8');
  assert.equal(require('@hydrooj/ui-default/package.json').version,'4.58.5');
  assert.equal(Number(process.versions.node.split('.')[0]),22);
  assert.ok(Number(process.versions.node.split('.')[1]) >= 13);
  assert.equal(process.env.DFACM_CONTROLLED_HISTORY,'0');
  assert.equal(process.env.SWPU_AUTO_JOIN,'0');
  assert.equal(root instanceof native.Context,true);
  const timeline=[], instances=[], timers=new Map();
  const log = (stage, data={}) => {const row={n:timeline.length+1,stage,...data};timeline.push(row);console.log('D1 TRACE',JSON.stringify(row));};
  const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
  let release, purgeStarted, blockPurge=false, activeEntry=null, sharedLock, sweepCount=0;
  const gate=new Promise(resolve=>{release=resolve;});
  const originalTimeout=global.setTimeout, originalClear=global.clearTimeout;
  const originalCollection=service.collection;
  const rpPath=path.join(meta.project,'plugin-dfacm-ops/rp-sweep.cjs');
  const livePath=path.join(meta.project,'plugin-dfacm-ops/live-rp.cjs');
  const rpModule=require(rpPath), liveModule=require(livePath);
  const originals={createRpLock:rpModule.createRpLock,createRpSweep:rpModule.createRpSweep,createLiveRp:liveModule.createLiveRp};
  let integration;
  // Only production RP-owned timeout calls are captured. Native Cordis/Hydro timers stay native.
  global.setTimeout=(cb,ms,...args)=>{
    const stack=new Error().stack;
    if(stack.includes(rpPath)||stack.includes(livePath)) {
      const timer={D1Timer:true,id:timers.size+timeline.length+1};
      timers.set(timer,{cb:()=>cb(...args),ms}); log('timer.arm',{ms,id:timer.id}); return timer;
    }
    return originalTimeout(cb,ms,...args);
  };
  global.clearTimeout=timer=>{
    if(timer?.D1Timer){timers.delete(timer);log('timer.clear',{id:timer.id});return;}
    return originalClear(timer);
  };
  const fire=ms=>{
    const entry=[...timers].find(([,v])=>v.ms===ms);
    assert.ok(entry,`D1 timer ${ms} must be armed`);
    timers.delete(entry[0]);log('timer.fire',{ms});return entry[1].cb();
  };
  const users=[{_id:3,uname:'hydsvc-0074'},{_id:42,uname:'D1-member'}];
  const members=[{domainId:'system',uid:42,join:true,role:'default'},{domainId:'poj',uid:42,join:true,role:'default'}];
  const statusColl={deleteMany:async filter=>{
    assert.deepEqual(filter,{uid:{$in:[3]},docType:10});log('purge',{entry:activeEntry,filter});
    if(blockPurge){blockPurge=false;purgeStarted();await gate;log('purge.complete',{entry:activeEntry});}
    return {deletedCount:0};
  }};
  const userColl={find:filter=>({toArray:async()=>{
    if(filter._id.$in) return structuredClone(users.filter(u=>filter._id.$in.includes(u._id)));
    assert.deepEqual(filter,{_id:{$gt:1}});log('reconcile',{entry:activeEntry});return structuredClone(users);
  }})};
  const domainUserColl={find:filter=>({toArray:async()=>structuredClone(members.filter(u=>u.domainId===filter.domainId))}),
    updateOne:async()=>{throw Error('D1 unexpected domain insertion');},updateMany:async()=>({modifiedCount:0})};
  const boundary={'document.status':statusColl,'domain.user':domainUserColl,user:userColl};
  service.collection=function(name){assert.ok(boundary[name],`D1 unexpected production collection ${name}`);return boundary[name];};
  rpModule.createRpLock=()=>{
    const lock=originals.createRpLock();
    sharedLock=work=>lock(async()=>{log('lock.enter');return await work();});
    return sharedLock;
  };
  const decorate=(instance,label)=>{
    const original=instance.stop;
    const record={label,stopCalls:0,startCalls:0,instance,lock:sharedLock};
    instance.stop=()=>{record.stopCalls++;log('stop',{entry:label});return original();};
    if(instance.start){const start=instance.start;instance.start=()=>{record.startCalls++;return start();};}
    instances.push(record);return instance;
  };
  const isolatedScript={run:async args=>{log('rp',{entry:activeEntry,args});}};
  rpModule.createRpSweep=options=>{
    const label=sweepCount++===0?'manual':'scheduled';
    assert.equal(options.lock,sharedLock);
    const instance=originals.createRpSweep({...options,script:isolatedScript,
      lock:work=>options.lock(async()=>{activeEntry=label;try{return await work();}finally{activeEntry=null;}})});
    return decorate(instance,label);
  };
  liveModule.createLiveRp=options=>{
    assert.equal(options.lock,sharedLock);
    const instance=originals.createLiveRp({...options,script:isolatedScript,
      lock:work=>options.lock(async()=>{activeEntry='live';try{return await work();}finally{activeEntry=null;}})});
    return decorate(instance,'live');
  };
  try {
    let disposeEventCalls=0,effectCleanupCalls=0;
    const probe=await root.plugin({name:`D1-characterize-${meta.runId}`,apply(ctx){
      ctx.on('dispose',()=>{disposeEventCalls++;});
      ctx.effect(()=>()=>{effectCleanupCalls++;});
    }});
    await probe.dispose();await probe.dispose();
    assert.equal(effectCleanupCalls,1);
    assert.equal(disposeEventCalls,0);
    log('native.characterization',{disposeEventCalls,effectCleanupCalls});

    // Actual production entry, loaded by native Hydro register and native app.plugin.
    integration=await root.plugin(require(path.join(meta.project,'plugin-dfacm-ops/index.ts')));
    const manual=global.Hydro.script.swpuRpSweep.run;
    assert.equal(typeof manual,'function');
    assert.deepEqual(instances.map(i=>i.label),['manual','live','scheduled']);
    assert.deepEqual(instances.map(i=>i.startCalls),[0,0,1]);
    const stopCounts=()=>Object.fromEntries(instances.map(i=>[i.label,i.stopCalls]));
    const stagesAfter=n=>{
      const stages=timeline.filter(x=>x.n>n);
      return {purge:stages.filter(x=>x.stage==='purge').length,reconcile:stages.filter(x=>x.stage==='reconcile').length,rp:stages.filter(x=>x.stage==='rp').length};
    };
    const event=()=>root.parallel('record/change',{domainId:`D1-${meta.runId}`,uid:42,pid:1,status:1},{},{},{key:'end'});
    const unload=async()=>{
      log('unload.start');await integration.dispose();await integration.dispose();log('unload.complete');
      assert.equal(global.Hydro.script.swpuRpSweep,undefined,'native ApiMixin removed script on actual unload');
      assert.deepEqual(stopCounts(),{manual:1,live:1,scheduled:1},'native unload must call every scheduler stop exactly once');
      return timeline.length;
    };
    if(phase==='queued'){
      const blocker=sharedLock(async()=>{log('blocker.start');await gate;log('blocker.complete');});
      await flush();
      const manualPending=manual({});await event();
      const livePending=fire(30000),scheduledPending=fire(180000);await flush();
      assert.deepEqual(stagesAfter(0),{purge:0,reconcile:0,rp:0});
      const unloaded=await unload();release();
      await Promise.all([blocker,manualPending,livePending,scheduledPending]);await flush();
      const stages=stagesAfter(unloaded);
      assert.deepEqual(stages,{purge:0,reconcile:0,rp:0},'queued work must stop before purge/reconcile/RP');
      assert.equal(timers.size,0,'scheduled timer must not rearm');
      assert.equal((await manualPending).recalculated,false);
      log('queued.observed',{stages,remainingTimers:timers.size});
    }else if(phase==='armed'){
      await event();assert.equal(timers.size,2);
      const retainedTimers=[...timers.values()];
      const retainedHook=instances.find(i=>i.label==='live').instance.hook;
      const unloaded=await unload();
      assert.equal(timers.size,0,'unload must cancel armed live and scheduled timers');
      await Promise.all(retainedTimers.map(timer=>timer.cb()));await flush();
      retainedHook({domainId:'system',uid:42,pid:1,status:1},{},{},{key:'end'});
      const staleManual=await manual({});await flush();
      assert.equal(staleManual.recalculated,false,'retained manual callback must be stopped after unload');
      const stages=stagesAfter(unloaded);
      assert.deepEqual(stages,{purge:0,reconcile:0,rp:0},'retained callbacks must start no purge/reconcile/RP');
      assert.equal(timers.size,0,'retained callbacks must not rearm timers');
      const beforeEvent=timers.size;await event();assert.equal(timers.size,beforeEvent,'native record/change must start no new timer work after unload');
      log('armed.observed',{stages,remainingTimers:timers.size});
    }else if(phase==='inflight'){
      blockPurge=true;
      const began=new Promise(resolve=>{purgeStarted=resolve;});
      const pending=manual({});await began;
      const unloaded=await unload();release();assert.equal((await pending).recalculated,false);await flush();
      const stages=stagesAfter(unloaded);
      assert.deepEqual(stages,{purge:0,reconcile:0,rp:0},'in-progress purge may finish but no next stage starts');
      assert.equal(timeline.filter(x=>x.stage==='purge.complete').length,1,'the active database call finishes normally');
      assert.equal(timers.size,0);
      log('inflight.observed',{stages});
    }else throw Error(`D1 unknown phase ${phase}`);

    assert.deepEqual(stopCounts(),{manual:1,live:1,scheduled:1});
    const receipt={runId:meta.runId,database:meta.database,phase,pid:process.pid,
      framework:{hydro:'5.0.7',cordis:'4.0.0-rc.8',node:process.versions.node},
      actualNativePluginUnload:true,disposeEventCalls,effectCleanupCalls,stopCounts:stopCounts(),timeline,passed:true};
    fs.writeFileSync(path.join(meta.scratch,`D1-${phase}-receipt.json`),JSON.stringify(receipt,null,2));
    console.log(`D1_NATIVE_OK ${meta.runId} ${phase}`);
    return {phase,passed:true};
  }finally{
    release();if(integration)await integration.dispose();
    for(const item of instances)if(item.stopCalls===0)item.instance.stop();
    timers.clear();global.setTimeout=originalTimeout;global.clearTimeout=originalClear;
    service.collection=originalCollection;Object.assign(rpModule,{createRpLock:originals.createRpLock,createRpSweep:originals.createRpSweep});
    liveModule.createLiveRp=originals.createLiveRp;
  }
};

if (require.main === module) {
  const crypto = require('node:crypto');
  const { spawnSync } = require('node:child_process');
  const project = path.resolve(__dirname, '../..');
  const output = process.env.DFACM_NATIVE_OUTPUT;
  assert.ok(output && path.isAbsolute(output), 'set DFACM_NATIVE_OUTPUT to an absolute local evidence directory');
  assert.equal(Number(process.versions.node.split('.')[0]), 22, 'run this manual fixture with Node 22 >=22.13');
  assert.ok(Number(process.versions.node.split('.')[1]) >= 13, 'Node 22 >=22.13 is required');
  const nativeRoot = path.dirname(require.resolve('hydrooj/package.json'));
  const port = process.env.DFACM_NATIVE_MONGO_PORT || '27713';
  assert.equal(port, '27713', 'the fixture only accepts the established isolated localhost Mongo port');
  const runId = crypto.randomBytes(12).toString('hex');
  const database = `dfacm_d1_native_${runId}`;
  const scratch = path.join(output, runId), profile = path.join(scratch, 'profile');
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(path.join(scratch, 'storage'));
  const meta = { runId, database, project, scratch };
  const metaPath = path.join(scratch, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({
    uri: `mongodb://127.0.0.1:${port}/${database}`, host: '127.0.0.1', port, name: database,
  }));
  fs.writeFileSync(path.join(profile, 'addon.json'), '[]');
  const sourceFiles = ['index.ts', 'rp-sweep.cjs', 'live-rp.cjs'].map(name => path.join(project, 'plugin-dfacm-ops', name));
  const hashes = () => Object.fromEntries(sourceFiles.map(file => [path.relative(project, file),
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const before = hashes();
  const args = [path.join(nativeRoot, 'bin/hydrooj.js'), 'cli', 'execute',
    `return await require(${JSON.stringify(__filename)})();`];
  const env = { ...process.env, HYDRO_PROFILE: profile, DEFAULT_STORE_PATH: path.join(scratch, 'storage'),
    SWPU_LIVE_RP: '1', SWPU_RP_SWEEP: '1', SWPU_AUTO_JOIN: '0', SWPU_SERVICE_UIDS: '3',
    SWPU_SERVICE_UIDS_DRYRUN: '0', NODE_APP_INSTANCE: '0', DFACM_CONTROLLED_HISTORY: '0', D1_NATIVE_META: metaPath };
  delete env.CI;
  const results = [];
  for (const phase of ['queued', 'armed', 'inflight']) {
    const phaseEnv = { ...env, D1_NATIVE_PHASE: phase };
    fs.writeFileSync(path.join(scratch, `${phase}-command.json`), JSON.stringify({
      executable: process.execPath, args, cwd: project, phase, profile, database, timeoutMs: 30000,
    }, null, 2));
    const r = spawnSync(process.execPath, args, { cwd: project, env: phaseEnv, encoding: 'utf8',
      timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    fs.writeFileSync(path.join(scratch, `${phase}.log`), `${r.stdout || ''}\nSTDERR:\n${r.stderr || ''}\nSTATUS:${r.status}\nERROR:${r.error || ''}\n`);
    assert.equal(r.status, 0, `${phase} native process failed; inspect ${scratch}`);
    assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /Execution fail/, 'Hydro can swallow eval failures with exit zero');
    const receiptPath = path.join(scratch, `D1-${phase}-receipt.json`);
    assert.ok(fs.existsSync(receiptPath), `${phase} native success receipt is mandatory`);
    const receipt = JSON.parse(fs.readFileSync(receiptPath));
    assert.equal(receipt.runId, runId); assert.equal(receipt.phase, phase);
    assert.equal(receipt.database, database); assert.equal(receipt.passed, true);
    assert.ok(r.stdout.includes(`D1_NATIVE_OK ${runId} ${phase}`), 'unique success marker is mandatory');
    assert.deepEqual(receipt.stopCounts, { manual: 1, live: 1, scheduled: 1 });
    results.push({ phase, pid: receipt.pid, status: r.status, stopCounts: receipt.stopCounts, passed: true });
  }
  const after = hashes();
  assert.deepEqual(after, before, 'native acceptance must leave production source unchanged');
  assert.equal(new Set(results.map(result => result.pid)).size, 3, 'each native case needs its own process');
  const summary = { ...meta, results, sourceHashes: after, sourceUnchanged: true, passed: true };
  fs.writeFileSync(path.join(scratch, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('D1_NATIVE_LIFECYCLE_ACCEPTED', JSON.stringify(summary));
}
