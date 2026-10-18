import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tooltipState } from '../../src/ui/state/tooltipState.svelte.js';
import { tooltip } from '../../src/ui/actions/tooltip.js';
import * as fs from 'fs';
import * as path from 'path';

class MockElement {
  private listeners: Record<string, Function[]> = {};
  public rect = { top: 100, bottom: 120, left: 300, right: 340, width: 40, height: 20 };

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

describe('Global Singleton Tooltip Portal & Auto-Flip System', () => {
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
    it('initializes with default hidden state', () => {
      expect(tooltipState.visible).toBe(false);
      expect(tooltipState.text).toBe('');
      expect(tooltipState.position).toBe('top');
    });

    it('updates text, coordinates, position and visibility on show()', () => {
      tooltipState.show({
        text: 'Aura neón del jugador',
        x: 450,
        y: 120,
        position: 'top'
      });

      expect(tooltipState.visible).toBe(true);
      expect(tooltipState.text).toBe('Aura neón del jugador');
      expect(tooltipState.x).toBe(450);
      expect(tooltipState.y).toBe(120);
      expect(tooltipState.position).toBe('top');
    });

    it('clears text and resets visible flag on hide()', () => {
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
    });
  });

  describe('2. use:tooltip Action & Auto-Flip Vertical Logic', () => {
    it('does not display tooltip when text is empty or whitespace', () => {
      const el = new MockElement();
      tooltip(el as any, '');
      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(false);

      tooltip(el as any, '   ');
      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(false);
    });

    it('positions tooltip above (position="top") when there is adequate space above', () => {
      const el = new MockElement();
      el.rect = { top: 250, bottom: 270, left: 500, right: 540, width: 40, height: 20 };

      tooltip(el as any, 'Frecuencia de muestreo');
      el.dispatchEvent('pointerenter');

      expect(tooltipState.visible).toBe(true);
      expect(tooltipState.position).toBe('top');
      expect(tooltipState.y).toBe(250 - 8); // rect.top - 8
    });

    it('auto-flips to bottom (position="bottom") when top boundary would clip (rect.top - estimatedHeight < padding)', () => {
      const el = new MockElement();
      // rect.top = 40, estimatedHeight = 60, padding = 12 => 40 - 60 = -20 < 12 => FLIP TO BOTTOM
      el.rect = { top: 40, bottom: 60, left: 500, right: 540, width: 40, height: 20 };

      tooltip(el as any, 'Sensibilidad táctica');
      el.dispatchEvent('pointerenter');

      expect(tooltipState.visible).toBe(true);
      expect(tooltipState.position).toBe('bottom');
      expect(tooltipState.y).toBe(60 + 8); // rect.bottom + 8
    });
  });

  describe('3. Viewport Clamping Horizontal Boundaries', () => {
    it('clamps horizontal position when element is too close to left edge', () => {
      const el = new MockElement();
      // rect.left = 10, width = 20 => center is 20
      // minX = padding(12) + estimatedHalfWidth(140) = 152
      el.rect = { top: 200, bottom: 220, left: 10, right: 30, width: 20, height: 20 };

      tooltip(el as any, 'Borde izquierdo');
      el.dispatchEvent('pointerenter');

      expect(tooltipState.visible).toBe(true);
      expect(tooltipState.x).toBe(152);
    });

    it('clamps horizontal position when element is too close to right edge', () => {
      const el = new MockElement();
      // window.innerWidth = 1280
      // maxX = 1280 - 12 - 140 = 1128
      // rect.left = 1250, width = 20 => center is 1260
      el.rect = { top: 200, bottom: 220, left: 1250, right: 1270, width: 20, height: 20 };

      tooltip(el as any, 'Borde derecho');
      el.dispatchEvent('pointerenter');

      expect(tooltipState.visible).toBe(true);
      expect(tooltipState.x).toBe(1128);
    });
  });

  describe('4. Event Lifecycle & Window Event Cleanup', () => {
    it('hides on pointerleave and blur', () => {
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

    it('hides on window scroll and resize', () => {
      const el = new MockElement();
      tooltip(el as any, 'Test de scroll');

      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(true);

      // Trigger window scroll
      for (const h of windowListeners['scroll'] || []) {
        h();
      }
      expect(tooltipState.visible).toBe(false);

      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(true);

      // Trigger window resize
      for (const h of windowListeners['resize'] || []) {
        h();
      }
      expect(tooltipState.visible).toBe(false);
    });

    it('updates text dynamically and hides if updated to empty', () => {
      const el = new MockElement();
      const instance = tooltip(el as any, 'Texto original');

      el.dispatchEvent('pointerenter');
      expect(tooltipState.text).toBe('Texto original');

      instance.update('Texto actualizado');
      expect(tooltipState.text).toBe('Texto actualizado');

      instance.update('');
      expect(tooltipState.visible).toBe(false);
    });

    it('destroys listeners and cleans up state on destroy()', () => {
      const el = new MockElement();
      const instance = tooltip(el as any, 'Texto transitorio');

      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(true);

      instance.destroy();
      expect(tooltipState.visible).toBe(false);

      el.dispatchEvent('pointerenter');
      expect(tooltipState.visible).toBe(false);
    });
  });

  describe('5. Zero-Clipping and Elimination of Local Tooltip-Bubbles', () => {
    it('confirms complete removal of .tooltip-bubble in SettingsModal, PhysicsModal and RoomCreator', () => {
      const uiDir = path.resolve(__dirname, '../../src/ui');

      const filesToCheck = [
        path.join(uiDir, 'modals/SettingsModal.svelte'),
        path.join(uiDir, 'modals/PhysicsModal.svelte'),
        path.join(uiDir, 'screens/RoomCreator.svelte')
      ];

      for (const filePath of filesToCheck) {
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Must not contain old .tooltip-bubble in markup or css
        expect(content).not.toContain('class="tooltip-bubble"');
        expect(content).not.toContain('.tooltip-bubble');

        // Must import and use the global action
        expect(content).toContain("import { tooltip }");
        expect(content).toContain("use:tooltip=");
      }
    });
  });
});
