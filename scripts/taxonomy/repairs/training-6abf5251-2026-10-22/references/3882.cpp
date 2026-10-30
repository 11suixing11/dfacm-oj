#include <bits/stdc++.h>
using namespace std;
int apple(int m,int n){if(m==0||n==1)return 1;if(n>m)return apple(m,m);return apple(m,n-1)+apple(m-n,n);}int main(){int t,m,n;cin>>t;while(t--){cin>>m>>n;cout<<apple(m,n)<<"\n";}}
