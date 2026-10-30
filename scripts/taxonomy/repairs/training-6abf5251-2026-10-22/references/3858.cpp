#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<double>a,b;while(n--){string sex;double h;cin>>sex>>h;(sex=="male"?a:b).push_back(h);}sort(a.begin(),a.end());sort(b.rbegin(),b.rend());a.insert(a.end(),b.begin(),b.end());for(size_t i=0;i<a.size();i++)cout<<(i?" ":"")<<fixed<<setprecision(2)<<a[i];cout<<"\n";}
