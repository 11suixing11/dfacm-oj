#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(1,200);vector<long long>a(n),d(n);vector<vector<int>>edge(n);
    for(auto&x:a)x=inf.readLong(0LL,(long long)INT_MAX);
    while(true){int u=inf.readInt(0,n),v=inf.readInt(0,n);if(u==0&&v==0)break;if(u<1||v<=u)quitf(_fail,"invalid forward edge");edge[u-1].push_back(v-1);}
    for(int u=n-1;u>=0;u--){d[u]=a[u];long long tail=0;for(int v:edge[u])tail=max(tail,d[v]);d[u]+=tail;}
    long long opt=*max_element(d.begin(),d.end());
    auto check=[&](InStream&stream,TResult failure){
        string token=stream.readToken();vector<int>path;
        for(size_t i=0;i<token.size();){
            if(token[i]<'1'||token[i]>'9')quitf(failure,"invalid path token");
            int value=0;while(i<token.size()&&isdigit((unsigned char)token[i])){value=value*10+token[i++]-'0';if(value>n)quitf(failure,"city out of range");}
            path.push_back(value-1);if(i==token.size())break;if(token[i++]!='-'||i==token.size())quitf(failure,"invalid path separator");
            if(int(path.size())>=n)quitf(failure,"path too long");
        }
        if(path.empty())quitf(failure,"empty path");
        long long reported=stream.readLong(),sum=0;
        if(reported!=opt)quitf(failure,"reported total is not optimal");
        for(int u:path)sum+=a[u];
        for(int i=1;i<int(path.size());i++)if(find(edge[path[i-1]].begin(),edge[path[i-1]].end(),path[i])==edge[path[i-1]].end())quitf(failure,"invalid mine edge");
        if(!edge[path.back()].empty())quitf(failure,"path must continue to a terminal mine");
        if(sum!=opt)quitf(failure,"path total is not optimal");
        if(!stream.seekEof())quitf(failure,"extra output");
    };
    check(ans,_fail);check(ouf,_wa);quitf(_ok,"optimal mine path");
}
