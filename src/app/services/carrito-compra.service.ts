import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Evento, TipoBoleta } from '../types';

export interface ItemCarritoEvento {
  tipo: TipoBoleta;
  cantidad: number;
  datosAsistente?: {
    nombre?: string;
    documento?: string;
    email?: string;
    telefono?: string;
  };
  palco_ids?: (number | null)[];
}

interface CarritoPersistido {
  evento: Evento | null;
  items: ItemCarritoEvento[];
}

@Injectable({
  providedIn: 'root'
})
export class CarritoCompraService {
  private readonly storageKey = 'eventum_carrito_compra';
  private readonly eventoSubject = new BehaviorSubject<Evento | null>(null);
  private readonly itemsSubject = new BehaviorSubject<ItemCarritoEvento[]>([]);
  private readonly totalItemsSubject = new BehaviorSubject<number>(0);

  readonly evento$ = this.eventoSubject.asObservable();
  readonly items$ = this.itemsSubject.asObservable();
  readonly totalItems$ = this.totalItemsSubject.asObservable();

  constructor() {
    this.hidratarDesdeStorage();
  }

  getEventoSnapshot(): Evento | null {
    return this.eventoSubject.getValue();
  }

  getItemsSnapshot(): ItemCarritoEvento[] {
    return this.itemsSubject.getValue();
  }

  getCantidadEnCarrito(tipoBoletaId: number): number {
    const item = this.itemsSubject.getValue().find((it) => it.tipo.id === tipoBoletaId);
    return item ? item.cantidad : 0;
  }

  syncEvento(evento: Evento): boolean {
    const actual = this.eventoSubject.getValue();
    if (actual && actual.id !== evento.id) {
      this.itemsSubject.next([]);
      this.eventoSubject.next({ ...evento });
      this.persistir();
      this.actualizarTotalItems();
      return true;
    }

    if (!actual) {
      this.eventoSubject.next({ ...evento });
      this.persistir();
    }

    return false;
  }

  agregarAlCarrito(tipo: TipoBoleta): boolean {
    const items = this.itemsSubject.getValue().map((item) => ({
      ...item,
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
    }));
    const existente = items.find((item) => item.tipo.id === tipo.id);

    if (existente) {
      if (existente.cantidad >= tipo.cantidad_disponibles) {
        return false;
      }
      existente.cantidad += 1;
      if (this.esPalco(tipo)) {
        existente.palco_ids = existente.palco_ids || [];
        existente.palco_ids.push(null);
      }
    } else {
      if (tipo.cantidad_disponibles <= 0) {
        return false;
      }
      items.push({
        tipo: { ...tipo },
        cantidad: 1,
        datosAsistente: {},
        palco_ids: this.esPalco(tipo) ? [null] : undefined
      });
    }

    this.itemsSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
    return true;
  }

  quitarDelCarrito(tipoBoletaId: number): void {
    const items = this.itemsSubject.getValue().map((item) => ({
      ...item,
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
    }));
    const index = items.findIndex((item) => item.tipo.id === tipoBoletaId);
    if (index === -1) return;

    const item = items[index];
    if (item.cantidad > 1) {
      item.cantidad -= 1;
      if (this.esPalco(item.tipo) && item.palco_ids) {
        item.palco_ids = item.palco_ids.slice(0, item.cantidad);
      }
    } else {
      items.splice(index, 1);
    }

    this.itemsSubject.next(items);
    this.persistir();
    this.actualizarTotalItems();
  }

  eliminarDelCarrito(tipoBoletaId: number): void {
    const filtrados = this.itemsSubject
      .getValue()
      .filter((item) => item.tipo.id !== tipoBoletaId)
      .map((item) => ({
        ...item,
        palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
      }));
    this.itemsSubject.next(filtrados);
    this.persistir();
    this.actualizarTotalItems();
  }

  reemplazarItems(items: ItemCarritoEvento[]): void {
    const clonados = items.map((item) => ({
      ...item,
      tipo: { ...item.tipo },
      palco_ids: item.palco_ids ? [...item.palco_ids] : undefined
    }));
    this.itemsSubject.next(clonados);
    this.persistir();
    this.actualizarTotalItems();
  }

  vaciarCarrito(): void {
    this.itemsSubject.next([]);
    this.eventoSubject.next(null);
    this.persistir();
    this.actualizarTotalItems();
  }

  private actualizarTotalItems(): void {
    const total = this.itemsSubject.getValue().reduce((acc, item) => acc + item.cantidad, 0);
    this.totalItemsSubject.next(total);
  }

  private esPalco(tipo: TipoBoleta): boolean {
    return Math.max(1, Number(tipo.personas_por_unidad ?? 1)) > 1;
  }

  private hidratarDesdeStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        this.actualizarTotalItems();
        return;
      }
      const parsed = JSON.parse(raw) as CarritoPersistido;
      this.eventoSubject.next(parsed?.evento ?? null);
      this.itemsSubject.next(Array.isArray(parsed?.items) ? parsed.items : []);
    } catch (error) {
      console.warn('No se pudo restaurar el carrito desde storage:', error);
      this.eventoSubject.next(null);
      this.itemsSubject.next([]);
    } finally {
      this.actualizarTotalItems();
    }
  }

  private persistir(): void {
    const payload: CarritoPersistido = {
      evento: this.eventoSubject.getValue(),
      items: this.itemsSubject.getValue()
    };
    localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }
}

