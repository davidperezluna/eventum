import { Injectable } from '@angular/core';

type CacheStorageType = 'local' | 'session';

@Injectable({
  providedIn: 'root'
})
export class AppCacheService {
  get<T>(key: string, storageType: CacheStorageType = 'local'): T | null {
    const storage = this.getStorage(storageType);
    if (!storage) return null;

    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn('[AppCache] Error leyendo cache, se elimina la clave', { key, error });
      try {
        storage.removeItem(key);
      } catch {
        // noop
      }
      return null;
    }
  }

  set<T>(key: string, value: T, storageType: CacheStorageType = 'local'): void {
    const storage = this.getStorage(storageType);
    if (!storage) return;

    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn('[AppCache] Error escribiendo cache', { key, error });
    }
  }

  remove(key: string, storageType: CacheStorageType = 'local'): void {
    const storage = this.getStorage(storageType);
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      // noop
    }
  }

  private getStorage(storageType: CacheStorageType): Storage | null {
    if (typeof window === 'undefined') return null;
    return storageType === 'session' ? window.sessionStorage : window.localStorage;
  }
}
