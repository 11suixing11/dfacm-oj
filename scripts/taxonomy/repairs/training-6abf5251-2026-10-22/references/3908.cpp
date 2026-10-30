#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;priority_queue<long long,vector<long long>,greater<long long>>q;for(int i=0;i<min(n,m);i++)q.push(0);long long answer=0;for(int i=0;i<n;i++){long long x;cin>>x;long long end=q.top()+x;q.pop();q.push(end);answer=max(answer,end);}cout<<answer<<"\n";}
