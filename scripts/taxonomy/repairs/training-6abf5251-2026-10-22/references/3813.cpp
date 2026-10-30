#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;reverse(s.begin(),s.end());for(char c:s)if(c>='a'&&c<='z')cout<<char((c-'a'+3)%26+'A');else cout<<char((c-'A'+3)%26+'a');cout<<"\n";}
