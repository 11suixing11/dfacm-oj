#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,target;cin>>n>>target;vector<int>a(n+1),l(n+1),r(n+1);for(int i=1;i<=n;i++)cin>>a[i]>>l[i]>>r[i];int count=0,answer=0;function<void(int)>visit=[&](int u){if(!u)return;visit(l[u]);count++;if(!answer&&a[u]==target)answer=count;visit(r[u]);};visit(1);cout<<answer<<"\n";

return 0;
}
