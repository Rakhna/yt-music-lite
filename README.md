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
- **Reproduccion Continua / Autoplay Inteligente**:
  - Al terminar una pista o playlist, el reproductor consulta las recomendaciones relacionadas de YouTube (`/api/related/:id`) y continua reproduciendo sin interrupciones, replicando la experiencia nativa de YouTube Music.
  - Alternable mediante el boton dedicado `Auto` en la barra inferior o con el atajo de teclado `A`.
- **Control Flexible de la Barra de URL y Busqueda**:
  - Posibilidad de mostrar u ocultar la barra de entrada de URL en cualquier momento con el boton de cabecera (`/`), el boton de cierre integrado en la propia barra o la tecla `Escape`.
  - Copia rapida del enlace oficial de YouTube de la cancion actual mediante el boton al lado del titulo o con el atajo `C`.
  - Compatible tanto en modo estandar como en modo micro-pildora, ajustando automaticamente las dimensiones de la ventana.
- **Suite de Pruebas Automatizadas**:
  - Cobertura de codigo superior al 96% implementada con Vitest y `@vitest/coverage-v8`.
  - Simulacion interactiva de usuario completa (`pnpm test:user`) con 22 comprobaciones integradas.

---

## Atajos de Teclado

- `Espacio`: Reproducir / Pausar
- `V`: Mostrar / Ocultar video
- `/` o `Ctrl+L`: Mostrar / Enfocar barra de busqueda o URL
- `Escape`: Ocultar barra de busqueda o URL
- `A`: Activar / Desactivar reproduccion continua (Autoplay)
- `C`: Copiar enlace de YouTube de la pista actual
- `M`: Alternar modo micro-pildora
- `N`: Siguiente cancion (o siguiente recomendada si autoplay esta activo)
- `P`: Cancion anterior
- `Flecha Derecha`: Adelantar 5 segundos
- `Flecha Izquierda`: Rebobinar 5 segundos

---

## Opciones de Personalizacion

### 1. Seleccion de Icono del Reproductor y de la Bandeja
El proyecto incluye tres variantes oficiales de iconos en la carpeta `client/public/icons/`:
- `icon1`: Diseno clasico magenta con onda de audio.
- `icon2`: Diseno minimalista circular de disco de vinilo.
- `icon3`: Diseno moderno degradado con isotipo de reproduccion (predeterminado).

Para elegir el icono deseado:
1. Crear o editar el archivo `icon_choice.txt` en la raiz del proyecto con una sola linea:
   ```text
   icon1
   ```
   *(o `icon2` / `icon3` segun su preferencia).*
2. El lanzador `tray.py` cargara automaticamente el icono elegido para la bandeja del sistema (System Tray).
3. Para actualizar el acceso directo de su Escritorio con el nuevo icono elegido:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/create_shortcut.ps1
   ```

### 2. Modos de Visualizacion del Widget
- **Fijar en primer plano (Always on Top)**: Boton de chincheta (Pin) en la cabecera superior. Mantiene el reproductor siempre por encima de cualquier ventana de trabajo, o lo desfija para comportarse como una ventana estandard.
- **Modo Micro-Pildora (Atajo: `M`)**: Contrae la interfaz a una barra compacta ultra reducida con controles minimos. Al activarse, todo el cuerpo del reproductor se convierte en area de arrastre (`drag region`).
- **Alternancia de Video (Atajo: `V`)**: Oculta el contenedor de video manteniendo la reproduccion en segundo plano con resolucion forzada a 144p para optimizar el consumo de GPU.
- **Alternancia de Busqueda (Atajo: `/`)**: Muestra u oculta la caja de entrada de URLs y busqueda de canciones para una vista aun mas despejada.

### 3. Modo Widget Puro (Sin Barra de Tareas)
- Por defecto, la aplicacion opera en modo widget flotante de escritorio (`WS_EX_TOOLWINDOW`), permaneciendo visible sobre el fondo o ventanas segun se configure pero **sin ocupar espacio ni mostrar iconos en la barra de tareas de Windows**.
- Para minimizarlo o restaurarlo rapidamente se utiliza el icono de la bandeja del sistema (System Tray junto al reloj de Windows), haciendo clic izquierdo sobre el icono o seleccionando "Mostrar / Ocultar Widget" en el menu contextual.

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
