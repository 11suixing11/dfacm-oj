#include <bits/stdc++.h>
using namespace std;
int main(){string s;while(getline(cin,s)){if(!s.empty()&&s.back()=='\r')s.pop_back();string a(s.size(),' ');vector<int>stack;for(int i=0;i<int(s.size());i++){if(s[i]=='(')stack.push_back(i);if(s[i]==')'){if(stack.empty())a[i]='?';else stack.pop_back();}}for(int i:stack)a[i]='$';cout<<s<<"\n"<<a<<"\n";}}
