#include <bits/stdc++.h>
using namespace std;
int limit;
int main() {
    ios::sync_with_stdio(false);cin.tie(nullptr);
    int n;cin>>n>>limit;vector<string> words(n);for(auto &s:words)cin>>s;
    sort(words.begin(),words.end());
    function<vector<long long>(int,int,int)> solve=[&](int left,int right,int depth){
        int common=words[left].size();
        for(int i=left+1;i<right;i++){
            common=min(common,(int)words[i].size());int j=depth;while(j<common&&words[i][j]==words[left][j])j++;common=j;
        }
        int endings=0;while(left+endings<right&&(int)words[left+endings].size()==common)endings++;
        vector<long long> best(min(limit,endings)+1,0);
        for(int l=left+endings;l<right;){
            int r=l+1;while(r<right&&words[r][common]==words[l][common])r++;
            auto next=solve(l,r,common);int old=best.size()-1;
            vector<long long> merged(min(limit,old+(int)next.size()-1)+1,LLONG_MIN/4);
            for(int i=0;i<=old;i++)for(int j=0;j<(int)next.size()&&i+j<=limit;j++)merged[i+j]=max(merged[i+j],best[i]+next[j]);
            best.swap(merged);l=r;
        }
        for(int k=0;k<(int)best.size();k++)best[k]+=1LL*(common-depth)*k*(k-1)/2;
        return best;
    };
    cout<<solve(0,n,0)[limit]<<'\n';
}
