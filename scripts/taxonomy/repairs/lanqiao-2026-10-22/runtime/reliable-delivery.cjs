/* Private durable outbox for final HydroJudge results. Intermediate updates
 * may be dropped across reconnects; the final result contains every testcase. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
class ReliableDelivery {
    constructor(directory,send) {
        this.directory=directory;this.send=send;this.pending=new Map();this.active=new Set();
        fs.mkdirSync(directory,{recursive:true,mode:0o700});
        for(const name of fs.readdirSync(directory)) {
            if(!/^[a-f0-9]{24}\.json$/.test(name))continue;
            const value=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
            if(value.dfacmDeliveryId+'.json'!==name||!/^[a-f0-9]{24}$/.test(value.rid)||value.key!=='end')throw new Error('Invalid final-result outbox file');
            this.pending.set(value.dfacmDeliveryId,value);
        }
    }
    available() { return [...new Set([...this.active,...this.pending.keys()])]; }
    begin(id) { if(id)this.active.add(id); }
    finish(id) { if(id)this.active.delete(id); }
    publish(value) {
        const id=value.dfacmDeliveryId;
        if(!/^[a-f0-9]{24}$/.test(id)||!/^[a-f0-9]{24}$/.test(value.rid))throw new Error('Invalid final-result identity');
        const file=path.join(this.directory,id+'.json'),part=file+'.tmp';
        const fd=fs.openSync(part,'w',0o600);
        try {fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
        fs.renameSync(part,file);this.pending.set(id,value);this.flush(id);
    }
    flush(only) {
        for(const [id,value] of this.pending) {
            if(only&&id!==only)continue;
            // A failed/closed socket must leave the durable result for retry.
            try {this.send(value);} catch { /* Retry after reconnect. */ }
        }
    }
    acknowledge(id,rid,outcome) {
        const value=this.pending.get(id);
        if(!value||value.rid!==rid||!['accepted','stale'].includes(outcome))return;
        fs.unlinkSync(path.join(this.directory,id+'.json'));this.pending.delete(id);
    }
}
module.exports={ReliableDelivery};
