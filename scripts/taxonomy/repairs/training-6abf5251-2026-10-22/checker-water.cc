#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);int n=inf.readInt(1,1000);vector<long long>a(n);for(auto&x:a)x=inf.readLong(0LL,(long long)INT_MAX);
    vector<long long>sorted=a;sort(sorted.begin(),sorted.end());long long optimal=0;for(int i=0;i<n;i++)optimal+=sorted[i]*(n-i-1);
    auto check=[&](InStream&s,TResult failure){
        vector<bool>seen(n);long long wait=0;
        for(int i=0;i<n;i++){int id=s.readInt(1,n)-1;if(seen[id])quitf(failure,"duplicate participant");seen[id]=true;wait+=a[id]*(n-i-1);}
        string token=s.readToken();
        size_t at=0;
        if(at<token.size()&&(token[at]=='+'||token[at]=='-'))at++;
        size_t first=at;
        while(at<token.size()&&token[at]>='0'&&token[at]<='9')at++;
        bool valid=at>first;
        if(at<token.size()&&token[at]=='.'){
            first=++at;
            while(at<token.size()&&token[at]>='0'&&token[at]<='9')at++;
            valid=valid&&at>first;
        }
        if(!valid||at!=token.size())quitf(failure,"invalid decimal waiting time");
        char*end=nullptr;long double mean=strtold(token.c_str(),&end);
        if(!isfinite(mean)||*end||wait!=optimal||fabsl(mean-(long double)optimal/n)>0.00500001L)quitf(failure,"not an optimal queue or wrong average waiting time");
        if(!s.seekEof())quitf(failure,"extra output");
    };check(ans,_fail);check(ouf,_wa);quitf(_ok,"optimal queue and average wait");
}
