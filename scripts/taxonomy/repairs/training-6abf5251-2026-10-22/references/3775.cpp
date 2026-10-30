#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;const int limit=110000;vector<bool> composite(limit+1);for(int i=2,c=0;i<=limit;i++){if(!composite[i]){if(++c==n){cout<<i<<"\n";return 0;}if(1LL*i*i<=limit)for(int j=i*i;j<=limit;j+=i)composite[j]=true;}}}
