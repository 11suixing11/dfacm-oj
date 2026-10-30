#include <bits/stdc++.h>
using namespace std;
int main() {
    int n,m; cin>>n>>m; vector<vector<int>> a(n,vector<int>(m));
    for(auto& row:a) for(auto& x:row) cin>>x;
    for(int i=0;i<n;++i) {
        for(int j=0;j<m;++j) { int x; cin>>x; if(j) cout<<' '; cout<<a[i][j]+x; }
        cout<<'\n';
    }
}
