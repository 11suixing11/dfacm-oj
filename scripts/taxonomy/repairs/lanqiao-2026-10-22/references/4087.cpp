#include <bits/stdc++.h>
using namespace std;
struct Dinic {
    struct Edge { int to, rev; long long cap; };
    vector<vector<Edge>> g; vector<int> level, it;
    Dinic(int n):g(n),level(n),it(n){}
    void add(int u,int v,long long cap) {
        g[u].push_back({v,(int)g[v].size(),cap});
        g[v].push_back({u,(int)g[u].size()-1,0});
    }
    long long dfs(int u,int t,long long flow) {
        if(u==t)return flow;
        for(int &i=it[u];i<(int)g[u].size();i++) {
            auto &e=g[u][i];
            if(e.cap&&level[e.to]==level[u]+1) {
                long long got=dfs(e.to,t,min(flow,e.cap));
                if(got){e.cap-=got;g[e.to][e.rev].cap+=got;return got;}
            }
        }
        return 0;
    }
    long long flow(int s,int t) {
        long long ans=0;
        while(true) {
            fill(level.begin(),level.end(),-1);queue<int> q;q.push(s);level[s]=0;
            while(!q.empty()){int u=q.front();q.pop();for(auto e:g[u])if(e.cap&&level[e.to]<0)level[e.to]=level[u]+1,q.push(e.to);}
            if(level[t]<0)return ans;
            fill(it.begin(),it.end(),0);while(long long f=dfs(s,t,1LL<<60))ans+=f;
        }
    }
};
int main() {
    ios::sync_with_stdio(false);cin.tie(nullptr);
    int n;cin>>n;vector<vector<int>> a(n);vector<long long> weight(n);
    for(auto &row:a){int m;cin>>m;row.resize(m);for(int &x:row){cin>>x;--x;}}
    for(auto &w:weight)cin>>w;
    vector<int> owner(n,-1),seen(n);
    function<bool(int)> augment=[&](int u) {
        for(int v:a[u])if(!seen[v]){seen[v]=1;if(owner[v]<0||augment(owner[v])){owner[v]=u;return true;}}
        return false;
    };
    for(int u=0;u<n;u++){fill(seen.begin(),seen.end(),0);if(!augment(u))return 1;}
    Dinic d(n+2);int s=n,t=n+1;long long answer=0;
    for(int i=0;i<n;i++){
        if(weight[i]<0){answer+=weight[i];d.add(s,i,-weight[i]);}else d.add(i,t,weight[i]);
        for(int v:a[i])if(owner[v]!=i)d.add(i,owner[v],1LL<<50);
    }
    cout<<answer+d.flow(s,t)<<'\n';
}
