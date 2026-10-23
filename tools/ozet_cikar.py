#!/usr/bin/env python3
"""Soru havuzundaki her sorunun dayanak maddesini (d alanı) resmî mevzuat metninden BİREBİR çıkarır
ve src/ozet.js dosyasını üretir (yanlış cevapta gösterilen "Konu özeti" paneli).

Kullanım:  python3 tools/ozet_cikar.py <metin_dizini>
  <metin_dizini>: mevzuat PDF'lerinin pdftotext çıktıları (DOC_FILES tablosundaki dosya adı önekleriyle).
Çıktı: src/ozet.js  ->  var OZET={m:{...}, r:{...}, g:{...}};
  m: "belge#madde" -> {t: başlık, p: [fıkra/paragraf metinleri]}   (yalnız atıf yapılan maddeler)
  r: "konu|d" -> [[belge, madde, fıkra/bent ölçütü], ...]
  g: "konu|d etiketi" -> kavram notu (rehber konuları: aynı etikete bağlı sorulardaki açıklamalar + varsa rehberden birebir bölüm)
Metin hiçbir yerde yeniden yazılmaz; yalnızca resmî metinden kesilip gösterilir (değişiklik künyeleri çıkarılır).
"""
import re, sys, os, json, glob, collections

B = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TXT = sys.argv[1] if len(sys.argv) > 1 else '.'

# belge anahtarı -> (dosya öneki, görünen ad)
DOC_FILES = {
 'k657':   ('p657', '657 sayılı DMK'),
 'kAy':    ('af356a53', 'Anayasa'),
 'k5378':  ('3f7e3ab4', '5378 sayılı Engelliler Hakkında Kanun'),
 'k5442':  ('ac954f63', '5442 sayılı İl İdaresi Kanunu'),
 'k2577':  ('cd813294', '2577 sayılı İYUK'),
 'kCBK':   ('9e01a0bf', '1 sayılı CBK (MEB bölümü)'),
 'k1739':  ('414a442c', '1739 sayılı Millî Eğitim Temel Kanunu'),
 'k222':   ('1d6abd41', '222 sayılı İlköğretim ve Eğitim Kanunu'),
 'k5580':  ('cca38a49', '5580 sayılı Özel Öğretim Kurumları Kanunu'),
 'k573':   ('97b6955d', '573 sayılı Özel Eğitim KHK'),
 'k2133':  ('2c33f992', '2133 sayılı Kanun'),
 'k3423':  ('4b88be9b', '3423 sayılı Kanun'),
 'k7528':  ('1f578db6', '7528 sayılı Öğretmenlik Mesleği Kanunu'),
 'k2886':  ('03fe5813', '2886 sayılı Devlet İhale Kanunu'),
 'k3628':  ('51f7288a', '3628 sayılı Kanun'),
 'k4483':  ('85385535', '4483 sayılı Kanun'),
 'k4734':  ('d2f8f62b', '4734 sayılı Kamu İhale Kanunu'),
 'k4735':  ('a52a4d6f', '4735 sayılı Kamu İhale Sözleşmeleri Kanunu'),
 'k5018':  ('d126de81', '5018 sayılı Kanun'),
 'yDMDY':  ('c795c234', 'Devlet Memurları Disiplin Yönetmeliği'),
 'yTesvik':('b0a1c656', 'Üretimi Teşvik Primi Yönetmeliği'),
 'yDSIY':  ('fe4992aa', 'Döner Sermaye İşletmeleri Yönetmeliği'),
 'yKAKAY': ('689f8853', 'Kurum Açma, Kapatma ve Ad Verme Yönetmeliği'),
 'yMEMY':  ('7865f8d9', 'Millî Eğitim Müdürlükleri Yönetmeliği'),
 'yOOIK':  ('717e5690', 'Okul Öncesi Eğitim ve İlköğretim Kurumları Yönetmeliği'),
 'yOAB':   ('0d5570a2', 'Okul-Aile Birliği Yönetmeliği'),
 'yOKY':   ('pOkY', 'Ortaöğretim Kurumları Yönetmeliği'),
 'yRPDHY': ('4f703de5', 'Rehberlik ve Psikolojik Danışma Hizmetleri Yönetmeliği'),
 'ySEY':   ('40a82a5f', 'Sosyal Etkinlikler Yönetmeliği'),
 'yTYEEY': ('4d1b46d2', 'Taşıma Yoluyla Eğitime Erişim Yönetmeliği'),
 'yTKY':   ('0263de38', 'Teftiş Kurulu Yönetmeliği'),
 'yEKYGY': ('252a4971', 'Eğitim Kurumları Yönetici Görevlendirme Yönetmeliği'),
 'yODY':   ('4202913a', 'Ölçme ve Değerlendirme Yönetmeliği'),
 'yOEHY':  ('ebbc5291', 'Özel Eğitim Hizmetleri Yönetmeliği'),
 'yTMY':   ('6bdbc508', 'Taşınır Mal Yönetmeliği'),
}

