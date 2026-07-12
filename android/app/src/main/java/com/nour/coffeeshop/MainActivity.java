package com.nour.coffeeshop;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — entry point for the {@code com.nour.coffeeshop} APK.
 *
 * The bulk of the app is a Capacitor WebView running inside
 * {@link BridgeActivity}. We extend it only to add three user-facing
 * affordances:
 *
 * <h3>1) Deep-link reset (QR code / NFC / {@code adb shell am start})</h3>
 * A {@code nour-floor://settings} (or {@code nour-floor://reset}) intent
 * must be honoured even when the WebView is currently showing the
 * LAN-hosted Next.js app — the launcher's JS handler is gone after
 * the user navigated away.
 *
 * <p>If the new intent's URI scheme is {@code nour-floor}, we navigate
 * the WebView back to {@code https://localhost/?reset=1} so the
 * launcher page reloads AND its {@code ?reset=1} query-string handler
 * (see {@code capacitor-launcher/launcher.js}) clears the saved URL.
 * {@code onNewIntent} overrides the activity's intent on resume; the
 * same logic runs from {@code onCreate} so a cold-start intent is
 * honoured too. {@code setIntent(intent)} keeps the activity's notion
 * of its launching intent consistent.
 *
 * <h3>2) Double-back → launcher</h3>
 * Once staff save a LAN URL and the WebView has navigated to it,
 * the launcher is unloaded. We intercept {@link #onBackPressed()}:
 *
 * <ol>
 *   <li>If the current WebView URL is the bundled launcher we fall
 *       through to the platform default, which finishes the activity.</li>
 *   <li>If the WebView is on the LAN URL, the first back-press shows
 *       a small Arabic toast telling staff a second press returns them
 *       to the connection screen.</li>
 *   <li>The second back-press (within {@link #BACK_PRESS_WINDOW_MS})
 *       navigates the WebView back to {@code https://localhost/} so
 *       the launcher re-renders.</li>
 * </ol>
 *
 * <h3>3) Single back on the launcher</h3>
 * Falls through to {@code super.onBackPressed()} — the activity
 * finishes and the app exits. That is intentional; the launcher IS
 * the app's home screen, not a back-stop.
 *
 * <p>Note: we don't reach into Capacitor internals. {@code bridge} is
 * the public {@link com.getcapacitor.Bridge} field on
 * {@link BridgeActivity} in Capacitor 6.
 */
public class MainActivity extends BridgeActivity {

    /** Two presses inside this window (ms) count as "double back".
     *  Approximates {@link Toast#LENGTH_LONG}'s documented render
     *  duration on stock Android (~3.5 s) so slow-finger users don't
     *  see the hint vanish right before they re-press. */
    private static final long BACK_PRESS_WINDOW_MS = 3500L;

    /** Origin of the bundled launcher (Capacitor's androidScheme=https). */
    private static final String LAUNCHER_ORIGIN_PREFIX = "https://localhost";

    /** Deep-link URI scheme that the launcher recognises for reset. */
    private static final String DEEP_LINK_SCHEME = "nour-floor";

    /** Token that the launcher's init code keys off to clear the
     *  saved URL when deep-link reset kicks us back here. */
    private static final String RESET_QUERY = "?reset=1";

    private long lastBackPressAt = 0L;
    private Toast backHintToast;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Honour `nour-floor://settings` even on cold start.
        handleResetFromIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleResetFromIntent(intent);
    }

    /**
     * If {@code intent}'s data URI uses our deep-link scheme, bounce
     * the WebView back to the launcher with {@code ?reset=1} so the
     * launcher's JS clears the saved URL. Safe to call multiple times.
     */
    private void handleResetFromIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        if (!DEEP_LINK_SCHEME.equals(data.getScheme())) return;
        WebView wv = bridge != null ? bridge.getWebView() : null;
        if (wv == null) return;
        try {
            // The `?reset=1` query is the in-launcher signal to wipe
            // saved state. Bouncing to bare `/` would just re-load
            // the form with the existing URL still in localStorage.
            wv.loadUrl(LAUNCHER_ORIGIN_PREFIX + "/" + RESET_QUERY);
        } catch (Exception ignored) {
            // WebView gone (activity tearing down). Nothing to do.
        }
    }

    @Override
    public void onBackPressed() {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        String url = webView != null ? webView.getUrl() : null;
        boolean onLauncher = url != null && url.startsWith(LAUNCHER_ORIGIN_PREFIX);

        if (onLauncher || webView == null) {
            // Already on the launcher (or no WebView for some reason) —
            // default behaviour: exit the app.
            super.onBackPressed();
            return;
        }

        long now = System.currentTimeMillis();
        if (now - lastBackPressAt < BACK_PRESS_WINDOW_MS) {
            // Second press inside the window → reload launcher.
            lastBackPressAt = 0L;
            try {
                webView.loadUrl(LAUNCHER_ORIGIN_PREFIX + "/");
            } catch (Exception ignored) {
                super.onBackPressed();
            }
            return;
        }

        // First press: surface the hint. Cancel the previous toast so
        // repeated back-presses don't queue a stack of toasts; nudge
        // it towards the bottom of the screen so it doesn't overlap
        // the field-input caret on tablets.
        lastBackPressAt = now;
        if (backHintToast != null) {
            backHintToast.cancel();
        }
        backHintToast = Toast.makeText(
            getApplicationContext(),
            "اضغط مرة أخرى للعودة إلى شاشة الاتصال",
            Toast.LENGTH_LONG
        );
        backHintToast.setGravity(Gravity.BOTTOM, 0, 120);
        backHintToast.show();
    }
}
