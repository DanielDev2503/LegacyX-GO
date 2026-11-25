import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { gameUI, DEFAULT_SETTINGS } from '../../src/ui/state/gameUI.svelte.js';
import { userProfile } from '../../src/ui/state/userProfile.svelte.js';
import { isBallSkin } from '../../src/renderer/ballDesigns.js';
import { musicPlayer } from '../../src/audio/MusicPlayer.svelte.js';
import IntroVideoOverlay from '../../src/ui/components/IntroVideoOverlay.svelte';
import LegalPage from '../../src/ui/screens/LegalPage.svelte';
import EmojiPickerPopover from '../../src/ui/components/EmojiPickerPopover.svelte';
import MatchScoreboard, { SCOREBOARD_DESIGNS } from '../../src/ui/components/MatchScoreboard.svelte';
import TutorialModal from '../../src/ui/modals/TutorialModal.svelte';
import SettingsModal from '../../src/ui/modals/SettingsModal.svelte';
import PhysicsModal from '../../src/ui/modals/PhysicsModal.svelte';
import TeamSelectModal from '../../src/ui/modals/TeamSelectModal.svelte';
import InGameHUD from '../../src/ui/hud/InGameHUD.svelte';
import Gatekeeper from '../../src/ui/screens/Gatekeeper.svelte';
import Lobby from '../../src/ui/screens/Lobby.svelte';

