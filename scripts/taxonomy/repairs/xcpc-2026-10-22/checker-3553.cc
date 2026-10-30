#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
int main(int argc,char*argv[]) {
    registerTestlibCmd(argc,argv);
    int n=inf.readInt(1,200000),s=inf.readInt(1,200000);
    vector<int>degree(n);
    long long sum=0;
    for(int&d:degree){d=inf.readInt(0,s);sum+=d;}
    if(sum!=s)quitf(_fail,"card counts do not sum to s");
    vector<int>sorted=degree;
    sort(sorted.begin(),sorted.end(),greater<int>());
    vector<long long>prefix(n+1);
    for(int i=0;i<n;i++)prefix[i+1]=prefix[i]+sorted[i];
    bool possible=s%2==0&&sorted[0]<n;
    // Erdos-Gallai, independent of the Havel-Hakimi reference construction.
    for(int k=1;k<=n&&possible;k++){
        int p=upper_bound(sorted.begin(),sorted.end(),k,greater<int>())-sorted.begin();
        p=max(p,k);
        long long bound=1LL*k*(k-1)+1LL*(p-k)*k+prefix[n]-prefix[p];
        if(prefix[k]>bound)possible=false;
    }
    string verdict=ouf.readToken("Yes|No","verdict");
    if(verdict=="No"){
        if(!ouf.seekEof())quitf(_wa,"extra output after No");
        if(possible)quitf(_wa,"a valid exchange sequence exists");
        quitf(_ok,"exchange is impossible");
    }
    if(!possible)quitf(_wa,"exchange is impossible");
    int count=ouf.readInt(0,s/2,"number of exchanges");
    if(count!=s/2)quitf(_wa,"incorrect exchange count");
    vector<int>actual(n);
    set<pair<int,int>>edges;
    for(int i=0;i<count;i++){
        int a=ouf.readInt(1,n)-1,b=ouf.readInt(1,n)-1;
        if(a==b)quitf(_wa,"self exchange");
        if(!edges.insert(minmax(a,b)).second)quitf(_wa,"repeated exchange pair");
        actual[a]++;actual[b]++;
    }
    if(!ouf.seekEof())quitf(_wa,"extra output");
    if(actual!=degree)quitf(_wa,"not all original cards exchanged");
    quitf(_ok,"valid exchanges");
}
