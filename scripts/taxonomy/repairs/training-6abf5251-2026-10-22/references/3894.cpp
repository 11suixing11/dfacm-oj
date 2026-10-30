#include <bits/stdc++.h>
using namespace std;
bool win(long long a,long long b){if(a>b)swap(a,b);if(b%a==0||b/a>=2)return true;return !win(b%a,a);}int main(){long long a,b;while(cin>>a>>b&&(a||b))cout<<(win(a,b)?"win":"lose")<<"\n";}
