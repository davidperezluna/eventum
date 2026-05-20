import { Routes } from '@angular/router';
import { Layout } from './components/layout/layout';
import { Dashboard } from './pages/dashboard/dashboard';
import { DashboardOrganizador } from './pages/dashboard-organizador/dashboard-organizador';
import { Eventos } from './pages/eventos/eventos';
import { EventosCliente } from './pages/eventos-cliente/eventos-cliente';
import { ConocenosContacto } from './pages/conocenos-contacto/conocenos-contacto';
import { DetalleEvento } from './pages/detalle-evento/detalle-evento';
import { Carrito } from './pages/carrito/carrito';
import { MisCompras } from './pages/mis-compras/mis-compras';
import { MisComprasGuia } from './pages/mis-compras-guia/mis-compras-guia';
import { Boletas } from './pages/boletas/boletas';
import { Perfil } from './pages/perfil/perfil';
import { PagoResultado } from './pages/pago-resultado/pago-resultado';
import { Ventas } from './pages/ventas/ventas';
import { VentasManual } from './pages/ventas-manual/ventas-manual';
import { Usuarios } from './pages/usuarios/usuarios';
import { Categorias } from './pages/categorias/categorias';
import { Lugares } from './pages/lugares/lugares';
import { Calificaciones } from './pages/calificaciones/calificaciones';
import { Notificaciones } from './pages/notificaciones/notificaciones';
import { Reportes } from './pages/reportes/reportes';
import { ReporteVentasCompletadas } from './pages/reporte-ventas-completadas/reporte-ventas-completadas';
import { DashboardEventos } from './pages/dashboard-eventos/dashboard-eventos';
import { Palcos } from './pages/palcos/palcos';
import { LectoresParametrizacion } from './pages/lectores-parametrizacion/lectores-parametrizacion';
import { EscanearQr } from './pages/escanear-qr/escanear-qr';
import { LectorHome } from './pages/lector-home/lector-home';
import { LectorLayout } from './components/lector-layout/lector-layout';
import { Login } from './pages/login/login';
import {
  lectorAuthGuard,
  lectorChildGuard,
  lectorFueraDeAppGuard,
} from './guards/lector.guard';
import { LoginAdmin } from './pages/login-admin/login-admin';
import { Register } from './pages/register/register';
import { AuthCallback } from './pages/auth-callback/auth-callback';
import { authGuard } from './guards/auth.guard';
import { Mantenimiento } from './pages/mantenimiento/mantenimiento';
import { environment } from '../environments/environment';

const appRoutes: Routes = [
  {
    path: 'login',
    component: Login
  },
  /** Personal: admin, organizador y lector (email/contraseña). Clientes: `/login`. */
  {
    path: 'login-admin',
    component: LoginAdmin,
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
    path: 'lector/login',
    redirectTo: 'login-admin',
    pathMatch: 'full',
  },
  {
    path: 'lector',
    component: LectorLayout,
    canActivate: [lectorAuthGuard],
    children: [
      { path: '', redirectTo: 'inicio', pathMatch: 'full' },
      { path: 'inicio', component: LectorHome, canActivate: [lectorChildGuard] },
      {
        path: 'validar',
        component: EscanearQr,
        canActivate: [lectorChildGuard],
        data: { modoApp: 'lector' },
      },
    ],
  },
  // Rutas públicas (sin autenticación) - Página principal
  {
    path: '',
    component: Layout,
    canActivate: [lectorFueraDeAppGuard],
    children: [
      { path: '', redirectTo: 'eventos-cliente', pathMatch: 'full' },
      { path: 'eventos-cliente', component: EventosCliente }, // Página principal pública
      { path: 'conocenos', component: ConocenosContacto }, // Conócenos y contacto (público)
      { path: 'detalle-evento/:id', component: DetalleEvento }, // Público: detalle de evento
      { path: 'carrito', component: Carrito },
    ]
  },
  // Rutas protegidas (requieren autenticación)
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: Dashboard }, // Admin dashboard
      { path: 'dashboard-organizador', component: DashboardOrganizador }, // Organizador dashboard
      { path: 'dashboard-eventos', component: DashboardEventos }, // Dashboard completo de eventos
      { path: 'usuarios', component: Usuarios },
      { path: 'eventos', component: Eventos },
      { path: 'mis-compras/actividad', component: MisCompras }, // Cliente: traslados / actividad
      { path: 'mis-compras/guia', component: MisComprasGuia }, // Cliente: guía de uso de entradas
      { path: 'mis-compras/evento/:id', component: MisCompras }, // Cliente: detalle de boletas por evento
      { path: 'mis-compras', component: MisCompras }, // Cliente: ver compras
      { path: 'pago-resultado', component: PagoResultado }, // Resultado de pago Wompi
      { path: 'categorias', component: Categorias },
      { path: 'lugares', component: Lugares },
      { path: 'boletas', component: Boletas, data: { vistaBoletas: 'pendientes' } },
      { path: 'boletas-usadas', component: Boletas, data: { vistaBoletas: 'usadas' } },
      { path: 'lectores-parametrizacion', component: LectoresParametrizacion },
      { path: 'escanear-qr', component: EscanearQr, data: { modoApp: 'admin' } },
      { path: 'palcos', component: Palcos },
      { path: 'ventas', component: Ventas },
      { path: 'ventas-manual', component: VentasManual, data: { adminOnly: true } },
      { path: 'calificaciones', component: Calificaciones },
      { path: 'notificaciones', component: Notificaciones },
      { path: 'reportes', component: Reportes },
      { path: 'reportes/ventas-completadas', component: ReporteVentasCompletadas },
      { path: 'perfil', component: Perfil },
    ]
  },
  {
    path: '**',
    redirectTo: '/eventos-cliente'
  }
];

const maintenanceRoutes: Routes = [
  {
    path: '',
    component: Mantenimiento
  },
  {
    path: '**',
    redirectTo: ''
  }
];

export const routes: Routes = environment.maintenanceMode ? maintenanceRoutes : appRoutes;
