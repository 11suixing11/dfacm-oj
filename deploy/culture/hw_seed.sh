#!/bin/bash
# SWPU OJ culture seed v1 (2026-10-05)
# Adds: discussion nodes (SWPU category) + 4 pinned posts + about page rewrite
#       + training section titles + first weekly contest + footer links
# Usage: bash hw_seed.sh prep   (read-only checks + login test)
#        bash hw_seed.sh run    (full seed)
#        BOOL=on bash hw_seed.sh run   (if Types.Boolean rejects 'true')
set -u
MODE=${1:-prep}
S=/root/culture-seed
TS=$(date +%Y%m%d-%H%M%S)
B=/root/backups/culture-seed-$TS
URI=$(node -e "process.stdout.write(require('/root/.hydro/config.json').uri)")
HO=/usr/local/share/.config/yarn/global/node_modules/hydrooj
H=https://swpuacm.xyz
R="--resolve swpuacm.xyz:443:127.0.0.1"
JAR=/tmp/hw_jar.txt
BOOL=${BOOL:-true}

fail(){ echo "!! FAIL: $1"; exit 1; }
ok(){ echo "ok - $1"; }

JUN=$(grep -o 'uname:.*' /root/.hydro/judge.yaml | head -1 | awk '{print $2}')
JPW=$(grep -o 'password:.*' /root/.hydro/judge.yaml | head -1 | awk '{print $2}')
[ -n "$JUN" ] && [ -n "$JPW" ] || fail "cannot read judge credentials"

login(){
  local code
  code=$(curl -sk $R -c $JAR -o /dev/null -w "%{http_code}" -d "uname=$JUN&password=$JPW" $H/login)
  [ "$code" = "302" ] && ok "login 302 as $JUN" || fail "login got $code"
}
sudo_up(){
  # Hydro sudo flow: touch a @requireSudo page first (writes sudoArgs into
  # server-side session), then POST the password to activate for 1 hour.
  curl -sk $R -b $JAR -c $JAR -o /dev/null -w "touch /manage/setting -> %{http_code} (302 expected pre-sudo)\n" $H/manage/setting
  local code code2
  code=$(curl -sk $R -b $JAR -c $JAR -o /dev/null -w "%{http_code}" -d "password=$JPW" $H/user/sudo)
  echo "sudo activate -> $code (expect 302)"
  code2=$(curl -sk $R -b $JAR -o /dev/null -w "%{http_code}" $H/manage/setting)
  echo "sudo verify: GET /manage/setting -> $code2 (200=sudo active)"
  [ "$code2" = "200" ] || fail "sudo not activated"
}

if [ "$MODE" = "prep" ]; then
  echo "=== Types.Boolean definition ==="
  for f in $(grep -rl "Boolean:" $HO/src --include="*.ts" 2>/dev/null | head -3); do
    echo "--- $f"
    grep -n -A6 "Boolean:" "$f" | head -14
  done
  echo "=== judge uname: $JUN (password length ${#JPW})"
  echo "=== census ==="
  mongosh "$URI" --quiet --eval 'print("node docs=" + db.getCollection("document").countDocuments({docType:20}) + " posts=" + db.getCollection("document").countDocuments({docType:21}))'
  echo "=== judge account timezone ==="
  mongosh "$URI" --quiet --eval 'var u=db.getCollection("user").findOne({_id:3}); print("tz=" + (u.timeZone||"unset"))'
  echo "=== login test ==="
  login
  echo "PREP_DONE"
  exit 0
fi

