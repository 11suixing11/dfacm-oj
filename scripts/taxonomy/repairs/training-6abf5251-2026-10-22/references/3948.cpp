#include <bits/stdc++.h>
using namespace std;
struct Big{vector<unsigned>a;Big(unsigned v=0){if(v)a.push_back(v);}Big&operator+=(const Big&b){a.resize(max(a.size(),b.a.size()));unsigned long long carry=0;for(size_t i=0;i<a.size();i++){unsigned long long value=a[i]+carry+(i<b.a.size()?b.a[i]:0);a[i]=value%1000000000;carry=value/1000000000;}if(carry)a.push_back(carry);return *this;}friend ostream&operator<<(ostream&o,const Big&b){if(b.a.empty())return o<<0;o<<b.a.back();for(int i=int(b.a.size())-2;i>=0;i--)o<<setw(9)<<setfill('0')<<b.a[i];return o;}};
int main(){int n,target;cin>>n>>target;vector<Big>d(target+1);d[0]=Big(1);while(n--){int coin;cin>>coin;for(int j=coin;j<=target;j++)d[j]+=d[j-coin];}cout<<d[target]<<"\n";}
