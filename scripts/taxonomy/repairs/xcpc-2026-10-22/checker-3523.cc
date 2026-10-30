#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
using ll=long long;
int main(int argc,char*argv[]) {
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(0,100000);
    ll L=inf.readLong(1,1000000000LL);
    vector<array<ll,4>>ramps(n);
    vector<ll>points={0,L};
    for(auto&r:ramps){
        r[0]=inf.readLong(0,L);r[1]=inf.readLong(1,1000000000LL);
        r[2]=inf.readLong(1,1000000000LL);r[3]=inf.readLong(1,1000000000LL);
        if(r[0]+r[1]>L)quitf(_fail,"ramp exceeds finish");
        if(r[0]>=r[3]){points.push_back(r[0]-r[3]);points.push_back(r[0]+r[1]);}
    }
    sort(points.begin(),points.end());points.erase(unique(points.begin(),points.end()),points.end());
    auto id=[&](ll x){return lower_bound(points.begin(),points.end(),x)-points.begin();};
    struct Edge{int to;ll cost;};
    vector<vector<Edge>>g(points.size());
    for(int i=1;i<(int)points.size();i++){
        ll cost=points[i]-points[i-1];
        g[i].push_back({i-1,cost});g[i-1].push_back({i,cost});
    }
    for(auto&r:ramps)if(r[0]>=r[3])g[id(r[0]-r[3])].push_back({(int)id(r[0]+r[1]),r[2]+r[3]});
    vector<ll>distance(points.size(),LLONG_MAX/4);
    set<pair<ll,int>>queue;distance[0]=0;queue.insert({0,0});
    while(!queue.empty()){
        auto[dist,u]=*queue.begin();queue.erase(queue.begin());
        for(auto&e:g[u])if(dist+e.cost<distance[e.to]){
            queue.erase({distance[e.to],e.to});
            distance[e.to]=dist+e.cost;queue.insert({distance[e.to],e.to});
        }
    }
    ll claimed=ouf.readLong(0,L,"minimum time");
    int k=ouf.readInt(0,n,"number of ramps");
    vector<bool>used(n);
    ll position=0,time=0;
    for(int i=0;i<k;i++){
        int number=ouf.readInt(1,n)-1;
        if(used[number])quitf(_wa,"ramp used more than once");
        used[number]=true;auto&r=ramps[number];
        ll start=r[0]-r[3];
        if(start<0)quitf(_wa,"run-up enters negative axis");
        time+=abs(position-start)+r[3]+r[2];position=r[0]+r[1];
    }
    if(!ouf.seekEof())quitf(_wa,"extra output");
    time+=abs(L-position);
    if(time!=claimed)quitf(_wa,"claimed time differs from listed route");
    if(time!=distance.back())quitf(_wa,"route is not optimal");
    quitf(_ok,"optimal route in %lld seconds",time);
}
