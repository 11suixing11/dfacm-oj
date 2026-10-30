#include <bits/stdc++.h>
using namespace std;
int main(){int n;long long x;cin>>n>>x;long long a=1,b=2*x;for(int i=2;i<=n;i++){auto c=2*x*b-2*(i-1)*a;a=b;b=c;}cout<<(n?b:a)<<".00\n";}
