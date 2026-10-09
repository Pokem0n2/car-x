#!/usr/bin/env python3
# assemble-v17k.py — v1.7.6: 兜底主循环版
import re, sys
sys.path.insert(0, '/tmp/e3d-test')

base = open('/tmp/base-slim2.html', encoding='utf-8').read()

# CSS minify
i = base.find('<style>'); j = base.find('</style>')
css = re.sub(r'\s+', ' ', base[i + 7:j])
css = css.replace(': ', ':').replace('; ', ';').replace('{ ', '{').replace(' }', '}')
base = base[:i + 7] + css + base[j:]

# 版本 stamp
base = re.sub(r'car-x v1\.[0-9.]+', 'car-x v1.7.8', base)

# LZMA worker 解码器 minified
old_dec = re.findall(r'<script[^>]*>(var e=function\(\)\{"use strict".*?this\.LZMA=this\.LZMA_WORKER=e;)</script>', base, re.S)
assert old_dec, 'decoder block not found'
decm = open('/tmp/dec-min.js').read()
base = base.replace(old_dec[0] + '</script>', decm + '</script>', 1)

# 载荷
p = open('/tmp/payload-1025.txt', 'rb').read().decode('ascii')
def rep_payload(html, pid, text):
    pat = re.compile(r'(<script type="text/plain" id="' + pid + r'">)[\s\S]*?(</script>)')
    assert pat.search(html), pid
    return pat.sub(lambda m: m.group(1) + text + m.group(2), html, count=1)
base = rep_payload(base, 'p-app', p)

# boot
BOOT = open('/tmp/boot-v17d.txt').read()
i = base.rfind('<script>')
j = base.find('</script>', i) + len('</script>')
base = base[:i] + BOOT + base[j:]

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/car-x-v176.html'
open(out, 'w', encoding='utf-8').write(base)
import os
print(f'assembled: {os.path.getsize(out):,}B  payload {len(p):,} chars')
