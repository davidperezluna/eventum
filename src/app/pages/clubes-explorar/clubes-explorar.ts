import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CoversService } from '../../services/covers.service';
import { LugarCoverListado } from '../../types/covers';
import { COVERS_LABELS } from '../../core/covers-labels';

@Component({
  selector: 'app-clubes-explorar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './clubes-explorar.html',
  styleUrls: ['./clubes-explorar.css'],
})
export class ClubesExplorar implements OnInit {
  readonly coversLabels = COVERS_LABELS;

  loading = true;
  lugares: LugarCoverListado[] = [];

  constructor(
    private coversService: CoversService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    void this.cargar();
  }

  private refreshView(): void {
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.refreshView();
    try {
      this.lugares = await this.coversService.listarLugaresConCovers();
    } catch {
      this.lugares = [];
    } finally {
      this.loading = false;
      this.refreshView();
    }
  }

  formatCurrency(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(Number(value))) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value));
  }

  trackLugar(_index: number, lugar: LugarCoverListado): number {
    return lugar.id;
  }
}
