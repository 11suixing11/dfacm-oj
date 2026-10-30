/* Read-only HTTP verification of every repaired statement, sequentially throttled. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {MongoClient}=require('mongodb');
const root=process.env.PROBLEM_REPAIR_ROOT||'/root/backups/problem-repair-20261022';
const batches=(process.env.PROBLEM_REPAIR_HTTP_BATCHES||'ordered-statements.json.gz').split(',');
const label=process.env.PROBLEM_REPAIR_HTTP_LABEL||'ordered';
const stateFile=path.join(root,`${label}-served-pages.json.gz`);
const pickBatch=name=>{
    const b=fs.readFileSync(path.join(root,name));
    return JSON.parse((name.endsWith('.gz')?zlib.gunzipSync(b):b).toString('utf8')).problems;
};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function descriptionOf(page) {
    const start=/<div\b[^>]*data-fragment-id="problem-description"[^>]*>/.exec(page);
    if(!start)throw new Error('Missing problem description fragment');
    let depth=1;
    const tags=/<\/?div\b[^>]*>/g;
    tags.lastIndex=start.index+start[0].length;
    for(let tag; (tag=tags.exec(page));) {
        depth+=tag[0].startsWith('</')?-1:1;
        if(depth===0)return page.slice(start.index,tags.lastIndex);
    }
    throw new Error('Unclosed description fragment');
}
(async()=>{
    const all=batches.flatMap(pickBatch).sort((a,b)=>a.domainId===b.domainId?a.docId-b.docId:a.domainId==='system'?-1:1);
    const pages=fs.existsSync(stateFile)?JSON.parse(zlib.gunzipSync(fs.readFileSync(stateFile))):[];
    const done=new Set(pages.map(row=>row.domainId+'/'+row.docId));
    for(const patch of all) {
        const key=patch.domainId+'/'+patch.docId;
        if(done.has(key))continue;
        const urlPath=patch.domainId==='system'?`/p/${patch.docId}`:`/d/${patch.domainId}/p/${patch.docId}`;
        let response,body;
        for(let attempt=0;attempt<4;attempt++) {
            response=await fetch('http://127.0.0.1:8888'+urlPath,{headers:{host:'dfacm.website','user-agent':'Mozilla/5.0 dfacm-problem-repair'},signal:AbortSignal.timeout(20000)});
            body=await response.text();
            if(response.ok)break;
            if(![403,429,502,503,504].includes(response.status))break;
            await sleep(3000*(attempt+1));
        }
        if(!response.ok)throw new Error(`${key}: HTTP ${response.status}`);
        const fragment=descriptionOf(body);
        pages.push({domainId:patch.domainId,docId:patch.docId,category:patch.category,content:patch.content,html:fragment,path:urlPath,status:response.status});
        if(pages.length%50===0) {
            fs.writeFileSync(stateFile,zlib.gzipSync(JSON.stringify(pages),{level:9}),{mode:0o600});
            console.log('HTTP_VERIFIED',pages.length,key);
        }
        await sleep(80);
    }
    fs.writeFileSync(stateFile,zlib.gzipSync(JSON.stringify(pages),{level:9}),{mode:0o600});
    console.log('HTTP_BATCH_COMPLETE',pages.length,fs.statSync(stateFile).size);
    const client=new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json','utf8')).uri);
    await client.connect();
    try {
        const docs=await client.db('hydro').collection('document').find({docType:10,domainId:'system'}).project({docId:1,content:1,title:1}).sort({docId:1}).toArray();
        const dangling=docs.filter(r=>/file:\/\//.test(r.content));
        const duplicates=docs.filter(r=>/<code class="language-(input|output)\d+">\s*<\/code>/.test(r.content)&&r.docId>=843&&r.docId<=3675);
        console.log('SYSTEM_REMAINING_FILE_URLS',dangling.map(r=>r.docId));
        console.log('SYSTEM_REMAINING_CF_EMPTY_SAMPLES',duplicates.map(r=>r.docId));
    }finally{await client.close();}
})().catch(e=>{console.error('HTTP_VERIFY_FAILED',e.message);process.exitCode=1;});
