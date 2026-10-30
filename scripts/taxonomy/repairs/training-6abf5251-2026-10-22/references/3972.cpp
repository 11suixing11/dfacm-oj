#include <bits/stdc++.h>
using namespace std;
int lcs(string a,string b){vector<int>d(b.size()+1);for(char x:a){int old=0;for(int j=1;j<=int(b.size());j++){int keep=d[j];d[j]=x==b[j-1]?old+1:max(d[j],d[j-1]);old=keep;}}return d.back();}int main(){string a,b;while(cin>>a>>b)cout<<lcs(a,b)<<"\n";}
