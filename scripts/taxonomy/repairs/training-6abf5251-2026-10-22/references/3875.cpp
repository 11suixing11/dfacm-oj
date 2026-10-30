#include <bits/stdc++.h>
using namespace std;
string s,a;bool used[6];void dfs(){if(a.size()==s.size()){cout<<a<<"\n";return;}for(int i=0;i<int(s.size());i++)if(!used[i]){used[i]=true;a+=s[i];dfs();a.pop_back();used[i]=false;}}int main(){cin>>s;dfs();}