describe('Mega Update 25 Features Verification', () => {
  beforeEach(() => {
    gameUI.resetRoomSession();
    gameUI.setViewportEnvironment(1280, 720, false, false, false, false);
    gameUI.isGamepadActive = false;
    gameUI.isHudEditorOpen = false;
    gameUI.activeModal = 'NONE';
    gameUI.isPracticeMode = false;
    gameUI.roomType = 'casual';
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.settings.showTelemetryCard = DEFAULT_SETTINGS.showTelemetryCard;
    gameUI.settings.showPlayerNicknames = DEFAULT_SETTINGS.showPlayerNicknames;
  });

  it('renders clean IntroVideoOverlay without overlay HUD text or skip buttons', () => {
    const { body } = render(IntroVideoOverlay, { props: { onFinish: () => {} } });
    expect(body).toContain('data-testid="intro-video-overlay"');
    expect(body).toContain('<video');
    expect(body).not.toContain('SALTAR INTRO');
    expect(body).not.toContain('btn-skip-intro');
    expect(body).not.toContain('CYBER-PITCH ARENA');
  });

  it('removes "Ir a LegacyX-GO" link from LegalPage and keeps standalone legal shell', () => {
    const { body } = render(LegalPage);
    expect(body).toContain('data-testid="standalone-legal-page"');
    expect(body).not.toContain('Ir a LegacyX-GO');
    expect(body).not.toContain('back-game-btn');
  });

  it('uses 2-word artistic music titles in musica/ and picks a random initial track', () => {
    const musicDir = resolve(__dirname, '../../../../musica');
    const files = readdirSync(musicDir).filter((f) => f.toLowerCase().endsWith('.mp3'));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const file of files) {
      const base = file.replace(/\.mp3$/i, '');
      expect(base.split(/\s+/).length).toBe(2);
      expect(base.toLowerCase()).not.toContain('menu');
      expect(base.toLowerCase()).not.toContain('kickoff');
    }
    expect(typeof musicPlayer.nextTrack).toBe('function');
  });

  it('supports Champions League Starball & Scoreboard designs', () => {
    expect(isBallSkin('champions')).toBe(true);
    expect((SCOREBOARD_DESIGNS as readonly string[]).includes('champions')).toBe(true);
    const { body } = render(MatchScoreboard, {
      props: { design: 'champions', redScore: 2, blueScore: 1, clockText: '01:45' }
    });
    expect(body).toContain('design-champions');
    expect(body).toContain('champions-bar');
  });

  it('defaults Ping/FPS telemetry card to hidden (false), respects toggle, and hides mobile chat when modal is open', () => {
    expect(DEFAULT_SETTINGS.showTelemetryCard).toBe(false);
    expect(DEFAULT_SETTINGS.showPlayerNicknames).toBe(true);

    const hiddenHud = render(InGameHUD);
    expect(hiddenHud.body).not.toContain('hud-telemetry-corner');

    gameUI.settings.showTelemetryCard = true;
    const shownHud = render(InGameHUD);
    expect(shownHud.body).toContain('hud-telemetry-corner');

    gameUI.setViewportEnvironment(390, 844, true, false, true, true);
    gameUI.activeModal = 'TEAM_MANAGEMENT';
    const modalOpenHud = render(InGameHUD);
    expect(modalOpenHud.body).not.toContain('btn-mobile-chat-toggle');

    gameUI.activeModal = 'NONE';
    gameUI.isGamepadActive = true;
    const padHud = render(InGameHUD);
    expect(padHud.body).toContain('btn-mobile-chat-toggle');
    expect(padHud.body).not.toContain('mobile-controls-overlay');
  });

  it('renders EmojiPickerPopover cleanly, removes social/legal footers from Gatekeeper & Lobby, and renders TutorialModal', () => {
    const picker = render(EmojiPickerPopover, {
      props: { value: '🧤', onSelect: () => {}, testId: 'unit-emoji-picker' }
    });
    expect(picker.body).toContain('data-testid="unit-emoji-picker"');
    expect(picker.body).toContain('🧤');

    gameUI.avatarMode = 'emoji';
    const gate = render(Gatekeeper);
    expect(gate.body).not.toContain('gatekeeper-bottom-strip');
    expect(gate.body).toContain('data-testid="guest-emoji-picker"');
    gameUI.avatarMode = 'letters';

    const lobby = render(Lobby);
    expect(lobby.body).not.toContain('lobby-community-footer');
    expect(lobby.body).toContain('data-testid="btn-open-tutorial"');

    const tutorial = render(TutorialModal, { props: { isOpen: true, onClose: () => {} } });
    expect(tutorial.body).toContain('data-testid="tutorial-modal"');
    expect(tutorial.body).toContain('data-testid="tutorial-step-controls"');
  });

  it('splits Settings Controls into 3 subsections and adds dash slowdown to PhysicsModal Mechanics', () => {
    gameUI.activeSettingsTab = 'controls';
    const settingsHtml = render(SettingsModal).body;
    expect(settingsHtml).toContain('data-testid="controls-subtab-keyboard"');
    expect(settingsHtml).toContain('data-testid="controls-subtab-gamepad"');
    expect(settingsHtml).toContain('data-testid="controls-subtab-touch"');

    gameUI.activeSettingsTab = 'video';
    const videoHtml = render(SettingsModal).body;
    expect(videoHtml).toContain('data-testid="toggle-player-nicknames"');
    expect(videoHtml).toContain('data-testid="toggle-telemetry-card"');

    gameUI.activeModifiersTab = 'mechanics';
    const physicsHtml = render(PhysicsModal).body;
    expect(physicsHtml).toContain('Duración de freno post-dash');
    expect(physicsHtml).toContain('Reducción de velocidad post-dash');
  });

  it('renders 3-column Broadcast Lineup, supports Practice/Casual bots (blocked in Ranked), and fixes mobile Chat access + /admin command', () => {
    gameUI.setViewportEnvironment(390, 844, true, false, true, true);
    gameUI.isHost = false;
    gameUI.isAdmin = false;
    gameUI.matchPhase = 0;

    const nonAdminMenu = render(TeamSelectModal).body;
    expect(nonAdminMenu).toContain('data-testid="broadcast-lineup-3col"');
    expect(nonAdminMenu).toContain('id="slide-chat"');
    expect(nonAdminMenu).not.toContain('btn-add-bot-red');

    // Practice allows bots freely; Ranked strictly blocks bots even for Host
    gameUI.isHost = true;
    gameUI.isAdmin = true;
    gameUI.isPracticeMode = true;
    expect(gameUI.addBotToTeam('red', 'hard')).toBe(true);
    expect(gameUI.rosterPlayers.some((p) => p.isBot && p.team === 'red' && p.botDifficulty === 'hard')).toBe(true);
    expect(gameUI.setBotDifficulty(gameUI.rosterPlayers.find((p) => p.isBot)!.id, 'easy')).toBe(true);
    expect(gameUI.rosterPlayers.find((p) => p.isBot)!.botDifficulty).toBe('easy');

    gameUI.isPracticeMode = false;
    gameUI.roomType = 'ranked';
    expect(gameUI.addBotToTeam('blue', 'medium')).toBe(false);

    // Superadmin /admin command triggers callback only when role is superadmin
    let elevatedCount = 0;
    gameUI.registerUserRoleReader(() =>
      userProfile.isAuthenticated && !userProfile.isGuest ? userProfile.role : 'jugador'
    );
    gameUI.onSuperadminElevate = () => {
      elevatedCount++;
    };
    userProfile.isAuthenticated = true;
    userProfile.isGuest = false;
    userProfile.role = 'jugador';
    expect(gameUI.handleChatCommand('/admin')).toBe(true);
    expect(elevatedCount).toBe(0);

    userProfile.role = 'superadmin';
    expect(gameUI.handleChatCommand('/admin')).toBe(true);
    expect(elevatedCount).toBe(1);
  });
});
