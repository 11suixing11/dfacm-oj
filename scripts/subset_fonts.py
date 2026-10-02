# -*- coding: utf-8 -*-
"""Subset the display (ZCOOL QingKe HuangYou) and mono (JetBrains Mono) fonts
to only the glyphs actually used by landing/index.html + plugin-swpu-regcode/reg.html.

Usage: python scripts/subset_fonts.py <zcool.ttf> <jbmono.ttf> <landing_dir>
Requires: pip install fonttools brotli
"""
import subprocess, sys, os

def main():
    if len(sys.argv) != 4:
        print('Usage: python scripts/subset_fonts.py <zcool.ttf> <jbmono.ttf> <landing_dir>')
        raise SystemExit(1)
    zcool, jbmono, landing = sys.argv[1], sys.argv[2], sys.argv[3]
    repo_root = os.path.dirname(os.path.abspath(landing))
    sources = (
        os.path.join(landing, 'index.html'),
        os.path.join(repo_root, 'plugin-swpu-regcode', 'reg.html'),
    )
    html = ''
    for p in sources:
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                html += f.read()
    chars = set(html)
    cjk = ''.join(sorted(c for c in chars if ord(c) > 0x7F))
    ascii_buf = ''.join(chr(c) for c in range(0x20, 0x7F))
    extra = '·—…「」『』、。，！？：；（）✓✗◆×≈'
    glyphs = os.path.join(repo_root, 'glyphs.txt')
    open(glyphs, 'w', encoding='utf-8').write(cjk + ascii_buf + extra)
    print(f'display glyphs: {len(cjk)} CJK + ascii')
    subprocess.run([sys.executable, '-m', 'fontTools.subset', zcool,
        f'--text-file={glyphs}', '--flavor=woff2', '--layout-features=*',
        f'--output-file={os.path.join(landing, "swpu-display.woff2")}'], check=True)
    unicodes = 'U+0020-007E,U+00A0-00FF,U+2013-2014,U+2026,U+00B7,U+2212,U+00D7,U+2248,U+2713,U+2717,U+25C6,U+2192,U+2191'
    subprocess.run([sys.executable, '-m', 'fontTools.subset', jbmono,
        f'--unicodes={unicodes}', '--flavor=woff2', '--layout-features=*',
        f'--output-file={os.path.join(landing, "swpu-mono.woff2")}'], check=True)
    print('done: swpu-display.woff2 + swpu-mono.woff2')

if __name__ == '__main__':
    main()
