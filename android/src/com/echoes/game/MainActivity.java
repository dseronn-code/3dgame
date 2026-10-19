package com.echoes.game;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;

/**
 * Abre o Echoes (assets/www) em tela cheia numa WebView.
 * O microfone só é pedido quando o jogo solicita (depois da tela de explicação),
 * e o áudio é analisado localmente pela página; nada sai do aparelho.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REQ_MIC = 7;
    private static final int IMMERSIVE_FLAGS = 0x00001000 | 0x00000200 | 0x00000400 | 0x00000100 | 0x00000004 | 0x00000002;

    private WebView web;
    private PermissionRequest pendingMic;
    private long lastBack;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                WindowManager.LayoutParams lp = w.getAttributes();
                lp.getClass().getField("layoutInDisplayCutoutMode").setInt(lp, 1);
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
        web.setWebChromeClient(new WebChromeClient() {
            // Chamado pela WebView (API 21+) quando a página pede getUserMedia
            public void onPermissionRequest(PermissionRequest request) {
                boolean wantsMic = false;
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
                }
                if (!wantsMic) {
                    request.deny();
                    return;
                }
                if (hasMicPermission()) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    pendingMic = request;
                    askMicPermission();
                }
            }
        });
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

    private boolean hasMicPermission() {
        return checkPermission(Manifest.permission.RECORD_AUDIO, Process.myPid(), Process.myUid()) == PackageManager.PERMISSION_GRANTED;
    }

    private void askMicPermission() {
        try {
            getClass().getMethod("requestPermissions", String[].class, int.class)
                    .invoke(this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
        } catch (Exception e) {
            if (pendingMic != null) pendingMic.deny();
            pendingMic = null;
        }
    }

    // Assinatura da API 23; chamado pelo sistema depois do diálogo de permissão
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != REQ_MIC || pendingMic == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pendingMic.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pendingMic.deny();
        }
        pendingMic = null;
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg")) return "image/jpeg";
        if (path.endsWith(".glb")) return "model/gltf-binary";
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
        // Primeiro "voltar" pausa; o segundo (em até 2s) fecha o app.
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
