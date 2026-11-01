'use strict';

const { memoryCollection } = require('./memory.cjs');
const { configFromEnv } = require('./config.cjs');
const { createMongoStore } = require('./store.cjs');
const { createEngine } = require('./engine.cjs');

const CONTEST = '6a0000000000000000000007';
const GENERATED_CODE = `#include <bits/stdc++.h>
using namespace std;

// Count subarrays whose sum is exactly target.
long long countTargetSubarrays(const vector<long long>& numbers, long long target) {
    unordered_map<long long, long long> prefixFrequency;
    prefixFrequency.reserve(numbers.size() * 2 + 1);
    prefixFrequency[0] = 1;
    long long prefixSum = 0, answer = 0;
    for (long long value : numbers) {
        prefixSum += value;
        auto found = prefixFrequency.find(prefixSum - target);
        if (found != prefixFrequency.end()) answer += found->second;
        ++prefixFrequency[prefixSum];
    }
    return answer;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int count;
    long long target;
    if (!(cin >> count >> target)) return 0;
    vector<long long> numbers(count);
    for (auto& value : numbers) cin >> value;
    cout << countTargetSubarrays(numbers, target) << '\\n';
    return 0;
}
`;
const HUMAN_CODE = `#include <iostream>
#include <vector>
#include <map>
using namespace std;
int main(){
    int n;
    long long k, x, s=0, ans=0;
    cin>>n>>k;
    map<long long,int> m;
    m[0]=1;
    for(int i=0;i<n;i++){
        cin>>x;
        s+=x;
        if(m.count(s-k)) ans+=m[s-k];
        m[s]++;
    }
    cout<<ans<<endl;
    return 0;
}`;
const PEER_CODE = `#include <bits/stdc++.h>
using namespace std;
int main(){
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int vertexCount, edgeCount;
    cin >> vertexCount >> edgeCount;
    vector<vector<pair<int,int>>> adjacency(vertexCount + 1);
    for (int i = 0; i < edgeCount; ++i) {
        int from, to, weight;
        cin >> from >> to >> weight;
        adjacency[from].push_back({to, weight});
    }
    const long long infinity = 4000000000000000000LL;
    vector<long long> distance(vertexCount + 1, infinity);
    priority_queue<pair<long long,int>, vector<pair<long long,int>>, greater<pair<long long,int>>> pending;
    distance[1] = 0; pending.push({0, 1});
    while (!pending.empty()) {
        auto [cost, vertex] = pending.top(); pending.pop();
        if (cost != distance[vertex]) continue;
        for (auto [next, weight] : adjacency[vertex]) {
            if (cost + weight >= distance[next]) continue;
            distance[next] = cost + weight;
            pending.push({distance[next], next});
        }
    }
    for (int vertex = 1; vertex <= vertexCount; ++vertex) {
        cout << (distance[vertex] == infinity ? -1 : distance[vertex]) << " ";
    }
    return 0;
}`;

async function createDemo({ now = Date.now, seed = true } = {}) {
    const config = configFromEnv({ DFACM_AI_WATCH_DOMAINS: 'system', DFACM_AI_WATCH_SCOPE: 'all', DFACM_AI_WATCH_INTERVAL_MS: '1000' });
    const reports = memoryCollection(); const sources = memoryCollection(); const state = memoryCollection();
    const jobs = memoryCollection(); const records = memoryCollection();
    const problems = new Map([['P2104', 2104], ['P2110', 2110]]);
    const store = createMongoStore({ reports, sources, state, jobs, records, config, now,
        objectId: id => id, problemModel: { get: async (_domain, pid) => ({ docId: problems.get(pid) || Number(String(pid).replace(/^P/, '')), pid: `P${String(pid).replace(/^P/, '')}` }) } });
    const engine = createEngine({ store, config, now, log: (stage, error) => console.error(`Demo ${stage}: ${error.code || 'INTERNAL'}`) });
    let counter = 0;
    function idAt(time) { return Math.floor(time / 1000).toString(16).padStart(8, '0') + (++counter).toString(16).padStart(16, '0'); }
    async function submit({ code = GENERATED_CODE, uid = 1086, pid = 2104, time = now(), contest = CONTEST, lang = 'cpp', status = 1 } = {}) {
        const record = { _id: idAt(time), domainId: 'system', uid, pid, lang, code, contest, status };
        await records.insertOne(record); engine.enqueue(record); return record;
    }
    async function addJob(uid, time = now() - 60000) {
        const job = { _id: (++counter).toString(16).padStart(32, '0'), type: 'job', status: 'ready', scope: `system:${uid}`, target: 'p:P2104',
            answer: { status: 'ok', mode: 'solve', level: 'solution', code: GENERATED_CODE }, completedAt: new Date(time), expireAt: new Date(now() + 600000) };
        await jobs.insertOne(job); return job;
    }
    if (seed) {
        const before = now() - 270000;
        await addJob(1086, before - 5000);
        await submit({ uid: 1042, pid: 2110, code: PEER_CODE, time: before });
        await submit({ uid: 1088, pid: 2110, code: PEER_CODE.replace(/adjacency/g, 'graph').replace(/vertexCount/g, 'size'), time: before + 10000 });
        await submit({ uid: 1024, code: HUMAN_CODE, time: before + 60000 });
        await submit({ uid: 1061, pid: 1000, code: '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}', time: before + 100000 });
        await submit({ uid: 1086, code: GENERATED_CODE, time: before + 150000 });
        await submit({ uid: 1093, code: HUMAN_CODE + '\n// Generated by ChatGPT\n', time: before + 200000 });
        await engine.tick();
    }
    async function newSubmission() {
        const uid = 1100 + counter;
        await addJob(uid, now() - 1000);
        const record = await submit({ uid });
        // The live background engine handles it; the POST is merely a submit event.
        return record;
    }
    return { config, store, engine, records, reports, sources, jobs, state, submit, addJob, newSubmission };
}

module.exports = { createDemo, GENERATED_CODE, HUMAN_CODE, PEER_CODE, CONTEST };
