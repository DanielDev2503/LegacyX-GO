import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_KEYBINDS,
  DEFAULT_SETTINGS,
  assignUniqueKeybind,
  formatKeybindCode,
  isFloatingScoreCategoryEnabled,
  type KeybindConfig
} from '../../src/ui/state/gameUI.svelte';
import {
  MOUSE_DEADZONE_PX,
  MOUSE_FINE_CONTROL_RADIUS_PX,
  computeMouseMovementVector,
  mouseButtonToCode
} from '../../src/controllers/InputManager';
import {
  findActiveMentionToken,
  getMentionCandidates,
  applyMentionCandidate,
  segmentChatMentions
} from '../../src/ui/utils/chatMentions';
import { matchRecorder } from '../../src/recorder/MatchRecorder.svelte';

describe('Gate 6: Mouse Controls, Unique Keybinds, @Mentions, Floating Point Filters & .LXR Replay', () => {
  beforeEach(() => {
    if (matchRecorder.isRecording) {
      matchRecorder.stop();
    }
    matchRecorder.dismissPrompt();
  });

  describe('1. 100% Unique Keybind Remapping (Keyboard + Mouse0/Mouse1/Mouse2)', () => {
    it('swaps/removes duplicate codes across actions including Mouse0, Mouse1, and Mouse2', () => {
      const initial: KeybindConfig = JSON.parse(JSON.stringify(DEFAULT_KEYBINDS));

      // Bind kick to Mouse0 (Left Click) -> no conflict initially
      const step1 = assignUniqueKeybind(initial, 'kick', 'Mouse0');
      expect(step1.keybinds.kick).toEqual(['Mouse0']);
      expect(step1.swappedAction).toBeNull();

      // Now bind dash to Mouse0 -> steals Mouse0 from kick and swaps ArrowUp into kick!
      const step2 = assignUniqueKeybind(step1.keybinds, 'dash', 'Mouse0');
      expect(step2.swappedAction).toBe('kick');
      expect(step2.keybinds.dash).toEqual(['Mouse0']);
      expect(step2.keybinds.kick).toEqual(['ArrowUp']);

      // Verify zero duplicate codes across all actions
      const allAssigned = Object.values(step2.keybinds).flat();
      expect(new Set(allAssigned).size).toBe(allAssigned.length);

      expect(formatKeybindCode('Mouse0')).toBe('Click Izquierdo');
      expect(formatKeybindCode('Mouse1')).toBe('Click Central');
      expect(formatKeybindCode('Mouse2')).toBe('Click Derecho');
    });
  });

  describe('2. 360° Mouse Deadzone & Proportional Fine-Control Vector', () => {
    it('enforces deadzone <= 6px, smooth proportional throttle between 6px and 42px, and 1.0 throttle >= 42px', () => {
      expect(MOUSE_DEADZONE_PX).toBe(6);
      expect(MOUSE_FINE_CONTROL_RADIUS_PX).toBe(42);

      // Inside deadzone -> inactive, throttle = 0 (anti-jitter)
      const idle = computeMouseMovementVector(100, 100, 104, 100);
      expect(idle.active).toBe(false);
      expect(idle.throttle).toBe(0);

      // Halfway through fine-control span (6 + 18 = 24px) -> throttle = 0.5
      const mid = computeMouseMovementVector(0, 0, 0, 24);
      expect(mid.active).toBe(true);
      expect(mid.throttle).toBeCloseTo(0.5, 3);
      expect(mid.angle).toBeCloseTo(Math.PI / 2, 3);

      // Beyond fine-control radius (>= 42px) -> throttle clamped to 1.0
      const full = computeMouseMovementVector(0, 0, -60, 0);
      expect(full.active).toBe(true);
      expect(full.throttle).toBe(1.0);
      expect(full.angle).toBeCloseTo(Math.PI, 3);

      expect(mouseButtonToCode(0)).toBe('Mouse0');
      expect(mouseButtonToCode(1)).toBe('Mouse1');
      expect(mouseButtonToCode(2)).toBe('Mouse2');
      expect(mouseButtonToCode(4)).toBeNull();
    });
  });

  describe('3. Chat @Mentions (@all + Roster Autocomplete & Self Highlight)', () => {
    it('detects active @tokens, prioritizes @all + roster matches, inserts handle, and highlights self/@all', () => {
      const roster = [
        { name: 'CyberHost', team: 'red' },
        { name: 'inv_Striker', team: 'blue' }
      ];

      const input = 'Buen pase @cy';
      const token = findActiveMentionToken(input, input.length);
      expect(token).toEqual({ start: 10, end: 13, query: 'cy' });

      const candidates = getMentionCandidates(token!.query, roster);
      expect(candidates.map((c) => c.handle)).toEqual(['CyberHost']);

      const allCandidates = getMentionCandidates('', roster);
      expect(allCandidates[0]?.handle).toBe('all');
      expect(allCandidates).toHaveLength(3);

      const applied = applyMentionCandidate(input, token!, 'CyberHost');
      expect(applied.nextText).toBe('Buen pase @CyberHost ');

      const segsSelf = segmentChatMentions(
        'Atención @CyberHost y @inv_Striker!',
        'CyberHost',
        ['CyberHost', 'inv_Striker']
      );
      const mentions = segsSelf.filter((s) => s.kind === 'mention');
      expect(mentions).toHaveLength(2);
      expect(mentions[0]).toMatchObject({ value: '@CyberHost', isSelf: true, isAll: false });
      expect(mentions[1]).toMatchObject({ value: '@inv_Striker', isSelf: false, isAll: false });

      const segsAll = segmentChatMentions('GG @all bien jugado', 'inv_Striker', ['CyberHost']);
      const allMention = segsAll.find((s) => s.kind === 'mention');
      expect(allMention).toMatchObject({ value: '@all', isSelf: true, isAll: true });
    });
  });

  describe('4. Per-Category Floating Score Point Toggles', () => {
    it('filters individual score categories independently and honors master floatingPointsEnabled', () => {
      const cfg = {
        ...DEFAULT_SETTINGS,
        floatingPointsEnabled: true,
        floatingGoals: true,
        floatingShots: false,
        floatingPasses: false,
        floatingSaves: true
      };

      expect(isFloatingScoreCategoryEnabled(cfg, 'goal')).toBe(true);
      expect(isFloatingScoreCategoryEnabled(cfg, 'save')).toBe(true);
      expect(isFloatingScoreCategoryEnabled(cfg, 'shot')).toBe(false);
      expect(isFloatingScoreCategoryEnabled(cfg, 'pass')).toBe(false);

      cfg.floatingPointsEnabled = false;
      expect(isFloatingScoreCategoryEnabled(cfg, 'goal')).toBe(false);
    });
  });

  describe('5. Lightweight .LXR (LXR2 & LXR1) Replay Capture & Validation', () => {
    it('records quantized frames + goal markers, exports valid LXR2 JSON, keeps LXR1 backwards-compatible parse, and rejects corrupt files', () => {
      matchRecorder.start(null, {
        roomName: 'Final Clasificatoria',
        stadiumId: 'af_3v3',
        players: [{ id: 1, nickname: 'CyberPro', team: 'red', avatar: '10' }]
      });
      expect(matchRecorder.isRecording).toBe(true);

      matchRecorder.recordFrame({
        tick: 60,
        phase: 2,
        matchTimer: 175,
        redScore: 1,
        blueScore: 0,
        soundMask: 0,
        discs: [
          { id: 0, team: 0, x: 12.345, y: -45.678, vx: 0, vy: 0, flags: 0 },
          { id: 1000, team: 1, x: -120.4, y: 30.2, vx: 10, vy: 0, flags: 4, stamina: 75 }
        ]
      });
      matchRecorder.recordGoal({
        scoringTeam: 'red',
        scorerName: 'CyberPro',
        redScore: 1,
        blueScore: 0
      });

      const lxr = matchRecorder.stop();
      expect(matchRecorder.isRecording).toBe(false);
      expect(lxr).not.toBeNull();
      expect(lxr!.magic).toBe('LXR3');
      expect(lxr!.frames.length).toBe(1);
      expect(lxr!.goals.length).toBe(1);
      expect(lxr!.goals[0]!.scorerName).toBe('CyberPro');

      const serialized = JSON.stringify(lxr);
      const parsed = matchRecorder.parseReplayText(serialized);
      expect(parsed.magic).toBe('LXR3');
      expect(parsed.roomName).toBe('Final Clasificatoria');
      expect(parsed.redScore).toBe(1);

      // Verify backwards-compatible LXR1 parsing still works seamlessly
      const legacyV1 = JSON.stringify({
        magic: 'LXR1',
        version: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        roomName: 'Legacy Sala',
        stadiumId: 'mediano',
        durationSeconds: 12,
        redScore: 1,
        blueScore: 0,
        players: [{ id: 1, nickname: 'LegacyUser', team: 'red', avatar: 'LU' }],
        frames: lxr!.frames,
        goals: lxr!.goals
      });
      const parsedLegacy = matchRecorder.parseReplayText(legacyV1);
      expect(parsedLegacy.magic).toBe('LXR1');
      expect(parsedLegacy.roomName).toBe('Legacy Sala');

      expect(() => matchRecorder.parseReplayText('{"magic":"WRONG"}')).toThrow(
        'Archivo .lxr inválido o corrupto.'
      );
    });
  });
});
