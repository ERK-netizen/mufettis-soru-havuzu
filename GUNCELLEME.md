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
