import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.overcooked.app',
  appName: 'OverCooked',
  webDir: 'www',
  plugins: {
    // Sin esto, al abrir el teclado en Android el WebView completo se
    // "achica" en vez de que sólo se ajuste el contenido: los inputs
    // quedan comprimidos/tapados por el teclado. 'Body' hace que sea
    // ion-content quien se acomoda, como en cualquier app Ionic normal.
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_name',
    },
  },
};

export default config;
