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

int x,y,z;cin>>x>>y>>z;vector<Big>adult(z+2),egg(z+2);adult[0]=Big(1);for(int month=0;month<=z;month++){if(month){adult[month]=adult[month-1];if(month>=2)adult[month]=adult[month]+egg[month-2];}if(month>=x)egg[month]=adult[month-x].times(y);}cout<<adult[z].str()<<"\n";

return 0;
}
