import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UsuariosService } from '../../services/usuarios.service';
import { Usuario } from '../../types/entities';
import { TipoGenero } from '../../types/enums';
import { validarDocumentoIdentidadColombia } from '../../core/documento-identidad';
import {
  formatFechaNacimientoParaInput,
  validarFechaNacimiento,
} from '../../core/fecha-nacimiento';
import { esGeneroUsuarioValido, perfilListoParaComprar } from '../../core/perfil-completo';
import {
  datosConsentimientoParaGuardar,
  usuarioTieneConsentimientoDatos,
} from '../../core/tratamiento-datos';
import {
  TRATAMIENTO_DATOS_CHECKBOX,
  TRATAMIENTO_DATOS_LINEAS,
  TRATAMIENTO_DATOS_RESUMEN,
} from '../../constants/tratamiento-datos.constants';
import { validarTelefonoColombia, normalizarTelefonoColombia } from '../../core/telefono-colombia';
import { TelefonoColombiaInputComponent } from '../telefono-colombia-input/telefono-colombia-input';
import { EvDatePicker } from '../ev-date-picker/ev-date-picker';
import { EvSelect } from '../ev-select/ev-select';

type CampoPerfilForm =
  | 'nombre'
  | 'apellido'
  | 'documento'
  | 'telefono'
  | 'fechaNacimiento'
  | 'genero'
  | 'tratamientoDatos';

@Component({
  selector: 'app-completar-perfil-form',
  imports: [CommonModule, FormsModule, TelefonoColombiaInputComponent, EvDatePicker, EvSelect],
  templateUrl: './completar-perfil-form.html',
  styleUrl: './completar-perfil-form.css',
})
export class CompletarPerfilFormComponent implements OnInit {
  @Input() mostrarCancelar = false;
  @Input() textoBotonPrimario = 'Guardar y continuar';
  @Output() guardado = new EventEmitter<Usuario>();
  @Output() cancelado = new EventEmitter<void>();

  readonly generoOptions = [
    { value: TipoGenero.MASCULINO, label: 'Masculino' },
    { value: TipoGenero.FEMENINO, label: 'Femenino' },
    { value: TipoGenero.OTRO, label: 'Otro' },
  ];

  readonly tratamientoDatosResumen = TRATAMIENTO_DATOS_RESUMEN;
  readonly tratamientoDatosLineas = TRATAMIENTO_DATOS_LINEAS;
  readonly tratamientoDatosCheckbox = TRATAMIENTO_DATOS_CHECKBOX;

  nombre = '';
  apellido = '';
  documento = '';
  telefono = '';
  fechaNacimiento = '';
  genero: TipoGenero | null = null;
  aceptaTratamientoDatos = false;
  consentimientoDatosPrevio = false;
  guardando = false;
  error: string | null = null;
  intentadoEnviar = false;
  private camposTocados: Record<CampoPerfilForm, boolean> = {
    nombre: false,
    apellido: false,
    documento: false,
    telefono: false,
    fechaNacimiento: false,
    genero: false,
    tratamientoDatos: false,
  };

  constructor(
    private authService: AuthService,
    private usuariosService: UsuariosService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.cargarDesdeUsuario(this.authService.getUsuario());
  }

  marcarTocado(campo: CampoPerfilForm): void {
    this.camposTocados[campo] = true;
  }

  mostrarMensajeError(campo: CampoPerfilForm): boolean {
    return this.intentadoEnviar || this.camposTocados[campo];
  }

  onTratamientoDatosChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.aceptaTratamientoDatos = input.checked;
    this.marcarTocado('tratamientoDatos');
  }

  errorNombre(): string | null {
    if (!this.nombre.trim()) {
      return 'Ingresa tu nombre.';
    }
    return null;
  }

  errorApellido(): string | null {
    if (!this.apellido.trim()) {
      return 'Ingresa tu apellido.';
    }
    return null;
  }

  errorDocumento(): string | null {
    const validacion = validarDocumentoIdentidadColombia(this.documento);
    return validacion.valido ? null : (validacion.mensaje ?? 'Ingresa una cédula colombiana válida.');
  }

  errorTelefono(): string | null {
    const validacion = validarTelefonoColombia(this.telefono);
    return validacion.valido ? null : (validacion.mensaje ?? 'Revisa el número de teléfono.');
  }

  errorFechaNacimiento(): string | null {
    const validacion = validarFechaNacimiento(this.fechaNacimiento);
    return validacion.valido ? null : (validacion.mensaje ?? 'Ingresa una fecha de nacimiento válida.');
  }

  errorGenero(): string | null {
    if (!esGeneroUsuarioValido(this.genero)) {
      return 'Selecciona tu género.';
    }
    return null;
  }

  errorTratamientoDatos(): string | null {
    if (this.consentimientoDatosPrevio || this.aceptaTratamientoDatos) {
      return null;
    }
    return 'Debes aceptar el tratamiento de datos personales para continuar.';
  }

  private formularioValido(): boolean {
    return (
      !this.errorNombre() &&
      !this.errorApellido() &&
      !this.errorDocumento() &&
      !this.errorTelefono() &&
      !this.errorFechaNacimiento() &&
      !this.errorGenero() &&
      !this.errorTratamientoDatos()
    );
  }

  get puedeEnviar(): boolean {
    return this.formularioValido();
  }

  private marcarTodosTocados(): void {
    (Object.keys(this.camposTocados) as CampoPerfilForm[]).forEach((campo) => {
      this.camposTocados[campo] = true;
    });
  }

  private cargarDesdeUsuario(usuario: Usuario | null): void {
    if (!usuario) {
      return;
    }
    this.nombre = String(usuario.nombre ?? '').trim();
    this.apellido = String(usuario.apellido ?? '').trim();
    this.documento = String(usuario.documento_identidad ?? '').trim();
    this.telefono = normalizarTelefonoColombia(String(usuario.telefono ?? ''));
    this.fechaNacimiento = formatFechaNacimientoParaInput(usuario.fecha_nacimiento);
    this.genero = esGeneroUsuarioValido(usuario.genero) ? (usuario.genero as TipoGenero) : null;
    this.consentimientoDatosPrevio = usuarioTieneConsentimientoDatos(usuario);
    this.aceptaTratamientoDatos = this.consentimientoDatosPrevio;
  }

  private mensajeErrorGuardar(err: unknown): string {
    const raw = err as { code?: string; message?: string; details?: string } | null;
    const code = String(raw?.code ?? '').trim();
    const blob = `${String(raw?.message ?? '')} ${String(raw?.details ?? '')}`.toLowerCase();

    if (
      code === '23505' ||
      blob.includes('documento_identidad') ||
      blob.includes('already exists') ||
      blob.includes('duplicate key')
    ) {
      return 'Ese documento ya está registrado en otra cuenta. Revisa el número o inicia sesión con la cuenta correcta.';
    }

    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }
    return 'No se pudo guardar tus datos. Intenta de nuevo.';
  }

  async guardar(): Promise<void> {
    this.error = null;
    this.intentadoEnviar = true;
    this.marcarTodosTocados();

    if (!this.formularioValido()) {
      this.error = 'Revisa los campos marcados antes de continuar.';
      this.cdr.detectChanges();
      return;
    }

    const nombre = this.nombre.trim();
    const apellido = this.apellido.trim();
    const validacionDocumento = validarDocumentoIdentidadColombia(this.documento);
    const validacionTelefono = validarTelefonoColombia(this.telefono);
    const validacionFechaNacimiento = validarFechaNacimiento(this.fechaNacimiento);

    const usuarioId = this.authService.getUsuarioId();
    if (!usuarioId) {
      this.error = 'Debes iniciar sesión para continuar.';
      this.cdr.detectChanges();
      return;
    }

    const updateData: Partial<Usuario> = {
      nombre,
      apellido,
      documento_identidad: validacionDocumento.normalizado,
      telefono: validacionTelefono.normalizado,
      fecha_nacimiento: validacionFechaNacimiento.normalizado,
      genero: this.genero ?? undefined,
      ...(this.consentimientoDatosPrevio ? {} : datosConsentimientoParaGuardar()),
    };

    this.guardando = true;
    this.cdr.detectChanges();

    try {
      const usuarioActualizado = await this.usuariosService.updateUsuario(usuarioId, updateData);
      await this.authService.refreshUsuario();
      const usuario = this.authService.getUsuario() ?? usuarioActualizado;

      if (!perfilListoParaComprar(usuario)) {
        this.error = 'Aún faltan datos por completar. Revisa los campos e intenta de nuevo.';
        return;
      }

      this.guardado.emit(usuario);
    } catch (err: unknown) {
      this.error = this.mensajeErrorGuardar(err);
    } finally {
      this.guardando = false;
      this.cdr.detectChanges();
    }
  }
}
