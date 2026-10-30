#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);
    int f=inf.readInt(1,100),v=inf.readInt(f,100);
    vector<vector<int>>a(f,vector<int>(v));for(auto&row:a)for(int&x:row)x=inf.readInt(-50,50);
    const long long NEG=LLONG_MIN/4;vector<long long>d(v+1,0);
    for(auto&row:a){vector<long long>next(v+1,NEG);for(int j=1;j<=v;j++){next[j]=next[j-1];if(d[j-1]!=NEG)next[j]=max(next[j],d[j-1]+row[j-1]);}d=next;}
    long long opt=d[v];
    auto check=[&](InStream&stream,TResult failure){
        if(stream.readLong()!=opt)quitf(failure,"aesthetic value is not optimal");
        int previous=0;long long sum=0;for(int i=0;i<f;i++){int vase=stream.readInt(1,v);if(vase<=previous)quitf(failure,"vase numbers must increase");previous=vase;sum+=a[i][vase-1];}
        if(sum!=opt)quitf(failure,"placement does not attain optimum");
        if(!stream.seekEof())quitf(failure,"extra output");
    };
    check(ans,_fail);check(ouf,_wa);quitf(_ok,"optimal ordered placement");
}
