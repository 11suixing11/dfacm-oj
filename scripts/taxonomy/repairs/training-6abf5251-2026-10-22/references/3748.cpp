#include <bits/stdc++.h>
using namespace std;
int main(){int n;long long a,b,c,d;cin>>n>>a>>b;while(--n){cin>>c>>d;long long diff=20*(d*a-b*c),base=a*c;cout<<(diff>base?"better":diff<-base?"worse":"same")<<"\n";}}
