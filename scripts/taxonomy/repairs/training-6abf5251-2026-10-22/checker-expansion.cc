// Bisect the geometric sagitta independently of the reference's angle search.
#include "testlib.h"
#include <cmath>
int main(int argc,char**argv){
    registerTestlibCmd(argc,argv);
    long double L=inf.readDouble(),n=inf.readDouble(),C=inf.readDouble(),delta=n*C;
    if(L<0||n<0||C<0||delta>0.50000000001L)quitf(_fail,"Invalid rod input");
    long double expected=0;
    if(L>0&&delta>0){
        long double l=0,r=L/2;
        for(int i=0;i<150;i++){
            long double h=(l+r)/2,t=2*h/L;
            // arc/chord = atan(t)*(1+t*t)/t; subtract one stably near zero.
            long double excess=t<0.001L?2*t*t/3-2*powl(t,4)/15+2*powl(t,6)/35:atanl(t)*(1+t*t)/t-1;
            if(excess<delta)l=h;else r=h;
        }
        expected=(l+r)/2;
    }
    long double stored=ans.readDouble();
    if(!std::isfinite(stored)||fabsl(stored-expected)>0.00050001L)quitf(_fail,"Stored sagitta disagrees with rod geometry");
    long double got=ouf.readDouble();ouf.skipBlanks();if(!ouf.eof())quitf(_wa,"Unexpected trailing output");
    if(!std::isfinite(got)||fabsl(got-expected)>0.00050001L)quitf(_wa,"Incorrect rod displacement");
    quitf(_ok,"Correct rod displacement");
}
