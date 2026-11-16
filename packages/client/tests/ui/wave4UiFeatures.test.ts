import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_SETTINGS, gameUI } from '../../src/ui/state/gameUI.svelte.js';
import { SoundFX } from '../../src/audio/SoundFX.js';
import { DiscRenderer, activePitchEmotes, clearPitchEmotes } from '../../src/renderer/DiscRenderer.js';

function makeMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
}

describe('Wave-4 UI & Client Features', () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const clientSrc = resolve(__dirname, '../../src');

  beforeEach(() => {
    vi.stubGlobal('localStorage', makeMemoryStorage());
    clearPitchEmotes();
    gameUI.onPlayerEmote = null;
    gameUI.resetRoomSession();
    gameUI.saveSettings({
      ...DEFAULT_SETTINGS,
      localKit: { ...DEFAULT_SETTINGS.localKit },
      visitorKit: { ...DEFAULT_SETTINGS.visitorKit },
      emoteTriggers: [...DEFAULT_SETTINGS.emoteTriggers]
    });
  });

  afterEach(() => {
    clearPitchEmotes();
    gameUI.onPlayerEmote = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('defaults all sound volumes to 1.0 (100%) across DEFAULT_SETTINGS and SoundFX', () => {
    expect(DEFAULT_SETTINGS.masterVolume).toBe(1.0);
    expect(DEFAULT_SETTINGS.chatVolume).toBe(1.0);
    expect(DEFAULT_SETTINGS.sfxVolume).toBe(1.0);
    expect(DEFAULT_SETTINGS.envVolume).toBe(1.0);
    expect(DEFAULT_SETTINGS.crowdVolume).toBe(1.0);

    const sfx = new SoundFX();
    expect(sfx.volume).toBe(1.0);
  });

  it('enforces 1500ms chat cooldown to prevent spam and recovers after >= 1500ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    expect(gameUI.canSendChatNow(10_000)).toBe(true);
    gameUI.markChatSent(10_000);
    expect(gameUI.canSendChatNow(10_200)).toBe(false);
    expect(gameUI.canSendChatNow(11_499)).toBe(false);
    expect(gameUI.canSendChatNow(11_500)).toBe(true);
  });

  it('triggers pitch emote and forwards recording callback via gameUI.triggerPlayerEmote / onPlayerEmote', () => {
    const recordedEmotes: Array<{ playerId: number; emoji: string }> = [];
    gameUI.onPlayerEmote = (playerId, emoji) => {
      recordedEmotes.push({ playerId, emoji });
    };

    gameUI.triggerPlayerEmote(7, '🔥');

    const active = activePitchEmotes.get(7);
    expect(active).toBeDefined();
    expect(active?.emoji).toBe('🔥');
    expect(recordedEmotes).toEqual([{ playerId: 7, emoji: '🔥' }]);

    clearPitchEmotes();
    gameUI.settings.showPitchEmotes = false;
    gameUI.triggerPlayerEmote(7, '⚽');

    expect(activePitchEmotes.has(7)).toBe(false);
    expect(recordedEmotes).toEqual([
      { playerId: 7, emoji: '🔥' },
      { playerId: 7, emoji: '⚽' }
    ]);
  });

  it('omits avatar text/emoji when DiscRenderer.showPlayerAvatars is false and typing bubble when showTypingIndicator is false', () => {
    const renderer = new DiscRenderer();
    renderer.showPlayerAvatars = false;
    renderer.showTypingIndicator = false;

    const fillTexts: string[] = [];
    const mockCtx: any = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      ellipse: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillText: (text: string) => fillTexts.push(text)
    };

    const discs = [
      {
        id: 1,
        team: 1,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 15,
        avatar: '7',
        isTyping: true,
        isDashing: false,
        isTurbo: false,
        kicking: false,
        stamina: 100
      } as any
    ];

    renderer.render(mockCtx, discs, 1);
    expect(fillTexts).toEqual([]);
  });

  it('compiles RoomCreator (Canvas Captcha), Lobby (Disconnect Modal), SettingsModal (Video Redesign + CTAs), and InGameHUD (/var + Record Guard) cleanly in Svelte 5', () => {
    const targets = [
      'ui/screens/RoomCreator.svelte',
      'ui/screens/Lobby.svelte',
      'ui/modals/SettingsModal.svelte',
      'ui/hud/InGameHUD.svelte',
      'ui/modals/ReplayViewerModal.svelte'
    ];

    for (const rel of targets) {
      const code = readFileSync(resolve(clientSrc, rel), 'utf8');
      const result = compile(code, { filename: rel, runes: true });
      expect(result.js.code.length).toBeGreaterThan(100);
    }

    const roomCreatorCode = readFileSync(resolve(clientSrc, 'ui/screens/RoomCreator.svelte'), 'utf8');
    expect(roomCreatorCode).toContain('room-captcha-input');
    expect(roomCreatorCode).toContain('captchaCanvas');

    const lobbyCode = readFileSync(resolve(clientSrc, 'ui/screens/Lobby.svelte'), 'utf8');
    expect(lobbyCode).toContain('room-disconnect-modal');
    expect(lobbyCode).toContain('gameUI.roomDisconnectNotice');
  });
});
