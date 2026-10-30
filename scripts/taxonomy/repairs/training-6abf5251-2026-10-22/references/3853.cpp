#include <bits/stdc++.h>
using namespace std;
int main(){int n,x;cin>>n;vector<int>a;while(n--){cin>>x;if(x%2)a.push_back(x);}sort(a.begin(),a.end());for(size_t i=0;i<a.size();i++)cout<<(i?",":"")<<a[i];cout<<"\n";}
