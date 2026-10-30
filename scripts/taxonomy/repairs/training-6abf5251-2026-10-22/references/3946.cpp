#include <bits/stdc++.h>
using namespace std;
int main(){int oxygen,nitrogen,n;cin>>oxygen>>nitrogen>>n;const int INF=1000000000;vector<vector<int>>d(oxygen+1,vector<int>(nitrogen+1,INF));d[0][0]=0;while(n--){int a,b,w;cin>>a>>b>>w;for(int i=oxygen;i>=0;i--)for(int j=nitrogen;j>=0;j--)d[i][j]=min(d[i][j],d[max(0,i-a)][max(0,j-b)]+w);}cout<<d[oxygen][nitrogen]<<"\n";}
