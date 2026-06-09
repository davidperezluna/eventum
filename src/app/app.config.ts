import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
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
    provideRouter(
      routes,
      withEnabledBlockingInitialNavigation(), // Mejora la navegación inicial en producción
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      })
    ),
    provideServiceWorker('ngsw-worker.js', {
      // Solo producción: el build `dev` en Vercel no genera ngsw; registrarlo en staging dejaba F5 sirviendo builds viejos.
      enabled: environment.production && (environment.pwa?.serviceWorkerEnabled ?? true),
      registrationStrategy: 'registerWhenStable:3000',
    }),
    // GoogleAnalyticsService se inicializa automáticamente cuando se inyecta por primera vez
  ]
};
