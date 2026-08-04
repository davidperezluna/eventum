import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CompletarPerfilFormComponent } from '../../components/completar-perfil-form/completar-perfil-form';
import { perfilListoParaComprar } from '../../core/perfil-completo';
import { Usuario } from '../../types/entities';

@Component({
  selector: 'app-completar-perfil',
  imports: [CommonModule, CompletarPerfilFormComponent],
  templateUrl: './completar-perfil.html',
  styleUrl: './completar-perfil.css',
})
export class CompletarPerfil implements OnInit {
  loading = true;
  usuario: Usuario | null = null;
  private returnUrl = '/eventos-cliente';

  constructor(
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.authService.waitForInitialization();

    const returnUrlRaw = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrlRaw && this.authService.esReturnUrlPermitidaCliente(returnUrlRaw)) {
      this.returnUrl = returnUrlRaw;
    }

    this.usuario = this.authService.getUsuario();
    if (!this.usuario) {
      void this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/completar-perfil' },
      });
      return;
    }

    if (perfilListoParaComprar(this.usuario)) {
      void this.router.navigateByUrl(this.returnUrl);
      return;
    }

    this.loading = false;
    this.cdr.detectChanges();
  }

  onPerfilGuardado(usuario: Usuario): void {
    this.usuario = usuario;
    void this.router.navigateByUrl(this.returnUrl);
  }
}