# d alanındaki önek -> belge
PREFIXES = [
 (r'^5378', 'k5378'), (r'^657', 'k657'), (r'^5442', 'k5442'), (r'^Anayasa', 'kAy'),
 (r'^DMDY', 'yDMDY'), (r'^2577|^İYUK', 'k2577'), (r'^1 s(ayılı|\.) CBK', 'kCBK'),
 (r'^1739', 'k1739'), (r'^222', 'k222'), (r'^5580', 'k5580'), (r'^573', 'k573'),
 (r'^2133', 'k2133'), (r'^3423', 'k3423'), (r'^Teşvik', 'yTesvik'), (r'^DSİY', 'yDSIY'),
 (r'^KAKAY', 'yKAKAY'), (r'^MEMY', 'yMEMY'), (r'^OÖİKY', 'yOOIK'),
 (r'^OAB Yön|^Okul-Aile Birliği Yön', 'yOAB'), (r'^OKY', 'yOKY'), (r'^RPDHY', 'yRPDHY'),
 (r'^SEY', 'ySEY'), (r'^TYEEY', 'yTYEEY'), (r'^TKY', 'yTKY'), (r'^EKYGY', 'yEKYGY'),
 (r'^ÖDY', 'yODY'), (r'^ÖEHY', 'yOEHY'), (r'^7528', 'k7528'), (r'^2886', 'k2886'),
 (r'^3628', 'k3628'), (r'^4483', 'k4483'), (r'^4734', 'k4734'), (r'^4735', 'k4735'),
 (r'^5018', 'k5018'), (r'^TMY|^Taşınır Mal Yön', 'yTMY'),
]

ANNOT = re.compile(r'\((?:Değişik|Ek|İptal|Mülga|Yeniden düzenleme|Değiştirilerek|Ek fıkra|Ek cümle|Değişik cümle|Değişik fıkra|Ek bent|Değişik bent|İptal fıkra|Teselsül|Düzeltme|Yürürlükten kaldırılan|Ek paragraf|Değişik paragraf|Ek ibare|Değişik ibare|Ek bölüm|Ek başlık|Değişik başlık|İptal ibare|Ek madde|Değişik madde|Değişik alt bent|Ek alt bent|Ek:|Değişik:)[^()]*(?:\([^()]*\)[^()]*)*\)\s*', re.S)
ANNOT_LINE = re.compile(r'^\((?:Mülga|İptal)[^)]*\)\s*$')
HEAD = re.compile(r'^\s*((?:GEÇİCİ|Geçici|EK|Ek)\s+)?(MADDE|Madde)\s+(\d+)\s*[-–—]\s*(.*)$')
SKIP = re.compile(r'^(\d{1,3}|\d+\s*/\s*\d+|Sayfa \d+.*|T\.C\. Resmî Gazete.*|www\..*|https?://.*|.*Mevzuat Bilgi Sistemi.*|.*Resmî Gazete.*Sayı.*\d+\s*)$')

