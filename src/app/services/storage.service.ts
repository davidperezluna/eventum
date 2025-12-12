import { Injectable, NgZone } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ImageOptimizationService } from './image-optimization.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(
    private supabaseService: SupabaseService,
    private imageOptimizationService: ImageOptimizationService,
    private zone: NgZone
  ) {}

  // Subir archivo
  async uploadFile(
    bucket: string,
    path: string,
    file: File,
    options?: { cacheControl?: string; upsert?: boolean }
  ): Promise<{ data: any; error: any }> {
    return new Promise((resolve, reject) => {
      this.zone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabaseService.storage
            .from(bucket)
            .upload(path, file, options);
          
          this.zone.run(() => {
            resolve({ data, error });
          });
        } catch (error) {
          this.zone.run(() => {
            reject(error);
          });
        }
      });
    });
  }

  // Subir imagen optimizada
  async uploadOptimizedImage(
    bucket: string,
    path: string,
    file: File,
    options?: { cacheControl?: string; upsert?: boolean }
  ): Promise<{ data: any; error: any; originalSize: number; optimizedSize: number }> {
    return new Promise((resolve, reject) => {
      this.zone.runOutsideAngular(async () => {
        try {
          // Optimizar imagen
          const optimizedFile = await this.imageOptimizationService.optimizeImageForMobile(file);
          
          // Subir imagen optimizada
          const { data, error } = await this.supabaseService.storage
            .from(bucket)
            .upload(path, optimizedFile, options);
          
          this.zone.run(() => {
            resolve({ 
              data, 
              error, 
              originalSize: file.size, 
              optimizedSize: optimizedFile.size 
            });
          });
        } catch (error) {
          this.zone.run(() => {
            reject(error);
          });
        }
      });
    });
  }

  // Obtener URL pública de archivo
  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabaseService.storage
      .from(bucket)
      .getPublicUrl(path);
    
    return data.publicUrl;
  }

  // Eliminar archivo
  async deleteFile(bucket: string, paths: string[]): Promise<{ data: any[] | null; error: any }> {
    return new Promise((resolve) => {
      this.zone.runOutsideAngular(async () => {
        try {
          const { data, error } = await this.supabaseService.storage
            .from(bucket)
            .remove(paths);
          
          this.zone.run(() => {
            resolve({ data, error });
          });
        } catch (error) {
          this.zone.run(() => {
            resolve({ data: null, error });
          });
        }
      });
    });
  }
}

