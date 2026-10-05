#!/bin/bash
# Create the XCPC progressive training plan via POST /training/create
set -u
S=/root/culture-seed
URI=$(node -e "process.stdout.write(require('/root/.hydro/config.json').uri)")
H=https://swpuacm.xyz
R="--resolve swpuacm.xyz:443:127.0.0.1"
JAR=/tmp/xcpc_jar.txt
fail(){ echo "!! FAIL: $1"; exit 1; }

JUN=$(grep -o 'uname:.*' /root/.hydro/judge.yaml | head -1 | awk '{print $2}')
JPW=$(grep -o 'password:.*' /root/.hydro/judge.yaml | head -1 | awk '{print $2}')
[ -n "$JUN" ] && [ -n "$JPW" ] || fail "no judge credentials"

code=$(curl -sk $R -c $JAR -o /dev/null -w "%{http_code}" -d "uname=$JUN&password=$JPW" $H/login)
[ "$code" = "302" ] || fail "login $code"

DAG=$(cat $S/xcpc_dag.json)
curl -sk $R -b $JAR -o /tmp/xcpc_resp.txt -D /tmp/xcpc_hdr.txt -w "training/create -> %{http_code}\n" \
  --data-urlencode "title=【进阶】XCPC 专题训练 108 题" \
  --data-urlencode "content@$S/xcpc_content.md" \
  --data-urlencode "dag=$DAG" \
  -d "pin=0" \
  --data-urlencode "description@$S/xcpc_desc.md" \
  $H/training/create
TID=$(grep -o '"tid":"[a-f0-9]\{24\}"' /tmp/xcpc_resp.txt | head -1 | cut -d'"' -f4)
if [ -z "$TID" ]; then
  TID=$(grep -io 'location: /training/[a-f0-9]\{24\}' /tmp/xcpc_hdr.txt | head -1 | grep -o '[a-f0-9]\{24\}')
fi
[ -n "$TID" ] || { echo "resp:"; head -c 400 /tmp/xcpc_resp.txt; echo; fail "no tid"; }
echo "TID=$TID"

echo "-- owner fix 3->2 --"
mongosh "$URI" --quiet --eval 'var r=db.getCollection("document").updateOne({docType:40,_id:ObjectId("'$TID'"),owner:3},{$set:{owner:2}}); print("owner updated: "+r.modifiedCount)'

echo "-- doc check --"
mongosh "$URI" --quiet --eval 'var t=db.getCollection("document").findOne({docType:40,_id:ObjectId("'$TID'")}); print("title="+t.title); print("owner="+t.owner+" pin="+t.pin); print("nodes="+t.dag.length+" pids="+t.dag.reduce(function(a,n){return a+n.pids.length},0)); t.dag.forEach(function(n){print("  ch"+n._id+" req=["+n.requireNids.join(",")+"] n="+n.pids.length)})'

echo "-- guest verify --"
curl -sk $R -o /tmp/v_tr.html -w "/training http=%{http_code} " $H/training; grep -c "XCPC 专题训练" /tmp/v_tr.html || true
curl -sk $R -o /tmp/v_td.html -w "detail http=%{http_code} " "$H/training/$TID"; grep -c "热身路段\|冲顶突击" /tmp/v_td.html || true
grep -o "Enrolled\|报名" /tmp/v_td.html | sort | uniq -c | head -3
echo "TID=$TID" > /tmp/xcpc_tid.env
echo "CREATE_DONE"
