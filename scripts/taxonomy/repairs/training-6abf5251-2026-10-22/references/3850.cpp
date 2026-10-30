#include <bits/stdc++.h>
using namespace std;
int main(){string a,b;cin>>a>>b;vector<int>c(a.size()+b.size()+1);reverse(a.begin(),a.end());reverse(b.begin(),b.end());for(size_t i=0;i<a.size();i++)for(size_t j=0;j<b.size();j++)c[i+j]+=(a[i]-'0')*(b[j]-'0');for(size_t i=0;i+1<c.size();i++){c[i+1]+=c[i]/10;c[i]%=10;}while(c.size()>1&&c.back()==0)c.pop_back();for(auto it=c.rbegin();it!=c.rend();it++)cout<<*it;cout<<"\n";}
