#include <bits/stdc++.h>
using namespace std;
int main(){string a,b;getline(cin,a);getline(cin,b);if(!a.empty()&&a.back()=='\r')a.pop_back();if(!b.empty()&&b.back()=='\r')b.pop_back();vector<int>d(b.size()+1);iota(d.begin(),d.end(),0);for(int i=1;i<=int(a.size());i++){int old=d[0];d[0]=i;for(int j=1;j<=int(b.size());j++){int keep=d[j];d[j]=min({d[j]+1,d[j-1]+1,old+(a[i-1]!=b[j-1])});old=keep;}}cout<<d.back()<<"\n";}
