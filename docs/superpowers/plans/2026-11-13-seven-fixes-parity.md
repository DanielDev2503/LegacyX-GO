# LegacyX-GO 7-Item Fixes & Host/Non-Host Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `native_swarm` (`swarm`) to execute Tasks 1–6 in parallel across non-overlapping file ownership boundaries (`workspace: "share"` for authors, `"inherit"` for verifiers), followed by Task 7 verification and live browser E2E testing (`browser` subagent with `Model: "flash"`).

**Goal:** Deliver 7 interconnected bug fixes and UX refinements across engine, Supabase/Auth, signaling/WebRTC networking, Canvas replay compositor, and Svelte 5 HUD/modals while guaranteeing strict Host and Non-Host gameplay parity.

**Architecture:** The monorepo is strictly decoupled across `@legacyx/core` (fixed `1/60s` headless deterministic physics & scoring), `@legacyx/server` (WebSocket signaling + Auth/Ranked relay), and `@legacyx/client` (WebRTC P2P + Canvas 2D + Svelte 5 Runes UI). Each swarm author owns disjoint files so parallel edits cannot conflict.

**Tech Stack:** TypeScript 5, Vitest, Svelte 5 Runes (`$state`, `$derived`, `$props`, `$effect`), Canvas 2D, Node `ws`, WebRTC `RTCDataChannel` (`ordered: false, maxRetransmits: 0`), Supabase PostgreSQL (RPC + RLS + Triggers).

---

## Global Constraints

- **Physics (`AGENTS.md` §A):** Fixed timestep $\Delta t = 1/60\text{ s}$ only, zero external physics libraries, deterministic TS.
- **Networking (`AGENTS.md` §B):** Host authoritative; real-time channels remain `ordered: false, maxRetransmits: 0`; never break existing room join/play flows.
- **UI (`AGENTS.md` §C):** Svelte 5 Runes exclusively (`$state`, `$derived`, `$props`, `$effect`); strictly scoped `<style>`; **no `backdrop-filter: blur`** on modal/HUD overlays.
- **Host / Non-Host Parity:** Every UI card, event, banner, ping display, ball customization, and stat behavior must work identically (as designed for role) across both Host and Guest.
- **Zero File Collisions Across Swarm:** No two authors may edit the same file. Shared interface contracts are defined in the `Interfaces` block of each task.

---

## Review Focus (Top 5 High-Risk Edge Cases)

1. **Clock Skew & Fallback on Hover Ping (Item 3):** Client browser clock vs Signaling server clock can differ by seconds; WS probe fallback must never subtract browser `Date.now()` from server `Date.now()`, and ephemeral WebRTC hover probes must close cleanly within timeout without triggering `PEER_JOINED` or chat join messages for the Host.
2. **Double-Spend / Error Lockout on Name Change (Item 6):** Calling Supabase `change_username_once` with a duplicate/invalid name must return `{ success: false }` WITHOUT flipping `name_changed = true`, and re-logging / reloading must never overwrite the updated `profiles.username` with stale `auth.users.raw_user_meta_data`.
3. **Host vs Guest Score Event Delivery in Solo/Casual/Ranked (Item 1):** Sliding score events must emit for Casual `1v1+`, Ranked `1v1+`, `1v0` solo rooms, and Entrenamiento (`isPracticeMode`), for both Host (`playerId = 1`) and Guest (`localPlayerId >= 2`), while `roomType !== 'ranked'` or `1v0`/`isPracticeMode` MUST remain blocked from mutating global Supabase rankings/ELO.
4. **Replay Modal Click-Through / Z-Index Trap (Item 4):** Adding `pointer-events: auto` to `ReplayViewerModal.svelte .modal-backdrop` must block clicks from hitting `Lobby` / `InGameHUD` behind it while keeping interactive controls inside `.replay-shell` and the `<video>`/`<canvas>` controls clickable and responsive inside both Lobby and In-Game.
5. **Legacy Saved Ball Settings Migration (Item 7):** Players whose `localStorage` currently has `ballMode: 'texture'` and `ballSkin: 'solid'` must auto-migrate seamlessly to `ballMode: 'color'` (preserving solid appearance) without throwing or blanking the preview/renderer when the `"Sólido"` option is removed from `"Diseño"`.

---

## File Ownership Map (Parallel Swarm Safe)

