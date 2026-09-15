# YT Music Lite

Reproductor de musica de YouTube ultra eficiente y compacto enfocado en minimo uso de memoria RAM, CPU y ancho de banda.

---

## Caracteristicas Principales

- **Minimo consumo de recursos**:
  - Enfoque centrado en audio con resolucion forzada a 144p en segundo plano para evitar decodificacion de video pesada y saturacion de GPU.
  - Supresion de capas de renderizado (`visibility: hidden`) cuando el video se oculta.
  - Detencion total del sondeo de progreso en segundo plano (Page Visibility API) al minimizar a la bandeja (`0.0% CPU`).
  - Paquete frontend ultraligero (~10 KB total transferido, construido con TypeScript y CSS puro sin frameworks pesados).
- **Integracion con Bandeja de Windows (System Tray)**:
  - Se oculta en el area de notificacion junto al reloj (`tray.py`).
  - Permite alternar la ventana o cerrar la aplicacion limpiamente sin procesos zombi.
- **Modo Micro-Pill y Controles Reactivos**:
  - Posibilidad de ocultar la barra de busqueda, el reproductor de video o contraer todo a una pequeña pildora flotante.
- **Soporte de teclas multimedia de Windows**: Integracion completa con `navigator.mediaSession` para controlar reproduccion mediante teclas de hardware del teclado (Play/Pause, Siguiente, Anterior).
- **Buscador instantaneo y URLs**:
  - Busqueda rapida de pistas y artistas mediante la API InnerTube (`youtubei.js`) con cache LRU en memoria.
  - Soporte para pegar URLs directas de videos, shorts, directos o playlists completas.
- **Suite de Pruebas Automatizadas**:
  - Cobertura de codigo superior al 96% implementada con Vitest y `@vitest/coverage-v8`.

---

## Atajos de Teclado

- `Espacio`: Reproducir / Pausar
- `V`: Mostrar / Ocultar video
- `/`: Enfocar o abrir barra de busqueda
- `M`: Alternar modo micro-pildora
- `N`: Siguiente cancion
- `P`: Cancion anterior
- `Flecha Derecha`: Adelantar 5 segundos
- `Flecha Izquierda`: Rebobinar 5 segundos

---

## Requisitos

- Node.js (v18 o superior)
- pnpm (instalado globalmente)
- Python 3.10+ (con `pystray` y `pillow` para la bandeja de Windows)

---

## Instalacion y Puesta en Marcha

1. Instalar dependencias con pnpm y Python:
   ```bash
   pnpm install
   pip install pystray pillow
   ```

2. Compilar los recursos del cliente:
   ```bash
   pnpm run build
   ```

3. Iniciar la aplicacion:
   - **Opcion rapida**: Doble clic en `start.bat`.
   - **Opcion por terminal**:
     ```bash
     pythonw tray.py
     ```
   - **Modo solo servidor**:
     ```bash
     pnpm start
     ```

4. Ejecutar pruebas con cobertura:
   ```bash
   pnpm test:coverage
   ```

---

## Hoja de Ruta (Roadmap) - Futura Version Ultra-Nativa (< 30 MB RAM)

En una etapa posterior se tiene proyectado desarrollar una version completamente nativa de la aplicacion que rompa la barrera de los 100 MB:
- **Arquitectura prevista**: Eliminacion total de los motores web (Chromium/Edge y Node.js), implementando una aplicacion en binario nativo (C#, Rust o Python nativo ligero).
- **Decodificacion directa**: Extraccion y reproduccion del flujo de audio puro de YouTube de forma nativa (mediante `ffmpeg` o librerias como `miniaudio` / `rodio`).
- **Objetivo de rendimiento**: Operar con un consumo maximo de **20 a 30 MB de RAM** total en reposo y ejecucion.
