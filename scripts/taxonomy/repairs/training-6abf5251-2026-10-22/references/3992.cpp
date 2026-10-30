#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,r;cin>>n>>r;vector<int>path;function<void(int)>dfs=[&](int next){if((int)path.size()==r){for(int x:path)cout<<setw(3)<<x;cout<<"\n";return;}int remaining=r-path.size();for(int x=next;x<=n-remaining+1;x++){path.push_back(x);dfs(x+1);path.pop_back();}};dfs(1);

return 0;
}