| Worker Role | Owned Files (Exclusive) | Items Covered |
|---|---|---|
| `core-score` | `packages/core/src/index.ts`, `packages/core/src/game/GameEngine.ts`, `packages/core/tests/core-fixes-and-anticheat.test.ts`, `packages/core/tests/practiceMouseDashAndScoringRebalance.test.ts` | Item 1, Item 5 guard check |
| `supabase-auth` | `supabase/migrations/20261113203000_fix_username_change_rpc_and_backfill.sql`, `packages/client/src/ui/state/userProfile.svelte.ts`, `packages/server/src/auth/AuthService.ts`, `packages/client/tests/ui/profileUsernameChange.test.ts`, `packages/server/tests/usernameChangeRpc.test.ts` | Item 6 (+ live DB migration) |
| `net-ping` | `packages/server/src/signalingServer.ts`, `packages/client/src/net/NetworkHost.ts`, `packages/client/src/net/NetworkClient.ts`, `packages/client/src/net/SignalingClient.ts`, `packages/client/src/net/GameApp.ts`, `packages/client/src/ui/screens/Lobby.svelte`, `packages/server/tests/server-fixes.test.ts`, `packages/client/tests/net/hoverPingParity.test.ts` | Item 3 |
| `hud-modals` | `packages/client/src/ui/hud/InGameHUD.svelte`, `packages/client/src/ui/modals/ReplayViewerModal.svelte`, `packages/client/src/ui/modals/SettingsModal.svelte`, `packages/client/src/ui/hud/PostMatchCarousel.svelte`, `packages/client/tests/ui/chatMentionsAndUiFixes.test.ts`, `packages/client/tests/ui/modalsAndHudFixes.test.ts` | Items 1 (stats UI), 2, 4, 5, 6 (Account UI check), 7 |
| `replay-compositor` | `packages/client/src/recorder/ReplayHudCompositor.ts`, `packages/client/src/controllers/components/ScoreboardHUD.ts`, `packages/client/tests/recorder/cloudReplaysAndCompositor.test.ts` | Items 2 & 5 (WebM/Canvas compositor) |
| `client-wiring` | `packages/client/src/App.svelte`, `packages/client/src/ui/state/gameUI.svelte.ts`, `packages/client/tests/net/hostGuestParityIntegration.test.ts` | Items 1, 3 (Host/Guest telemetry), 7 (settings migration) |
| `verifier` | Read-only review + test runner + `svelte-check` + `vite build` | All Items |

---

