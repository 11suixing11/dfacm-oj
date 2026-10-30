#include <bits/stdc++.h>
using namespace std;

struct Big {
    static const unsigned B=1000000000;
    vector<unsigned> a;
    Big(unsigned x=0){if(x)a.push_back(x);}
    Big operator+(const Big&b)const{Big c;unsigned long long carry=0;for(size_t i=0;i<max(a.size(),b.a.size())||carry;i++){unsigned long long v=carry+(i<a.size()?a[i]:0ULL)+(i<b.a.size()?b.a[i]:0ULL);c.a.push_back(v%B);carry=v/B;}return c;}
    Big times(unsigned k)const{Big c;unsigned long long carry=0;for(size_t i=0;i<a.size()||carry;i++){unsigned long long v=carry+(i<a.size()?(unsigned long long)a[i]*k:0ULL);c.a.push_back(v%B);carry=v/B;}while(!c.a.empty()&&!c.a.back())c.a.pop_back();return c;}
    string str()const{if(a.empty())return "0";ostringstream s;s<<a.back();for(int i=(int)a.size()-2;i>=0;i--)s<<setw(9)<<setfill('0')<<a[i];return s.str();}
};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,k;cin>>n>>k;vector<vector<Big>>d(n+1,vector<Big>(k+1));d[0][0]=Big(1);for(int i=1;i<=n;i++)for(int j=1;j<=min(i,k);j++)d[i][j]=d[i-1][j-1]+d[i-1][j].times(j);cout<<d[n][k].str()<<"\n";

return 0;
}
