#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int l,r,c;
    while(cin>>l>>r>>c && l) {
        vector<vector<string>> grid(l, vector<string>(r));
        vector<int> distance(l*r*c,-1);
        int start=-1,target=-1;
        for(int z=0;z<l;++z) for(int y=0;y<r;++y) {
            cin>>grid[z][y];
            for(int x=0;x<c;++x) {
                if(grid[z][y][x]=='S') start=(z*r+y)*c+x;
                if(grid[z][y][x]=='E') target=(z*r+y)*c+x;
            }
        }
        queue<int> todo; todo.push(start); distance[start]=0;
        const int dz[]={1,-1,0,0,0,0},dy[]={0,0,1,-1,0,0},dx[]={0,0,0,0,1,-1};
        while(!todo.empty()) {
            int u=todo.front(); todo.pop();
            int x=u%c,y=u/c%r,z=u/c/r;
            for(int d=0;d<6;++d) {
                int xx=x+dx[d],yy=y+dy[d],zz=z+dz[d];
                if(xx<0||xx>=c||yy<0||yy>=r||zz<0||zz>=l||grid[zz][yy][xx]=='#') continue;
                int v=(zz*r+yy)*c+xx;
                if(distance[v]<0) { distance[v]=distance[u]+1; todo.push(v); }
            }
        }
        if(distance[target]<0) cout<<"Trapped!\n";
        else cout<<"Escaped in "<<distance[target]<<" minute(s).\n";
    }
}
