#include <bits/stdc++.h>
using namespace std;
int main(){int n,k;string s;cin>>n>>k>>s;vector<vector<unsigned long long>>a(n,vector<unsigned long long>(n)),d(k+2,vector<unsigned long long>(n+1));for(int i=0;i<n;i++)for(int j=i;j<n;j++)a[i][j]=(j==i?0:a[i][j-1])*10+s[j]-'0';d[0][0]=1;for(int count=1;count<=k+1;count++)for(int end=count;end<=n;end++)for(int cut=count-1;cut<end;cut++)d[count][end]=max(d[count][end],d[count-1][cut]*a[cut][end-1]);cout<<d[k+1][n]<<"\n";}
