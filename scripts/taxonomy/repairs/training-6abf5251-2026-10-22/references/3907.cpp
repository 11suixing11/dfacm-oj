#include <bits/stdc++.h>
using namespace std;
int main(){int t;cin>>t;while(t--){int n;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;sort(a.begin(),a.end());long long total=0;while(n>3){total+=min(a[0]+2*a[1]+a[n-1],2*a[0]+a[n-2]+a[n-1]);n-=2;}if(n==3)total+=a[0]+a[1]+a[2];else if(n==2)total+=a[1];else if(n==1)total+=a[0];cout<<total<<"\n";}}
