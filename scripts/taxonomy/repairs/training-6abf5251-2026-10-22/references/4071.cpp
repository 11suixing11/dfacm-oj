#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<string>words(n);array<bool,26>present{};for(string&s:words){cin>>s;for(char c:s)present[c-'a']=true;}string target;cin>>target;for(char c:target)present[c-'a']=true;bool g[26][26]={};int degree[26]={};for(int i=0;i+1<n;i++){size_t k=0;while(k<words[i].size()&&k<words[i+1].size()&&words[i][k]==words[i+1][k])k++;if(k==min(words[i].size(),words[i+1].size())){if(words[i].size()>words[i+1].size()){cout<<"0\n";return 0;}}else{int a=words[i][k]-'a',b=words[i+1][k]-'a';if(!g[a][b]){g[a][b]=true;degree[b]++;}}}vector<int>order;while(order.size()<count(present.begin(),present.end(),true)){int u=-1,candidates=0;for(int i=0;i<26;i++)if(present[i]&&degree[i]==0){u=i;candidates++;}if(candidates!=1){cout<<"0\n";return 0;}degree[u]=-1;order.push_back(u);for(int v=0;v<26;v++)if(g[u][v])degree[v]--;}char map[26]={};for(size_t i=0;i<order.size();i++)map[order[i]]='a'+i;for(char c:target)cout<<map[c-'a'];cout<<"\n";

return 0;
}
