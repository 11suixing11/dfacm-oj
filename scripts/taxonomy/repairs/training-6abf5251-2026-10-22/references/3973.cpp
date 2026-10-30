#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int T;cin>>T;while(T--){string a,b;cin>>a>>b;vector<int>d(b.size()+1);iota(d.begin(),d.end(),0);for(int i=1;i<=(int)a.size();i++){int diagonal=d[0];d[0]=i;for(int j=1;j<=(int)b.size();j++){int old=d[j];d[j]=min({d[j]+1,d[j-1]+1,diagonal+(a[i-1]!=b[j-1])});diagonal=old;}}cout<<d.back()<<"\n";}

return 0;
}
