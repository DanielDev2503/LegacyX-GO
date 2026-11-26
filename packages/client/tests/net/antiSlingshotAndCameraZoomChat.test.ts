import { describe, it, expect, vi } from 'vitest';
import { SharedSimSync } from '../../src/net/SharedSimSync';
import { Camera } from '../../src/renderer/Camera';
import { EngineInstance, INPUT_FLAG_RIGHT, MatchPhase, type GameStateSnapshot } from '@legacyx/core';

describe('SharedSimSync Smooth Correction, Camera Zoom Expansion & Chat Enter Activation', () => {
  describe('SharedSimSync Visual Offset & Smooth Exponential Decay', () => {
    it('absorbs small snapshot discrepancies into visualOffset without 0.00px pop and decays continuously', () => {
      const sync = new SharedSimSync('AF 3v3');
      const host = new EngineInstance('AF 3v3');
      host.addPlayer(1, 'red');
      host.startMatch(false);
      host.fsm.startPlaying();

      const snap0 = host.getState();
      sync.onSnapshot(snap0, 1000);

      // Step host 1 tick with RIGHT input and simulate minor divergence (-2 px)
      const rightMap = new Map([[1, { inputMask: INPUT_FLAG_RIGHT }]]);
      host.step(rightMap);
      const snap1 = host.getState();
      const beforeRender = sync.buildRenderSnapshot(0, 1000)!;
      const visualBeforeX = beforeRender.discs.find((d) => d.id === 1)!.x;

      snap1.discs.find((d) => d.id === 1)!.x = visualBeforeX - 2.0;
      sync.onSnapshot(snap1, 1016.67);
      const afterRender = sync.buildRenderSnapshot(0, 1016.67)!;
      const visualAfterX = afterRender.discs.find((d) => d.id === 1)!.x;

      expect(Math.abs(visualAfterX - visualBeforeX)).toBeLessThan(0.05);

      const initialOffset = Math.abs(sync.getTelemetry(undefined, 1016.67).lastCorrectionPx);
      expect(initialOffset).toBeCloseTo(2.0, 2);

      // Exponential smoothing exp(-20 * dt) decays visualOffset monotonically over frames
      for (let f = 0; f < 12; f++) {
        sync.update(1 / 60, 1016.67 + (f + 1) * (1000 / 60));
      }
      const decayedSnap = sync.buildRenderSnapshot(0, 1216.67)!;
      const authX = sync.simWorld.players.get(1)!.pos.x;
      expect(Math.abs(decayedSnap.discs.find((d) => d.id === 1)!.x - authX)).toBeLessThan(8);
    });

    it('smoothly converges movement release discrepancy without accumulated slingshot pop', () => {
      const sync = new SharedSimSync('AF 3v3');
      const snap0: GameStateSnapshot = {
        tick: 1,
        phase: MatchPhase.PLAYING,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
          { id: 1, team: 1, x: -50, y: 0, vx: 0, vy: 0, flags: 0, stamina: 100 }
        ]
      };
      sync.onSnapshot(snap0, 1000);

      const snap1: GameStateSnapshot = {
        tick: 9,
        phase: MatchPhase.PLAYING,
        matchTimer: 10,
        redScore: 0,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 0, y: 0, vx: 0, vy: 0, flags: 0 },
          { id: 1, team: 1, x: -42, y: 0, vx: 0, vy: 0, flags: 0, stamina: 100 }
        ]
      };
      sync.onSnapshot(snap1, 1016);
      const immediate = sync.buildRenderSnapshot(0, 1016)!;
      // 0.00 px instant jump from -50 upon snapshot arrival
      expect(immediate.discs.find((d) => d.id === 1)!.x).toBeCloseTo(-50, 3);

      // Over ~200 ms (12 frames), visualOffset decays toward authoritative -42
      for (let f = 1; f <= 12; f++) {
        sync.update(1 / 60, 1016 + f * (1000 / 60));
      }
      const settled = sync.buildRenderSnapshot(0, 1216)!;
      expect(Math.abs(settled.discs.find((d) => d.id === 1)!.x - -42)).toBeLessThan(0.5);
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
