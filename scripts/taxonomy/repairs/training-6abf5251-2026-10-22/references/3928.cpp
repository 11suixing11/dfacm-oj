#include <bits/stdc++.h>
using namespace std;
int main(){int s,e;cin>>s>>e;if(s>=e){cout<<s-e<<"\n";return 0;}int bound=2*e+2;vector<int>d(bound+1,-1);queue<int>q;q.push(s);d[s]=0;while(d[e]<0){int x=q.front();q.pop();for(int y:{x-1,x+1,x*2})if(y>=0&&y<=bound&&d[y]<0){d[y]=d[x]+1;q.push(y);}}cout<<d[e]<<"\n";}
