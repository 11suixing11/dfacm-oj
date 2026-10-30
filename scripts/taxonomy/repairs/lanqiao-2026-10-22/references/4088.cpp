#include <bits/stdc++.h>
using namespace std;
struct Car { long long v; int c,l,r; };
struct State { long long value; int id; };
int main() {
    ios::sync_with_stdio(false);cin.tie(nullptr);
    int n;cin>>n;vector<Car> a(n);vector<int> previous(n,-1);
    map<pair<int,int>,State> dp;long long best=0;int last=-1;
    for(int i=0;i<n;i++){
        auto &x=a[i];cin>>x.v>>x.c>>x.l>>x.r;
        int total=x.l+x.c+x.r;State state={0,-1};
        if(x.l){auto it=dp.find({total,x.l});if(it==dp.end())continue;state=it->second;}
        previous[i]=state.id;State next={state.value+x.v,i};
        auto key=make_pair(total,x.l+x.c);
        auto it=dp.find(key);
        if(it==dp.end()||it->second.value<next.value)dp[key]=next;
        if(x.r==0&&next.value>best)best=next.value,last=i;
    }
    vector<int> answer;for(int i=last;i>=0;i=previous[i])answer.push_back(i+1);
    reverse(answer.begin(),answer.end());cout<<answer.size()<<'\n';
    for(size_t i=0;i<answer.size();i++)cout<<answer[i]<<(i+1==answer.size()?'\n':' ');
    if(answer.empty())cout<<'\n';
}
