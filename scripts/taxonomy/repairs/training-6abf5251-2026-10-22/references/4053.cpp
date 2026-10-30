#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,start;cin>>n>>start;const long long INF=LLONG_MAX/4;vector<vector<long long>>d(n,vector<long long>(n,INF));for(int i=0;i<n;i++)for(int j=0;j<n;j++){string s;cin>>s;if(s!="-")d[i][j]=stoll(s);}for(int k=0;k<n;k++)for(int i=0;i<n;i++)if(d[i][k]!=INF)for(int j=0;j<n;j++)if(d[k][j]!=INF)d[i][j]=min(d[i][j],d[i][k]+d[k][j]);for(int i=0;i<n;i++)if(i!=start-1){cout<<"("<<start<<" -> "<<i+1<<") = ";if(d[start-1][i]==INF)cout<<"INF\n";else cout<<d[start-1][i]<<"\n";}

return 0;
}
