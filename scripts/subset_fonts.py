# -*- coding: utf-8 -*-
"""Subset the display (ZCOOL QingKe HuangYou) and mono (JetBrains Mono) fonts
to only the glyphs actually used by landing/index.html + landing/reg.html.

Usage: python scripts/subset_fonts.py <zcool.ttf> <jbmono.ttf> <landing_dir>
Requires: pip install fonttools brotli
"""
import subprocess, sys, os

def main():
    zcool, jbmono, landing = sys.argv[1], sys.argv[2], sys.argv[3]
    html = ''
    for name in ('index.html', 'reg.html'):
        p = os.path.join(landing, name)
        if os.path.exists(p):
            html += open(p, encoding='utf-8').read()
    chars = set(html)
    cjk = ''.join(sorted(c for c in chars if ord(c) > 0x7F))
    ascii_buf = ''.join(chr(c) for c in range(0x20, 0x7F))
    extra = '·—…「」『』、。，！？：；（）✓✗◆×≈'
    glyphs = os.path.join(os.path.dirname(landing), 'glyphs.txt')
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
