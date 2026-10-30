'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { MongoClient, BSON } = require('mongodb');
const storage = require('/usr/local/share/.config/yarn/global/node_modules/hydrooj/src/model/storage').default;
const root = '/root/backups/xcpc-repair-20261022';
module.exports = (async () => {
    const client = new MongoClient(JSON.parse(fs.readFileSync('/root/.hydro/config.json','utf8')).uri);await client.connect();
    try {
        const db=client.db('hydro'), inv=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'inventory.json.gz'))));
        const patches=JSON.parse(fs.readFileSync(process.env.XCPC_PATCH_BATCH,'utf8'));
        const missing=[];
        for (const patch of patches) {
            const doc=await db.collection('document').findOne({domainId:'system',docType:10,docId:patch.pid});
            const baseline=inv.problems.find(p=>p.docId===patch.pid);
            for (const file of patch.files) {
                const key=`problem/system/${patch.pid}/testdata/${file.name}`, meta=await storage.getMeta(key);
                if (!meta) continue;
                try { const parts=[];for await(const part of await storage.get(key))parts.push(Buffer.from(part));
                    const bytes=Buffer.concat(parts),sha=crypto.createHash('sha256').update(bytes).digest('hex');
                    if (sha!==file.sha256&&sha!==file.expectedSha256) console.log('XCPC_STORAGE_CONCURRENT',patch.pid,file.name,sha);
                } catch(error) {
                    const original=baseline.fileAudit.find(f=>f.kind==='testdata'&&f.name===file.name);
                    const item={pid:patch.pid,name:file.name,key,listed:doc.data?.find(f=>f.name===file.name),meta,baselineSha256:original?.sha256,error:error.message};
                    missing.push(item);console.log('XCPC_STORAGE_MISSING',patch.pid,file.name,error.message,'baseline',original?.sha256||'new');
                }
            }
        }
        fs.writeFileSync(path.join(root,'storage-missing.json'),JSON.stringify(missing,null,2),{mode:0o600});
        if (process.env.XCPC_REPAIR_ACTION==='apply') {
            const nodes=[];
            for (const item of missing) {
                const patch=patches.find(p=>p.pid===item.pid),file=patch.files.find(f=>f.name===item.name);
                if (item.listed||item.baselineSha256||file.expectedSha256!==null) throw new Error('Only unlisted stale indexes may be quarantined');
                const node=await db.collection('storage').findOne({path:item.key,autoDelete:null});
                if(!node||node.link)throw new Error('Unexpected stale index');
                if(await db.collection('storage').countDocuments({link:node._id,autoDelete:null}))throw new Error('Stale blob referenced elsewhere');
                nodes.push(node);
            }
            const backup=path.join(root,'stale-storage-before-'+Date.now()+'.json');
            const fd=fs.openSync(backup,'wx',0o600);
            try{fs.writeFileSync(fd,BSON.EJSON.stringify(nodes));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
            for(const node of nodes){
                const doc=await db.collection('document').findOne({domainId:'system',docType:10,docId:Number(node.path.split('/')[2])});
                if(doc.data?.some(f=>f.name===node.path.split('/').at(-1)))throw new Error('File became listed before quarantine');
                await storage.del([node.path],3);
                if(await storage.getMeta(node.path))throw new Error('Stale storage index still active');
                console.log('XCPC_STORAGE_QUARANTINED',node.path);
            }
            console.log('XCPC_STORAGE_BACKUP',backup);
        }
        console.log('XCPC_STORAGE_CHECK_COMPLETE',patches.length,'missing',missing.length);
    }finally{await client.close();}
})();