### Task 1 (`core-score`): Emit Score Events & Match Stats Across Casual, Ranked, `1v0` & Entrenamiento

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/game/GameEngine.ts`
- Test: `packages/core/tests/core-fixes-and-anticheat.test.ts`
- Test: `packages/core/tests/practiceMouseDashAndScoringRebalance.test.ts`

**Interfaces:**
- Produces: `EngineInstance.canAwardMatchPoints(): boolean` and `GameEngine.canAwardPoints(): boolean` returning `this.fsm.state === MatchPhase.PLAYING` (or `currentState === MatchPhase.PLAYING`), emitting `score_event` (`goal`, `assist`, `save`, `shot`, `pass`, `ownGoal`, `hattrick`) without adding `km/h` text to `score_event` payloads.

- [ ] **Step 1: Write failing core tests for 1v0, `isPracticeMode`, Casual & Ranked event emission + PAUSED/anti-cheat retention**

Update `packages/core/tests/core-fixes-and-anticheat.test.ts` (`Item 11 + 12` suite) and `packages/core/tests/practiceMouseDashAndScoringRebalance.test.ts`:
- Assert `EngineInstance` emits `score_event` and updates `stats.points` / `stats.goals` / `stats.shots` in BOTH `isPracticeMode = true` AND `1v0` rooms (`red=1, blue=0`) when `fsm.state === MatchPhase.PLAYING`.
- Assert `GameEngine.canAwardPoints()` returns `true` whenever `fsm.currentState === MatchPhase.PLAYING` (including `isPracticeMode = true` and `1v0`), and returns `false` during `MatchPhase.PAUSE`, `MatchPhase.STOP`, `MatchPhase.KICKOFF`, `MatchPhase.CELEBRATION`.
- Assert all anti-exploit cooldowns and corridor/speed checks (`<220 px/s`, self-shots, rival cooldown reset attempts, out-of-PLAYING phases) remain strictly enforced.
- Assert goal `score_event.text` retains bonus labels (`¡Gol! +100`, `¡Gol de Potencia! +130`, `¡Gol con Efecto! +130`, `¡Golazo Potencia y Efecto! +160`) WITHOUT `km/h`.

- [ ] **Step 2: Run Vitest in `@legacyx/core` to confirm failure**

Run: `pnpm --filter @legacyx/core test`
Expected: FAIL on `practice`/`1v0` score event emission assertions (currently returning `0`).

- [ ] **Step 3: Update `canAwardMatchPoints()` (`packages/core/src/index.ts`) and `canAwardPoints()` (`packages/core/src/game/GameEngine.ts`)**

Modify `canAwardMatchPoints(): boolean` and `canAwardPoints(): boolean` so both allow awarding points & emitting `score_event` whenever in `MatchPhase.PLAYING` (no longer gated on `!this.isPracticeMode` or `redCount > 0 && blueCount > 0`). Also verify `step()` / `handleGoalScored()` order so goals crossed cleanly from `PLAYING` (and kickoff-transitioned touch -> playing) always award points/events accurately. Keep `shouldBypassKickoffBarriers()` strictly `this.isPracticeMode === true` (Item 5 from earlier remains intact!).

- [ ] **Step 4: Run `@legacyx/core` test suite**

Run: `pnpm --filter @legacyx/core test`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit in worker workspace**

```bash
git add packages/core/
git commit -m "fix(core): emit score events and stats across casual, solo 1v0, and practice matches"
```

---

### Task 2 (`supabase-auth`): Fix Username Change Trigger Bypass via Atomic RPC & Backfill Broken Accounts

**Files:**
- Create: `supabase/migrations/20261113203000_fix_username_change_rpc_and_backfill.sql`
- Modify: `packages/client/src/ui/state/userProfile.svelte.ts`
- Modify: `packages/server/src/auth/AuthService.ts`
- Create: `packages/client/tests/ui/profileUsernameChange.test.ts`
- Create: `packages/server/tests/usernameChangeRpc.test.ts`

**Interfaces:**
- Produces SQL RPC: `public.change_username_once(p_new_username text) RETURNS jsonb` (callable by `authenticated` with caller JWT via `/rest/v1/rpc/change_username_once`).
- Produces `userProfile.changeUsernameOnce(newName: string): Promise<boolean>` which updates `username`, `displayName`, `nameChanged`, `gameUI.setPlayerNickname`, persisted session, active room profile, and refreshes `fetchLeaderboard()` + `fetchPersonalRank()`.

- [ ] **Step 1: Write failing tests for client & server username change RPC and profile hydration**

- Create `packages/client/tests/ui/profileUsernameChange.test.ts`:
  - Assert `userProfile.changeUsernameOnce('NewAlias')` calls `POST .../rest/v1/rpc/change_username_once` with `{ p_new_username: 'NewAlias' }` (NOT `PATCH /rest/v1/profiles`), updates `userProfile.username === 'NewAlias'`, `userProfile.displayName === 'NewAlias'`, `userProfile.nameChanged === true`, updates `localStorage` persisted session, and triggers leaderboard + personal rank refresh.
  - Assert on `{ success: false, error: '...' }` (duplicate/already used), `nameChanged` stays `false` (or unchanged) and `username` is not mutated, and `authError` is populated.
  - Assert 401/expired JWT refreshes session via `ensureValidAccessToken` and retries cleanly.
- Create `packages/server/tests/usernameChangeRpc.test.ts`:
  - Assert `AuthService.fetchFullProfile` maps `username`, `displayName`, and `nameChanged` accurately, and check `sync_player_profile` / login metadata handling respects authoritative `profiles.username`.

- [ ] **Step 2: Run new client & server tests to verify they fail**

Run: `pnpm --filter @legacyx/client test tests/ui/profileUsernameChange.test.ts` and `pnpm --filter @legacyx/server test tests/usernameChangeRpc.test.ts`
Expected: FAIL (`changeUsernameOnce` currently calls `PATCH /rest/v1/profiles` instead of `rpc/change_username_once`).

- [ ] **Step 3: Create & apply Supabase migration `20261113203000_fix_username_change_rpc_and_backfill.sql`**

1. Set `PERFORM set_config('app.bypass_profile_guard', 'on', true);` inside a `DO $$` block to backfill inconsistent existing rows where `name_changed = true` and `display_name IS NOT NULL AND TRIM(display_name) <> '' AND display_name <> username`:
   - If `TRIM(display_name)` matches `^[A-Za-z0-9_]{3,20}$`, `!~~* 'inv_%'`, and no other `profiles` row owns `LOWER(TRIM(display_name))`, update `username = TRIM(display_name)`, `display_name = TRIM(display_name)`, and sync `auth.users.raw_user_meta_data` (`username` & `display_name`). (Repairs `victorsamchez40` -> `Yami`!)
   - Otherwise reset `display_name = username, name_changed = false` so the user regains their valid one-time rename.
2. Create `public.change_username_once(p_new_username text) RETURNS jsonb` (`SECURITY DEFINER`, `SET search_path TO 'public', 'auth', 'pg_temp'`):
   - Authenticate via `auth.uid()`. Reject if null.
   - Normalize `v_clean := TRIM(COALESCE(p_new_username, ''))`. Validate `v_clean ~ '^[A-Za-z0-9_]{3,20}$'` and `v_clean !~* '^inv_'`.
   - Select current row `FOR UPDATE` from `public.profiles`. Reject if `name_changed = true`.
   - Reject if `LOWER(v_clean) = LOWER(v_current.username)` ("El nuevo nombre es igual al actual.").
   - Reject if `EXISTS (SELECT 1 FROM public.profiles WHERE id <> v_uid AND LOWER(username) = LOWER(v_clean))` without modifying `name_changed`!
   - `PERFORM set_config('app.bypass_profile_guard', 'on', true);`
   - Update `public.profiles SET username = v_clean, display_name = v_clean, name_changed = true WHERE id = v_uid;`
   - Update `auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', v_clean, 'display_name', v_clean) WHERE id = v_uid;`
   - Return `{ success: true, username: v_clean, display_name: v_clean, name_changed: true }`.
   - `REVOKE ALL ON FUNCTION public.change_username_once(text) FROM PUBLIC, anon;` and `GRANT EXECUTE ON FUNCTION public.change_username_once(text) TO authenticated;`
3. Ensure `get_leaderboard` & `get_player_rank_summary` remain consistent (reading updated `p.username`).

*(Note for execution phase: Apply migration to live project `jeopwutoxmaagxlebpsl` via `supabase_mcp:apply_migration` and verify with SQL SELECT on `victorsamchez40` -> `Yami` while leaving `Dev_test` `name_changed = false`!)*

