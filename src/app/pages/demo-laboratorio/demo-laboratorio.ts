import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { EventosService } from '../../services/eventos.service';
import { DemoScenarioService } from '../../demo/demo-scenario.service';
import { DemoDataProvider } from '../../demo/demo-data.provider';
import {
  DemoScenarioId,
  DemoScenarioMeta,
  DemoScenarioParams,
} from '../../demo/demo-scenario.types';
import { Evento } from '../../types';
import { EvSelect } from '../../components/ev-select/ev-select';

interface ParamSlider {
  key: keyof DemoScenarioParams;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}

@Component({
  selector: 'app-demo-laboratorio',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EvSelect],
  templateUrl: './demo-laboratorio.html',
  styleUrls: ['./demo-laboratorio.css', '../eventos/eventos.css'],
})
export class DemoLaboratorio implements OnInit {
  scenarios: DemoScenarioMeta[] = [];
  selectedId: DemoScenarioId = 'good-pace';
  params: DemoScenarioParams = {
    aforoPctVendido: 70,
    diasAlEvento: 10,
    asistenciaPct: 0,
    productosVendidos: 85,
    cuponesUsados: 12,
    eventosEnCartera: 2,
    aforoTotal: 300,
  };

  eventos: Evento[] = [];
  heroEventoId: number | null = null;
  heroEventoOptions: { value: number; label: string }[] = [];
  loading = true;
  launching = false;
  simulationActive = false;
  activeLabel: string | null = null;

  readonly paramSliders: ParamSlider[] = [
    { key: 'aforoPctVendido', label: '% aforo vendido', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'diasAlEvento', label: 'Días al evento', min: -7, max: 45, step: 1 },
    { key: 'asistenciaPct', label: '% asistentes', min: 0, max: 100, step: 1, suffix: '%' },
    { key: 'productosVendidos', label: 'Productos vendidos', min: 0, max: 250, step: 1 },
    { key: 'cuponesUsados', label: 'Cupones usados', min: 0, max: 50, step: 1 },
    { key: 'eventosEnCartera', label: 'Eventos en cartera', min: 1, max: 4, step: 1 },
  ];

  constructor(
    private authService: AuthService,
    private eventosService: EventosService,
    private demoScenarioService: DemoScenarioService,
    private demoDataProvider: DemoDataProvider,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!this.authService.isShowcaseOrganizador()) {
      void this.router.navigate(['/dashboard-organizador']);
      return;
    }

    this.scenarios = this.demoScenarioService.listScenarios();
    this.syncFromActiveState();
    void this.loadEventos();
  }

  get selectedScenario(): DemoScenarioMeta | undefined {
    return this.scenarios.find((s) => s.id === this.selectedId);
  }

  selectScenario(id: DemoScenarioId): void {
    this.selectedId = id;
    const def = this.demoScenarioService.getScenarioDefinition(id);
    this.params = { ...def.defaultParams };
    this.cdr.detectChanges();
  }

  onHeroEventoChange(value: number | null): void {
    this.heroEventoId = value;
  }

  async launchDemo(): Promise<void> {
    if (this.launching) return;
    this.launching = true;
    this.cdr.detectChanges();

    this.demoScenarioService.activate(this.selectedId, this.params, this.heroEventoId);
    this.demoDataProvider.invalidateContextCache();
    this.simulationActive = true;
    this.activeLabel = this.demoScenarioService.getActiveLabel();

    this.launching = false;
    this.cdr.detectChanges();
    void this.router.navigate(['/dashboard-organizador']);
  }

  exitSimulation(): void {
    this.demoScenarioService.deactivate();
    this.demoDataProvider.invalidateContextCache();
    this.simulationActive = false;
    this.activeLabel = null;
    this.cdr.detectChanges();
  }

  private syncFromActiveState(): void {
    const active = this.demoScenarioService.getActiveState();
    if (active) {
      this.selectedId = active.scenarioId;
      this.params = { ...active.params };
      this.heroEventoId = active.heroEventoId;
      this.simulationActive = true;
      this.activeLabel = this.demoScenarioService.getActiveLabel();
    } else {
      const def = this.demoScenarioService.getScenarioDefinition(this.selectedId);
      this.params = { ...def.defaultParams };
    }
  }

  private async loadEventos(): Promise<void> {
    const orgId = this.authService.getUsuarioId();
    if (orgId == null) {
      this.loading = false;
      return;
    }
    try {
      const res = await this.eventosService.getEventos({ organizador_id: orgId, limit: 50 });
      this.eventos = res.data ?? [];
      this.heroEventoOptions = this.eventos.map((e) => ({
        value: e.id,
        label: e.titulo || `Evento #${e.id}`,
      }));
      if (!this.heroEventoId && this.eventos.length > 0) {
        this.heroEventoId = this.eventos[0].id;
      }
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}
