#include <bits/stdc++.h>
using namespace std;
long long count2(long long n){long long ans=0;for(long long f=1;f<=n;f*=10){long long high=n/f/10,cur=n/f%10,low=n%f;ans+=high*f+(cur>2?f:cur==2?low+1:0);if(f>n/10)break;}return ans;}
int main(){long long l,r;cin>>l>>r;cout<<count2(r)-count2(l-1)<<"\n";}
