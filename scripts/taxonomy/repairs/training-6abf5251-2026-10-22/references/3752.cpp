#include <bits/stdc++.h>
using namespace std;
int main(){int n,s,d,run=0,best=0;cin>>n;while(n--){cin>>s>>d;run=90<=s&&s<=140&&60<=d&&d<=90?run+1:0;best=max(best,run);}cout<<best<<"\n";}
