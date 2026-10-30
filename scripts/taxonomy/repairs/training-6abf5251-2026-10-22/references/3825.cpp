#include <bits/stdc++.h>
using namespace std;
int main(){string s;getline(cin,s);s.pop_back();istringstream in(s);string w,best;while(in>>w)if(w.size()>best.size())best=w;cout<<best<<"\n";}