FOOTNOTE = re.compile(r'^\d{1,3}\s+(?:Bu\s+(?:fıkra|bent|madde|tablo|cetvel|ibare|cümle|bölüm|başlık|kısım)\b|\d{1,2}/\d{1,2}/\d{4}\s+tarihli|Bu\s+\S+\s+.*(?:ibaresi|değiştirilmiştir|eklenmiştir|yürürlükten|iptal)|[“"][^”"]{3,60}[”"]\s+ibaresi)')

def norm(s):
    return re.sub(r'\s+', ' ', s).strip()

def strip_annot(t):
    t = re.sub(r'\((?:Mülga|İptal)[^()]*(?:\([^()]*\)[^()]*)*\)', '(Mülga)', t)
    t = ANNOT.sub('', t)
    t = re.sub(r'\s*\((?:İptal|Değişik|Ek|Yeniden)[^()]*$', '', t)   # kapanmamış künye kalıntısı
    t = re.sub(r'\(…\)\s*\d*', '', t)       # iptal edilen ibare işaretleri
    t = re.sub(r'(?<=[\.\;\:\)”"’])\d{1,3}(?=\s|$)', '', t)      # bitişik dipnot rakamı: "olabilir.107"
    t = re.sub(r'(?<=[\.\;\:”"’])\s+\d{1,3}$', '', t)              # paragraf sonundaki dipnot rakamı
    return norm(t)

def parse_doc(path):
    lines = open(path, encoding='utf-8', errors='ignore').read().split('\n')
    arts = {}   # anahtar -> {t, raw:[satırlar]}
    cur = None; prev = ''
    fn = False
    for ln in lines:
        s = ln.rstrip()
        if fn:                      # dipnot devam satırları: nokta ile biten satıra kadar
            if re.search(r'[\.\)]\s*$', s): fn = False
            continue
        if FOOTNOTE.match(s):
            fn = not re.search(r'[\.\)]\s*$', s); continue
        m = HEAD.match(s)
        if m and (m.group(1) is None or True):
            pre = (m.group(1) or '').strip().replace('İ', 'i').lower()
            num = m.group(3)
            key = ('g' if pre.startswith('geçici') else 'e' if pre.startswith('ek') else '') + num
            # başlık: bir önceki kısa satır
            cap = prev.strip()
            cap = cap if (cap and 3 <= len(cap) < 90 and re.search(r'[A-Za-zÇĞİÖŞÜçğıöşü]{3}', cap) and not cap.endswith(('.', ';', ',')) and not HEAD.match(cap)) else ''
            if cur is not None:
                # önceki maddenin sonuna taşan başlık/bölüm satırlarını ayıkla
                while len(cur['raw']) > cur.get('keep', 0):
                    last = cur['raw'][-1].strip()
                    if not last: cur['raw'].pop(); continue
                    if (len(last) < 70 and not last.endswith(('.', ';', ',')) and not BENT.match(last) and not FIK.match(last)) \
                       or re.search(r'(BÖLÜM|KISIM|AYIRIM)\b', last):
                        cur['raw'].pop()
                    else: break
            cur = {'t': cap.rstrip(':'), 'raw': [m.group(4)] if m.group(4) else [], 'keep': 1 if m.group(4) else 0}
            if key not in arts:
                arts[key] = cur
            else:
                arts[key + '_dup'] = cur   # ilk görülen asıl madde; sonrakiler (değişiklik cetvelleri) atılır
            prev = s
            continue
        if cur is not None:
            if SKIP.match(s.strip()):
                prev = s; continue
            cur['raw'].append(s)
        if s.strip():
            prev = s
    # tekrarlarda uzun olanı seç
    for k in [k for k in arts if k.endswith('_dup')]:
        del arts[k]
    return arts

