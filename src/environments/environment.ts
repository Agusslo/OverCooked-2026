// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  supabaseUrl: 'https://ydpukgjowtmoxbeyhncz.supabase.co',
  supabaseKey: 'sb_publishable_7Z1MLt6q-rvHnv3STfwRbQ_554GBD3V',
  // El plugin de push notifications llama a Firebase apenas se registra
  // (PushNotifications.register()). Sin android/app/google-services.json
  // esa llamada tira una excepción nativa no capturable desde el lado
  // JS y CIERRA LA APP. Dejar en false hasta sumar ese archivo (Firebase
  // console → agregar app Android con el applicationId io.ionic.starter).
  pushNotificationsHabilitadas: true,
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
