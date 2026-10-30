#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;long long p=1,q=2;double s=0;while(n--){s+=double(q)/p;long long next=p+q;p=q;q=next;}cout<<fixed<<setprecision(4)<<s<<"\n";}
