#include <bits/stdc++.h>
using namespace std;
int main(){int n,k;cin>>n>>k;vector<long long>a(n);long long high=0;for(auto&x:a){string s;cin>>s;auto j=s.find('.');x=stoll(s.substr(0,j))*100+stoll(s.substr(j+1));high=max(high,x);}long long low=0;while(low<high){long long mid=(low+high+1)/2,count=0;for(auto x:a){count+=x/mid;if(count>=k)break;}if(count>=k)low=mid;else high=mid-1;}cout<<low/100<<'.'<<setw(2)<<setfill('0')<<low%100<<"\n";}
