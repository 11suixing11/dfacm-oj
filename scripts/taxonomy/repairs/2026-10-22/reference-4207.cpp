#include <bits/stdc++.h>
using namespace std;
int main() {
    const int faces[6][4]={{1,2,3,4},{9,10,11,12},{1,5,8,9},{2,7,8,10},{3,6,7,11},{4,5,6,12}};
    int t; cin>>t;
    while(t--) {
        int n; cin>>n; bool cut[13]={};
        while(n--) { int x; cin>>x; cut[x]=true; }
        int parent[6]; iota(parent,parent+6,0);
        auto find=[&](int u) { while(parent[u]!=u) u=parent[u]; return u; };
        for(int a=0;a<6;++a) for(int b=a+1;b<6;++b)
            for(int x:faces[a]) for(int y:faces[b]) if(x==y&&!cut[x]) parent[find(a)]=find(b);
        bool split=false;
        for(int i=1;i<6;++i) if(find(i)!=find(0)) split=true;
        cout<<(split?"Yes":"No")<<'\n';
    }
}
