#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
struct DSU {
    vector<int> p, size;
    DSU(int n): p(n+1), size(n+1,1) { iota(p.begin(),p.end(),0); }
    int find(int x) { return p[x]==x?x:p[x]=find(p[x]); }
    void join(int x,int y) { x=find(x);y=find(y);if(x==y)return;if(size[x]<size[y])swap(x,y);p[y]=x;size[x]+=size[y]; }
};
int main(int argc,char*argv[]) {
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(3,100000),m=inf.readInt(0,100000),v=inf.readInt(1,n);
    bool possible=m>=n-1&&m<=1LL*(n-1)*(n-2)/2+1;
    int first=ouf.readInt(-1,n);
    if(first==-1) {
        if(!ouf.seekEof())quitf(_wa,"extra output after -1");
        if(possible)quitf(_wa,"a valid graph exists");
        quitf(_ok,"no valid graph exists");
    }
    if(!possible)quitf(_wa,"the requested graph is impossible");
    DSU connected(n),removed(n);
    set<pair<int,int>> edges;
    for(int i=0;i<m;i++) {
        int a=i?ouf.readInt(1,n):first,b=ouf.readInt(1,n);
        if(a<1||a==b)quitf(_wa,"invalid edge");
        auto e=minmax(a,b);
        if(!edges.insert(e).second)quitf(_wa,"duplicate edge");
        connected.join(a,b);
        if(a!=v&&b!=v)removed.join(a,b);
    }
    if(!ouf.seekEof())quitf(_wa,"extra output");
    for(int i=2;i<=n;i++)if(connected.find(i)!=connected.find(1))quitf(_wa,"graph is disconnected");
    int components=0;
    for(int i=1;i<=n;i++)if(i!=v&&removed.find(i)==i)components++;
    if(components<2)quitf(_wa,"v is not an articulation vertex");
    quitf(_ok,"valid graph");
}
