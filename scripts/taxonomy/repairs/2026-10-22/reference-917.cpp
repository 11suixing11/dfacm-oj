#include <bits/stdc++.h>
using namespace std;
using ll = long long;
struct SegmentTree {
    int n;
    vector<ll> mn, lazy;
    SegmentTree(const vector<ll>& values) : n(values.size()), mn(4*n), lazy(4*n) { build(1,0,n-1,values); }
    void build(int p,int l,int r,const vector<ll>& a) {
        if(l==r) { mn[p]=a[l]; return; }
        int m=(l+r)/2;
        build(2*p,l,m,a); build(2*p+1,m+1,r,a);
        mn[p]=min(mn[2*p],mn[2*p+1]);
    }
    void apply(int p,ll x) { mn[p]+=x; lazy[p]+=x; }
    void push(int p) { if(lazy[p]) { apply(2*p,lazy[p]); apply(2*p+1,lazy[p]); lazy[p]=0; } }
    void add(int p,int l,int r,int a,int b,ll x) {
        if(a<=l && r<=b) { apply(p,x); return; }
        push(p); int m=(l+r)/2;
        if(a<=m) add(2*p,l,m,a,b,x);
        if(b>m) add(2*p+1,m+1,r,a,b,x);
        mn[p]=min(mn[2*p],mn[2*p+1]);
    }
    void add(int a,int b,ll x) { add(1,0,n-1,a,b,x); }
    ll query(int p,int l,int r,int a,int b) {
        if(a<=l && r<=b) return mn[p];
        push(p); int m=(l+r)/2; ll ret=LLONG_MAX/4;
        if(a<=m) ret=min(ret,query(2*p,l,m,a,b));
        if(b>m) ret=min(ret,query(2*p+1,m+1,r,a,b));
        return ret;
    }
    ll query(int a,int b) { return query(1,0,n-1,a,b); }
};
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n,q; if(!(cin>>n>>q)) return 0;
    vector<vector<pair<int,ll>>> tree(n);
    vector<int> from(2*n-2),to(2*n-2),tin(n),tout(n),order;
    vector<ll> weight(2*n-2),dist(n),back(n);
    for(int i=0;i<2*n-2;++i) {
        cin>>from[i]>>to[i]>>weight[i]; --from[i]; --to[i];
        if(i<n-1) tree[from[i]].push_back({to[i],weight[i]});
        else back[from[i]]=weight[i];
    }
    vector<pair<int,bool>> stack{{0,false}};
    while(!stack.empty()) {
        auto [u,exit]=stack.back(); stack.pop_back();
        if(exit) { tout[u]=order.size()-1; continue; }
        tin[u]=order.size(); order.push_back(u); stack.push_back({u,true});
        for(auto it=tree[u].rbegin();it!=tree[u].rend();++it) {
            dist[it->first]=dist[u]+it->second; stack.push_back({it->first,false});
        }
    }
    vector<ll> a(n),b(n);
    for(int i=0;i<n;++i) { a[tin[i]]=dist[i]; b[tin[i]]=dist[i]+(i?back[i]:0); }
    SegmentTree distance(a),returnCost(b);
    while(q--) {
        int type,u; ll v; cin>>type>>u>>v;
        if(type==1) {
            --u; ll delta=v-weight[u]; weight[u]=v;
            if(u<n-1) { int child=to[u]; distance.add(tin[child],tout[child],delta); returnCost.add(tin[child],tout[child],delta); }
            else returnCost.add(tin[from[u]],tin[from[u]],delta);
        } else {
            --u; int target=int(v)-1;
            ll du=distance.query(tin[u],tin[u]),dv=distance.query(tin[target],tin[target]);
            if(tin[u]<=tin[target] && tin[target]<=tout[u]) cout<<dv-du<<'\n';
            else cout<<returnCost.query(tin[u],tout[u])-du+dv<<'\n';
        }
    }
}
