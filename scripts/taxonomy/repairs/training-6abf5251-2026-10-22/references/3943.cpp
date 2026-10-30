#include <bits/stdc++.h>
using namespace std;
int main(){int cap,n;cin>>cap>>n;vector<long long>d(cap+1);while(n--){int w;long long value;cin>>w>>value;for(int j=w;j<=cap;j++)d[j]=max(d[j],d[j-w]+value);}cout<<"max="<<d[cap]<<"\n";}
