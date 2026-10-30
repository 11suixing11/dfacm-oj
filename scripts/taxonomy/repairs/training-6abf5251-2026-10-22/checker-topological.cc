// Validate a complete topological order, including isolated family members.
#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);int n=inf.readInt(1,100);vector<pair<int,int>>edges;
    for(int u=0;u<n;u++){int v;while((v=inf.readInt(0,n)))edges.push_back({u,v-1});}
    auto check=[&](InStream&s,TResult failure){
        vector<int>position(n,-1);
        for(int i=0;i<n;i++){int u=s.readInt(1,n)-1;if(position[u]>=0)quitf(failure,"duplicate family member");position[u]=i;}
        for(auto[u,v]:edges)if(position[u]>=position[v])quitf(failure,"ancestor must appear before descendant");
        if(!s.seekEof())quitf(failure,"extra output");
    };check(ans,_fail);check(ouf,_wa);quitf(_ok,"valid complete topological order");
}
