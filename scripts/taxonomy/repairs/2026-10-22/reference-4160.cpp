#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    const string s((istreambuf_iterator<char>(cin)), {});
    size_t i = 0;
    char quote = 0;
    while (i < s.size()) {
        const char c = s[i];
        if (quote) {
            cout << c;
            ++i;
            if (c == '\\' && i < s.size()) cout << s[i++];
            else if (c == quote) quote = 0;
        } else if (c == '\'' || c == '"') {
            quote = c;
            cout << s[i++];
        } else if (s.compare(i, 2, "//") == 0) {
            i = s.find('\n', i + 2);
            if (i == string::npos) break;
        } else if (s.compare(i, 2, "/*") == 0) {
            const auto end = s.find("*/", i + 2);
            if (end == string::npos) return 1;
            i = end + 2;
        } else cout << s[i++];
    }
}
