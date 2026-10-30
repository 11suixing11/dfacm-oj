#include <bits/stdc++.h>
using namespace std;
int main(){string a,b;cin>>a>>b;reverse(a.begin(),a.end());reverse(b.begin(),b.end());int borrow=0;for(size_t i=0;i<a.size();i++){int x=a[i]-'0'-borrow-(i<b.size()?b[i]-'0':0);borrow=x<0;a[i]=char((x+10)%10+'0');}while(a.size()>1&&a.back()=='0')a.pop_back();reverse(a.begin(),a.end());cout<<a<<"\n";}
