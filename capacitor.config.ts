import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.overcooked.app',
  appName: 'OverCooked',
  webDir: 'www',
  plugins: {
    Keyboard: {
      // resize: KeyboardResize.Body,
      resize: KeyboardResize.Ionic,
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_name',
    },
  },
};

export default config;
