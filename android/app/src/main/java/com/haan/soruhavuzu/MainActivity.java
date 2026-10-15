package com.haan.soruhavuzu;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Soru Havuzu: GitHub Pages'teki güncel sayfayı açar; çevrimdışıyken service worker önbelleği, o da yoksa APK içindeki kopya. */
public class MainActivity extends Activity {
  private WebView web;
  private boolean fallback = false;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    setContentView(web);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setAllowFileAccess(true);
    s.setTextZoom(100);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    final String host = Uri.parse(BuildConfig.APP_URL).getHost();
    web.setWebViewClient(new WebViewClient() {
      @Override
      public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (host != null && host.equals(u.getHost())) return false;
        if ("file".equals(u.getScheme())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
        return true;
      }

      @SuppressWarnings("deprecation")
      @Override
      public void onReceivedError(WebView v, int code, String desc, String url) {
        if (!fallback && url != null && url.startsWith(BuildConfig.APP_URL)) {
          fallback = true;
          v.loadUrl("file:///android_asset/index.html");
        }
      }

      @Override
      public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
        if (r.isForMainFrame() && !fallback) {
          fallback = true;
          v.loadUrl("file:///android_asset/index.html");
        }
      }
    });
    if (state != null) web.restoreState(state);
    else web.loadUrl(BuildConfig.APP_URL);
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    web.saveState(out);
  }

  @Override
  public void onBackPressed() {
    web.evaluateJavascript(
        "(function(){var b=document.querySelector('.back:not([hidden])');if(b){b.click();return 1;}return 0;})()",
        v -> { if (!"1".equals(v)) finish(); });
  }
}
