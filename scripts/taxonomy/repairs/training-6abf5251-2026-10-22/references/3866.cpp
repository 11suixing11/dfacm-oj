#include <bits/stdc++.h>
using namespace std;
int main(){long long a[71]={1,1,2};for(int i=3;i<=70;i++)a[i]=a[i-1]+a[i-2]+a[i-3];int n;while(cin>>n&&n)cout<<a[n]<<"\n";}
