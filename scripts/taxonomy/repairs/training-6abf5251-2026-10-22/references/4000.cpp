#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int m;cin>>m;int n=1<<m;vector<vector<int>>a(n,vector<int>(n));a[0][0]=1;for(int width=1;width<n;width*=2)for(int i=0;i<width;i++)for(int j=0;j<width;j++){a[i][j+width]=a[i][j]+width;a[i+width][j]=a[i][j]+width;a[i+width][j+width]=a[i][j];}for(auto&row:a){for(int j=0;j<n;j++)cout<<(j?" ":"")<<row[j];cout<<"\n";}

return 0;
}