- [ ] **Step 4: Implement RPC client flow in `packages/client/src/ui/state/userProfile.svelte.ts` and `AuthService.ts` sync check**

- Update `changeUsernameOnce(newName)` to invoke `POST ${this.supabaseUrl}/rest/v1/rpc/change_username_once`, handle 401 refresh retry, update `username`, `displayName`, `nameChanged`, `persistSession()`, sync `gameUI.setPlayerNickname(clean)` and active room profile (`gameApp` / callback if registered without circular dependency, e.g., `onUsernameChanged` hook wired from `GameApp` or `userProfile` event), and refresh `fetchPersonalRank()` + `fetchLeaderboard()`.
- Verify `AuthService.ts` (`sync_player_profile` / Google login / `fetchFullProfile`) always prefers `profiles.username` when returning existing user profiles.

- [ ] **Step 5: Run tests & commit**

Run: `pnpm --filter @legacyx/client test tests/ui/profileUsernameChange.test.ts` and `pnpm --filter @legacyx/server test tests/usernameChangeRpc.test.ts`
Expected: PASS.

```bash
git add supabase/migrations/20261113203000_fix_username_change_rpc_and_backfill.sql packages/client/src/ui/state/userProfile.svelte.ts packages/server/src/auth/AuthService.ts packages/client/tests/ui/profileUsernameChange.test.ts packages/server/tests/usernameChangeRpc.test.ts
git commit -m "fix(auth,db): repair one-time username change via SECURITY DEFINER RPC and backfill mismatched rows"
```

---

### Task 3 (`net-ping`): Direct WebRTC Hover Ping Probe + Clock-Skew-Free WS Fallback + In-Room Parity

**Files:**
- Modify: `packages/server/src/signalingServer.ts`
- Modify: `packages/client/src/net/NetworkHost.ts`
- Modify: `packages/client/src/net/NetworkClient.ts`
- Modify: `packages/client/src/net/SignalingClient.ts`
- Modify: `packages/client/src/net/GameApp.ts`
- Modify: `packages/client/src/ui/screens/Lobby.svelte`
- Modify: `packages/server/tests/server-fixes.test.ts`
- Create: `packages/client/tests/net/hoverPingParity.test.ts`

**Interfaces:**
- Signaling protocol:
  - WS clock-skew-free relay: `ROOM_PING_PROBE` stamps server monotonic/epoch `serverRelaySentAt` internally and returns `clientSentAt` untouched alongside `hostRelayMs` & `hostWsRttMs` in `ROOM_PING_RESULT` (`SignalingClient` measures `now - clientSentAt` strictly on the SAME browser clock).
  - Direct ephemeral WebRTC hover probe: `RTC_PING_SIGNAL` relayed directly between requester `peerId` and `room.hostPeerId` tagged with `probeId` — strictly isolated from `PEER_JOINED`, player count, `players` Map, and chat join notices.
- Client API: `SignalingClient.probeRoomPing(roomId: string): Promise<number>` attempts direct WebRTC probe first (using `room.hostPeerId` or `roomId`, cached 8s per `roomId` with in-flight deduplication and clean timeout fallback to clock-skew-free WS RTT).
- In-room parity (`GameApp.ts` + `NetworkClient.ts`): Host sets `gameUI.pingMs = 0` (authoritative match server); Guest displays WebRTC `DataChannel` RTT (`PING_PROBE`/`PONG_PROBE` on the same channel type used in hover probe).

- [ ] **Step 1: Write failing tests for clock-skewed clocks, WS relay fallback, and isolated WebRTC hover probe**

- In `packages/server/tests/server-fixes.test.ts`:
  - Add test where guest sends `clientSentAt = Date.now() - 5000` OR `+ 5000` (simulating severe browser vs server clock skew) and verify server does NOT bake skewed `Date.now() - clientSentAt` into `pingMs`, instead returning `clientSentAt` untouched + server-measured `hostRelayMs`.
  - Add test for `RTC_PING_SIGNAL` relay between Lobby requester and Host without emitting `PEER_JOINED` or modifying `room.playerCount`.
- Create `packages/client/tests/net/hoverPingParity.test.ts`:
  - Verify `NetworkHost` handles ephemeral `RTC_PING_SIGNAL` offer/ICE on an isolated probe peer without adding a player, calling `onPlayerJoined`, or sending `se ha unido a la sala` chat notice, answers `{ type: 'PONG_PROBE', t }`, and tears down cleanly.
  - Verify `SignalingClient.probeRoomPing` deduplicates/caches (`8000 ms`), ignores skewed server clocks by measuring `clientNow - localSentAt`, prefers direct WebRTC probe RTT when available, and seamlessly falls back to clock-skew-free WS RTT for Dedicated/non-P2P hosts.

- [ ] **Step 2: Run server & client ping tests to confirm failure**

