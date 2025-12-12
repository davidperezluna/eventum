import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ImageOptimizationService {

  // Configuración para dispositivos móviles
  private readonly MOBILE_CONFIG = {
    maxWidth: 1200,        // Ancho máximo para eventos (más grande que productos)
    maxHeight: 800,        // Alto máximo para eventos
    quality: 0.85,         // Calidad de compresión (0.1 - 1.0)
    format: 'jpeg'        // Formato de salida
  };

  constructor() { }

  /**
   * Optimiza una imagen para dispositivos móviles
   * @param file Archivo de imagen original
   * @returns Promise<File> Archivo optimizado
   */
  async optimizeImageForMobile(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      try {
        // Validar que sea una imagen
        if (!file.type.startsWith('image/')) {
          reject(new Error('El archivo no es una imagen válida'));
          return;
        }

        // Crear un canvas para redimensionar y comprimir
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = () => {
          try {
            // Calcular nuevas dimensiones manteniendo la proporción
            const { width, height } = this.calculateDimensions(
              img.width, 
              img.height, 
              this.MOBILE_CONFIG.maxWidth, 
              this.MOBILE_CONFIG.maxHeight
            );

            // Configurar canvas
            canvas.width = width;
            canvas.height = height;

            // Dibujar imagen redimensionada
            ctx?.drawImage(img, 0, 0, width, height);

            // Convertir a blob con compresión
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  // Crear nuevo archivo con el nombre original
                  const optimizedFile = new File(
                    [blob], 
                    file.name, 
                    { 
                      type: `image/${this.MOBILE_CONFIG.format}`,
                      lastModified: Date.now()
                    }
                  );
                  
                  resolve(optimizedFile);
                } else {
                  reject(new Error('Error al procesar la imagen'));
                }
              },
              `image/${this.MOBILE_CONFIG.format}`,
              this.MOBILE_CONFIG.quality
            );
          } catch (error) {
            reject(error);
          }
        };

        img.onerror = () => {
          reject(new Error('Error al cargar la imagen'));
        };

        // Cargar la imagen
        img.src = URL.createObjectURL(file);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Calcula las nuevas dimensiones manteniendo la proporción
   */
  private calculateDimensions(
    originalWidth: number, 
    originalHeight: number, 
    maxWidth: number, 
    maxHeight: number
  ): { width: number; height: number } {
    let { width, height } = { width: originalWidth, height: originalHeight };

    // Si la imagen es más grande que los límites, redimensionar
    if (width > maxWidth || height > maxHeight) {
      const aspectRatio = width / height;

      if (width > height) {
        // Imagen horizontal
        width = Math.min(width, maxWidth);
        height = width / aspectRatio;
        
        if (height > maxHeight) {
          height = maxHeight;
          width = height * aspectRatio;
        }
      } else {
        // Imagen vertical
        height = Math.min(height, maxHeight);
        width = height * aspectRatio;
        
        if (width > maxWidth) {
          width = maxWidth;
          height = width / aspectRatio;
        }
      }
    }

    return {
      width: Math.round(width),
      height: Math.round(height)
    };
  }

  /**
   * Valida el tamaño del archivo antes de la optimización
   */
  validateFileSize(file: File, maxSizeMB: number = 10): boolean {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxSizeBytes;
  }

  /**
   * Obtiene información del archivo de imagen
   */
  getImageInfo(file: File): Promise<{ width: number; height: number; size: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height,
          size: this.formatFileSize(file.size)
        });
      };
      
      img.onerror = () => {
        reject(new Error('Error al obtener información de la imagen'));
      };
      
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Formatea el tamaño del archivo en formato legible
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Crea una vista previa de la imagen optimizada
   */
  createPreview(file: File, maxWidth: number = 300): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        try {
          const aspectRatio = img.width / img.height;
          const width = Math.min(img.width, maxWidth);
          const height = width / aspectRatio;

          canvas.width = width;
          canvas.height = height;

          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Error al crear la vista previa'));
      };

      img.src = URL.createObjectURL(file);
    });
  }
}

