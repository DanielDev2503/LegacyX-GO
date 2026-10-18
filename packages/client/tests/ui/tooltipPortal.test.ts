import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tooltipState } from '../../src/ui/state/tooltipState.svelte.js';
import { tooltip, calculateTooltipPosition } from '../../src/ui/actions/tooltip.js';
import * as fs from 'fs';
import * as path from 'path';

class MockElement {
  private listeners: Record<string, Function[]> = {};
  public rect = { top: 250, bottom: 270, left: 500, right: 540, width: 40, height: 20 };

  public addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  public removeEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
  }

  public dispatchEvent(event: string) {
    const handlers = this.listeners[event] || [];
    for (const h of handlers) {
      h();
    }
  }

  public getBoundingClientRect() {
    return this.rect;
  }
}

describe('Global Singleton Tooltip Portal & 4-Layer Positioning Architecture', () => {
  let originalWindow: any;
  let windowListeners: Record<string, Function[]> = {};

  beforeEach(() => {
    tooltipState.hide();
    windowListeners = {};
    originalWindow = (globalThis as any).window;

    (globalThis as any).window = {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener: vi.fn((event: string, handler: Function) => {
        if (!windowListeners[event]) windowListeners[event] = [];
        windowListeners[event].push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: Function) => {
        if (!windowListeners[event]) return;
        windowListeners[event] = windowListeners[event].filter((h) => h !== handler);
      })
    };
  });

  afterEach(() => {
    tooltipState.hide();
    (globalThis as any).window = originalWindow;
  });

  describe('1. tooltipState Store', () => {
    it('initializes with default hidden state and null anchorRect', () => {
      expect(tooltipState.visible).toBe(false);
      expect(tooltipState.text).toBe('');
      expect(tooltipState.position).toBe('top');
      expect(tooltipState.anchorRect).toBeNull();
    });

    it('updates text, coordinates, position and anchorRect on show()', () => {
      const anchor = { left: 400, top: 100, right: 440, bottom: 120, width: 40, height: 20 };
      tooltipState.show({
        text: 'Aura neón del jugador',
        anchorRect: anchor,
        x: 450,
        y: 120,
        position: 'top'
      });

      expect(tooltipState.visible).toBe(true);
      expect(tooltipState.text).toBe('Aura neón del jugador');
      expect(tooltipState.x).toBe(450);
      expect(tooltipState.y).toBe(120);
      expect(tooltipState.position).toBe('top');
      expect(tooltipState.anchorRect).toEqual(anchor);
    });

    it('clears text, anchorRect and resets visible flag on hide()', () => {
      tooltipState.show({
        text: 'Efecto Magnus',
        x: 100,
        y: 200,
        position: 'bottom'
      });
      expect(tooltipState.visible).toBe(true);

      tooltipState.hide();
      expect(tooltipState.visible).toBe(false);
      expect(tooltipState.text).toBe('');
      expect(tooltipState.anchorRect).toBeNull();
    });
  });

  describe('2. Algoritmo Matemático calculateTooltipPosition (Two-Pass & Hard-Clamp)', () => {
    const defaultViewport = { width: 1280, height: 800 };
    const SAFE_MARGIN = 16;

    it('coloca el tooltip arriba (placement="top") cuando hay espacio suficiente (rect.top - height >= 16)', () => {
      const anchor = { top: 300, bottom: 320, left: 500, right: 540, width: 40, height: 20 };
      const tooltipSize = { width: 280, height: 60 };

      const result = calculateTooltipPosition(anchor, tooltipSize, defaultViewport, SAFE_MARGIN);

      expect(result.placement).toBe('top');
      // y = anchor.top - tooltipHeight - 8
      expect(result.y).toBe(300 - 60 - 8); // 232
      // x centrado = anchor.left + width/2 - tooltipWidth/2 = 500 + 20 - 140 = 380
      expect(result.x).toBe(380);
      // arrowX centrado en el ancla = anchorCenterX - x = 520 - 380 = 140
      expect(result.arrowX).toBe(140);
    });

    it('auto-flip hacia abajo (placement="bottom") cuando el espacio superior es menor a 16px', () => {
      // Caso Equipaciones de Equipo: título cerca del top (ej. top = 70px) con tooltip multilínea (height = 90px)
      const anchor = { top: 70, bottom: 90, left: 200, right: 224, width: 24, height: 20 };
      const tooltipSize = { width: 320, height: 90 };

      // 70 - 90 = -20 < 16 => DEBE rotar hacia abajo
      const result = calculateTooltipPosition(anchor, tooltipSize, defaultViewport, SAFE_MARGIN);

      expect(result.placement).toBe('bottom');
      // y = anchor.bottom + 8
      expect(result.y).toBe(90 + 8); // 98
      expect(result.y).toBeGreaterThanOrEqual(SAFE_MARGIN);
      // y + height no debe exceder ventana
      expect(result.y + tooltipSize.height).toBeLessThanOrEqual(defaultViewport.height - SAFE_MARGIN);
    });

    it('hard-clamp vertical: no permite que el tooltip se salga por abajo de la ventana', () => {
      // Elemento en la parte inferior de la ventana (ej. top = 760, bottom = 780)
      const anchor = { top: 760, bottom: 780, left: 400, right: 440, width: 40, height: 20 };
      const tooltipSize = { width: 280, height: 100 };

      // Espacio arriba: 760 - 100 = 660 >= 16 -> placement top
      // Pero y = 760 - 100 - 8 = 652
      const result = calculateTooltipPosition(anchor, tooltipSize, defaultViewport, SAFE_MARGIN);
      expect(result.placement).toBe('top');
      expect(result.y + tooltipSize.height).toBeLessThanOrEqual(defaultViewport.height - SAFE_MARGIN);

      // Ahora forzar que placement='bottom' se clampee al maxY si alguien está muy abajo
      const bottomAnchor = { top: 10, bottom: 780, left: 400, right: 440, width: 40, height: 20 };
      // 10 - 100 < 16 -> placement = 'bottom' -> y deseado = 780 + 8 = 788 -> clamped a 800 - 100 - 16 = 684
      const bottomResult = calculateTooltipPosition(bottomAnchor, tooltipSize, defaultViewport, SAFE_MARGIN);
      expect(bottomResult.placement).toBe('bottom');
      expect(bottomResult.y).toBe(defaultViewport.height - tooltipSize.height - SAFE_MARGIN);
    });

    it('hard-clamp horizontal: sujeta x a SAFE_MARGIN (16px) en el borde izquierdo y acota la flecha', () => {
      // Elemento pegado al borde izquierdo de la pantalla (left = 5px, width = 20px)
      const anchor = { top: 300, bottom: 320, left: 5, right: 25, width: 20, height: 20 };
      const tooltipSize = { width: 320, height: 60 };

      // anchorCenterX = 15. Sin clamp, x = 15 - 160 = -145. Con clamp, x = 16
      const result = calculateTooltipPosition(anchor, tooltipSize, defaultViewport, SAFE_MARGIN);

      expect(result.x).toBe(SAFE_MARGIN); // 16
      // Flecha acotada al margen mínimo (12px) dentro del tooltip
      expect(result.arrowX).toBe(12);
    });

    it('hard-clamp horizontal: sujeta x a maxX en el borde derecho y acota la flecha', () => {
      // Elemento pegado al borde derecho (left = 1260, width = 20)
      const anchor = { top: 300, bottom: 320, left: 1260, right: 1280, width: 20, height: 20 };
      const tooltipSize = { width: 320, height: 60 };

      // maxX = 1280 - 320 - 16 = 944
      const result = calculateTooltipPosition(anchor, tooltipSize, defaultViewport, SAFE_MARGIN);

      expect(result.x).toBe(944);
      // Flecha acotada al margen máximo (width - 12 = 308)
      expect(result.arrowX).toBe(320 - 12);
    });

    it('posiciona la flecha exactamente alineada con el centro del ancla en casos intermedios', () => {
      const anchor = { top: 300, bottom: 320, left: 400, right: 440, width: 40, height: 20 };
      const tooltipSize = { width: 280, height: 60 };

      const result = calculateTooltipPosition(anchor, tooltipSize, defaultViewport, SAFE_MARGIN);
      const anchorCenterX = anchor.left + anchor.width / 2; // 420
      // x = 420 - 140 = 280
      // arrowX = 420 - 280 = 140
      expect(result.arrowX).toBe(anchorCenterX - result.x);
    });
  });

  describe('3. use:tooltip Action & Reactividad', () => {
    it('no activa tooltip cuando el texto está vacío o en blanco', () => {
      const el = new MockElement();
      tooltip(el as any, '');
      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(false);

      tooltip(el as any, '   ');
      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(false);
    });

    it('guarda anchorRect y dimensiones iniciales calculadas al hacer hover/focus', () => {
      const el = new MockElement();
      el.rect = { top: 250, bottom: 270, left: 500, right: 540, width: 40, height: 20 };

      tooltip(el as any, 'Sensibilidad táctica');
      el.dispatchEvent('pointerenter');

      expect(tooltipState.visible).toBe(true);
      expect(tooltipState.anchorRect).toEqual(el.rect);
      expect(tooltipState.position).toBe('top');
      expect(tooltipState.y).toBe(250 - 60 - 8); // 182
    });

    it('auto-flip a bottom en la acción cuando rect.top es menor a estimatedHeight + SAFE_MARGIN', () => {
      const el = new MockElement();
      // rect.top = 40 < 60 + 16 (76)
      el.rect = { top: 40, bottom: 60, left: 500, right: 540, width: 40, height: 20 };

      tooltip(el as any, 'Rebote del balón');
      el.dispatchEvent('pointerenter');

      expect(tooltipState.visible).toBe(true);
      expect(tooltipState.position).toBe('bottom');
      expect(tooltipState.y).toBe(60 + 8); // rect.bottom + 8 = 68
    });

    it('se oculta limpiamente en pointerleave y blur', () => {
      const el = new MockElement();
      tooltip(el as any, 'Test de interacción');

      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(true);

      el.dispatchEvent('pointerleave');
      expect(tooltipState.visible).toBe(false);

      el.dispatchEvent('focus');
      expect(tooltipState.visible).toBe(true);

      el.dispatchEvent('blur');
      expect(tooltipState.visible).toBe(false);
    });

    it('se oculta en scroll de ventana y resize', () => {
      const el = new MockElement();
      tooltip(el as any, 'Test de scroll');

      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(true);

      for (const h of windowListeners['scroll'] || []) {
        h();
      }
      expect(tooltipState.visible).toBe(false);

      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(true);

      for (const h of windowListeners['resize'] || []) {
        h();
      }
      expect(tooltipState.visible).toBe(false);
    });

    it('actualiza el texto reactivamente con update() y limpia en destroy()', () => {
      const el = new MockElement();
      const instance = tooltip(el as any, 'Texto original');

      el.dispatchEvent('pointerenter');
      expect(tooltipState.text).toBe('Texto original');

      instance.update('Texto modificado');
      expect(tooltipState.text).toBe('Texto modificado');

      instance.destroy();
      expect(tooltipState.visible).toBe(false);
    });
  });

  describe('4. Erradicación Absoluta de .tooltip-bubble Local', () => {
    it('comprueba que ningún modal contenga estilos ni marcado .tooltip-bubble local', () => {
      const uiDir = path.resolve(__dirname, '../../src/ui');

      const filesToCheck = [
        path.join(uiDir, 'modals/SettingsModal.svelte'),
        path.join(uiDir, 'modals/PhysicsModal.svelte'),
        path.join(uiDir, 'screens/RoomCreator.svelte')
      ];

      for (const filePath of filesToCheck) {
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf-8');

        expect(content).not.toContain('class="tooltip-bubble"');
        expect(content).not.toContain('.tooltip-bubble');
        expect(content).toContain("import { tooltip }");
        expect(content).toContain("use:tooltip=");
      }
    });
  });
});
