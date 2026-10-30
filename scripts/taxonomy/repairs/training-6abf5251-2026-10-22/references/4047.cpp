#include <bits/stdc++.h>
using namespace std;

struct FastInput{
    char buffer[1<<16];size_t at=0,length=0;
    int get(){if(at==length){length=fread(buffer,1,sizeof(buffer),stdin);at=0;if(!length)return EOF;}return (unsigned char)buffer[at++];}
    int next(){int c=get();while(c!=EOF&&c<=32)c=get();int x=0;while(c!=EOF&&c>32){x=x*10+c-'0';c=get();}return x;}
};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

FastInput in;int days=in.next(),id=0;
using Bill=pair<int,int>;
vector<Bill>lowStorage,highStorage;lowStorage.reserve(days*100);highStorage.reserve(days*100);
priority_queue<Bill,vector<Bill>,greater<Bill>>low(greater<Bill>(),move(lowStorage));
priority_queue<Bill,vector<Bill>>high(less<Bill>(),move(highStorage));
vector<char>paid;paid.reserve(days*100);string output;output.reserve(days*22);
while(days--){
    int m=in.next();while(m--){int value=in.next();low.push({value,id});high.push({value,id});paid.push_back(false);id++;}
    while(paid[low.top().second])low.pop();Bill a=low.top();low.pop();paid[a.second]=true;
    while(paid[high.top().second])high.pop();Bill b=high.top();high.pop();paid[b.second]=true;
    output+=to_string(a.first)+" "+to_string(b.first)+"\n";
}
fwrite(output.data(),1,output.size(),stdout);

return 0;
}
