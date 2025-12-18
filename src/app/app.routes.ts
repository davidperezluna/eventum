import { Routes } from '@angular/router';
import { Layout } from './components/layout/layout';
import { Dashboard } from './pages/dashboard/dashboard';
import { DashboardOrganizador } from './pages/dashboard-organizador/dashboard-organizador';
import { Eventos } from './pages/eventos/eventos';
import { EventosCliente } from './pages/eventos-cliente/eventos-cliente';
import { DetalleEvento } from './pages/detalle-evento/detalle-evento';
import { MisCompras } from './pages/mis-compras/mis-compras';
import { Boletas } from './pages/boletas/boletas';
import { Perfil } from './pages/perfil/perfil';
import { PagoResultado } from './pages/pago-resultado/pago-resultado';
import { Ventas } from './pages/ventas/ventas';
import { Usuarios } from './pages/usuarios/usuarios';
import { Categorias } from './pages/categorias/categorias';
import { Lugares } from './pages/lugares/lugares';
import { Calificaciones } from './pages/calificaciones/calificaciones';
import { Notificaciones } from './pages/notificaciones/notificaciones';
import { Reportes } from './pages/reportes/reportes';
import { DashboardEventos } from './pages/dashboard-eventos/dashboard-eventos';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { AuthCallback } from './pages/auth-callback/auth-callback';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: Login
  },
  {
    path: 'register',
    component: Register
  },
  {
    path: 'auth/callback',
    component: AuthCallback
  },
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: Dashboard }, // Admin dashboard
      { path: 'dashboard-organizador', component: DashboardOrganizador }, // Organizador dashboard
      { path: 'dashboard-eventos', component: DashboardEventos }, // Dashboard completo de eventos
      { path: 'usuarios', component: Usuarios },
      { path: 'eventos', component: Eventos },
      { path: 'eventos-cliente', component: EventosCliente }, // Cliente: ver eventos
      { path: 'detalle-evento/:id', component: DetalleEvento }, // Cliente: detalle y compra
      { path: 'mis-compras', component: MisCompras }, // Cliente: ver compras
      { path: 'pago-resultado', component: PagoResultado }, // Resultado de pago Wompi
      { path: 'categorias', component: Categorias },
      { path: 'lugares', component: Lugares },
      { path: 'boletas', component: Boletas },
      { path: 'ventas', component: Ventas },
      { path: 'calificaciones', component: Calificaciones },
      { path: 'notificaciones', component: Notificaciones },
      { path: 'reportes', component: Reportes },
      { path: 'perfil', component: Perfil },
    ]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
