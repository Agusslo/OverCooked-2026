package com.overcooked.app;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @SuppressLint("Range")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        ajustarTecladoEnAndroidViejo();
    }

    /**
     * En Android < 15 (sin edge-to-edge forzado), el plugin SystemBars de
     * Capacitor 8 pone los insets de las barras en 0 y, con un WebView < 140
     * (ej. Moto E6s en Android 9, que quedó en WebView 138), eso también se
     * lleva puesto el alto del teclado: el WebView no se achica y el teclado
     * tapa los inputs. Además, el workaround `resizeOnFullScreen` del plugin
     * Keyboard se desactiva solo cuando SystemBars está presente.
     *
     * Acá reemplazamos el listener de SystemBars (sólo en esas versiones) por
     * uno que deja lugar para el teclado con padding inferior en el
     * contenedor del WebView. En Android 15+ se sigue usando el de SystemBars.
     */
    private void ajustarTecladoEnAndroidViejo() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            return;
        }

        View contenedorWebView = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(contenedorWebView, (v, insets) -> {
            boolean tecladoVisible = insets.isVisible(WindowInsetsCompat.Type.ime());
            Insets teclado = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(0, 0, 0, tecladoVisible ? teclado.bottom : 0);
            return WindowInsetsCompat.CONSUMED;
        });
        contenedorWebView.requestApplyInsets();
    }
}
