#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(1,200);vector<long long>a(n);vector<int>d(n,1);
    for(auto&x:a)x=inf.readLong();
    for(int i=0;i<n;i++)for(int j=0;j<i;j++)if(a[j]<=a[i])d[i]=max(d[i],d[j]+1);
    int opt=*max_element(d.begin(),d.end());string header="max="+to_string(opt);
    auto check=[&](InStream&stream,TResult failure){
        if(stream.readToken()!=header)quitf(failure,"first token must be %s",header.c_str());
        int ptr=0;long long previous=LLONG_MIN;
        for(int i=0;i<opt;i++){
            long long x=stream.readLong();
            if(x<previous)quitf(failure,"subsequence decreases");
            while(ptr<n&&a[ptr]!=x)ptr++;
            if(ptr==n)quitf(failure,"not a subsequence of input");
            ptr++;previous=x;
        }
        if(!stream.seekEof())quitf(failure,"extra output");
    };
    check(ans,_fail);check(ouf,_wa);quitf(_ok,"optimal legal subsequence");
}