Run: `pnpm --filter @legacyx/server test tests/server-fixes.test.ts` and `pnpm --filter @legacyx/client test tests/net/hoverPingParity.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement clock-skew fix & `RTC_PING_SIGNAL` in `signalingServer.ts`, `SignalingClient.ts`, `NetworkHost.ts`, `GameApp.ts`, `NetworkClient.ts`, `Lobby.svelte`**

1. `signalingServer.ts`:
   - In `ROOM_PING_PROBE`, record server `serverForwardedAt = Date.now()`, attach `serverForwardedAt` inside server pending probe map, forward `clientSentAt` untouched.
   - In `PONG_PROBE`, compute `hostRelayMs = Math.max(0, Date.now() - entry.serverForwardedAt)`. Send `{ type: 'ROOM_PING_RESULT', roomId, probeId, clientSentAt: entry.clientSentAt, hostRelayMs, pingMs: entry.isDedicated ? (ws.rttMs ?? hostRelayMs) : undefined }` (Wait: preserve backwards-compatibility for existing `server-fixes.test.ts` assertion or update assertion deliberately to verify exact `hostRelayMs` vs client-side RTT calculation!). Let's align `server-fixes.test.ts` cleanly with the new clock-skew-free contract!
   - Add `RTC_PING_SIGNAL` handler: look up target peer (`toHost` -> `room.hostPeerId`, or back to `targetPeerId` if sender is host) and forward `{ type: 'RTC_PING_SIGNAL', roomId, fromPeerId, probeId, data }`. Reject unknown room or banned peer; NEVER alter room membership.
2. `NetworkHost.ts`:
   - Listen for `RTC_PING_SIGNAL`: manage lightweight `probePeers` Map (`Map<string, { peer: PeerConnection; timer: ReturnType<typeof setTimeout> }>`, capped at e.g. 8 concurrent probes, 4s auto-cleanup TTL). Respond to `{ type: 'PING_PROBE', t }` over unreliable DataChannel with `{ type: 'PONG_PROBE', t }`. Clean up `probePeers` in `destroy()`. Never trigger `onPlayerJoined` / chat notices.
3. `SignalingClient.ts` & `GameApp.ts` & `Lobby.svelte`:
   - `SignalingClient.probeRoomPing`: Use `performance.now()` (monotonic client clock) to measure true Client RTT on WS AND run an ephemeral WebRTC probe (`PeerConnection` `isInitiator: true`) over `RTC_PING_SIGNAL` for non-dedicated rooms (with 8s cache + 1.5s probe timeout fallback to clock-skew-free WS RTT). Also trigger hover probe reliably in `Lobby.svelte` (`handleRoomHover` / `onfocus`) and update `room.ping` immediately!
   - In `GameApp.ts` & `NetworkClient.ts`: Ensure `updateHostProfile` / username sync helper integrates cleanly if needed, Host initializes telemetry `pingMs = 0`, and Guest measures WebRTC DataChannel RTT consistently with `PING_PROBE`/`PONG_PROBE` on the same channel type!

- [ ] **Step 4: Run server & client ping tests**

Run: `pnpm --filter @legacyx/server test tests/server-fixes.test.ts` and `pnpm --filter @legacyx/client test tests/net/hoverPingParity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit in worker workspace**

```bash
git add packages/server/src/signalingServer.ts packages/client/src/net/ packages/client/src/ui/screens/Lobby.svelte packages/server/tests/server-fixes.test.ts packages/client/tests/net/hoverPingParity.test.ts
git commit -m "fix(net): measure direct WebRTC P2P hover ping and eliminate WS clock skew"
```

---

### Task 4 (`hud-modals`): Fix Replay Modal Click-Through, Golden Goal Ball Icon, Icon-Only Replay Button, Goal Banner Pills, Ball Customization & Practice Stats

**Files:**
- Modify: `packages/client/src/ui/modals/ReplayViewerModal.svelte`
- Modify: `packages/client/src/ui/hud/InGameHUD.svelte`
- Modify: `packages/client/src/ui/modals/SettingsModal.svelte`
- Modify: `packages/client/src/ui/hud/PostMatchCarousel.svelte`
- Modify: `packages/client/tests/ui/chatMentionsAndUiFixes.test.ts`
- Create: `packages/client/tests/ui/modalsAndHudFixes.test.ts`

**Interfaces:**
- Consumes: `ballDesigns.ts` `'gold'` metallic palette (`#FEF9C3`, `#FACC15`, `#CA8A04`, `#713F12`, patches `#451A03`, seams `#854D0E`), `userProfile.changeUsernameOnce`.
- Produces UI contracts:
  - `ReplayViewerModal.svelte .modal-backdrop`: includes `pointer-events: auto;` and remains strictly scoped (`z-index: 900`) with zero `backdrop-filter: blur`.
  - `#btn-hud-replays`: renders Play `<svg>` icon ONLY (visible `<span class="replay-label">Ver Repeticiones</span>` removed; `title` & `aria-label` kept).
  - `.golden-goal-floating-badge` (in `InGameHUD.svelte` & `ReplayViewerModal.svelte`): renders ONLY a glowing metallic gold soccer ball SVG icon (`22–26px`, icosahedron bronze patches + gold gradient, NO `"GOL DE ORO"` text, NO wide card box/background).
  - `#hud-banner-goal` & ReplayViewer GOAL banner: retains scorer, assister, and `{speedKmh} km/h` speed badge; removes `.goal-bonus-pill.power` (`POTENCIA +30`) and `.goal-bonus-pill.curve` (`EFECTO +30`) (and corresponding `.tele-chip.power` / `.tele-chip.curve` in `ReplayViewerModal.svelte`).
  - `SettingsModal.svelte`: removes `"Sólido"` (`ballSkin = 'solid'`) pattern card from `ballMode === 'texture'` (`"Diseño"`), preserving `"Color sólido"` (`ballMode === 'color'`). Account tab continues triggering `userProfile.changeUsernameOnce` and rendering updated `userProfile.username`.

