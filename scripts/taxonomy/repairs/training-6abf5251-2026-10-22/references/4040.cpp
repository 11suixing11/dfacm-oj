#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;string s;cin>>n>>s;function<char(int,int)>visit=[&](int l,int r){char type;if(r-l==1)type=s[l]=='0'?'B':'I';else{int m=(l+r)/2;char a=visit(l,m),b=visit(m,r);type=a==b?a:'F';}cout<<type;return type;};visit(0,s.size());cout<<"\n";

return 0;
}
