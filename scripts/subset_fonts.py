# -*- coding: utf-8 -*-
"""Subset the display (ZCOOL QingKe HuangYou) and mono (JetBrains Mono) fonts.

- swpu-display.woff2: only the glyphs actually used by landing/index.html +
  plugin-swpu-regcode/reg.html (display font is landing/reg only).
- swpu-mono.woff2: theme/00-brand.css applies it as the site-wide code font
  (pre/code), so its subset must serve OJ problem-statement code blocks, not
  just the landing page. Coverage: printable ASCII, Latin-1, general
  punctuation, arrows, math operators, control pictures, box drawing,
  geometric shapes. CJK is deliberately excluded (too large) and falls back
  to the system font via the CSS font stack.

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
    # 覆盖: ASCII + Latin-1 + 广义标点(弯引号/破折号) + 箭头(含 Hydro「显示制表符」⇥)
    # + 数学运算符(≤≥≠∑∫) + 控制图形(Hydro「显示换行」␍␊) + 制表框线 + 几何图形 + ✓✗
    # 字体自身缺失的字形会被 fontTools 静默跳过,无妨
    unicodes = ('U+0020-007E,U+00A0-00FF,U+2000-206F,U+2190-21FF,U+2200-22FF,'
                'U+2400-243F,U+2500-257F,U+25A0-25FF,U+2713,U+2717')
    subprocess.run([sys.executable, '-m', 'fontTools.subset', jbmono,
        f'--unicodes={unicodes}', '--flavor=woff2', '--layout-features=*',
        f'--output-file={os.path.join(landing, "swpu-mono.woff2")}'], check=True)
    print('done: swpu-display.woff2 + swpu-mono.woff2')

if __name__ == '__main__':
    main()
