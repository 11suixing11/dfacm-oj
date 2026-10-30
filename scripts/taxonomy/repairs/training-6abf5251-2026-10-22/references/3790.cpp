#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<double>a(n);for(auto&x:a)cin>>x;sort(a.begin(),a.end());double mean=accumulate(a.begin()+1,a.end()-1,0.0)/(n-2),err=max(abs(a[1]-mean),abs(a[n-2]-mean));cout<<fixed<<setprecision(2)<<mean<<" "<<err<<"\n";}
