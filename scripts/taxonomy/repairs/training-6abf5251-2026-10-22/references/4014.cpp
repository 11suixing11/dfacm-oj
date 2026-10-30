#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string pre,inside;cin>>pre>>inside;function<void(int,int,int)>visit=[&](int p,int l,int r){if(l==r)return;int m=inside.find(pre[p]);visit(p+1,l,m);visit(p+1+m-l,m+1,r);cout<<pre[p];};visit(0,0,inside.size());cout<<"\n";

return 0;
}
