#include <bits/stdc++.h>
using namespace std;
int main(){int n;long long a[31]={1,1};for(int i=2;i<=30;i++)a[i]=a[i-1]+a[i-2];while(cin>>n)cout<<a[n]<<"\n";}
