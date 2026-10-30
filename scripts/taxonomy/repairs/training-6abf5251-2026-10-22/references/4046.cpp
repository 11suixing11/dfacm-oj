#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;priority_queue<pair<long long,string>>q;while(n--){string op;cin>>op;if(op=="push"){string name;long long p;cin>>name>>p;q.push({p,name});}else if(q.empty())cout<<"none\n";else{auto[p,name]=q.top();q.pop();cout<<name<<" "<<p<<"\n";}}

return 0;
}
