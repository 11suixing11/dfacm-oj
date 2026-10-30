#include <bits/stdc++.h>
using namespace std;
int main(){string a,b,s;cin>>a>>b;int carry=0;reverse(a.begin(),a.end());reverse(b.begin(),b.end());for(size_t i=0;i<max(a.size(),b.size())||carry;i++){int x=carry+(i<a.size()?a[i]-'0':0)+(i<b.size()?b[i]-'0':0);s+=char(x%10+'0');carry=x/10;}while(s.size()>1&&s.back()=='0')s.pop_back();reverse(s.begin(),s.end());cout<<s<<"\n";}
