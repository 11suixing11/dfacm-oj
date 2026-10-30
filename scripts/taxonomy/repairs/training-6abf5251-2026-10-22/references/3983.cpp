#include <bits/stdc++.h>
using namespace std;

string trim(string s){size_t i=s.find_first_not_of('0');return i==string::npos?"0":s.substr(i);}
bool ge(const string&a,const string&b){return a.size()!=b.size()?a.size()>b.size():a>=b;}
string subtract(string a,const string&b){int carry=0;for(int i=a.size()-1,j=b.size()-1;i>=0;i--,j--){int x=a[i]-'0'-carry-(j>=0?b[j]-'0':0);carry=x<0;if(carry)x+=10;a[i]='0'+x;}return trim(a);}

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string a,b;cin>>a>>b;a=trim(a);b=trim(b);string quotient,remainder="0";for(char ch:a){remainder=trim(remainder+ch);int digit=0;while(ge(remainder,b)){remainder=subtract(remainder,b);digit++;}quotient+='0'+digit;}cout<<trim(quotient)<<"\n"<<remainder<<"\n";

return 0;
}
