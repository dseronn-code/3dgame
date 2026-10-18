package com.arenaroyale.game;

import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;

/**
 * Abre o jogo (assets/www) em tela cheia numa WebView.
 * Os arquivos são servidos por uma origem https falsa para que os módulos ES funcionem.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int IMMERSIVE_FLAGS = 0x00001000 /* IMMERSIVE_STICKY */
            | 0x00000200 /* LAYOUT_HIDE_NAVIGATION */
            | 0x00000400 /* LAYOUT_FULLSCREEN */
            | 0x00000100 /* LAYOUT_STABLE */
            | 0x00000004 /* FULLSCREEN */
            | 0x00000002 /* HIDE_NAVIGATION */;

    private WebView web;
    private long lastBack;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                WindowManager.LayoutParams lp = w.getAttributes();
                lp.getClass().getField("layoutInDisplayCutoutMode").setInt(lp, 1 /* SHORT_EDGES */);
                w.setAttributes(lp);
            } catch (Exception ignored) {
            }
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        try {
            s.getClass().getMethod("setMediaPlaybackRequiresUserGesture", boolean.class).invoke(s, false);
        } catch (Exception ignored) {
        }
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (!HOST.equals(uri.getHost())) return null;
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(mimeType(path), "UTF-8", in);
                } catch (IOException e) {
                    return null;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("https://" + HOST);
            }
        });
        setContentView(web);
        hideSystemUi();
        web.loadUrl("https://" + HOST + "/index.html");
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    private void hideSystemUi() {
        web.setSystemUiVisibility(IMMERSIVE_FLAGS);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideSystemUi();
    }

    @Override
    public void onBackPressed() {
        // Primeiro "voltar" pausa o jogo; o segundo (em até 2s) fecha o app.
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) {
            super.onBackPressed();
            return;
        }
        lastBack = now;
        web.loadUrl("javascript:(function(){var b=document.getElementById('btnPause');if(b)b.click();})()");
        Toast.makeText(this, "Pressione voltar de novo para sair", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
