#include <bits/stdc++.h>
using namespace std;
struct Stu { string name, sex; int age, score; };
int main() {
    int n; cin >> n;
    vector<Stu> v(n);
    for (auto &s : v) cin >> s.name >> s.sex >> s.age >> s.score;
    stable_sort(v.begin(), v.end(), [](const Stu &a, const Stu &b) { return a.score < b.score; });
    for (auto &s : v) cout << s.name << ' ' << s.sex << ' ' << s.age << ' ' << s.score << "\n";
    return 0;
}
