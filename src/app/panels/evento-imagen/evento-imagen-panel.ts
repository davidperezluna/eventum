import { Component, OnInit, inject, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawerRef, EV_DRAWER_DATA, EvDrawerContent } from '../../core/drawer';
import { EventosService } from '../../services/eventos.service';
import { StorageService } from '../../services/storage.service';
import { ImageOptimizationService } from '../../services/image-optimization.service';
import { AuthService } from '../../services/auth.service';
import { AlertService } from '../../services/alert.service';
import { EvDrawerFooter } from '../../components/ev-drawer/ev-drawer-footer';
import { EvButton } from '../../components/ev-button';
import { EvPanelForm } from '../../components/ev-panel-form';
import { EventoImagenDrawerResult, EventoImagenPanelData } from './evento-imagen.types';

@Component({
  selector: 'app-evento-imagen-panel',
  standalone: true,
  imports: [CommonModule, EvDrawerFooter, EvButton, EvPanelForm],
  templateUrl: './evento-imagen-panel.html',
  styleUrl: './evento-imagen-panel.css',
})
export class EventoImagenPanel implements OnInit, EvDrawerContent {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private readonly eventosService = inject(EventosService);
  private readonly storageService = inject(StorageService);
  private readonly imageOptimizationService = inject(ImageOptimizationService);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly drawerRef = inject(DrawerRef<EventoImagenDrawerResult>);
  readonly data = inject<EventoImagenPanelData>(EV_DRAWER_DATA);

  previewUrl: string | null = null;
  selectedFile: File | null = null;
  savedUrl: string | null = null;
  saving = false;
  markedForRemoval = false;

  ngOnInit(): void {
    this.resetPanelState();
    this.cdr.detectChanges();
  }

  private resetPanelState(): void {
    this.savedUrl = this.data.imagenActual?.trim() || null;
    this.previewUrl = this.savedUrl;
    this.selectedFile = null;
    this.markedForRemoval = false;
    this.saving = false;
    this.drawerRef.markPristine();
  }

  get hasPreview(): boolean {
    return !!this.previewUrl;
  }

  get canSave(): boolean {
    return !!this.selectedFile || this.markedForRemoval;
  }

  evDrawerHasUnsavedChanges(): boolean {
    return this.canSave;
  }

  triggerSelect(): void {
    this.fileInput?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (!this.imageOptimizationService.validateFileSize(file, 10)) {
        this.alertService.warning('Imagen demasiado grande', 'La imagen es demasiado grande. Máximo 10 MB.');
        input.value = '';
        return;
      }

      this.selectedFile = file;
      this.markedForRemoval = false;
      this.previewUrl = await this.imageOptimizationService.createPreview(file, 480);
      this.drawerRef.markDirty();
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error al procesar la imagen:', err);
      this.alertService.error('Error al procesar imagen', 'No se pudo procesar el archivo. Intenta con otro.');
      input.value = '';
    }
  }

  removeImage(): void {
    this.selectedFile = null;
    this.previewUrl = null;
    this.markedForRemoval = !!this.savedUrl;

    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }

    if (this.markedForRemoval) {
      this.drawerRef.markDirty();
    } else {
      this.drawerRef.markPristine();
    }
    this.cdr.detectChanges();
  }

  closePanel(): void {
    void this.drawerRef.close({ changed: false });
  }

  async save(): Promise<void> {
    if (!this.canSave || this.saving) {
      return;
    }

    this.saving = true;
    this.cdr.detectChanges();

    try {
      let imagenUrl: string | null | undefined = this.savedUrl;

      if (this.markedForRemoval && !this.selectedFile) {
        imagenUrl = null;
      } else if (this.selectedFile) {
        const uploaded = await this.uploadImage(this.selectedFile);
        if (!uploaded) {
          return;
        }
        imagenUrl = uploaded;
      }

      const updated = await this.eventosService.updateEvento(this.data.eventoId, {
        imagen_principal: imagenUrl ?? undefined,
      });

      const finalUrl = updated.imagen_principal ?? imagenUrl ?? null;
      this.savedUrl = finalUrl;
      this.previewUrl = finalUrl;
      this.selectedFile = null;
      this.markedForRemoval = false;
      this.alertService.success('Guardado', 'La imagen del evento se guardó correctamente.');
      this.drawerRef.markPristine();
      this.cdr.detectChanges();
      void this.drawerRef.close({ changed: true, imagenUrl: finalUrl });
    } catch (err) {
      console.error('Error guardando imagen del evento:', err);
      this.alertService.error('Error', 'No se pudo guardar la imagen del evento.');
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  private async uploadImage(file: File): Promise<string | null> {
    const usuario = this.authService.getUsuario();
    if (!usuario) {
      this.alertService.error('Error', 'No hay usuario autenticado.');
      return null;
    }

    const timestamp = Date.now();
    const fileName = `eventos/${usuario.id}/evento_${timestamp}.jpg`;

    const { error } = await this.storageService.uploadOptimizedImage('imagenes', fileName, file);

    if (error) {
      console.error('Error subiendo imagen:', error);
      this.alertService.error('Error al subir imagen', error.message || 'No se pudo subir la imagen.');
      return null;
    }

    return this.storageService.getPublicUrl('imagenes', fileName);
  }
}
