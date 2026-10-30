#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]) {
    registerTestlibCmd(argc,argv);
    string s=inf.readToken("[a-zA-Z]{1,500}","s");
    int n=s.size(),k=inf.readInt(1,n,"k");
    vector<vector<int>> cost(n,vector<int>(n));
    for(int len=2;len<=n;len++)for(int l=0;l+len<=n;l++){
        int r=l+len-1;cost[l][r]=(s[l]!=s[r])+(len>2?cost[l+1][r-1]:0);
    }
    vector<int> dp(n+1,10000);dp[0]=0;
    int optimum=10000;
    for(int parts=1;parts<=k;parts++){
        vector<int> next(n+1,10000);
        for(int r=parts;r<=n;r++)for(int l=parts-1;l<r;l++)next[r]=min(next[r],dp[l]+cost[l][r-1]);
        optimum=min(optimum,next[n]);dp.swap(next);
        if(!optimum)break;
    }
    int claimed=ouf.readInt(0,n,"number of changed characters");
    string t=ouf.readToken("[a-zA-Z+]{1,1000}","partition");
    if(!ouf.seekEof())quitf(_wa,"extra output");
    string flat;
    int count=0,l=0;
    for(int r=0;r<=(int)t.size();r++)if(r==(int)t.size()||t[r]=='+'){
        if(r==l)quitf(_wa,"empty palindrome");
        for(int i=l,j=r-1;i<j;i++,j--)if(t[i]!=t[j])quitf(_wa,"part is not a palindrome");
        flat+=t.substr(l,r-l);count++;l=r+1;
    }
    if(count>k)quitf(_wa,"too many palindromes");
    if(flat.size()!=s.size())quitf(_wa,"text length changed");
    int actual=0;
    for(int i=0;i<n;i++)actual+=flat[i]!=s[i];
    if(claimed!=actual)quitf(_wa,"claimed edit count differs from actual count");
    if(actual!=optimum)quitf(_wa,"edits %d, optimum %d",actual,optimum);
    quitf(_ok,"optimal palindrome partition");
}
