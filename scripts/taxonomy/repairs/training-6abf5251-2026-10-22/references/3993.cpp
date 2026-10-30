#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<int>path;function<void(int,int)>dfs=[&](int remaining,int minimum){if(!remaining){if(path.size()>1){cout<<n<<"=";for(size_t i=0;i<path.size();i++)cout<<(i?"+":"")<<path[i];cout<<"\n";}return;}for(int x=minimum;x<=remaining;x++){path.push_back(x);dfs(remaining-x,x);path.pop_back();}};dfs(n,1);

return 0;
}
