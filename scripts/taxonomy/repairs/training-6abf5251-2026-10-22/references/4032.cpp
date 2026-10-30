#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<int>stack;int next=1;bool ok=true;for(int i=0;i<n;i++){int x;cin>>x;while(next<=n&&(stack.empty()||stack.back()!=x))stack.push_back(next++);if(stack.empty()||stack.back()!=x)ok=false;else stack.pop_back();}cout<<(ok?"YES":"NO")<<"\n";

return 0;
}
