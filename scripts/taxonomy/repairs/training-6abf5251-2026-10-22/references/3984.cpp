#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int base;string text;cin>>base>>text;vector<int>a;for(auto it=text.rbegin();it!=text.rend();++it){char c=toupper(*it);a.push_back(isdigit(c)?c-'0':c-'A'+10);}int step=0;while(true){bool palindrome=true;for(size_t i=0;i<a.size();i++)if(a[i]!=a[a.size()-1-i])palindrome=false;if(palindrome){cout<<step<<"\n";break;}if(step==30){cout<<"Impossible\n";break;}vector<int>b(a.rbegin(),a.rend());int carry=0;for(size_t i=0;i<a.size();i++){int sum=a[i]+b[i]+carry;a[i]=sum%base;carry=sum/base;}if(carry)a.push_back(carry);step++;}

return 0;
}
