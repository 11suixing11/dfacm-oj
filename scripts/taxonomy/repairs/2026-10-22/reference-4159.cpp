#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int t; cin>>t;
    while(t--) {
        int n; cin>>n;
        map<string,set<string>> next;
        map<string,int> indegree;
        for(int i=0;i<n;++i) {
            string a,b; cin>>a>>b;
            indegree.try_emplace(a,0); indegree.try_emplace(b,0);
            if(next[a].insert(b).second) ++indegree[b];
        }
        queue<string> q;
        for(auto [name,degree]:indegree) if(!degree) q.push(name);
        bool first=true;
        while(!q.empty()) {
            string name=q.front(); q.pop();
            if(!first) cout<<' '; first=false; cout<<name;
            for(const auto& b:next[name]) if(--indegree[b]==0) q.push(b);
        }
        cout<<'\n';
    }
}
