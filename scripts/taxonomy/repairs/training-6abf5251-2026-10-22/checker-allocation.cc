#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(1,100),m=inf.readInt(1,100);
    vector<vector<long long>>a(n,vector<long long>(m+1));for(auto&row:a)for(int j=1;j<=m;j++)row[j]=inf.readLong(0LL,(long long)INT_MAX);
    const long long NEG=LLONG_MIN/4;vector<long long>d(m+1,NEG);d[0]=0;
    for(auto&row:a){vector<long long>next(m+1,NEG);for(int total=0;total<=m;total++)for(int k=0;k<=total;k++)if(d[total-k]!=NEG)next[total]=max(next[total],d[total-k]+row[k]);d=next;}
    long long opt=*max_element(d.begin(),d.end());
    auto check=[&](InStream&stream,TResult failure){
        if(stream.readLong()!=opt)quitf(failure,"profit is not optimal");
        vector<int>seen(n);int total=0;long long profit=0;
        for(int i=0;i<n;i++){int company=stream.readInt(1,n)-1,k=stream.readInt(0,m);if(seen[company]++)quitf(failure,"company repeated");total+=k;profit+=a[company][k];}
        if(total>m||profit!=opt)quitf(failure,"allocation does not attain optimum within capacity");
        if(!stream.seekEof())quitf(failure,"extra output");
    };
    check(ans,_fail);check(ouf,_wa);quitf(_ok,"optimal feasible allocation");
}