BENT = re.compile(r'^[a-zçğıöşüA-ZÇĞİÖŞÜ]\)(\s|$)')
FIK = re.compile(r'^\((\d+)\)\s*')
def paragraphs(raw):
    """Satır listesini fıkra/paragraflara ayırır."""
    blocks = []
    for s in raw:
        s = s.strip()
        if not s: continue
        if not blocks: blocks.append(s); continue
        startsNew = bool(re.match(r'^[A-ZÇĞİÖŞÜ]\s-\s', s)) or bool(FIK.match(s)) or bool(BENT.match(s)) or bool(re.match(r'^\d+\)\s', s)) or bool(re.match(r'^\([a-zçğıöşü]\)\s', s))
        if not startsNew:
            last = blocks[-1]
            if re.search(r'[\.\:]\s*$', last) and re.match(r'^[A-ZÇĞİÖŞÜ\(]', s) and not BENT.match(last) :
                # eski kanun biçimi: yeni fıkra
                startsNew = True
        if startsNew: blocks.append(s)
        else: blocks[-1] += ' ' + s
    return blocks

def clean_art(a):
    ps = paragraphs(a['raw'])
    out = []
    for p in ps:
        p = strip_annot(p)
        if not p or ANNOT_LINE.match(p): continue
        # PDF'deki değişiklik açıklama notları ("13/2/2011 tarihli ve 6111 sayılı Kanunun 117 nci maddesiyle, ... ibaresi ...") metin değildir
        if re.match(r'^(\d{1,2}/\d{1,2}/\d{4}|\d{4})\s+tarihli\s+ve\s+\d+\s+sayılı', p) and re.search(r'(maddesiyle|maddesi ile|ibaresi|fıkrası|bendi)', p) and re.search(r'(değiştirilmiş|eklenmiş|yürürlükten|olarak|ibaresi)', p) and not re.search(r'\bBu (Kanun|Yönetmelik)\b', p[:60]):
            continue
        out.append(p)
    return {'t': a['t'], 'p': out}

# --- d alanı ayrıştırma ---
def parse_d(d):
    """-> [(docKey, madde, ölçüt)] ; çözülemeyen -> []"""
    doc = None
    for rx, k in PREFIXES:
        if re.match(rx, d): doc = k; break
    if not doc: return []
    i = d.find('md.')
    if i < 0: return []
    rest = d[i:]
    items = []
    # "geçici md.3" / "Ek md.2" / "md.geçici 4" / "md.Ek 2" / "md.Ek md.1/3"
    pre = d[:i].lower()
    kind0 = 'g' if re.search(r'geçici\s*$', pre) else 'e' if re.search(r'\bek\s*$', pre) else ''
    for part in re.split(r',', rest):
        part = part.strip()
        part = re.sub(r'^md\.\s*', '', part)
        kind = kind0
        mk = re.match(r'^(geçici|ek)\s*(?:md\.\s*)?(.*)$', part, flags=re.I)
        if mk:
            kind = 'g' if mk.group(1).lower().startswith('geçici') else 'e'
            part = mk.group(2)
        part = re.sub(r'\s*\(.*?\)\s*', '', part).strip()
        if not part: continue
        m = re.match(r'^(\d+)-(\d+)$', part)
        if m and 0 < int(m.group(2)) - int(m.group(1)) <= 3:
            for n in range(int(m.group(1)), int(m.group(2)) + 1): items.append((doc, kind + str(n), ''))
            continue
        m = re.match(r'^(\d+)/([^\s]+?)-(\d+)/([^\s]+)$', part)   # 3/a-4/A
        if m:
            items.append((doc, kind + m.group(1), m.group(2))); items.append((doc, kind + m.group(3), m.group(4))); continue
        m = re.match(r'^(\d+)(?:/(\S+))?$', part)
        if m:
            items.append((doc, kind + m.group(1), m.group(2) or '')); continue
        m = re.match(r'^(\d+)\s*[;.]?\s*(.*)$', part)
        if m: items.append((doc, kind + m.group(1), ''))
    # sonraki öğeler aynı belgeden (bare numbers) — doc zaten aynı
    return items

