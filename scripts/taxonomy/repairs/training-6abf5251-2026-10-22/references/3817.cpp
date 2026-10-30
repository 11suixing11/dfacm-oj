#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;for(string suffix:{"er","ly","ing"})if(s.size()>suffix.size()&&s.compare(s.size()-suffix.size(),suffix.size(),suffix)==0){s.resize(s.size()-suffix.size());break;}cout<<s<<"\n";}
