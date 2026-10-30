#include <bits/stdc++.h>
using namespace std;
int main(){int cap,n;cin>>cap>>n;vector<int>d(cap+1);while(n--){int x;cin>>x;for(int j=cap;j>=x;j--)d[j]=max(d[j],d[j-x]+x);}cout<<cap-d[cap]<<"\n";}
