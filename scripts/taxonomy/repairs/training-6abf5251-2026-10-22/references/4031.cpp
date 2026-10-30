#include <bits/stdc++.h>
using namespace std;

struct Parser{
    string s;bool power,ok=true;vector<pair<char,long long>>postfix;
    int prec(char c){if(c=='~')return 4;if(c=='^'&&power)return 3;if(c=='*'||c=='/')return 2;if(c=='+'||c=='-')return 1;return 0;}
    long long run(){
        vector<char>ops;bool expect=true;
        for(size_t i=0;i<s.size();){char c=s[i];
            if(c>='0'&&c<='9'){
                if(!expect){ok=false;return 0;}__int128 v=0;
                while(i<s.size()&&isdigit((unsigned char)s[i])){v=v*10+s[i++]-'0';if(v>LLONG_MAX){ok=false;return 0;}}
                postfix.push_back({'n',(long long)v});expect=false;continue;
            }
            i++;
            if(c=='('){if(!expect){ok=false;return 0;}ops.push_back(c);}
            else if(c==')'){
                if(expect){ok=false;return 0;}while(!ops.empty()&&ops.back()!='('){postfix.push_back({ops.back(),0});ops.pop_back();}
                if(ops.empty()){ok=false;return 0;}ops.pop_back();expect=false;
            }else if(prec(c)){
                if(expect){if(c!='-'){ok=false;return 0;}ops.push_back('~');}
                else{while(!ops.empty()&&ops.back()!='('&&prec(ops.back())>=prec(c)){postfix.push_back({ops.back(),0});ops.pop_back();}ops.push_back(c);expect=true;}
            }else{ok=false;return 0;}
        }
        if(expect){ok=false;return 0;}
        while(!ops.empty()){if(ops.back()=='('){ok=false;return 0;}postfix.push_back({ops.back(),0});ops.pop_back();}
        vector<long long>stack;
        for(auto[c,v]:postfix){
            if(c=='n'){stack.push_back(v);continue;}
            if(c=='~'){if(stack.empty()){ok=false;return 0;}stack.back()=-stack.back();continue;}
            if(stack.size()<2){ok=false;return 0;}long long b=stack.back();stack.pop_back();long long a=stack.back();stack.pop_back();__int128 x=0;
            if(c=='+')x=(__int128)a+b;else if(c=='-')x=(__int128)a-b;else if(c=='*')x=(__int128)a*b;
            else if(c=='/'){if(!b){ok=false;return 0;}x=(__int128)a/b;}
            else{if(b<0||b>INT_MAX){ok=false;return 0;}__int128 base=a;x=1;while(b){if(b&1){x*=base;if(x>LLONG_MAX||x<-LLONG_MAX){ok=false;return 0;}}b>>=1;if(b){base*=base;if(base>LLONG_MAX||base<-LLONG_MAX){ok=false;return 0;}}}}
            if(x>LLONG_MAX||x<-LLONG_MAX){ok=false;return 0;}stack.push_back((long long)x);
        }
        if(stack.size()!=1){ok=false;return 0;}return stack[0];
    }
};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);
string s;cin>>s;Parser p{s,true};long long answer=p.run();if(p.ok)cout<<answer<<"\n";
return 0;
}
