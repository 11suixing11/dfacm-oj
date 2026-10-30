// Solve on monotone intervals independently of the reference's unit scan.
#include "testlib.h"
#include <algorithm>
#include <cmath>
#include <vector>
int main(int argc,char**argv){
    registerTestlibCmd(argc,argv);
    long double a=inf.readDouble(),b=inf.readDouble(),c=inf.readDouble(),d=inf.readDouble();
    long double discriminant=b*b-3*a*c;
    if(a==0||discriminant<=0)quitf(_fail,"Invalid three-root cubic");
    long double p=(-b-sqrtl(discriminant))/(3*a),q=(-b+sqrtl(discriminant))/(3*a);
    if(p>q)std::swap(p,q);
    long double bound=1+std::max({fabsl(b/a),fabsl(c/a),fabsl(d/a)});
    std::vector<long double>cuts={-bound,p,q,bound},expected;
    auto f=[&](long double x){return ((a*x+b)*x+c)*x+d;};
    for(int i=0;i<3;i++){
        long double l=cuts[i],r=cuts[i+1],fl=f(l);
        if(fl*f(r)>=0)quitf(_fail,"Cubic lacks three distinct real roots");
        for(int j=0;j<150;j++){
            long double m=(l+r)/2,fm=f(m);
            if(fm==0){l=r=m;break;}
            if(fm*fl>0)l=m;else r=m;
        }
        expected.push_back((l+r)/2);
    }
    for(int i=0;i<3;i++){
        long double stored=ans.readDouble();
        if(!std::isfinite(stored)||fabsl(stored-expected[i])>0.00500001L)quitf(_fail,"Stored root disagrees with cubic");
        long double got=ouf.readDouble();
        if(!std::isfinite(got)||fabsl(got-expected[i])>0.00500001L)quitf(_wa,"Incorrect root %d",i+1);
    }
    ouf.skipBlanks();if(!ouf.eof())quitf(_wa,"Unexpected trailing output");
    quitf(_ok,"Correct three real roots");
}
