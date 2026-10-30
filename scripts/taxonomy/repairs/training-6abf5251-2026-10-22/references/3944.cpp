#include <bits/stdc++.h>
using namespace std;
int main(){int n,cap;cin>>n>>cap;vector<long long>d(cap+1);while(n--){int w,count;long long value;cin>>w>>value>>count;for(int k=1;count;k*=2){int take=min(k,count);count-=take;int cost=take*w;for(int j=cap;j>=cost;j--)d[j]=max(d[j],d[j-cost]+take*value);}}cout<<d[cap]<<"\n";}
