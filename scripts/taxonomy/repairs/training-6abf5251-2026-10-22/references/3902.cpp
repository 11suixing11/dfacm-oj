#include <bits/stdc++.h>
using namespace std;
int main(){int n;while(cin>>n&&n){long double answer=1e30L;for(int i=0;i<n;i++){long double v;long long t;cin>>v>>t;if(t>=0)answer=min(answer,16200.L/v+t);}cout<<(long long)ceill(answer-1e-12L)<<"\n";}}
