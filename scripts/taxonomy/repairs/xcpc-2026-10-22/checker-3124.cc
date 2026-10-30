#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]) {
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(1,100000),m=inf.readInt(0,100000);
    vector<int>color(n+1);
    map<int,set<int>> adjacent;
    for(int i=1;i<=n;i++){color[i]=inf.readInt(1,100000);adjacent[color[i]];}
    for(int i=0;i<m;i++){
        int a=inf.readInt(1,n),b=inf.readInt(1,n);
        if(color[a]!=color[b]){adjacent[color[a]].insert(color[b]);adjacent[color[b]].insert(color[a]);}
    }
    int best=0;
    for(auto&[c,neighbors]:adjacent)best=max(best,(int)neighbors.size());
    int answer=ouf.readInt(1,100000);
    if(!ouf.seekEof())quitf(_wa,"extra output");
    auto it=adjacent.find(answer);
    if(it==adjacent.end())quitf(_wa,"color does not occur");
    if((int)it->second.size()!=best)quitf(_wa,"color does not maximize diversity");
    quitf(_ok,"maximum diversity %d",best);
}