# ============================ RUN ============================
mkdir -p "$B"
echo "== 0. backups =="
mongosh "$URI" --quiet --eval 'var v=db.getCollection("system").findOne({_id:"ui-default.about"}); if(v){print(v.value)}' > "$B/about_orig.md"
mongosh "$URI" --quiet --eval 'var v=db.getCollection("system").findOne({_id:"discussion.nodes"}); if(v){print(v.value)}' > "$B/nodes_orig.yaml"
mongosh "$URI" --quiet --eval 'var v=db.getCollection("system").findOne({_id:"ui-default.footer_extra_html"}); if(v){print(v.value)}' > "$B/footer_orig.html"
mongosh "$URI" --quiet --eval 'print(JSON.stringify(db.getCollection("document").find({docType:40}).toArray()))' > "$B/trainings_orig.json"
mongosh "$URI" --quiet --eval 'print(JSON.stringify(db.getCollection("document").find({docType:20}).toArray()))' > "$B/node_docs_orig.json"
wc -c "$B"/* || true

login
sudo_up

echo "== 1. discussion.nodes setting =="
curl -sk $R -b $JAR -c $JAR -o /dev/null -w "manage/setting nodes -> %{http_code}\n" \
  --data-urlencode "discussion.nodes@$S/hw_nodes.yaml" $H/manage/setting
mongosh "$URI" --quiet --eval 'var v=db.getCollection("system").findOne({_id:"discussion.nodes"}).value; print("stored nodes has SWPU category: " + (String(v).indexOf("SWPU")>=0))'

echo "== 2. init discussion nodes (flush+re-add; posts=0 so safe) =="
curl -sk $R -b $JAR -c $JAR -o /dev/null -w "domain/dashboard init -> %{http_code}\n" \
  -d "operation=init_discussion_node" $H/domain/dashboard
NC=$(mongosh "$URI" --quiet --eval 'print(db.getCollection("document").countDocuments({docType:20}))')
echo "node docs now: $NC (expect 19 = 16 old + 3 new)"
[ "$NC" -ge 19 ] || fail "node init failed (count $NC)"

echo "== 3. first contest (Altitude Weekly R0) =="
curl -sk $R -b $JAR -o /tmp/hw_contest_resp.txt -D /tmp/hw_contest_hdr.txt -w "contest/create -> %{http_code}\n" \
  -d "operation=update" \
  --data-urlencode "beginAtDate=2026-10-11" \
  --data-urlencode "beginAtTime=19:00" \
  -d "duration=3" \
  --data-urlencode "title=海拔周赛 R0 · 新生热身专场" \
  --data-urlencode "content@$S/hw_contest.md" \
  -d "rule=acm" \
  -d "pids=3677,3676,3712,3717,3736" \
  -d "allowViewCode=$BOOL" \
  $H/contest/create
TID=$(grep -o '"tid":"[a-f0-9]\{24\}"' /tmp/hw_contest_resp.txt | head -1 | cut -d'"' -f4)
if [ -z "$TID" ]; then
  TID=$(grep -io 'location: /contest/[a-f0-9]\{24\}' /tmp/hw_contest_hdr.txt | head -1 | grep -o '[a-f0-9]\{24\}')
fi
[ -n "$TID" ] || { echo "resp head:"; head -c 300 /tmp/hw_contest_resp.txt; echo; fail "no tid in contest response"; }
ok "contest tid=$TID"
sed -i "s/__TID__/$TID/g" "$S/hw_post_zhousai.md"

echo "== 4. create posts =="
# node urlencoded: 公告=%E5%85%AC%E5%91%8A  问答=%E9%97%AE%E7%AD%94
create_post(){
  local NODE=$1 TITLE=$2 FILE=$3 PIN=$4 HL=$5 CODE DID EXTRA
  EXTRA="-d pin=$PIN"
  [ -n "$HL" ] && EXTRA="$EXTRA -d highlight=$HL"
  CODE=$(curl -sk $R -b $JAR -o /tmp/hw_post_resp.txt -D /tmp/hw_post_hdr.txt -w "%{http_code}" \
    --data-urlencode "title=$TITLE" --data-urlencode "content@$S/$FILE" \
    $EXTRA \
    "$H/discuss/node/$NODE/create")
  DID=$(grep -o '"did":"[a-f0-9]\{24\}"' /tmp/hw_post_resp.txt | head -1 | cut -d'"' -f4)
  if [ -z "$DID" ]; then
    DID=$(grep -io 'location: /discuss/[a-f0-9]\{24\}' /tmp/hw_post_hdr.txt | head -1 | grep -o '[a-f0-9]\{24\}')
  fi
  echo "post '$TITLE' -> http=$CODE did=$DID" >&2
  echo "$DID"
}
DID_CHUTI=$(create_post "%E5%85%AC%E5%91%8A" "出题规范与数据制作教程" hw_post_chuti.md "$BOOL" "$BOOL")
[ -n "$DID_CHUTI" ] || fail "chuti post failed"
DID_ASK=$(create_post "%E9%97%AE%E7%AD%94" "提问的智慧：怎么问，别人才愿意帮你" hw_post_ask.md "$BOOL" "")
[ -n "$DID_ASK" ] || fail "ask post failed"
DID_ZHOUSAI=$(create_post "%E5%85%AC%E5%91%8A" "周赛怎么打：赛前 · 赛中 · 赛后" hw_post_zhousai.md "$BOOL" "")
[ -n "$DID_ZHOUSAI" ] || fail "zhousai post failed"
sed -i "s/__DID_CHUTI__/$DID_CHUTI/g; s/__DID_ASK__/$DID_ASK/g; s/__DID_ZHOUSAI__/$DID_ZHOUSAI/g" "$S/hw_post_xuzhi.md"
DID_XUZHI=$(create_post "%E5%85%AC%E5%91%8A" "ACM 新生入门须知" hw_post_xuzhi.md "$BOOL" "$BOOL")
[ -n "$DID_XUZHI" ] || fail "xuzhi post failed"

cat > /tmp/hw_ids.env <<EOL
DID_XUZHI=$DID_XUZHI
DID_CHUTI=$DID_CHUTI
DID_ASK=$DID_ASK
DID_ZHOUSAI=$DID_ZHOUSAI
TID=$TID
EOL

echo "== 5. fix post owners uid3 -> uid2 (bot爱摸鱼) =="
mongosh "$URI" --quiet --eval 'var r=db.getCollection("document").updateMany({docType:21,owner:3},{$set:{owner:2,editor:2}}); print("documents updated: "+r.modifiedCount); var r2=db.getCollection("discussion.history").updateMany({uid:3},{$set:{uid:2}}); print("history rows updated: "+r2.modifiedCount)'
mongosh "$URI" --quiet --eval 'db.getCollection("document").find({docType:21}).forEach(function(d){print("POST " + d._id + " pin=" + d.pin + " highlight=" + d.highlight + " owner=" + d.owner + " " + d.title)})'

echo "== 6. about page =="
python3 - "$B" "$S" "$DID_XUZHI" <<'PYEOF'
import sys
bdir, sdir, did = sys.argv[1], sys.argv[2], sys.argv[3]
orig = open(bdir + '/about_orig.md', encoding='utf-8').read()
idx = orig.index('\n# privacy')
preserved = orig[idx+1:]
head = open(sdir + '/hw_about_head.md', encoding='utf-8').read().rstrip()
head = head.replace('__DID_XUZHI__', did)
open('/tmp/hw_about_new.md', 'w', encoding='utf-8').write(head + '\n\n' + preserved)
print('about_new built, preserved privacy/tos bytes:', len(preserved))
PYEOF
curl -sk $R -b $JAR -c $JAR -o /dev/null -w "manage/setting about -> %{http_code}\n" \
  --data-urlencode "ui-default.about@/tmp/hw_about_new.md" $H/manage/setting

echo "== 7. training section titles =="
mongosh "$URI" --quiet "$S/hw_train.js"

echo "== 8. footer links =="
python3 - "$B" "$S" "$DID_XUZHI" <<'PYEOF'
import sys
bdir, sdir, did = sys.argv[1], sys.argv[2], sys.argv[3]
cur = open(bdir + '/footer_orig.html', encoding='utf-8').read()
if 'swpu-guide-link' in cur:
    print('footer already has guide link, skip')
    open('/tmp/hw_footer_new.html', 'w', encoding='utf-8').write(cur)
else:
    lines = open(sdir + '/hw_footer_lines.html', encoding='utf-8').read()
    lines = lines.replace('__DID_XUZHI__', did)
    open('/tmp/hw_footer_new.html', 'w', encoding='utf-8').write(cur.rstrip() + '\n' + lines)
    print('footer_new built')
PYEOF
curl -sk $R -b $JAR -c $JAR -o /dev/null -w "manage/setting footer -> %{http_code}\n" \
  --data-urlencode "ui-default.footer_extra_html@/tmp/hw_footer_new.html" $H/manage/setting

echo "== 9. verification =="
echo "--- guest /discuss:"
curl -sk $R -o /tmp/hw_v1.txt -w "http=%{http_code} " $H/discuss; grep -c "入门须知\|出题规范\|周赛怎么打\|提问的智慧" /tmp/hw_v1.txt || true
echo "--- guest /wiki/about:"
curl -sk $R -o /tmp/hw_v2.txt -w "http=%{http_code} " $H/wiki/about; grep -c "关于我们\|2017" /tmp/hw_v2.txt || true
echo "--- training pages:"
curl -sk $R -o /tmp/hw_v3.txt -w "http=%{http_code} " "$H/training/6abf5251aaa235606eedfb84"; grep -c "大本营" /tmp/hw_v3.txt || true
curl -sk $R -o /tmp/hw_v4.txt -w "http=%{http_code} " "$H/training/6abf552caaa235606eedfbee"; grep -c "峰顶实录" /tmp/hw_v4.txt || true
echo "--- contest detail:"
curl -sk $R -b $JAR -o /tmp/hw_v5.txt -w "http=%{http_code} " "$H/contest/$TID"; grep -c "海拔周赛" /tmp/hw_v5.txt || true
echo "--- contest doc check (expect beginAt=2026-10-11T11:00Z endAt=+3h):"
mongosh "$URI" --quiet --eval 'var t=db.getCollection("document").findOne({docType:30,docId:ObjectId("'$TID'")}); print("beginAt="+t.beginAt+" endAt="+t.endAt+" rule="+t.rule+" rated="+t.rated+" allowViewCode="+t.allowViewCode+" pids="+t.pids)'
echo "--- footer check:"
curl -sk $R -o /tmp/hw_v6.txt $H/login; grep -c "swpu-guide-link" /tmp/hw_v6.txt || true
echo "--- landing:"
curl -sk $R -o /dev/null -w "http=%{http_code}\n" $H/

echo "===== SUMMARY ====="
cat /tmp/hw_ids.env
echo "backup dir: $B"
echo "SEED_DONE"
