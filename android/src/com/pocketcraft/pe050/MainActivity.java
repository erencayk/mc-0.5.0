package com.pocketcraft.pe050;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;

/**
 * Hosts the game (a WebGL page bundled in assets/www) full-screen in a WebView and
 * exposes the native bridge (TCP sockets, LAN discovery, file storage) to JavaScript.
 */
public class MainActivity extends Activity {
    // View.SYSTEM_UI_FLAG_* values (inlined to keep the build free of the Android SDK)
    private static final int UI_IMMERSIVE = 0x00000002 /* HIDE_NAVIGATION */ | 0x00000004 /* FULLSCREEN */
            | 0x00000100 /* LAYOUT_STABLE */ | 0x00000200 /* LAYOUT_HIDE_NAVIGATION */
            | 0x00000400 /* LAYOUT_FULLSCREEN */ | 0x00001000 /* IMMERSIVE_STICKY */;

    private WebView web;
    private NetBridge bridge;
    private static final int PICK_FILE = 50;
    private ValueCallback<Uri[]> pendingPick;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window win = getWindow();
        win.addFlags(0x00000400 /* FLAG_FULLSCREEN */);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = win.getAttributes();
            lp.layoutInDisplayCutoutMode = 1; // SHORT_EDGES: draw under the notch
            win.setAttributes(lp);
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient());
        // <input type=file> (used to import the player's own 0.5.0 APK textures)
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (pendingPick != null) pendingPick.onReceiveValue(null);
                pendingPick = cb;
                Intent i = new Intent("android.intent.action.GET_CONTENT");
                i.addCategory("android.intent.category.OPENABLE");
                i.setType("*/*");
                try {
                    startActivityForResult(i, PICK_FILE);
                } catch (RuntimeException e) {
                    pendingPick = null;
                    cb.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
        web.setBackgroundColor(0xff000000);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(2 /* OVER_SCROLL_NEVER */);

        bridge = new NetBridge(this, web);
        web.addJavascriptInterface(bridge, "AndroidBridge");
        setContentView(web);
        hideSystemUi();
        web.loadUrl("file:///android_asset/www/index.html");
    }

    private void hideSystemUi() {
        if (web != null) web.setSystemUiVisibility(UI_IMMERSIVE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        // let the game save before the WebView is paused
        if (web != null) {
            web.evaluateJavascript("window.__app && window.__app.autosave && window.__app.autosave()", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && pendingPick != null) {
            pendingPick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingPick = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // back button opens/closes the in-game menu (Escape key behaviour)
        if (web != null) {
            web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'}))", null);
        }
    }
}
