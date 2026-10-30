#include <bits/stdc++.h>
using namespace std;
int r,c,best=0,total;vector<string>a;void dfs(int x,int y,unsigned mask,int depth){best=max(best,depth);if(best==total)return;for(auto [dx,dy]:vector<pair<int,int>>{{1,0},{-1,0},{0,1},{0,-1}}){int i=x+dx,j=y+dy;if(i<0||i>=r||j<0||j>=c)continue;unsigned bit=1u<<(a[i][j]-'A');if(!(mask&bit))dfs(i,j,mask|bit,depth+1);if(best==total)return;}}int main(){cin>>r>>c;a.resize(r);unsigned all=0;for(auto&s:a){cin>>s;for(char ch:s)all|=1u<<(ch-'A');}total=__builtin_popcount(all);dfs(0,0,1u<<(a[0][0]-'A'),1);cout<<best<<"\n";}
