#include <bits/stdc++.h>
using namespace std;
int main(){int n,best=-1,score;string name,ans;cin>>n;while(n--){cin>>score>>name;if(score>best){best=score;ans=name;}}cout<<ans<<"\n";}
