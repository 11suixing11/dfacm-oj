// Accept any minimum spanning tree; parallel edges use their minimum weight.
#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);int n=inf.readInt(2,100),m=inf.readInt();
    const long long INF=LLONG_MAX/4;vector<vector<long long>>w(n,vector<long long>(n,INF));
    for(int i=0;i<m;i++){int a=inf.readInt(1,n)-1,b=inf.readInt(1,n)-1;long long cost=inf.readLong(1LL,(long long)INT_MAX);w[a][b]=w[b][a]=min(w[a][b],cost);}
    vector<long long>d(n,INF);vector<bool>used(n);d[0]=0;long long optimal=0;
    for(int k=0;k<n;k++){int u=-1;for(int i=0;i<n;i++)if(!used[i]&&(u<0||d[i]<d[u]))u=i;if(d[u]==INF)quitf(_fail,"disconnected input");optimal+=d[u];used[u]=true;for(int v=0;v<n;v++)if(!used[v])d[v]=min(d[v],w[u][v]);}
    auto check=[&](InStream&s,TResult failure){
        DSU tree(n);long long cost=0;
        for(int i=0;i<n-1;i++){int a=s.readInt(1,n)-1,b=s.readInt(1,n)-1;if(w[a][b]==INF||!tree.join(a,b))quitf(failure,"missing edge or cycle");cost+=w[a][b];}
        if(cost!=optimal)quitf(failure,"spanning tree is not minimum");
        if(!s.seekEof())quitf(failure,"extra output");
    };check(ans,_fail);check(ouf,_wa);quitf(_ok,"minimum spanning tree");
}
