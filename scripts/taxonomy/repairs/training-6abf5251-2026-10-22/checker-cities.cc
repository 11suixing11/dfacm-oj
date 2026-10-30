#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(1,20);const long long INF=LLONG_MAX/4;
    vector<vector<long long>>a(n,vector<long long>(n)),d(n,vector<long long>(n,INF));
    for(int i=0;i<n;i++)for(int j=0;j<n;j++){a[i][j]=inf.readLong(0LL,(long long)INT_MAX);if(i==j)d[i][j]=0;else if(a[i][j])d[i][j]=a[i][j];}
    for(int k=0;k<n;k++)for(int i=0;i<n;i++)for(int j=0;j<n;j++)d[i][j]=min(d[i][j],d[i][k]+d[k][j]);
    if(d[0][n-1]==INF)quitf(_fail,"unreachable target in input");
    string header="minlong="+to_string(d[0][n-1]);
    auto check=[&](InStream&stream,TResult failure){
        if(stream.readToken()!=header)quitf(failure,"first token must be %s",header.c_str());
        vector<int>path;while(!stream.seekEof()){if(int(path.size())==n)quitf(failure,"path too long");path.push_back(stream.readInt(1,n)-1);}
        if(path.empty()||path.front()!=0||path.back()!=n-1)quitf(failure,"path endpoints incorrect");
        set<int>visited;long long sum=0;
        for(int u:path)if(!visited.insert(u).second)quitf(failure,"city repeated");
        for(int i=1;i<int(path.size());i++){long long cost=a[path[i-1]][path[i]];if(cost<=0)quitf(failure,"missing directed road");sum+=cost;}
        if(sum!=d[0][n-1])quitf(failure,"path is not optimal");
    };
    check(ans,_fail);check(ouf,_wa);quitf(_ok,"optimal directed path");
}
