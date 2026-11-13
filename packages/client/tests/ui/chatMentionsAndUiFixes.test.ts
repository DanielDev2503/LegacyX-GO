import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import {
  applyMentionCandidate,
  findActiveMentionToken,
  getMentionCandidates,
  segmentChatMentions
} from '../../src/ui/utils/chatMentions.js';
import { gameUI, type PlayerStatEntry } from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';
import { matchRecorder } from '../../src/recorder/MatchRecorder.svelte.js';
import InGameHUD from '../../src/ui/hud/InGameHUD.svelte';
import PhysicsModal from '../../src/ui/modals/PhysicsModal.svelte';
import TeamSelectModal from '../../src/ui/modals/TeamSelectModal.svelte';
import Lobby from '../../src/ui/screens/Lobby.svelte';
import SettingsModal from '../../src/ui/modals/SettingsModal.svelte';

const SRC_ROOT = resolve(__dirname, '../../src/ui');

function readUiFile(relPath: string): string {
  return readFileSync(resolve(SRC_ROOT, relPath), 'utf8');
}

describe('Task 5: Chat Mentions, HUD Polish, Stats Redesign, Lobby & Account Tab', () => {
  beforeEach(() => {
    gameUI.currentScreen = 'IN_GAME';
    gameUI.fsmPhase = 'PLAYING';
    gameUI.matchPhase = 2;
    gameUI.activeModal = 'NONE';
    gameUI.nickname = 'CyberHost';
    gameUI.timeLimit = 3;
    gameUI.matchTimerSeconds = 0;
    gameUI.isGoldenGoal = false;
    gameUI.currentSlidingEvent = null;
    (gameUI as any).slidingEventQueue = undefined;
    gameUI.chatMessages = [];
    gameUI.settings.chatOpacity = 0.95;
    gameUI.rosterPlayers = [
      { id: 1, name: 'CyberHost', nickname: 'CyberHost', team: 'red', avatar: 'CH', isHost: true },
      { id: 2, name: 'Striker', nickname: 'Striker', team: 'blue', avatar: 'ST' },
      { id: 3, name: 'Keeper', nickname: 'Keeper', team: 'red', avatar: 'KP' }
    ];
    gameUI.players = [...gameUI.rosterPlayers];
    gameUI.hasCompletedMatch = false;
    gameUI.lastMatchStats = null;
    gameUI.redTeamStats = [];
    gameUI.blueTeamStats = [];
    gameUI.mvp = null;
    gameUI.rooms = [];
    gameUI.lobbyError = null;
    gameUI.activeSettingsTab = 'controls';

    userProfile.isAuthenticated = false;
    userProfile.isGuest = true;
    userProfile.username = '';
    userProfile.email = '';
    userProfile.role = 'player';
    userProfile.isVerified = false;
    userProfile.elo = 1000;
    userProfile.stats = {
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      mvpCount: 0
    };

    if (matchRecorder.isRecording) {
      matchRecorder.stop();
    }
    matchRecorder.dismissPrompt();
    (matchRecorder as any).hasRecordedClip = false;
  });

  describe('Items 1 & 2: chatMentions self-exclusion, single-whitespace termination & sender awareness', () => {
    it('closes active mention token as soon as query contains any whitespace (including single space)', () => {
      const active = findActiveMentionToken('Hola @cy', 8);
      expect(active).toEqual({ start: 5, end: 8, query: 'cy' });

      const applied = applyMentionCandidate('Hola @cy', active!, 'Striker');
      expect(applied.nextText).toBe('Hola @Striker ');
      expect(findActiveMentionToken(applied.nextText, applied.nextCursor)).toBeNull();
      expect(findActiveMentionToken('@Striker ', 9)).toBeNull();
      expect(findActiveMentionToken('hola @a\tb', 8)).toBeNull();
    });

    it('excludes local player from mention candidates when excludeNickname is provided', () => {
      const roster = [
        { name: 'CyberHost', team: 'red' },
        { name: 'Striker', team: 'blue' }
      ];
      const candidates = getMentionCandidates('', roster, 'cyberhost');
      expect(candidates.map((c) => c.handle)).toEqual(['all', 'Striker']);
    });

    it('does not mark own sent messages as isSelf while marking incoming mentions and keeping @all flag', () => {
      const ownSegs = segmentChatMentions(
        'Aviso para @CyberHost y @all',
        'CyberHost',
        ['CyberHost', 'Striker'],
        'CyberHost'
      );
      const ownMentions = ownSegs.filter((s) => s.kind === 'mention');
      expect(ownMentions).toHaveLength(2);
      expect(ownMentions[0]).toMatchObject({ value: '@CyberHost', isSelf: false, isAll: false });
      expect(ownMentions[1]).toMatchObject({ value: '@all', isSelf: false, isAll: true });

      const peerSegs = segmentChatMentions(
        'Pase @CyberHost o @all!',
        'CyberHost',
        ['CyberHost', 'Striker'],
        'Striker'
      );
      const peerMentions = peerSegs.filter((s) => s.kind === 'mention');
      expect(peerMentions[0]).toMatchObject({ value: '@CyberHost', isSelf: true, isAll: false });
      expect(peerMentions[1]).toMatchObject({ value: '@all', isSelf: true, isAll: true });
    });

    it('InGameHUD passes gameUI.nickname to getMentionCandidates and msg.sender to segmentChatMentions', () => {
      gameUI.chatMessages = [
        { id: 'm1', sender: 'CyberHost', team: 'RED', text: 'Yo @CyberHost probando', timestamp: 1 },
        { id: 'm2', sender: 'Striker', team: 'BLUE', text: 'Oye @CyberHost pasa', timestamp: 2 }
      ];
      const { html } = render(InGameHUD);
      const ownLine = html.slice(html.indexOf('Yo '), html.indexOf('probando'));
      const peerLine = html.slice(html.indexOf('Oye '), html.indexOf('pasa'));
      expect(ownLine).toContain('@CyberHost');
      expect(ownLine).not.toMatch(/class="chat-mention-pill[^"]*is-self/);
      expect(peerLine).toMatch(/class="chat-mention-pill[^"]*is-self[^>]*>@CyberHost/);

      const src = readUiFile('hud/InGameHUD.svelte');
      expect(src).toMatch(/getMentionCandidates\([^)]*gameUI\.nickname/);
      expect(src).toMatch(/segmentChatMentions\([^)]*msg\.sender/);
    });
  });

  describe('Items 6, 8, 9, 10, 14, 18, 19, 23, 24: InGameHUD fixes', () => {
    it('Item 6: renders sliding event cards without .event-player and supports stacked queue', () => {
      (gameUI as any).slidingEventQueue = [
        {
          id: 'e1',
          playerName: 'CyberHost',
          eventType: 'GOL',
          pointsText: '+100 PTS',
          color: '#22c55e',
          team: 'red',
          timestamp: 1
        },
        {
          id: 'e2',
          playerName: 'CyberHost',
          eventType: 'PASE',
          pointsText: '+10 PTS',
          color: '#00e5ff',
          team: 'red',
          timestamp: 2
        }
      ];

      const { html } = render(InGameHUD);
      expect(html).toContain('hud-sliding-event-card');
      expect(html).toContain('event-badge');
      expect(html).toContain('event-points');
      expect(html).not.toContain('event-player');
      expect(html.match(/hud-sliding-event-card/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('Item 8: normalizes slider chatOpacity (10..100 -> 0.1..1.0, min 0.05)', () => {
      gameUI.settings.chatOpacity = 40;
      const { html: html40 } = render(InGameHUD);
      expect(html40).toContain('--chat-opacity: 0.4;');

      gameUI.settings.chatOpacity = 0;
      const { html: htmlMin } = render(InGameHUD);
      expect(htmlMin).toContain('--chat-opacity: 0.05;');

      gameUI.settings.chatOpacity = 0.75;
      const { html: htmlDec } = render(InGameHUD);
      expect(htmlDec).toContain('--chat-opacity: 0.75;');
    });

    it('Item 9: activates 30s warning glow in both KICKOFF (1) and PLAYING (2) and renders Golden Goal badge', () => {
      gameUI.timeLimit = 1; // 60 seconds
      gameUI.matchTimerSeconds = 40; // 20s left
      gameUI.isGoldenGoal = false;

      gameUI.matchPhase = 1;
      const { html: kickoffHtml } = render(InGameHUD);
      expect(kickoffHtml).toContain('is-warning-30s');

      gameUI.matchPhase = 2;
      const { html: playHtml } = render(InGameHUD);
      expect(playHtml).toContain('is-warning-30s');

      gameUI.isGoldenGoal = true;
      const { html: ggHtml } = render(InGameHUD);
      expect(ggHtml).toContain('glowing-ball-svg');
      expect(ggHtml).toContain('#FEF9C3');
      expect(ggHtml).toContain('#FACC15');
      expect(ggHtml).toContain('#451A03');
      expect(ggHtml).not.toContain('golden-goal-floating-badge');
      expect(ggHtml).not.toMatch(/GOL DE ORO/i);
      expect(ggHtml).not.toContain('is-warning-30s');
    });

    it('Item 10: removes sys-bolt-svg from system chat notices and CSS', () => {
      gameUI.chatMessages = [
        { id: 's1', sender: 'Sistema', team: 'SYSTEM', text: 'Partido iniciado', timestamp: 1, isSystem: true }
      ];
      const { html } = render(InGameHUD);
      expect(html).toContain('chat-system-notice');
      expect(html).not.toContain('sys-bolt-svg');

      const src = readUiFile('hud/InGameHUD.svelte');
      expect(src).not.toContain('sys-bolt-svg');
    });

    it('Item 14: renders opaque dark Cyber-Pitch backgrounds on .vs-card and .vs-team-half', () => {
      const src = readUiFile('hud/InGameHUD.svelte');
      expect(src).not.toMatch(/\.vs-card[\s\S]*backdrop-filter\s*:\s*blur/);
      expect(src).toMatch(/\.vs-team-half\s*\{[\s\S]*background:\s*#0c1424/);
      expect(src).toMatch(/\.vs-card\s*\{[\s\S]*background:\s*#080e18/);
    });

    it('Items 18 & 19 & 23: adds icon-only Ver Repeticiones left of Grabar, gates unauth, replaces post-stop banner without downloads', () => {
      const { html } = render(InGameHUD);
      const replayBtnIdx = html.indexOf('id="btn-hud-replays"');
      const recBtnIdx = html.indexOf('id="btn-hud-record"');
      expect(replayBtnIdx).toBeGreaterThan(-1);
      expect(recBtnIdx).toBeGreaterThan(-1);
      expect(replayBtnIdx).toBeLessThan(recBtnIdx);
      expect(html).toContain('aria-label="Ver Repeticiones"');
      expect(html).toContain('title="Ver Repeticiones guardadas"');
      expect(html).toContain('replay-btn-svg');
      expect(html).not.toContain('replay-label');
      expect(html).not.toContain('>Ver Repeticiones<');

      matchRecorder.showPostRecordPrompt = true;
      (matchRecorder as any).hasRecordedClip = true;
      const { html: postRecHtml } = render(InGameHUD);
      expect(postRecHtml).toContain(
        'Grabación guardada en tu cuenta. Ve al Visor de Repeticiones en el Lobby o HUD para verla o descargar el video.'
      );
      expect(postRecHtml).not.toContain('REPLAY (.LXR)');
      expect(postRecHtml).not.toContain('VIDEO (.');
      expect(postRecHtml).not.toContain('downloadVideo');

      const src = readUiFile('hud/InGameHUD.svelte');
      expect(src).toContain('Solo cuentas registradas pueden ver o grabar repeticiones.');
      expect(src).not.toContain('downloadReplay');
      expect(src).not.toContain('downloadVideo');
    });

    it('Item 24: allows text selection and copying inside .chat-messages-scroll and .chat-text', () => {
      const src = readUiFile('hud/InGameHUD.svelte');
      expect(src).toMatch(/\.chat-messages-scroll\s*\{[^}]*user-select:\s*text/);
      expect(src).toMatch(/\.chat-messages-scroll\s*\{[^}]*-webkit-user-select:\s*text/);
      expect(src).toMatch(/\.chat-text\s*\{[^}]*user-select:\s*text/);
      expect(src).toMatch(/\.chat-text\s*\{[^}]*-webkit-user-select:\s*text/);
      expect(src).toMatch(/\.chat-text\s*\{[^}]*cursor:\s*text/);
    });
  });

  describe('Item 3: PhysicsModal stamina regeneration defaults', () => {
    it('sets staminaRegenMovingRate defaultVal to 25 and resets staminaRegenMoving=false and rate=25', () => {
      const src = readUiFile('modals/PhysicsModal.svelte');
      expect(src).toMatch(/key:\s*'staminaRegenMovingRate'[\s\S]*?defaultVal:\s*25/);
      expect(src).toMatch(/handleReset\(\)[\s\S]*staminaRegenMoving[\s\S]*false/);
      expect(src).toMatch(/handleReset\(\)[\s\S]*staminaRegenMovingRate[\s\S]*25/);

      gameUI.activeModifiersTab = 'mechanics';
      const { html } = render(PhysicsModal);
      expect(html).toContain('Velocidad de recarga en movimiento');
    });
  });

  describe('Items 12 & 13: TeamSelectModal Slide 0 Stats Redesign', () => {
    it('renders PTS | G | A | S | P | T columns, saves, hero summary, team expand-all toggle, unique Set keys and full chips without Toques', () => {
      gameUI.matchPhase = 0;
      gameUI.fsmPhase = 'STOPPED';
      gameUI.hasCompletedMatch = true;
      gameUI.activeSlide = 'STATS';
      gameUI.activeModal = 'STATS';

      const makePlayer = (overrides: Partial<PlayerStatEntry>): PlayerStatEntry => ({
        nickname: 'Player',
        team: 'red',
        points: 100,
        goals: 1,
        assists: 0,
        passes: 3,
        shots: 2,
        saves: 4,
        ...overrides
      });

      const red1 = makePlayer({ nickname: 'Alpha', points: 240, goals: 2, assists: 1, saves: 3, passes: 5, shots: 4 });
      const blue1 = makePlayer({ nickname: 'Beta', team: 'blue', points: 180, goals: 1, assists: 1, saves: 6, passes: 2, shots: 3, isMvp: true });
      gameUI.redTeamStats = [red1];
      gameUI.blueTeamStats = [blue1];
      gameUI.mvp = blue1;
      gameUI.lastMatchStats = {
        redScore: 2,
        blueScore: 1,
        matchDuration: 185,
        winner: 'red',
        winnerTeamName: 'RED',
        redTeamName: 'RED',
        blueTeamName: 'BLUE',
        redTeam: [red1],
        blueTeam: [blue1],
        mvp: blue1
      };

      const { html } = render(TeamSelectModal);
      expect(html).toContain('PTS');
      expect(html).toContain('G');
      expect(html).toContain('A');
      expect(html).toContain('S');
      expect(html).toContain('P');
      expect(html).toContain('T');
      expect(html).toContain('03:05');
      expect(html).toContain('Desplegar todos');
      expect(html).not.toContain('Toques');

      const src = readUiFile('modals/TeamSelectModal.svelte');
      expect(src).toContain('expandedPlayers = $state<Set<string>>(new Set())');
      expect(src).toContain('toggleAllTeam');
      expect(src).toContain('player.saves ?? 0');
      expect(src).toContain('Gol (+100)');
      expect(src).toContain('Gol Pot. (+30)');
      expect(src).toContain('Gol Ef. (+30)');
      expect(src).toContain('Asist. (+50)');
      expect(src).toContain('Asist. Ef. (+20)');
      expect(src).toContain('Atajada (+100)');
      expect(src).toContain('Tiro (+20)');
      expect(src).toContain('Pase (+10)');
      expect(src).toContain('Hattrick (+100)');
      expect(src).toContain('Autogol (-50)');
      expect(src).not.toContain('Toques');
    });
  });

  describe('Items 15, 18, 27, 28: Lobby live ping, single logout nav, replay warning & effect dedup', () => {
    it('removes estimateRoomPing, shows "Midiendo..." when ping pending and live ms when > 0, replaces Inicio with Cerrar sesión when authenticated', () => {
      const lobbySrc = readUiFile('screens/Lobby.svelte');
      expect(lobbySrc).not.toContain('estimateRoomPing');
      expect(lobbySrc).toContain('sharedSignaling.probeRoomPing');
      expect(lobbySrc).not.toContain('gameUI.pushScoreEvent');
      expect(lobbySrc).toContain('Midiendo...');

      gameUI.rooms = [
        {
          id: 'R1',
          name: 'Sala Pending',
          playersCount: 2,
          maxPlayers: 6,
          ping: 0,
          roomType: 'casual',
          isPrivate: false,
          stadium: 'AF 3v3'
        },
        {
          id: 'R2',
          name: 'Sala Live',
          playersCount: 4,
          maxPlayers: 6,
          ping: 34,
          roomType: 'ranked',
          isPrivate: false,
          stadium: 'AF 3v3'
        }
      ];

      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      userProfile.username = 'ProUser';
      const { html: authHtml } = render(Lobby);
      expect(authHtml).toContain('Cerrar sesión');
      expect(authHtml).not.toContain('CERRAR SESIÓN');
      expect(authHtml).not.toContain('<span>Inicio</span>');
      expect(authHtml).toContain('34 ms');
      expect(authHtml).toContain('ping-optimal');
      expect(lobbySrc).toContain("room.ping > 0 ? `${room.ping} ms` : 'Midiendo...'");

      userProfile.isAuthenticated = false;
      userProfile.isGuest = true;
      const { html: guestHtml } = render(Lobby);
      expect(guestHtml).toContain('<span>Inicio</span>');
      expect(guestHtml).not.toContain('Cerrar sesión');
    });
  });

  describe('Item 29 & Style Constraint: SettingsModal Account Tab & zero backdrop-filter: blur', () => {
    it('renders Cuenta tab with authenticated summary + stats + 15-char rename and guest banner CTA', () => {
      const settingsSrc = readUiFile('modals/SettingsModal.svelte');
      expect(settingsSrc).toContain("'account'");
      expect(settingsSrc).toContain('Cuenta');
      expect(settingsSrc).toContain('maxlength="15"');

      // Avatar tab must NOT keep username-change-card
      const avatarSectionMatch = settingsSrc.match(/activeTab === 'avatar'[\s\S]*?(?=activeTab === 'account'|<\/div>\s*<\/div>\s*<\/div>)/);
      expect(avatarSectionMatch?.[0] ?? '').not.toContain('username-change-card');

      (gameUI as any).activeSettingsTab = 'account';
      userProfile.isAuthenticated = true;
      userProfile.isGuest = false;
      userProfile.username = 'Campeon10';
      userProfile.email = 'campeon@legacyx.gg';
      userProfile.role = 'admin';
      userProfile.isVerified = true;
      userProfile.elo = 1420;
      userProfile.stats = {
        matchesPlayed: 22,
        wins: 14,
        losses: 6,
        draws: 2,
        goals: 31,
        assists: 18,
        saves: 27,
        mvpCount: 7
      };

      const { html: authHtml } = render(SettingsModal);
      expect(authHtml).toContain('Campeon10');
      expect(authHtml).toContain('campeon@legacyx.gg');
      expect(authHtml).toContain('1420');
      expect(authHtml).toContain('31');
      expect(authHtml).toContain('27');
      expect(authHtml).toContain('maxlength="15"');

      userProfile.isAuthenticated = false;
      userProfile.isGuest = true;
      const { html: guestHtml } = render(SettingsModal);
      expect(guestHtml).toContain('Iniciar sesión / Crear cuenta');
    });

    it('contains zero backdrop-filter: blur rules across all owned Svelte components', () => {
      const files = [
        'hud/InGameHUD.svelte',
        'modals/PhysicsModal.svelte',
        'modals/TeamSelectModal.svelte',
        'modals/SettingsModal.svelte',
        'screens/Lobby.svelte'
      ];
      for (const file of files) {
        const src = readUiFile(file);
        expect(src, `${file} must not use backdrop-filter: blur`).not.toMatch(/backdrop-filter\s*:\s*blur/i);
      }
    });
  });
});
