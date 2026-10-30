#include <bits/stdc++.h>
using namespace std;
int main(){int cash=0,saved=0;for(int month=1;month<=12;month++){int budget;cin>>budget;cash+=300-budget;if(cash<0){cout<<-month<<"\n";return 0;}saved+=cash/100*100;cash%=100;}cout<<cash+saved*6/5<<"\n";}