- [ ] **Step 1: Write failing UI unit tests in `chatMentionsAndUiFixes.test.ts` and `modalsAndHudFixes.test.ts`**

- Update `chatMentionsAndUiFixes.test.ts`:
  - `Item 9`: `.golden-goal-floating-badge` renders glowing metallic gold ball SVG WITHOUT `'GOL DE ORO'` text!
  - `Item 18`: `#btn-hud-replays` renders play SVG WITHOUT visible `class="replay-label"` / visible `'Ver Repeticiones'` text node.
- Create `packages/client/tests/ui/modalsAndHudFixes.test.ts`:
  - Assert `ReplayViewerModal.svelte` CSS `.modal-backdrop` contains `pointer-events: auto;` and NO `backdrop-filter: blur`.
  - Assert `InGameHUD.svelte` GOAL banner renders `145 km/h` + scorer/assister, and does NOT render `POTENCIA +30` or `EFECTO +30` pills.
  - Assert `ReplayViewerModal.svelte` renders metallic gold ball ONLY when `isGoldenGoal = true` (no `'GOL DE ORO'`), keeps speed `km/h`, and removes Power/Curve badges from its GOAL banner.
  - Assert `SettingsModal.svelte` under `"Diseño"` contains `classic`, `retro`, `neon`, `cyber`, `gold` and does NOT render the `"Sólido"` pattern option button.
  - Assert `PostMatchCarousel.svelte` renders Stats slide without gating `Stats` away in Casual or `isPracticeMode`.

- [ ] **Step 2: Run UI tests to confirm failure**

Run: `pnpm --filter @legacyx/client test tests/ui/chatMentionsAndUiFixes.test.ts tests/ui/modalsAndHudFixes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Apply clean Svelte 5 + Scoped CSS changes**

1. `ReplayViewerModal.svelte`:
   - Add `pointer-events: auto;` to `.modal-backdrop` (`~line 837`). Verify inner buttons/cards have full interactivity and zero click pass-through.
   - Replace `.golden-goal-floating-badge` card + `<span>GOL DE ORO</span>` with floating gold soccer ball SVG matching `'gold'` skin (no box border/background, warm gold drop-shadow glow).
   - In GOAL banner: keep `scorerName`, `assisterName`, and `{Math.round(activeBanner.speedKmh)} km/h`; remove `.tele-chip.power` and `.tele-chip.curve`.
2. `InGameHUD.svelte`:
   - Replace `.golden-goal-floating-badge` box + `<span>GOL DE ORO</span>` with matching metallic gold soccer ball SVG emblem (no background box or `"GOL DE ORO"` text), keep intermittent `is-warning-30s` glow untouched!
   - Remove `<span class="replay-label">Ver Repeticiones</span>` inside `#btn-hud-replays` and tighten `.hud-replay-btn` styling (`width: 2.15rem; padding: 0; justify-content: center;`) so it sits cleanly left of `Grabar`.
   - In `#hud-banner-goal`: keep scorer, assister, and `{activeBanner.speedKmh} km/h` badge; remove `.goal-bonus-pill.power` & `.goal-bonus-pill.curve`.
3. `SettingsModal.svelte`:
   - Remove the `<!-- 6. Sólido -->` button inside `ballMode === 'texture'` (`~1763-1777`). Check `Account` tab displays `userProfile.username` / `nameChanged` state cleanly with zero cached alias lag.
4. `PostMatchCarousel.svelte`:
   - Verify Stats slide (tab 0) renders team/player breakdown cleanly in Casual, Ranked, `1v0`, and Entrenamiento (checking `gameUI.lastMatchStats`, `redTeamStats`, `blueTeamStats`).

- [ ] **Step 4: Run UI tests**

Run: `pnpm --filter @legacyx/client test tests/ui/chatMentionsAndUiFixes.test.ts tests/ui/modalsAndHudFixes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit in worker workspace**

```bash
git add packages/client/src/ui/hud/InGameHUD.svelte packages/client/src/ui/modals/ReplayViewerModal.svelte packages/client/src/ui/modals/SettingsModal.svelte packages/client/src/ui/hud/PostMatchCarousel.svelte packages/client/tests/ui/
git commit -m "fix(ui): fix replay modal overlay pointer-events, gold ball badge, icon-only replay btn, goal banner pills, and ball skin options"
```

---

### Task 5 (`replay-compositor`): Update Canvas/WebM HUD Compositor & ScoreboardHUD for Items 2 & 5

**Files:**
- Modify: `packages/client/src/recorder/ReplayHudCompositor.ts`
- Modify: `packages/client/src/controllers/components/ScoreboardHUD.ts`
- Modify: `packages/client/tests/recorder/cloudReplaysAndCompositor.test.ts`

**Interfaces:**
- Consumes: `ReplayHudOverlayState` & `MatchBannerPayload`.
- Behavior:
  - `drawScoreboard`: when `state.isGoldenGoal` is `true`, draws ONLY the championship metallic gold soccer ball emblem (matching `ballDesigns.ts` `'gold'` gradient + dark bronze patches + glow) docked right of the scoreboard — NO rectangular card background and NO `'GOL DE ORO'` text!
  - `drawCenterBanner` (`GOAL`): keeps `km/h` speed chip alongside scorer/assister, removes `'POTENTE'` and `'EFECTO'` chips!

- [ ] **Step 1: Update failing expectations in `cloudReplaysAndCompositor.test.ts`**

- Replace `'GOL DE ORO'` text assertion with assertion verifying gold ball rendering (`arc` + gold `#FACC15`/`#FEF9C3`/`#451A03` fills) without `'GOL DE ORO'` text!
- Verify GOAL banner retains `128 km/h` while NOT calling `fillText` for `'POTENTE'` or `'EFECTO'`.

