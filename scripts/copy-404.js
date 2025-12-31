#!/usr/bin/env node

/**
 * Script para copiar index.html a 404.html
 * Solución para GitHub Pages: cuando no encuentra una ruta, sirve 404.html
 * Angular puede recuperar la ruta desde ahí y funcionar normalmente
 */

const fs = require('fs');
const path = require('path');

// Intentar diferentes rutas posibles según la versión de Angular
const possiblePaths = [
  path.join(__dirname, '..', 'dist', 'admin-panel', 'browser'), // Angular 17+ con browser subdirectory
  path.join(__dirname, '..', 'dist', 'admin-panel'), // Angular sin subdirectory
];

let distPath = null;
let indexPath = null;

// Buscar la ruta correcta
for (const possiblePath of possiblePaths) {
  const possibleIndexPath = path.join(possiblePath, 'index.html');
  if (fs.existsSync(possibleIndexPath)) {
    distPath = possiblePath;
    indexPath = possibleIndexPath;
    break;
  }
}

const notFoundPath = distPath ? path.join(distPath, '404.html') : null;

try {
  // Verificar que se encontró la ruta correcta
  if (!distPath || !indexPath) {
    console.error('❌ Error: No se encontró index.html en ninguna de las rutas esperadas:');
    possiblePaths.forEach(p => console.error(`   - ${p}`));
    console.log('💡 Ejecuta primero: npm run build:prod');
    process.exit(1);
  }

  console.log(`📁 Usando ruta: ${distPath}`);

  // Leer index.html
  const indexContent = fs.readFileSync(indexPath, 'utf8');

  // Escribir 404.html con el mismo contenido
  fs.writeFileSync(notFoundPath, indexContent, 'utf8');

  console.log('✅ 404.html creado exitosamente');
  console.log(`📁 Ubicación: ${notFoundPath}`);
  console.log('🚀 Listo para desplegar en GitHub Pages');
} catch (error) {
  console.error('❌ Error al crear 404.html:', error.message);
  process.exit(1);
}

