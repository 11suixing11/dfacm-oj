#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<int>q(n);int high=0;for(int&x:q){cin>>x;high=max(high,x);}vector<int>a(high+1);if(high)a[1]=1;for(int i=2;i<=high;i++)a[i]=(2*a[i-1]+a[i-2])%32767;for(int x:q)cout<<a[x]<<"\n";}
