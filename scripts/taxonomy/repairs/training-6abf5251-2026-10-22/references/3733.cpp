#include <bits/stdc++.h>
using namespace std;
int main(){long long a,b;char c;cin>>a>>b>>c;switch(c){case '+':cout<<a+b;break;case '-':cout<<a-b;break;case '*':cout<<a*b;break;case '/':if(!b)cout<<"Divided by zero!";else cout<<a/b;break;default:cout<<"Invalid operator!";}cout<<"\n";}
