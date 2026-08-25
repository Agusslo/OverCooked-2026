# OverCooked-2026

App Ionic + Angular 22 (componentes standalone) + Capacitor 8. El build sale a `www/`.

## Idioma
- Comentarios de código y este archivo: **en español**. El código en sí (nombres de variables, funciones, clases) se mantiene en inglés, como ya está en el repo.

## Stack / estructura
- Solo componentes standalone de Angular — sin NgModules. Usar `@if`/`@for`, no `*ngIf`/`*ngFor`.
- **Sin zone.js** (`angular.json` → `polyfills: []`, sin dependencia `zone.js`). La detección de cambios NO corre automáticamente después de `setTimeout`/`setInterval`/promesas resueltas fuera de las APIs de Angular. Cualquier estado que el template lea y que cambie de forma asíncrona (timers, subscripciones, eventos DOM no ligados con `(event)`) tiene que ser un `signal()` — una propiedad plana mutada después no actualiza la vista. Esto ya causó un bug en el splash (ver abajo); por defecto usar signals para el estado de cualquier componente, no solo el derivado de async.
- Componentes de Ionic (`@ionic/angular` v9) para la UI (`IonApp`, `IonRouterOutlet`, etc.).
- Estilos: SCSS por componente (`inlineStyleLanguage: scss`), estilos globales en `src/global.scss` + `src/theme/variables.scss`.
- El código de features vive en `src/app/feature/<nombre>/` (componente `.ts` + `.html` + `.scss` + `.spec.ts`).
- Assets (íconos, imágenes) van en `src/assets/`, referenciados como `assets/...` (sin barra inicial — se sirven desde la raíz de la app).
- Ruteo: `src/app/app.routes.ts` (vacío por ahora — todavía no hay rutas definidas).
- Backend: `@supabase/supabase-js` es dependencia — se espera Supabase para auth/datos cuando arranque ese trabajo.

## Comandos
- `npm start` → `ng serve`
- `npm run build` → `ng build`
- `npm test` → `ng test`
- `npm run lint` → `ng lint`
- Builds nativos con Capacitor: `npx cap sync` después del build web (todavía no configurado más allá del `capacitor.config.ts` por defecto).

## Convenciones ya establecidas
- Splash screen: `src/app/feature/splash/` (`app-splash`) controla todo el comportamiento del splash — logo, animación de pulso, tiempos de fade-out (`FADE_OUT_DELAY_MS`/`REMOVE_DELAY_MS` en `splash.component.ts`), estado como `signal()` (`fadingOut`, `hidden` — obligatorio, ver nota de zone.js arriba). Se renderiza como hermano de `<ion-router-outlet>` en `app.component.html`, no anidado adentro — los router outlets no proyectan contenido, así que cualquier cosa que deba superponerse a toda la app tiene que ir al lado, no adentro.
- `src/index.html` solo define `html, body { background-color: #ee7a4f }` (una línea) para que no haya flash blanco antes de que Angular arranque — no tiene logo/animación/timing propios. No duplicar markup/lógica del splash ahí; si el splash cambia, cambiar solo el componente.
- Color de fondo de marca: `#ee7a4f` (usado en `app.component.css`, el componente del splash, e `index.html`). `src/assets/icon/logo.png` está dibujado en ese mismo naranja, así que sobre cualquier fondo `#ee7a4f` necesita `filter: brightness(0) invert(1)` (lo fuerza a blanco) o una tarjeta/círculo de contraste detrás — puesto directo sobre el color de marca sin tratamiento, es casi invisible.

## Acuerdos de trabajo (leer esto para ahorrar tokens)
- No releer un archivo justo después de un Write/Edit — el resultado de la herramienta ya confirma el cambio; confiar en eso.
- No pegar contenidos completos de archivos en las explicaciones — referenciar `path:línea`.
- Evitar narrar pasos obvios ("ahora voy a revisar X") — hacerlo y reportar el resultado.
- Sin comentarios en el código salvo que expliquen un *por qué* no obvio (restricción oculta, workaround, invariante sutil) — y en español.
- Sin abstracciones especulativas, flags de configuración, ni manejo de errores para casos que no pueden pasar acá — es un proyecto de TFI chico, mantenerlo directo y mínimo.
- Al correr `ng build`/`ng serve`/`ng test`, preferir `npx ng ...` y mostrar solo la cola del output relevante a errores/warnings, no el log completo.
- Este repo no tiene CI configurado ni cobertura de tests más allá de los `.spec.ts` por defecto — no asumir infraestructura de testing más allá de `ng test`.
- **Mantener este archivo actualizado sobre la marcha.** Cuando un cambio agregue/quite una convención, una dependencia, un patrón de carpetas, o invalide algo escrito acá, actualizar la sección correspondiente en el mismo turno — sin esperar a que lo pidan. Las entradas desactualizadas cuestan más tokens después (redescubrimiento + suposiciones erróneas) que la edición ahora. Podar secciones que dejaron de ser ciertas en vez de apilar salvedades encima.
