#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<tuple<int,int,int>>a;for(int id=1;id<=n;id++){int c,m,e;cin>>c>>m>>e;a.emplace_back(-(c+m+e),-c,id);}sort(a.begin(),a.end());for(int i=0;i<5;i++)cout<<get<2>(a[i])<<" "<<-get<0>(a[i])<<"\n";}
