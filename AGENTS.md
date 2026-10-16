# DIRECTIVAS PERMANENTES Y PROTOCOLO OPERATIVO — LEGACYX-GO

Este documento rige la arquitectura, desarrollo, refactorización y pruebas en el monorepo LegacyX-GO.
Arquitectura desacoplada en tres capas: Core Headless TS + Canvas 2D + Svelte 5 UI.

---

## MATRIZ DE ACTIVACIÓN DE SKILLS Y DIRECTIVAS POR SUBSISTEMA

### A. Motor Matemático (`packages/core/src/physics/`)
* **Skills Mandatarias:** `physics-tuning` + `ponytail`
* **Reglas:**
  1. **Paso temporal estrictamente fijo:** Prohibido el uso de deltas variables en la simulación física ($\Delta t = 1/60\text{ s}$, 60 Hz).
  2. **CCD y Substepping:** Aplicar substepping y Continuous Collision Detection (CCD) tipo raycast/swept circle para evitar tunelización en velocidades superiores a 900 px/s.
  3. **YAGNI / Zero Third-Party Physics:** Prohibido importar motores físicos externos (Matter.js, Box2D, Planck, etc.). Toda la física debe ser TypeScript plano determinista sin efectos secundarios.

### B. Protocolo y Red WebRTC (`packages/core/src/protocol/` y `packages/client/src/net/`)
* **Skills Mandatarias:** `multiplayer-game-architecture`
* **Reglas:**
  1. **Autoridad Estricta del Host:** Los clientes únicamente transmiten inputs empaquetados; el host es la única autoridad del mundo físico, puntuación y eventos de gol.
  2. **Serialización Binaria:** Serialización compacta en `ArrayBuffer` y `DataView` con cuantización de coordenadas a enteros fijos (e.g., int16/uint16).
  3. **DataChannels en Tiempo Real:** Configuración de RTCDataChannels en modo no ordenado y no confiable (`ordered: false`, `maxRetransmits: 0`) para prevenir bloqueo Head-of-Line.

### C. Interfaz de Usuario (`packages/client/src/ui/`)
* **Skills Mandatarias:** `writing-svelte5` + `svelte-styling`
* **Reglas:**
  1. **Exclusividad Svelte 5 Runes:** Usar únicamente `$state`, `$derived`, `$props`, `$effect`. Prohibida la sintaxis obsoleta de Svelte 3/4 (`export let`, `$:` reactivo, stores manuales redundantes).
  2. **Estilos Estrictamente Encapsulados:** Todo el diseño y CSS debe estar confinado al bloque `<style>` del componente. Prohibido contaminar estilos globales o resetear selectores que rompan otras vistas.

### D. Renderizador Canvas 2D (`packages/client/src/renderer/`)
* **Skills Mandatarias:** `maximizing-game-feel`
* **Reglas:**
  1. **Desacoplamiento e Interpolación:** Desacoplar el loop de render del tick físico mediante interpolación lineal (lerp) calculada entre estados anteriores y actuales en `requestAnimationFrame`.
  2. **Game Feel y Dinamismo:** Screen shake sutil en colisiones con postes, estelas de partículas/neón para trayectorias curvas (efecto Magnus) y textos flotantes efímeros optimizados.

### E. Audio y Efectos Sonoros (`packages/client/src/audio/`)
* **Skills Mandatarias:** `add-audio`
* **Reglas:**
  1. **Web Audio API Procedural:** Emplear síntesis nativa con osciladores y nodos de ganancia para efectos mecánicos (rebotes, silbato, disparos). Evitar assets de audio externos pesados innecesarios.
  2. **Gestión de Ciclo de Vida:** Desconectar y limpiar nodos de audio explícitamente tras su ejecución para evitar fugas de memoria y saturación del Garbage Collector.

### F. Validación, Tests y Cierre de Tareas
* **Skills Mandatarias:** `vitest` + `tdd-test-writer` + `ponytail`
* **Reglas:**
  1. **Tests de Regresión Determinista:** Test suites que certifiquen la invariabilidad de cálculos matemáticos en ejecuciones prolongadas (e.g., benchmark de 3,600 ticks deterministas).
  2. **Auditoría Ponytail al Cerrar Fase:** Revisión estricta para eliminar código muerto, tipos superfluos y capas de abstracción no requeridas (YAGNI).