- [ ] **Step 2: Run compositor tests to verify failure**

Run: `pnpm --filter @legacyx/client test tests/recorder/cloudReplaysAndCompositor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Golden Ball emblem & GOAL banner cleanup in `ReplayHudCompositor.ts` & `ScoreboardHUD.ts`**

- Update `drawScoreboard` in `ReplayHudCompositor.ts`: draw crisp golden ball emblem (with radial gold gradient/fallback + dark bronze patches + seams) right of the scoreboard at `(left + barW + 24, top + barH / 2)`.
- Update `drawCenterBanner` `'GOAL'` in `ReplayHudCompositor.ts`: build `chips` array ONLY with `speedKmh` (`km/h`), remove `isPower`/`isCurve` chips.
- Update `ScoreboardHUD.ts` (`updateScoreboard` / `goldenGoalBadgeEl`): render golden ball SVG/emblem instead of `'GOL DE ORO'` text for Golden Goal state.

- [ ] **Step 4: Run compositor tests**

Run: `pnpm --filter @legacyx/client test tests/recorder/cloudReplaysAndCompositor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit in worker workspace**

```bash
git add packages/client/src/recorder/ReplayHudCompositor.ts packages/client/src/controllers/components/ScoreboardHUD.ts packages/client/tests/recorder/cloudReplaysAndCompositor.test.ts
git commit -m "fix(recorder): draw metallic gold ball emblem and speed-only goal chip in WebM compositor"
```

---

### Task 6 (`client-wiring`): Wire Score Event Delivery Parity, Host `0 ms` Telemetry, End-of-Match Stats & Ball Setting Migration

**Files:**
- Modify: `packages/client/src/App.svelte`
- Modify: `packages/client/src/ui/state/gameUI.svelte.ts`
- Modify: `packages/client/tests/net/hostGuestParityIntegration.test.ts`

**Interfaces:**
- Consumes: Task 1 `EngineInstance` `score_event` emissions, `NetworkClient.onScoreEvent`, `gameUI.pushScoreEvent`, `gameUI.recordTelemetrySample`.
- Guarantees:
  - Both Host (`localPlayerId = 1`) and Non-Host (`localPlayerId >= 2`) reliably dispatch own `score_event` items into `gameUI.pushScoreEvent` across `Casual`, `Ranked`, `1v0`, and `Entrenamiento` (even during early match/practice setup, without silently dropping due to `localPlayerId` race or Ranked checks!).
  - End-of-match / stop-match stats populate `gameUI.lastMatchStats`, `redTeamStats`, `blueTeamStats`, `mvp` across Casual, Ranked, `1v0`, and Entrenamiento whenever match stats exist.
  - Host in-room telemetry reports `0 ms` (`recordTelemetrySample(0, currentFps)`), never mixing Lobby WS latency into the Host telemetry badge.
  - Legacy saved setting `ballMode === 'texture' && ballSkin === 'solid'` normalizes cleanly on load/save to `ballMode = 'color'` with `ballSkin = 'classic'`.

- [ ] **Step 1: Write failing integration tests in `hostGuestParityIntegration.test.ts`**

- Test `gameUI.loadPersistedState()` normalizing `{ ballMode: 'texture', ballSkin: 'solid' }` -> `{ ballMode: 'color', ballSkin: 'classic' }`.
- Test `dispatchScoreEvent` / `wireHostEngineEvents` / `wireNetworkClient` / `App.svelte` does NOT gate `score_event`, `pushScoreEvent`, or `buildMatchStatsSnapshot` on `roomType === 'ranked'` or `!isPracticeMode`, works for both `localPlayerId = 1` (Host) and `localPlayerId = 2` (Guest), and Host telemetry uses `0 ms`.

- [ ] **Step 2: Run integration test to confirm failure**

