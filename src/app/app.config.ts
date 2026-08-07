import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { provideLuxonDateAdapter } from '@angular/material-luxon-adapter';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  provideRouter,
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling,
} from '@angular/router';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideLuxonDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'es-CO' },
    provideRouter(
      routes,
      withEnabledBlockingInitialNavigation(), // Mejora la navegación inicial en producción
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      })
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production && (environment.pwa?.serviceWorkerEnabled ?? true),
      registrationStrategy: 'registerImmediately',
    }),
    // GoogleAnalyticsService se inicializa automáticamente cuando se inyecta por primera vez
  ]
};
