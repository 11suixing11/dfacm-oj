#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]){
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(1,500);vector<int>a(n);for(int&x:a)x=inf.readInt();
    int m=inf.readInt(1,500);vector<int>b(m);for(int&x:b)x=inf.readInt();
    vector<int>d(m);for(int x:a){int best=0;for(int j=0;j<m;j++){if(b[j]<x)best=max(best,d[j]);else if(b[j]==x)d[j]=max(d[j],best+1);}}
    int optimal=*max_element(d.begin(),d.end());
    auto check=[&](InStream&s,TResult failure){
        int length=s.readInt(0,min(n,m));if(length!=optimal)quitf(failure,"length is not optimal");
        vector<int>sequence(length);for(int&x:sequence)x=s.readInt();
        for(int i=1;i<length;i++)if(sequence[i]<=sequence[i-1])quitf(failure,"sequence must strictly increase");
        for(const auto&source:{a,b}){int position=0;for(int x:sequence){while(position<(int)source.size()&&source[position]!=x)position++;if(position==(int)source.size())quitf(failure,"not a common subsequence");position++;}}
        if(!s.seekEof())quitf(failure,"extra output");
    };
    check(ans,_fail);check(ouf,_wa);quitf(_ok,"optimal increasing common subsequence");
}
