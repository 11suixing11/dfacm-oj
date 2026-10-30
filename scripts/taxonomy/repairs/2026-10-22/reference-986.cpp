#include <bits/stdc++.h>
using namespace std;
struct Node { int child[2]={0,0}; int count=0; };
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int q; if(!(cin>>q)) return 0;
    vector<Node> nodes(1);
    nodes.reserve(28*q+1);
    while(q--) {
        int op,p; cin>>op>>p;
        if(op==1 || op==2) {
            int at=0,delta=op==1?1:-1; nodes[at].count+=delta;
            for(int bit=26;bit>=0;--bit) {
                int b=(p>>bit)&1;
                if(!nodes[at].child[b]) { nodes[at].child[b]=nodes.size(); nodes.emplace_back(); }
                at=nodes[at].child[b]; nodes[at].count+=delta;
            }
        } else {
            int limit,at=0,result=0; cin>>limit;
            for(int bit=26;bit>=0;--bit) {
                int b=(p>>bit)&1;
                if((limit>>bit)&1) {
                    int same=nodes[at].child[b];
                    if(same) result+=nodes[same].count;
                    at=nodes[at].child[b^1];
                } else at=nodes[at].child[b];
                if(!at) break;
            }
            cout<<result<<'\n';
        }
    }
}
