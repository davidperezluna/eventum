import { Routes } from '@angular/router';
import { Layout } from './components/layout/layout';
import { Dashboard } from './pages/dashboard/dashboard';
import { Eventos } from './pages/eventos/eventos';
import { Boletas } from './pages/boletas/boletas';
import { Ventas } from './pages/ventas/ventas';
import { Usuarios } from './pages/usuarios/usuarios';
import { Categorias } from './pages/categorias/categorias';
import { Lugares } from './pages/lugares/lugares';
import { Calificaciones } from './pages/calificaciones/calificaciones';
import { Notificaciones } from './pages/notificaciones/notificaciones';
import { Reportes } from './pages/reportes/reportes';
import { Login } from './pages/login/login';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: Login
  },
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: Dashboard },
      { path: 'usuarios', component: Usuarios },
      { path: 'eventos', component: Eventos },
      { path: 'categorias', component: Categorias },
      { path: 'lugares', component: Lugares },
      { path: 'boletas', component: Boletas },
      { path: 'ventas', component: Ventas },
      { path: 'calificaciones', component: Calificaciones },
      { path: 'notificaciones', component: Notificaciones },
      { path: 'reportes', component: Reportes },
    ]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
