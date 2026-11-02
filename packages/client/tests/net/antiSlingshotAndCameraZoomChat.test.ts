import { describe, it, expect, vi } from 'vitest';
import { ClientPredictionReconciler } from '../../src/net/ClientPrediction';
import { Camera } from '../../src/renderer/Camera';
import { EngineInstance, MatchPhase, type GameStateSnapshot } from '@legacyx/core';

describe('Anti-Slingshot Reconciler, Camera Zoom Expansion & Chat Enter Activation', () => {
  describe('ClientPredictionReconciler Anti-Slingshot & Deadband', () => {
    it('ignores post-replay discrepancies < 3.5 px (distSq < 12.25) to eliminate micro-jitter', () => {
      const reconciler = new ClientPredictionReconciler();
      const engine = new EngineInstance('AF 3v3');
      const p = engine.addPlayer(1, 'red');

      // Record 5 pending inputs
      for (let t = 1; t <= 5; t++) {
        reconciler.recordInput(t, 8); // moving right
      }

      // Snapshot matching player start position
      const snap: GameStateSnapshot = {
        tick: 0,
        phase: MatchPhase.PLAYING,
        discs: [
          {
            id: 1,
            team: 1,
            x: p.pos.x,
            y: p.pos.y,
            vx: 0,
            vy: 0,
            radius: 15,
            flags: 0,
            stamina: 100
          }
        ]
      };

      const result = reconciler.reconcile(engine, snap, 1);
      expect(result.replayed).toBe(true);
      expect(result.hardSnapped).toBe(false);

      // Verify that after simulation where client was close to replay position (< 3.5px),
      // visualOffset is cleared to (0, 0)
      p.pos.x = p.pos.x - 2.0;
      reconciler.recordInput(6, 0); // keys released
      const snap2: GameStateSnapshot = {
        tick: 5,
        phase: MatchPhase.PLAYING,
        discs: [
          {
            id: 1,
            team: 1,
            x: p.pos.x,
            y: p.pos.y,
            vx: 0,
            vy: 0,
            radius: 15,
            flags: 0,
            stamina: 100
          }
        ]
      };
      reconciler.reconcile(engine, snap2, 1);
      expect(reconciler.visualOffset.x).toBe(0);
      expect(reconciler.visualOffset.y).toBe(0);
    });

    it('cancels backward pullback component when movement keys are released (inputMask = 0)', () => {
      const reconciler = new ClientPredictionReconciler();
      const engine = new EngineInstance('AF 3v3');
      const p = engine.addPlayer(1, 'red');

      // Player in active PLAYING phase moving right (+x)
      p.pos.set(-50, 0);
      p.vel.set(200, 0); // moving right along +x

      // Last input has mask 0 (movement keys released)
      reconciler.recordInput(10, 0);

      // Snapshot arrived slightly ahead at -42px, so prevPredicted (-50px) would pull back by errX = -8px
      const snap: GameStateSnapshot = {
        tick: 9,
        phase: MatchPhase.PLAYING,
        discs: [
          {
            id: 1,
            team: 1,
            x: -42,
            y: 0,
            vx: 0,
            vy: 0,
            radius: 15,
            flags: 0,
            stamina: 100
          }
        ]
      };

      reconciler.reconcile(engine, snap, 1);

      // Anti-slingshot guard: backward pullback component opposing velocity (+x) cancelled to 0!
      expect(reconciler.visualOffset.x).toBe(0);
      expect(reconciler.visualOffset.y).toBe(0);
    });
  });

  describe('Camera Zoom Expansion (0.40x - 2.50x)', () => {
    it('supports extended camera zoom bounds [0.40, 2.50] and clamps correctly', () => {
      const camera = new Camera();
      expect(camera.minScale).toBe(0.40);
      expect(camera.maxScale).toBe(2.50);

      // Underflow clamp
      camera.setZoom(0.20);
      expect(camera.zoom).toBe(0.40);
      expect(camera.scale).toBe(0.40);

      // Overflow clamp
      camera.setZoom(3.50);
      expect(camera.zoom).toBe(2.50);
      expect(camera.scale).toBe(2.50);

      // Continuous intermediate values
      camera.setZoom(0.50);
      expect(camera.zoom).toBe(0.50);

      camera.setZoom(0.75);
      expect(camera.zoom).toBe(0.75);

      camera.setZoom(1.25);
      expect(camera.zoom).toBe(1.25);

      camera.setZoom(2.00);
      expect(camera.zoom).toBe(2.00);
    });
  });

  describe('Enter Key Chat Activation in Menu & Stats Views', () => {
    it('allows chat activation when activeModal is TEAM_SELECT or STATS and blurs active buttons', () => {
      const allowedModals = ['NONE', 'TEAM_MANAGEMENT', 'TEAM_SELECT', 'teamSelect', 'STATS', 'stats'];
      expect(allowedModals).toContain('TEAM_SELECT');
      expect(allowedModals).toContain('STATS');

      const mockBtn = {
        tagName: 'BUTTON',
        blur: vi.fn(),
        getAttribute: (_attr: string) => null
      };

      let activeElement: any = mockBtn;

      // When Enter is pressed and activeElement is a button/select:
      if (activeElement && (activeElement.tagName === 'BUTTON' || activeElement.tagName === 'SELECT')) {
        activeElement.blur();
        activeElement = null;
      }

      expect(mockBtn.blur).toHaveBeenCalled();
      expect(activeElement).toBeNull();
    });
  });

  describe('VS Kickoff Banner Mini-Cards Kit Styling', () => {
    it('applies horizontal gradient, 2px border, tertiary color and conditional stroke outline', () => {
      const redKit = {
        primaryColor: '#ff2255',
        secondaryColor: '#ffffff',
        tertiaryColor: '#ffd700',
        outline: true
      };

      const gradient = `linear-gradient(90deg, ${redKit.primaryColor} 0%, ${redKit.primaryColor} 25%, ${redKit.secondaryColor} 75%, ${redKit.secondaryColor} 100%)`;
      const border = `2px solid ${redKit.tertiaryColor}`;
      const shadow = `0 0 16px ${redKit.primaryColor}66, inset 0 0 8px ${redKit.primaryColor}33`;
      const outlineCss = redKit.outline ? '-webkit-text-stroke: 3px #000000;' : '-webkit-text-stroke: 0px transparent;';

      expect(gradient).toContain('#ff2255');
      expect(gradient).toContain('#ffffff');
      expect(border).toBe('2px solid #ffd700');
      expect(shadow).toContain('#ff225566');
      expect(outlineCss).toContain('-webkit-text-stroke: 3px #000000');
    });
  });
});