def pick(art, spec):
    """Madde içinden gösterilecek parçayı seçer -> (metin listesi)"""
    ps = art['p']
    if not spec: return ps
    # sayısal fıkra (+ bent)
    m = re.match(r'^(\d+)(?:-([a-zçğıöşüA-ZÇĞİÖŞÜ]|\d+))?$', spec)
    if m:
        n = int(m.group(1))
        sel = [p for p in ps if FIK.match(p) and int(FIK.match(p).group(1)) == n]
        if sel:
            # numaralı fıkra + devamındaki bent satırları
            idx = ps.index(sel[0]); chunk = [ps[idx]]
            j = idx + 1
            while j < len(ps) and not FIK.match(ps[j]) and (BENT.match(ps[j]) or re.match(r'^\d+\)\s', ps[j])): chunk.append(ps[j]); j += 1
            if m.group(2) and not m.group(2).isdigit():
                bl = m.group(2)
                hit = [c for c in chunk if re.match('^' + re.escape(bl) + r'\)\s', c)]
                if hit and sum(map(len, chunk)) > 1400: return [chunk[0]] + hit
            return chunk
        if not any(FIK.match(p) for p in ps):   # numarasız eski biçim: n. üst düzey paragraf ve ona bağlı bentler
            chunks = []
            for p in ps:
                if BENT.match(p) or re.match(r'^\d+\)\s', p) or not chunks: 
                    if chunks: chunks[-1].append(p)
                    else: chunks.append([p])
                else: chunks.append([p])
            if 1 <= n <= len(chunks): return chunks[n - 1]
        return ps
    # harf (bent) ya da büyük harf-küçük harf (657/125 gibi)
    m = re.match(r'^([A-ZÇĞİÖŞÜ])(?:-([a-zçğıöşü]))?$', spec)
    if m:
        up, lo = m.group(1), m.group(2)
        H = r'(\)|\s*-\s)'
        for i, p in enumerate(ps):
            if re.match('^' + up + H, p):
                chunk = [p]; j = i + 1
                while j < len(ps) and not re.match(r'^[A-ZÇĞİÖŞÜ]' + H, ps[j]): chunk.append(ps[j]); j += 1
                if lo:
                    hit = [c for c in chunk if re.match('^' + lo + r'\)\s', c)]
                    if hit: return [chunk[0]] + hit
                return chunk
        return ps
    m = re.match(r'^([a-zçğıöşü])(?:[/-].*)?$', spec)
    if m:
        bl = m.group(1)
        for i, p in enumerate(ps):
            if re.match('^' + bl + r'\)\s', p):
                head = ps[0] if not BENT.match(ps[0]) else ''
                j = i + 1; chunk = [p]
                while j < len(ps) and not BENT.match(ps[j]) and not FIK.match(ps[j]): chunk.append(ps[j]); j += 1
                return ([head] if head else []) + chunk
    return ps

ALIAS = {'k5378': {'g312': 'g3'}}   # kaynak PDF'te "Geçici Madde 3" + dipnot 12 birleşik çıkıyor

def unit_blocks(path):
    """Öğrenme Psikolojisi rehberi: ünite sonu 'Kritik bilgiler' ve 'Sık yapılan yanlışlar' (birebir)."""
    L = open(path, encoding='utf-8', errors='ignore').read().split('\n')
    out = {}
    idx = [(i, int(re.match(r'^Ünite (\d+) — Kritik sınav bilgileri', l).group(1))) for i, l in enumerate(L) if re.match(r'^Ünite (\d+) — Kritik sınav bilgileri', l)]
    for i, n in idx:
        sec = None; K = []; Y = []
        for l in L[i + 1:i + 60]:
            t = l.strip()
            if t == 'Kritik bilgiler': sec = K; continue
            if t == 'Sık yapılan yanlışlar': sec = Y; continue
            if not t or t == '•': continue
            if re.match(r'^(2\. Ayrıntılı|Ünite \d+:|\d+ / \d+)', t) or t.endswith('EMY Sınav Rehberi'): break
            if sec is not None: sec.append(t)
        # satır kırıklarını birleştir: cümle noktayla biter
        def join(ls):
            res = []
            for t in ls:
                if res and not re.search(r'[\.\?\!:"”]$', res[-1]): res[-1] += ' ' + t
                else: res.append(t)
            return res
        out[n] = {'k': join(K), 'y': join(Y)}
    return out

