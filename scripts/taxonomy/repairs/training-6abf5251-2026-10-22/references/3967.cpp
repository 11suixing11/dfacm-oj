#include <bits/stdc++.h>
using namespace std;
int main(){int balls,hp,n;cin>>balls>>hp>>n;const int INF=1000000000;vector<vector<int>>d(n+1,vector<int>(balls+1,INF));d[0][0]=0;int processed=0;while(n--){int b,w;cin>>b>>w;processed++;for(int count=processed;count>=1;count--)for(int j=balls;j>=b;j--)d[count][j]=min(d[count][j],d[count-1][j-b]+w);}int count=processed;while(count&&*min_element(d[count].begin(),d[count].end())>=hp)count--;int damage=*min_element(d[count].begin(),d[count].end());cout<<count<<' '<<hp-damage<<"\n";}
