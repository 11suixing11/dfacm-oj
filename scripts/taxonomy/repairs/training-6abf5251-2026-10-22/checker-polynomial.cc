// Closed-form oracle independent of the reference program's term accumulation.
#include "testlib.h"
#include <cmath>
long double power(long double x,int n){long double r=1;while(n){if(n&1)r*=x;x*=x;n>>=1;}return r;}
bool close(long double a,long double b){long double error=fabsl(a-b);return std::isfinite(a)&&(error<=0.00500001L||error<=fabsl(b)*1e-8L);}
int main(int argc,char** argv){registerTestlibCmd(argc,argv);long double x=inf.readDouble();int n=inf.readInt(1,1000000);
    long double expected=x==1?n+1:x>0&&fabsl(x-1)<0.01L?expm1l((n+1)*log1pl(x-1))/(x-1):(power(x,n+1)-1)/(x-1);
    if(!std::isfinite(expected))quitf(_fail,"Invalid polynomial input");
    long double stored=ans.readDouble();if(!close(stored,expected))quitf(_fail,"Stored answer disagrees with independent polynomial");
    long double got=ouf.readDouble();ouf.skipBlanks();if(!ouf.eof())quitf(_wa,"Unexpected trailing output");
    if(!close(got,expected))quitf(_wa,"Incorrect polynomial value");quitf(_ok,"Correct polynomial value");}