Run: `pnpm --filter @legacyx/client test tests/net/hostGuestParityIntegration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Inspect full event & telemetry wiring in `App.svelte` and `gameUI.svelte.ts`, then implement minimal fixes**

- Verify why score events may not have rendered or emitted in real Casual/Practice matches (including `dispatchScoreEvent`, `localPlayerId` hydration, `isPracticeMode`, `wireNetworkClient`, and telemetry `pingMs` on Host vs Guest).
- Ensure `isPracticeMode` in `onStartPracticeMode` starts cleanly in a playable state (or starts `KICKOFF` -> `PLAYING` on first kick/touch) so practice matches immediately emit events and record stats!
- Add legacy `ballSkin === 'solid'` normalization in `gameUI.svelte.ts`.
- Force Host in-game telemetry ping passed to `gameUI.recordTelemetrySample(hostOrClientPing, currentFps)` to be `0` when `gameUI.isHost` is `true`, and `Math.max(1, gameUI.pingMs)` / `NetworkClient` RTT when Guest.

- [ ] **Step 4: Run integration tests**

Run: `pnpm --filter @legacyx/client test tests/net/hostGuestParityIntegration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit in worker workspace**

```bash
git add packages/client/src/App.svelte packages/client/src/ui/state/gameUI.svelte.ts packages/client/tests/net/hostGuestParityIntegration.test.ts
git commit -m "fix(client): ensure score event/stats parity, host 0ms ping telemetry, and solid ball migration"
```

---

### Task 7 (`verifier` + `/browser` Gate): Merge Swarm Branches, Run Full Checks & Live E2E Browser Verification

**Files:**
- Merge all 6 author worktrees cleanly into coordinator working copy (`main`)
- Run all monorepo checks & live E2E test with `Dev_test` / `dev_test` (`superadmin`)

- [ ] **Step 1: Verify zero conflicts and run full test + typecheck + build pipeline**

1. Run `pnpm --filter @legacyx/core test`
2. Run `pnpm --filter @legacyx/server test`
3. Run `pnpm --filter @legacyx/client test`
4. Run `pnpm --filter @legacyx/client check` (or `svelte-check`) & full workspace build (`pnpm build`)
Expected: 0 failures, 0 skipped tests, clean build.

- [ ] **Step 2: Apply & verify Supabase Migration in live DB (`jeopwutoxmaagxlebpsl`)**

- Verify `protect_profile_privileged_columns` trigger works together with `public.change_username_once(text)`.
- Confirm `victorsamchez40` has `username = 'Yami'`, `display_name = 'Yami'`, `name_changed = true`.
- Confirm `Dev_test` remains `name_changed = false` (`role = 'superadmin'`).

- [ ] **Step 3: Live `/browser` E2E Verification (`Model: "flash"`, Host + Guest tabs)**

Start signaling + client server locally (or point to full built app on localhost) and dispatch `browser` subagent (`Model: "flash"`) logging in as `Dev_test` / `dev_test` (`superadmin`):
1. **Ball Customization (Item 7):** Open `Ajustes -> Personalización -> Balón -> Diseño`; verify `Clásico`, `Retro`, `Neón`, `Cyber`, `Oro` exist and `"Sólido"` is gone; verify `"Color sólido"` works cleanly.
2. **Casual / Practice / 1v0 Score Events & Stats (Item 1):** Enter `Entrenamiento Offline` AND create a `Casual` room; perform shots/passes/goals and verify sliding score events appear visibly on HUD (`Tiro al arco +20`, `¡Gol! +100`, etc.) AND match stats populate on stop/end without pushing to Ranked global leaderboard. Also test a 2-tab Host + Guest match verifying Host + Guest both see their own score events cleanly!
3. **Golden Goal Ball & Icon-Only Replay Button & 30s Glow (Item 2):** Verify `#btn-hud-replays` shows only the Play icon (no `"Ver Repeticiones"` text), verify final 30s triggers red scoreboard glow, and enter Golden Goal to verify ONLY the glowing metallic gold soccer ball shows right of the scoreboard (NO wide card / `"GOL DE ORO"` text).
4. **Goal Banner Cleanup (Item 5):** Score a Power/Curve goal; verify GOAL banner shows scorer + `km/h` speed badge WITHOUT `POTENCIA +30` / `EFECTO +30` pills, while Score Event card shows `¡Gol de Potencia! +130` (etc.) cleanly without `km/h`.
5. **Lobby Hover Ping vs In-Room Ping (Item 3):** With Room open in Host tab (`0 ms`), open Guest/second tab in Lobby, hover room card, verify real preview ping matches WebRTC in-room ping after joining (no wild clock-skew mismatch!).
6. **ReplayViewerModal Interactivity (Item 4):** Record a short clip (or open saved replay) and open `ReplayViewerModal` from both Lobby and HUD; click filters/preview/close/tabs/buttons and verify zero click pass-through and full functionality!
7. **Username Change Persistence & DB Cleanup (Item 6):** Test username change RPC flow on a temporary disposable test account (OR test on `Dev_test`, verify updated name across Leaderboard, Personal Rank Bar, Account Card, Logout & Relogin, then cleanly restore `Dev_test` DB row back to `username = 'Dev_test', display_name = 'Dev_test', name_changed = false` via Supabase SQL so `Dev_test` stays ready for the user!).

- [ ] **Step 4: Ponytail Final Audit & Completion**

Verify zero dead code, unused props, or leftover temporary artifacts; ensure git diff is clean and concise. Output final report ending with `<!-- GOAL_COMPLETE -->`.
