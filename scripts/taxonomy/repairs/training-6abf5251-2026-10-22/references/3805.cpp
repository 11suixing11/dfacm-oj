#include <bits/stdc++.h>
using namespace std;
int main(){string s;getline(cin,s);cout<<count_if(s.begin(),s.end(),[](char c){return c>='0'&&c<='9';})<<"\n";}
