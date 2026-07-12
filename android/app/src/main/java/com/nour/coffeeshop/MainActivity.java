package com.nour.coffeeshop;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — entry point for the {@code com.nour.coffeeshop} APK.
 *
 * The app is a fully self-contained Capacitor WebView (bundled static
 * export + local SQLite, no LAN server, no launcher/reconnect screen).
 *
 * We extend {@link BridgeActivity} only to disable Android WebView's
 * default "media playback requires a user gesture" restriction. The
 * brand intro plays a muted video right after a successful login — that
 * follows a form submit + several `await`s (password check, backup
 * restore), so by the time `.play()` actually runs we're well outside
 * the original tap's call stack. Chromium-based WebView can otherwise
 * silently refuse to advance playback in that situation even though the
 * element reports itself as playing.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView != null) {
            webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
