#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);cin.tie(nullptr);
    int n;cin>>n;vector<vector<int>> g(n);
    for(int i=1;i<n;i++){int u,v;cin>>u>>v;--u;--v;g[u].push_back(v);g[v].push_back(u);}
    vector<long long> x(n),y(n),sx(n),sy(n);long long tx=0,ty=0;
    for(int i=0;i<n;i++){cin>>x[i]>>y[i];tx+=x[i];ty+=y[i];sx[i]=x[i];sy[i]=y[i];}
    vector<int> parent(n,-1),order{0},size(n,1);parent[0]=0;
    for(size_t i=0;i<order.size();i++)for(int v:g[order[i]])if(v!=parent[order[i]])parent[v]=order[i],order.push_back(v);
    for(int i=n-1;i>0;i--){int u=order[i],p=parent[u];sx[p]+=sx[u];sy[p]+=sy[u];size[p]+=size[u];}
    long double numerator=0;
    for(int i=0;i<n;i++){
        long double mass=0;
        for(int v:g[i]){
            bool child=parent[v]==i;
            long long cx=child?sx[v]:tx-sx[i];
            int count=child?size[v]:n-size[i];
            mass+=(long double)cx*count;
        }
        numerator+=(long double)y[i]*mass;
    }
    // Rooting at the entrance, E[arrival at t] = n - subtree_size(t).
    cout<<fixed<<setprecision(15)<<numerator/(long double)tx/(long double)ty<<'\n';
}
