import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuariosService } from '../../services/usuarios.service';
import { AlertService } from '../../services/alert.service';
import {
  OneSignalEmailService,
  OneSignalEmailTargeting,
} from '../../services/onesignal-email.service';
import { Usuario } from '../../types';

@Component({
  selector: 'app-probar-email',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './probar-email.html',
  styleUrl: './probar-email.css',
})
export class ProbarEmail {
  searchTerm = '';
  searchLoading = false;
  resultados: Usuario[] = [];
  usuarioSeleccionado: Usuario | null = null;

  targeting: OneSignalEmailTargeting = 'email';
  emailSubject = 'Prueba Eventum — correo transaccional';
  emailBody = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
  <h1 style="color: #7c3aed;">Eventum</h1>
  <p>Hola, este es un <strong>correo de prueba</strong> enviado desde el panel admin.</p>
  <p>Si lo recibes, OneSignal Email está funcionando correctamente.</p>
</body>
</html>`;
  templateId = '';

  enviando = false;
  ultimoEnvio: { onesignalId: string | null; recipients: number | null } | null = null;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private usuariosService: UsuariosService,
    private oneSignalEmailService: OneSignalEmailService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
  ) {}

  onSearchChange(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      void this.buscarUsuarios();
    }, 350);
  }

  async buscarUsuarios(): Promise<void> {
    const term = this.searchTerm.trim();
    if (term.length < 2) {
      this.resultados = [];
      this.cdr.detectChanges();
      return;
    }

    this.searchLoading = true;
    this.cdr.detectChanges();

    try {
      const response = await this.usuariosService.getUsuarios({
        search: term,
        limit: 12,
        page: 1,
        sortBy: 'email',
        sortOrder: 'asc',
      });
      this.resultados = response.data ?? [];
    } catch (err) {
      console.error('Error buscando usuarios:', err);
      this.resultados = [];
      this.alertService.error('Error', 'No se pudo buscar usuarios');
    } finally {
      this.searchLoading = false;
      this.cdr.detectChanges();
    }
  }

  seleccionarUsuario(usuario: Usuario): void {
    this.usuarioSeleccionado = usuario;
    this.resultados = [];
    this.searchTerm = this.etiquetaUsuario(usuario);
    this.cdr.detectChanges();
  }

  limpiarSeleccion(): void {
    this.usuarioSeleccionado = null;
    this.searchTerm = '';
    this.resultados = [];
    this.ultimoEnvio = null;
    this.cdr.detectChanges();
  }

  etiquetaUsuario(usuario: Usuario): string {
    const nombre = `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim();
    return nombre ? `${nombre} (${usuario.email})` : usuario.email;
  }

  get puedeEnviar(): boolean {
    if (!this.usuarioSeleccionado || this.enviando) {
      return false;
    }
    const tieneTemplate = this.templateId.trim().length > 0;
    const tieneContenido =
      this.emailSubject.trim().length > 0 &&
      (tieneTemplate || this.emailBody.trim().length > 0);
    if (!tieneContenido) {
      return false;
    }
    if (this.targeting === 'external_id') {
      return Boolean(this.usuarioSeleccionado.auth_user_id);
    }
    return Boolean(this.usuarioSeleccionado.email?.includes('@'));
  }

  async enviarCorreo(): Promise<void> {
    if (!this.usuarioSeleccionado || !this.puedeEnviar) {
      return;
    }

    this.enviando = true;
    this.ultimoEnvio = null;
    this.cdr.detectChanges();

    try {
      const templateId = this.templateId.trim();
      const result = await this.oneSignalEmailService.sendTestEmail({
        usuario_id: this.usuarioSeleccionado.id,
        email_subject: this.emailSubject.trim(),
        email_body: templateId ? undefined : this.emailBody.trim(),
        template_id: templateId || undefined,
        targeting: this.targeting,
      });

      this.ultimoEnvio = {
        onesignalId: result.onesignal_id ?? null,
        recipients: result.recipients ?? null,
      };

      await this.alertService.success(
        'Correo enviado',
        result.onesignal_id
          ? `OneSignal aceptó el envío (ID: ${result.onesignal_id}). Revisa la bandeja del destinatario.`
          : 'OneSignal aceptó el envío. Revisa la bandeja del destinatario.',
      );
    } catch (err) {
      console.error('Error enviando correo:', err);
      const message = err instanceof Error ? err.message : 'Error al enviar correo';
      await this.alertService.error('No se pudo enviar', message);
    } finally {
      this.enviando = false;
      this.cdr.detectChanges();
    }
  }
}
