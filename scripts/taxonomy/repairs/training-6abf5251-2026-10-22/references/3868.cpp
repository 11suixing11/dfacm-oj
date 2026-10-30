#include <bits/stdc++.h>
using namespace std;
int f(int m,int n){if(!m||n==1)return 1;if(n>m)return f(m,m);return f(m,n-1)+f(m-n,n);}int main(){int t;cin>>t;while(t--){int m,n;cin>>m>>n;cout<<f(m,n)<<"\n";}}
