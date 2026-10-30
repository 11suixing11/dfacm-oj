#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string a,b;cin>>a>>b;vector<int>d(a.size()+b.size()+1);for(int i=0;i<(int)a.size();i++)for(int j=0;j<(int)b.size();j++)d[i+j]+=(a[a.size()-1-i]-'0')*(b[b.size()-1-j]-'0');for(size_t i=0;i+1<d.size();i++){d[i+1]+=d[i]/10;d[i]%=10;}while(d.size()>1&&!d.back())d.pop_back();for(int i=d.size()-1;i>=0;i--)cout<<d[i];cout<<"\n";

return 0;
}
