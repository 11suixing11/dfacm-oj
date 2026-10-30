#include <bits/stdc++.h>
using namespace std;
int n,k;vector<string>a;int dfs(int row,int mask,int count){if(count==k)return 1;if(n-row<k-count)return 0;int ans=dfs(row+1,mask,count);for(int j=0;j<n;j++)if(a[row][j]=='#'&&!(mask&(1<<j)))ans+=dfs(row+1,mask|(1<<j),count+1);return ans;}int main(){while(cin>>n>>k&&n!=-1){a.resize(n);for(auto&s:a)cin>>s;cout<<dfs(0,0,0)<<"\n";}}
