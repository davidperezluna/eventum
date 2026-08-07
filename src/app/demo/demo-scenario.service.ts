import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../services/auth.service';
import {
  DemoScenarioActiveState,
  DemoScenarioId,
  DemoScenarioMeta,
  DemoScenarioParams,
  DEFAULT_DEMO_SCENARIO_PARAMS,
} from './demo-scenario.types';
import { DemoScenarioDefinition } from './demo-scenario.interface';
import { getAllDemoScenarios, getDemoScenario, getDefaultDemoScenario } from './demo-scenario.registry';

const STORAGE_KEY = 'eventum:demo-scenario:active';

@Injectable({ providedIn: 'root' })
export class DemoScenarioService {
  private readonly state$ = new BehaviorSubject<DemoScenarioActiveState | null>(null);
  private hydrated = false;

  constructor(private authService: AuthService) {}

  /** Observable para layout / laboratorio (no usar en pantallas de negocio). */
  watchActiveState() {
    return this.state$.asObservable();
  }

  getActiveState(): DemoScenarioActiveState | null {
    this.ensureHydrated();
    return this.state$.value;
  }

  isSimulatedViewActive(): boolean {
    this.ensureHydrated();
    return this.canUseDemo() && this.state$.value != null;
  }

  listScenarios(): DemoScenarioMeta[] {
    return getAllDemoScenarios().map((s) => s.meta);
  }

  getScenarioDefinition(id: DemoScenarioId): DemoScenarioDefinition {
    return getDemoScenario(id) ?? getDefaultDemoScenario();
  }

  getActiveScenarioDefinition(): DemoScenarioDefinition | null {
    const state = this.state$.value;
    if (!state) return null;
    return this.getScenarioDefinition(state.scenarioId);
  }

  activate(scenarioId: DemoScenarioId, params?: Partial<DemoScenarioParams>, heroEventoId?: number | null): void {
    if (!this.canUseDemo()) return;
    const def = this.getScenarioDefinition(scenarioId);
    const merged: DemoScenarioParams = { ...def.defaultParams, ...params };
    const state: DemoScenarioActiveState = {
      scenarioId,
      params: merged,
      heroEventoId: heroEventoId ?? null,
    };
    this.persist(state);
    this.state$.next(state);
  }

  updateParams(partial: Partial<DemoScenarioParams>): void {
    const current = this.state$.value;
    if (!current || !this.canUseDemo()) return;
    const next: DemoScenarioActiveState = {
      ...current,
      params: { ...current.params, ...partial },
    };
    this.persist(next);
    this.state$.next(next);
  }

  setHeroEventoId(heroEventoId: number | null): void {
    const current = this.state$.value;
    if (!current || !this.canUseDemo()) return;
    const next = { ...current, heroEventoId };
    this.persist(next);
    this.state$.next(next);
  }

  deactivate(): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    this.state$.next(null);
  }

  getActiveLabel(): string | null {
    const def = this.getActiveScenarioDefinition();
    return def?.meta.title ?? null;
  }

  private canUseDemo(): boolean {
    return this.authService.isShowcaseOrganizador();
  }

  private ensureHydrated(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    if (!this.canUseDemo()) return;
    const stored = this.readStored();
    if (stored) {
      this.state$.next(stored);
    }
  }

  private persist(state: DemoScenarioActiveState): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private readStored(): DemoScenarioActiveState | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DemoScenarioActiveState;
      if (!parsed?.scenarioId) return null;
      return {
        scenarioId: parsed.scenarioId,
        params: { ...DEFAULT_DEMO_SCENARIO_PARAMS, ...parsed.params },
        heroEventoId: parsed.heroEventoId ?? null,
      };
    } catch {
      return null;
    }
  }
}
