#include <bits/stdc++.h>
using namespace std;
int main(){int n,cap;cin>>n>>cap;vector<long long>d(cap+1);while(n--){int w;long long value;cin>>w>>value;for(int j=cap;j>=w;j--)d[j]=max(d[j],d[j-w]+value);}cout<<d[cap]<<"\n";}
