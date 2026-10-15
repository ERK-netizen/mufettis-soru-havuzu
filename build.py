#!/usr/bin/env python3
"""src/ -> web/index.html (PWA, GitHub Pages) + dist/artifact.html (claude.ai artifact). Kullanım: python3 build.py"""
import os,re,json,datetime
B=os.path.dirname(os.path.abspath(__file__))
rd=lambda p:open(os.path.join(B,'src',p),encoding='utf-8').read()
head,kap,data,app=rd('head.html'),rd('kapsam.html'),rd('data.js'),rd('app.js')
n=len(re.findall(r'^\{b:"',data,re.M))
stamp=datetime.datetime.now().strftime('%d.%m.%Y %H:%M')
body=head.replace('%%KAPSAM%%',kap)
mk=lambda web:'\n<script>\nvar BUILD_INFO='+json.dumps({'tarih':stamp,'soru':n,'web':web},ensure_ascii=False)+';\n'+data+'\n'+app+'\n</script>\n'
os.makedirs(os.path.join(B,'dist'),exist_ok=True)
open(os.path.join(B,'dist','artifact.html'),'w',encoding='utf-8').write(body+mk(False))
pwa_head=('<!doctype html>\n<html lang="tr">\n<meta charset="utf-8">\n'
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
 '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n')
sw=("<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});}</script>\n")
open(os.path.join(B,'web','index.html'),'w',encoding='utf-8').write(pwa_head+body+mk(True)+sw)
print('ok',n,'soru',stamp)
