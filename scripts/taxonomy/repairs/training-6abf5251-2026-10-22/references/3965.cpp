#include <bits/stdc++.h>
using namespace std;
int main(){int cap,n;cin>>cap>>n;vector<long long>d(cap+1);for(int i=0;i<n;i++){int w;long long value;cin>>w>>value;for(int j=cap;j>=w;j--)d[j]=max(d[j],d[j-w]+value);}cout<<d[cap]<<"\n";}
