#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);int n=inf.readInt(2,99),m=inf.readInt(2,1999);map<pair<int,int>,int>edges;
    for(int i=0;i<m;i++){int a=inf.readInt(1,n),b=inf.readInt(1,n);edges[minmax(a,b)]++;}
    auto check=[&](InStream&s,TResult failure){
        auto remaining=edges;int previous=s.readInt(1,n);
        for(int i=0;i<m;i++){int next=s.readInt(1,n);auto edge=minmax(previous,next);auto it=remaining.find(edge);if(it==remaining.end()||!it->second)quitf(failure,"edge missing or traversed too often");it->second--;previous=next;}
        if(!s.seekEof())quitf(failure,"extra vertices or output");
    };check(ans,_fail);check(ouf,_wa);quitf(_ok,"Euler trail uses every edge exactly once");
}