def main():
    d = open(os.path.join(B, 'src', 'data.js'), encoding='utf-8').read()
    qs = re.findall(r'^\{b:"(\w)",k:"((?:[^"\\]|\\.)*)",q:"(?:[^"\\]|\\.)*",o:\[.*?\],a:\d,e:"((?:[^"\\]|\\.)*)",d:"((?:[^"\\]|\\.)*)",s:"(\w+)"', d, re.M)
    unesc = lambda x: x.replace('\\"', '"').replace('\\\\', '\\')
    docs = {}
    for key, (pre, name) in DOC_FILES.items():
        fs = glob.glob(os.path.join(TXT, pre + '*.txt'))
        if not fs: print('EKSİK belge', key, pre); continue
        arts = parse_doc(fs[0])
        for a, b in ALIAS.get(key, {}).items():
            if a in arts and b not in arts: arts[b] = arts.pop(a)
        docs[key] = {k: clean_art(a) for k, a in arts.items()}
    SEL = {}; R = {}; MAD = {}
    miss = collections.Counter(); ok = 0; tot = 0
    def label(doc, mad, spec):
        kind = 'Geçici md.' if mad[0] == 'g' else 'Ek md.' if mad[0] == 'e' else 'md.'
        num = mad.lstrip('ge')
        return DOC_FILES[doc][1] + ' ' + kind + num + ('/' + spec if spec else '')
    def cap(ps, n):
        out = []; tot = 0
        for p in ps:
            if tot + len(p) > n and out:
                return out, True
            out.append(p); tot += len(p)
        return out, False
    for b, k, e, dd, s in qs:
        k = unesc(k); dd = unesc(dd)
        tot += 1
        keys = []
        for doc, mad, spec in parse_d(dd):
            art = docs.get(doc, {}).get(mad)
            if not (art and art['p']):
                miss[(doc, mad)] += 1; continue
            sk = doc + '#' + mad + '#' + spec
            mk = doc + '#' + mad
            if mk not in MAD:
                full, c2 = cap(art['p'], 6500)
                MAD[mk] = {'t': art['t'], 'p': full}
                if c2: MAD[mk]['c'] = 1
            if sk not in SEL:
                sel = pick(art, spec)
                idx = []
                for p_ in sel:
                    j = art['p'].index(p_)
                    if j < len(MAD[mk]['p']) and j not in idx: idx.append(j)
                allp = len(MAD[mk]['p'])
                tot_len = sum(len(x) for x in art['p'])
                ent = {'a': label(doc, mad, spec)}
                if not idx or len(idx) >= allp:
                    ent['i'] = 0
                elif tot_len <= 1800 and not MAD[mk].get('c'):
                    ent['i'] = 0; ent['h'] = idx          # kısa madde: tamamı gösterilir, ilgili fıkra vurgulanır
                else:
                    keep = []; tl = 0
                    for j in idx:
                        if tl + len(art['p'][j]) > 3200 and keep: break
                        keep.append(j); tl += len(art['p'][j])
                    ent['i'] = keep; ent['h'] = keep
                SEL[sk] = ent
            keys.append(sk)
        if keys:
            R[k + '|' + dd] = keys; ok += 1
    print('soru', tot, 'madde çözülen soru', ok, 'benzersiz madde/ölçüt', len(SEL))
    print('çözülemeyen (belge,madde):', dict(miss))
    U = {}
    fs = glob.glob(os.path.join(TXT, 'pOgr*.txt'))
    if fs: U = unit_blocks(fs[0]); print('ünite blokları', {n: (len(v['k']), len(v['y'])) for n, v in U.items()})
    out = 'var OZET=' + json.dumps({'r': R, 's': SEL, 'm': MAD, 'u': U}, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(os.path.join(B, 'src', 'ozet.js'), 'w', encoding='utf-8').write(out)
    print('boyut', len(out))

if __name__ == '__main__':
    main()
