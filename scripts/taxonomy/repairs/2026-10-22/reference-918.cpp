#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n,m; if(!(cin>>n>>m)) return 0;
    vector<vector<int>> pref(n+1,vector<int>(m+1));
    for(int i=1;i<=n;++i) {
        string s; cin>>s;
        for(int j=1;j<=m;++j) pref[i][j]=pref[i-1][j]+pref[i][j-1]-pref[i-1][j-1]+(s[j-1]=='1');
    }
    int answer=pref[n][m];
    for(int k=2;k<=max(n,m);++k) {
        int cost=0;
        for(int i=0;i<n;i+=k) for(int j=0;j<m;j+=k) {
            int x=min(i+k,n),y=min(j+k,m);
            int ones=pref[x][y]-pref[i][y]-pref[x][j]+pref[i][j];
            cost+=min(ones,k*k-ones);
        }
        answer=min(answer,cost);
    }
    cout<<answer<<'\n';
}
