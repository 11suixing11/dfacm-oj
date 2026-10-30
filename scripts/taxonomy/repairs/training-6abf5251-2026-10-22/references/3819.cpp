#include <bits/stdc++.h>
using namespace std;
int main(){string s;getline(cin,s);replace(s.begin(),s.end(),',',' ');istringstream in(s);string w,big,small;while(in>>w){if(big.empty()||w.size()>big.size())big=w;if(small.empty()||w.size()<small.size())small=w;}cout<<big<<"\n"<<small<<"\n";}
