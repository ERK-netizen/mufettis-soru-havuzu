# Soru Havuzu — güncelleme rehberi (Claude oturumları için)

Bu depo, MEB Müfettiş Yardımcılığı soru havuzu uygulamasının tek kaynağıdır.

- `src/data.js` → SRC (kaynaklar) ve Q (sorular). Soru biçimi:
  `{b:"a|b|c|d",k:"Konu",q:"Soru",o:["A","B","C","D"],a:0,e:"Açıklama",d:"Madde atfı",s:"kaynakAnahtarı"}`
  Seçenekler uygulamada karıştırılır; `a` doğru seçeneğin dizindir. Konu sırası, konunun Q içinde ilk göründüğü yerdir.
- `src/app.js`, `src/head.html`, `src/kapsam.html` → uygulama kodu, görünüm, kapsam notu.
- `python3 build.py` → `web/index.html` (telefon uygulaması/PWA) ve `dist/artifact.html` (claude.ai artifact) üretir.

## Yeni soru ekleme akışı
1. `src/data.js` içine soruları ekle (gerekirse SRC'ye kaynak ekle). Aynı soru metni iki kez olmamalı.
2. `python3 build.py`
3. `git commit -am "…" && git push` → GitHub Actions `web/` klasörünü gh-pages'e yayınlar; telefondaki uygulama bir sonraki açılışta yeni soruları alır.
4. claude.ai artifact'ını da güncellemek için `dist/artifact.html` dosyasını artifact URL'siyle yayınla (https://claude.ai/artifact/UDMvNk2MS5grQAvkNjYhjm).

`android/` yalnızca uygulama kabuğudur (WebView). İçerik güncellemeleri için APK'yı yeniden derlemek gerekmez; APK yalnızca `android/**` değişince derlenir.

## Yanlış cevap dönütü — Konu özeti (23.10.2026)
Yanlış cevaplanan soruda "Konu özeti" paneli açılır; Tekrar sekmesindeki ve deneme/oturum sonucundaki "Yanlışlarımın konu özetleri" ekranı bunları dayanak başına toplar.
- **Mevzuat konuları:** sorunun `d` alanındaki madde (fıkra/bent), resmî metinden **birebir** gösterilir; kısa maddelerde madde tamamı + ilgili fıkra vurgulu, uzun maddelerde yalnız ilgili parça + "Maddenin tamamı".
- **Rehber konuları:** aynı başlıktaki/ünitedeki diğer soruların açıklamalarından, bu soruyla en çok kelime örtüşenler (yeni bilgi yazılmaz); Öğrenme Psikolojisi'nde ünite "Kritik bilgiler / Sık yapılan yanlışlar" rehberden birebir.
- Veri: `src/ozet.js` (`var OZET={r,s,m,u}`) — **elle düzenlenmez**; `tools/ozet_cikar.py` üretir. `build.py` onu otomatik katar.
- **Yeni soru eklerken:** `d` alanını mevcut kalıpla yaz (`<ÖNEK> md.<no>[/fıkra[-bent]]`, ör. `ÖEHY md.15/1-e`, `657 md.125/D-k`, `geçici md.3`, `Ek md.2`); önekler `tools/ozet_cikar.py` içindeki `PREFIXES` tablosundadır. Yeni bir mevzuat/yönetmelik konusu eklenirse `DOC_FILES` ve `PREFIXES`'e satır ekle.
- **Yeniden üretme:** proje PDF'lerini `pdftotext X.pdf` ile metne çevir (dosya adı öneki `DOC_FILES` ile uyumlu; 657 ve Ortaöğretim Yön. proje dokümanlarından), sonra `python3 tools/ozet_cikar.py <metin_dizini>` → `python3 build.py`.
- Çıkarılamayan dayanaklar (mülga/kaldırılmış maddeler, "künye", "tablo") için mevzuat paneli çıkmaz; rehber konularındaki gibi ilgili açıklamalar gösterilir, yoksa panel gösterilmez.
