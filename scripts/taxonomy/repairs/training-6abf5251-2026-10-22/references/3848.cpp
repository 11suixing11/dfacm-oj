#include <bits/stdc++.h>
using namespace std;

using Big=vector<long long>;
const long long BASE=1000000000;
void mul(Big&a,int k){long long c=0;for(auto&x:a){c+=x*k;x=c%BASE;c/=BASE;}while(c){a.push_back(c%BASE);c/=BASE;}}
void add(Big&a,const Big&b){a.resize(max(a.size(),b.size()),0);long long c=0;for(size_t i=0;i<a.size();i++){c+=a[i]+(i<b.size()?b[i]:0);a[i]=c%BASE;c/=BASE;}if(c)a.push_back(c);}
void print(const Big&a){cout<<a.back();for(int i=int(a.size())-2;i>=0;i--)cout<<setw(9)<<setfill('0')<<a[i];cout<<"\n";}
int main(){int n;cin>>n;Big a{1};for(int i=2;i<=n;i++)mul(a,i);print(a);}
