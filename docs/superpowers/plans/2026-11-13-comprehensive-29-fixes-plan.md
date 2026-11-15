# LegacyX-GO 29-Item Comprehensive Fixes, Anti-Exploit & Replay Overhaul Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or swarm workers per task boundary (`AGENTS.md` skill matrix applies per subsystem). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 29 gameplay, physics, networking, UI/UX, anti-exploit scoring, stats, recording compression, Supabase cloud replay, and Host/Non-Host parity issues in a single cohesive release across `@legacyx/core`, `@legacyx/server`, and `@legacyx/client`.

**Architecture:** Decoupled 3-layer monorepo: deterministic headless core (`@legacyx/core`, 60 Hz fixed tick, zero external physics, binary `ArrayBuffer`/`DataView` protocol), Node WebSocket signaling/auth/dedicated host (`@legacyx/server`), and Svelte 5 Runes UI + Canvas 2D renderer + Cloud `.lxr` v2 Replay Compositor (`@legacyx/client`). All gameplay simulation and scoring remain strictly Host-authoritative, while BinaryProtocol and ControlMessages keep Non-Host prediction and HUD state 100% synchronized.

**Tech Stack:** TypeScript 5.4, Svelte 5.57 (Runes only), HTML5 Canvas 2D, WebRTC DataChannels, `ws`, Supabase REST/Auth/Storage, Vitest 5.0, `svelte-check`, Vite.

---

## Global Constraints (`AGENTS.md` & User Specs)

- **Core Physics (`packages/core/src/physics/`)**: Strict fixed timestep `dt = 1/60s` (60 Hz), CCD/substepping preserved, ZERO third-party physics engines, deterministic 3,600-tick test must pass.
- **Networking (`packages/core/src/protocol/`, `packages/client/src/net/`)**: Strict Host authority, `BinaryProtocol` `ArrayBuffer`/`DataView`, `ordered: false, maxRetransmits: 0` for real-time DataChannels.
- **Svelte 5 UI (`packages/client/src/ui/`)**: Exclusive Svelte 5 Runes (`$state`, `$derived`, `$props`, `$effect`); strictly scoped `<style>` blocks; NO `backdrop-filter: blur(...)`.
- **Renderer (`packages/client/src/renderer/`)**: Decoupled interpolated `requestAnimationFrame` loop; zero per-frame CPU `shadowBlur` regressions.
- **Audio (`packages/client/src/audio/`)**: Procedural Web Audio API with node cleanup.
- **Validation**: `vitest` + TDD tests + `ponytail` dead-code cleanup + `npm run check && npm run test && npm run build` + `/browser` visual verification.

## Review Focus (Top 5 High-Risk Failure Modes & Edge Cases)

1. **Expired Supabase JWT at Recording Stop**: A player logs in, plays a 10+ minute match or resumes an old tab, and clicks Stop Recording when `this.jwt` is expired (`ERR_JWT_EXPIRED` in live logs). -> Task 4 MUST proactively refresh via `/auth/v1/token?grant_type=refresh_token` in `ensureValidAccessToken()` before every Storage/Rest call and clean up dangling Storage objects on DB insert failure.
2. **Host-Guest Stale Turbo on Window Blur / Modal Open**: A guest holding `Shift + W` tabs out (`blur`) or opens Chat/Menu; if no release `OP_INPUT` is sent, `NetworkHost`/`App.svelte` `remoteInputs` keeps replaying `INPUT_FLAG_TURBO`. -> Task 6 MUST clear keys and call `dispatchImmediateGuestInput()` on `blur`, `visibilitychange`, chat focus, and modal open.
3. **Multiplayer 1v0 Kickoff Bypass After Goal/Disconnect**: A room drops to 1 team having 0 players or starts 1v0 waiting for rival; bypassing midfield barrier lets players score freely in multiplayer. -> Task 1 MUST restrict `shouldBypassKickoffBarriers()` strictly to `isPracticeMode === true` and sync `isNeutralKickoff`/`kickoffPossessingTeam` over `BinaryProtocol` to Non-Host `predEngine`.
4. **Rival Touch Bypassing Shot Cooldown & Fake Saves**: Rapid kick-save ping-pong or stale `pendingShot` from an earlier deflected clear awards undeserved `+20/+100` loops. -> Task 1 MUST remove the rival-touch reset of `lastShotTick`, enforce `SAVE_COOLDOWN_TICKS = 360`, invalidate stale/misdirected `pendingShot`, cap duo passes at 2 consecutive passes, and require `redCount > 0 && blueCount > 0 && !isPracticeMode`.
5. **Replaying/Exporting `.lxr` v1 vs Enriched `.lxr` v2 & HUD Aspect Ratio**: Old/minimal replays lack HUD logs, and replay canvas differs in size/aspect from gameplay viewport causing clipped zoom or oversized DOM overlays. -> Task 4 MUST support both `LXR1` and `LXR2`, scale camera zoom by `replayZoom * (stageWidth / refWidth)` inside a fixed 16:9 container with proportional HUD layout, and share an exact Canvas HUD drawing compositor for on-demand `.webm` export.

---

## Complete Item-to-Task Mapping (29/29 Coverage + Host/Non-Host Parity)

| Items | Area | Owning Task |
| :--- | :--- | :--- |
| #3, #4, #5, #11, #12 (scoring math), #26 (core velocity) | `@legacyx/core` Physics, Config, BinaryProtocol, Anti-Exploit | **Task 1** |
| #3 (host fallback), #11 (ranked report check), #15 (real probe), #28 (online count), #29 (`name_changed`) | `@legacyx/server` Auth, RoomRegistry, Signaling, DedicatedHost | **Task 2** |
| #7 (perimeter indicators), #25 (captain colors on posts/keeper/arrows) | `@legacyx/client/renderer` | **Task 3** |
| #16, #17, #18, #19, #20, #21, #22 (Recording, gzip, Supabase JWT/Upload, Cloud Viewer, 16:9 HUD, WebM export) | `@legacyx/client/recorder` + `userProfile` + `ReplayViewerModal` | **Task 4** |
| #1, #2, #3 (slider def), #6 (HUD card format), #8, #9, #10, #12 (Stats UI), #13, #14, #15 (Lobby ping UI), #18/#19/#23 (HUD buttons/toasts), #24 (chat copy), #27, #28 (Lobby listener dedup), #29 (`Cuenta` tab) | `@legacyx/client/ui` + `chatMentions` | **Task 5** |
| #15/#28 (`SignalingClient`), #6/#9/#26 (`NetworkHost`/`NetworkClient`/`GameApp`), Host & Non-Host `App.svelte` + `gameUI.svelte.ts` parity wiring | `@legacyx/client` Integration (`net` + `App.svelte` + `gameUI`) | **Task 6** |
| Full E2E Interactive + Visual Check + Ponytail Cleanup | Verification & `/browser` | **Task 7** |

*(Note on Swarm Parallelism: Tasks 1, 2, 3, 4, and 5 touch disjoint file sets and can run concurrently in `/teamwork` after `BinaryProtocol`/core type contracts are finalized; Task 6 integrates `App.svelte` & `gameUI.svelte.ts` against Tasks 1–5; Task 7 verifies the whole integrated build.)*

---

### Task 1: Core Physics, BinaryProtocol, Scoring Math & Anti-Exploit (`@legacyx/core`)

**Files:**
- Modify: `packages/core/src/game/GameConfig.ts` (`DEFAULT_GAMEPLAY_CONFIG`)
- Modify: `packages/core/src/physics/PlayerKinematics.ts` (`stepPlayerKinematics`)
- Modify: `packages/core/src/physics/PhysicsWorld.ts` (`shouldBypassKickoffBarrier`, calls)
- Modify: `packages/core/src/game/GameState.ts` (`GoalInfo`, `GameSnapshot`, `TouchHistoryEntry`)
- Modify: `packages/core/src/protocol/BinaryProtocol.ts` (`GameStateSnapshot`, header flags in byte 10)
- Modify: `packages/core/src/protocol/ControlMessages.ts` (`MatchBannerPayload`, `ScoreEventPayload`)
- Modify: `packages/core/src/game/GameEngine.ts` (parity on `shouldBypassKickoffBarrier`, `staminaRegenMoving` fallback, anti-exploit constants)
- Modify: `packages/core/src/index.ts` (`EngineInstance`, `ScoreEventEmitPayload`, `GoalBannerDetails`, `emitScoreEvent`, `shouldBypassKickoffBarriers`, `step`, `recordTouch`, `handleGoalScored`, `getState`, `setState`)
- Test: `packages/core/tests/core-fixes-and-anticheat.test.ts` (new), plus verify existing `packages/core/tests/*.test.ts` (including `physics-determinism.test.ts`, `staminaTurboDash.test.ts`, `kickoffBarriers.test.ts`)

**Interfaces (Contract exported to Server & Client):**
- `GameStateSnapshot`: keep 12-byte header compatible while packing flags into byte 10 (`SOUND_MASK_BITS = 0x07`; `SNAPSHOT_FLAG_KICKOFF_ACTIVE = 1 << 4`; `SNAPSHOT_FLAG_GOLDEN_GOAL = 1 << 5`; `SNAPSHOT_FLAG_NEUTRAL_KICKOFF = 1 << 6`; `SNAPSHOT_FLAG_KICKOFF_BLUE = 1 << 7`), exposed as decoded optional booleans/fields on `GameStateSnapshot`: `isGoldenGoal?: boolean`, `kickoffActive?: boolean`, `isNeutralKickoff?: boolean`, `kickoffPossessingTeam?: 'red' | 'blue'`.
- `ScoreEventEmitPayload`: `{ playerId: string; playerName: string; team: 'red' | 'blue' | 'spec'; text: string; points: number; x: number; y: number; color?: string; category: ScoreEventCategory }`.
- `GoalBannerDetails`: `{ scoringTeam: 'red' | 'blue'; scorerName: string | null; assisterName: string | null; isOwnGoal: boolean; speedKmh: number; isPower: boolean; isCurve: boolean }`.

- [ ] **Step 1: Write failing unit tests in `packages/core/tests/core-fixes-and-anticheat.test.ts`**
  Cover:
  1. `DEFAULT_GAMEPLAY_CONFIG.staminaRegenMoving === false` and `staminaRegenMovingRate === 25`; undefined config fallback does not regen while moving.
  2. Sticky turbo fix: pressing `INPUT_TURBO` activates `isTurbo`, releasing `INPUT_TURBO` while still moving immediately sets `player.isTurbo = false` on the very next tick.
  3. Kickoff barriers: in a non-practice (`isPracticeMode = false`) 1v0 room (`red=1, blue=0`) when `!isNeutralKickoff` (`kickoffPossessingTeam = 'blue'`), red player CANNOT cross midfield or enter center circle; when `isPracticeMode = true`, barriers bypass cleanly.
  4. `BinaryProtocol.encodeSnapshot`/`decodeSnapshot` round-trips `soundMask` (`0..7`), `isGoldenGoal`, `kickoffActive`, `isNeutralKickoff`, `kickoffPossessingTeam`.
  5. Goal scoring & speed: Power goal (`ball.isPowerShot` or `speed >= POWER_SHOT_SPEED_THRESHOLD`) awards `130` (`+100` + `+30` powerGoals), Curve goal awards `130` (`+100` + `+30` curveGoals), Curve+Power awards `160`, Curve Assist awards `70` (`curveAssists++`), Own Goal awards `-50` (`ownGoals++`), and `GoalBannerDetails.speedKmh >= 20`, `isPower`, `isCurve` match exact impact speed.
  6. Anti-exploit hardening:
     - 0 points/events awarded when `isPracticeMode = true` OR `redCount === 0 || blueCount === 0` OR `fsm.state !== MatchPhase.PLAYING`.
     - Rival touch does NOT reset `shooter.lastShotTick`; same player cannot earn two shots within `SHOT_ON_GOAL_COOLDOWN_TICKS` (240).
     - `SAVE_COOLDOWN_TICKS` (360) prevents consecutive saves by same defender; own/teammate shot or <60 ticks rebound or stale `pendingShot` (>120 ticks / stalled / reversed) does NOT award fake saves.
     - Passes require `>= 140 px`, speed `>= 90 px/s`, `COMPLETED_PASS_COOLDOWN_TICKS` (180), and cap consecutive `(A <-> B)` duo passes at 2 until a third player touches, shot occurs, or goal resets.
     - Assists expire after `420` ticks (7s) or opponent deliberate touch.

- [ ] **Step 2: Run new test to verify failure**
  Run: `npx vitest run packages/core/tests/core-fixes-and-anticheat.test.ts` (Expected: FAIL).

- [ ] **Step 3: Implement core config & kinematics fixes**
  - Update `packages/core/src/game/GameConfig.ts:236-237` -> `staminaRegenMoving: false`, `staminaRegenMovingRate: 25`.
  - Update `packages/core/src/physics/PlayerKinematics.ts`:
    - Line 188: remove `|| player.isTurbo` -> `const wantsTurbo = canTurbo && ((mask & INPUT_TURBO) !== 0);`.
    - Lines 227-228: `const regenMoving = config?.staminaRegenMoving === true; const movingFactor = Math.max(0, Math.min(200, config?.staminaRegenMovingRate ?? 25)) / 100;`.
  - Update `packages/core/src/physics/PhysicsWorld.ts:289-296` & callers: `shouldBypassKickoffBarrier` returns `true` ONLY when `this.isPracticeMode` (remove `kickoffTeamCount <= 0` bypass). Do the same in `GameEngine.ts:240-248` and `EngineInstance.shouldBypassKickoffBarriers` (`packages/core/src/index.ts:421-427`).
  - Update `EngineInstance.setState` (`packages/core/src/index.ts`): stop re-latching `player.isTurbo` across inputs unless predicted; sync `this.fsm.isOvertime`, `this.isNeutralKickoff`, `this.kickoffPossessingTeam` from decoded `GameStateSnapshot`.

- [ ] **Step 4: Implement `BinaryProtocol` snapshot metadata & `EngineInstance` anti-exploit + scoring + goal speed**
  - Update `BinaryProtocol.ts:70-78, 222-285`: pack flags (`SNAPSHOT_FLAG_*`) into bits 4..7 of byte 10 while masking `soundMask & 0x07` on decode; export bit constants cleanly.
  - Capture peak ball velocity (`lastTickBallSpeedPxSec` / impact velocity prior to goal net crossing) in `EngineInstance.step` before damping/resetting nets so `GoalBannerDetails` receives `speedKmh = Math.max(20, Math.round(ballSpeedPxSec * 0.18))`, `isPower`, `isCurve`.
  - Track per-player anti-exploit state inside `EngineInstance`:
    - `canAwardMatchPoints()`: `!this.isPracticeMode && this.getTeamPlayerCount('red') > 0 && this.getTeamPlayerCount('blue') > 0`.
    - `lastSaveTick` on `playerRuntime`, consecutive pass duo counter (`consecutivePassPairKey`, `consecutivePassPairCount`), `shotStartTick` + `shotThreatValid` on `pendingShot`.
    - Fix `handleGoalScored` arithmetic (`+100` base + `+30` power + `+30` curve, `powerGoals++`, `curveGoals++`, `curveAssists++`, `ownGoals++`), ensure `s.points` equals exact arithmetic breakdown, and emit `playerName` + `team` in `ScoreEventEmitPayload`.

- [ ] **Step 5: Run full `@legacyx/core` test & build suite**
  Run: `npm run check -w @legacyx/core && npm run test -w @legacyx/core && npm run build -w @legacyx/core`
  Check if any pre-existing test asserted old `staminaRegenMoving: true` or `1v0` bypass and update/report cleanly.
  Expected: All `@legacyx/core` tests PASS (including `physics-determinism.test.ts` 3,600 ticks).

---

### Task 2: Server Auth, Real Room Hover Ping, Online Player Deduplication & Ranked Integrity (`@legacyx/server`)

**Files:**
- Modify: `packages/server/src/auth/AuthService.ts` (`fetchFullProfile` `name_changed`, `UserProfileRecord`, ranked payload integrity bounds)
- Modify: `packages/server/src/signalingServer.ts` (real timestamped `ROOM_PING_PROBE` -> host `PING_PROBE` -> `PONG_PROBE` -> `ROOM_PING_RESULT`, `getRealOnlineCount()` deduplication by `userId`/`sessionKey`, `JOIN_LOBBY`/`IDENTIFY` metadata, `RANKED_MATCH_REPORT` consistency check)
- Modify: `packages/server/src/rooms/RoomRegistry.ts` (helper/room ping metadata if needed)
- Modify: `packages/server/src/headless/DedicatedHost.ts` (`staminaRegenMoving: false`, `staminaRegenMovingRate: 25`, handle `PING_PROBE` echo, propagate `speedKmh`/`isPower`/`isCurve`/`playerId`/`playerName`)
- Test: `packages/server/tests/server-fixes.test.ts`

**Interfaces:**
- Signaling messages:
  - Client -> Server: `ROOM_PING_PROBE: { type: 'ROOM_PING_PROBE', roomId: string, clientSentAt: number, probeId?: string }`
  - Server -> Room Host: `PING_PROBE: { type: 'PING_PROBE', roomId: string, requesterId: string, clientSentAt: number, probeId?: string }`
  - Room Host -> Server: `PONG_PROBE: { type: 'PONG_PROBE', roomId: string, requesterId: string, clientSentAt: number, probeId?: string }`
  - Server -> Client: `ROOM_PING_RESULT: { type: 'ROOM_PING_RESULT', roomId: string, pingMs: number, clientSentAt: number, probeId?: string }`
  - Lobby/Auth presence: `JOIN_LOBBY` accepts optional `{ userId?: string, clientSessionId?: string }` used strictly to deduplicate active connections in `getRealOnlineCount()`.

- [ ] **Step 1: Write failing tests in `packages/server/tests/server-fixes.test.ts`**
  Cover:
  1. Two concurrent WebSocket connections sharing `userId: 'user-1'` count as `onlineCount === 1`, while two different users or guests count as `2`.
  2. `ROOM_PING_PROBE` relays to Room Host (`PING_PROBE`), waits for host `PONG_PROBE`, and computes actual `Date.now() - clientSentAt` back to requester in `ROOM_PING_RESULT` (never hardcoded `24ms` heuristic!). For `isDedicated` hosts co-located in process or unresponding host fallback, measure accurately.
  3. `AuthService.fetchFullProfile` queries `name_changed` and returns `nameChanged: true` when true in DB.
  4. `RANKED_MATCH_REPORT` server validation rejects tampered/impossible stats (negative numbers, sum mismatch > tolerance, or <2 distinct team participants).

- [ ] **Step 2: Run failing tests**
  Run: `npm run test -w @legacyx/server -- server-fixes.test.ts` (Expected: FAIL).

- [ ] **Step 3: Implement fixes in `AuthService.ts`, `signalingServer.ts`, `DedicatedHost.ts`**
  - Update `AuthService.ts:248-280`: include `name_changed` in `select=...` and map `nameChanged: Boolean(p.name_changed)` onto `UserProfileRecord`. Add pure helper `validateRankedMatchReport(report)` checking finite non-negative bounds and minimum opposing teams.
  - Update `signalingServer.ts`:
    - Store `socketIdentity = new Map<WebSocket, { userId?: string; clientSessionId?: string }>()` updated on `IDENTIFY`/`JOIN_LOBBY`/`CREATE_ROOM`; `getRealOnlineCount()` deduplicates by `userId` (fallback `clientSessionId`, fallback unique socket). Clean up on `close`.
    - Rewrite `ROOM_PING_PROBE`: locate `hostWs = peerSockets.get(room.hostPeerId)`; send `PING_PROBE`; on host `PONG_PROBE`, relay `ROOM_PING_RESULT { roomId, pingMs: Math.max(1, Date.now() - msg.clientSentAt), clientSentAt, probeId }` directly back to `peerSockets.get(msg.requesterId)`. Wait cleanly with a timeout fallback if dedicated/unacked.
  - Update `DedicatedHost.ts`: ensure `DEFAULT_PHYSICS_MODIFIERS` / `GameplayConfig` aligns (`staminaRegenMoving: false, staminaRegenMovingRate: 25`), reply immediately on `PING_PROBE` if WS connected, propagate `speedKmh`/`isPower`/`isCurve` in goal banners.

- [ ] **Step 4: Run server check, test & build**
  Run: `npm run check -w @legacyx/server && npm run test -w @legacyx/server && npm run build -w @legacyx/server` (Expected: PASS).

---

### Task 3: Canvas Renderer — Perimeter Indicators & Captain Kit Colors (`packages/client/src/renderer/`)

**Files:**
- Modify: `packages/client/src/renderer/OffscreenIndicatorRenderer.ts` (`draw`)
- Modify: `packages/client/src/renderer/StadiumRenderer.ts` (`renderPost`, `buildCachedCanvas`, `setTeamColors`, cache key invalidation)
- Modify: `packages/client/src/renderer/GameRenderer.ts` (`render`, `setTeamKits`, pass `effectiveZoom`, `chatRect`, `redTeamColor`, `blueTeamColor` to `OffscreenIndicatorRenderer`, apply DPR transform cleanly without breaking `camera`)
- Test: `packages/client/tests/renderer/offscreenAndCaptainColors.test.ts`

**Interfaces:**
- `OffscreenIndicatorRenderer.draw(ctx, discs, localDiscId, camX, camY, cx, cy, viewportWidth, viewportHeight, chatHeight, options?: { zoom?: number; chatWidth?: number; redColor?: string; blueColor?: string })`: converts `(disc.x - camX) * zoom + cx`, checks disc visibility including `disc.radius * zoom` against viewport `[0, viewportWidth] × [0, viewportHeight]` AND HUD exclusion rects (top scoreboard `[cx - 180, cx + 180, 0, 56]` and bottom-left chat `[0, chatWidth, viewportHeight - chatHeight, viewportHeight]`) so indicators NEVER trigger when a disc is visible on screen or near empty bottom-right space.

- [ ] **Step 1: Write failing tests in `packages/client/tests/renderer/offscreenAndCaptainColors.test.ts`**
  Cover:
  1. Disc at `(camX + 350, camY + 250)` with `zoom = 0.5` on `1000×600` canvas is INSIDE viewport (`sx = 675, sy = 425`) -> draws 0 indicator arrows (even if `chatHeight = 200`, because `sx = 675 > chatWidth = 340`!).
  2. Disc occluded strictly behind bottom-left chat box (`sx = 150, sy = 500`, `chatWidth = 340, chatHeight = 200, viewportHeight = 600`) -> projects indicator to perimeter.
  3. Disc outside viewport (`sx = 1200`) -> draws indicator using captain `redColor`/`blueColor` instead of hardcoded `#FF0055`/`#0EA5E9`.
  4. `StadiumRenderer` renders left/right posts, halos, and keeper areas using configured `redTeamColor` and `blueTeamColor` (changing captain color invalidates cache and changes stroke color).

- [ ] **Step 2: Run test to verify failure**
  Run: `npm run test -w @legacyx/client -- offscreenAndCaptainColors.test.ts` (Expected: FAIL).

- [ ] **Step 3: Fix `OffscreenIndicatorRenderer.ts`, `StadiumRenderer.ts`, and `GameRenderer.ts`**
  - Update `OffscreenIndicatorRenderer.ts`: use `zoom`, disc radius screen margin, HUD rect checks (`chatWidth` scoped bottom-left only), and `redColor`/`blueColor`.
  - Update `StadiumRenderer.ts`: replace hardcoded `#FF0055` / `#0EA5E9` post inner strokes (`renderPost` lines `325-327`) with `this.redTeamColor` / `this.blueTeamColor` (also track `cachedRedColor`/`cachedBlueColor` in `renderPitch` cache invalidation so keeper area updates immediately when captain changes!). Check perimeter/goal contour accents (`buildCachedCanvas`) to use captain primary colors cleanly while preserving alpha/glow.
  - Update `GameRenderer.ts`: ensure CSS-pixel viewport dimensions, `zoom = camera.zoom * camera.renderScale`, `dpr`, actual chat bounds, and `this.stadiumRenderer.redTeamColor`/`blueTeamColor` are passed into `offscreenRenderer.draw(...)` properly under `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` (ensuring minimap & VFX layers align seamlessly in CSS px).

- [ ] **Step 4: Run renderer tests**
  Run: `npm run test -w @legacyx/client -- offscreenAndCaptainColors.test.ts` (Expected: PASS).

---

### Task 4: Cloud Replays (.lxr v2 + Gzip + Supabase JWT Refresh), 16:9 HUD Scaling & On-Demand WebM Export

**Files:**
- Modify: `packages/client/src/ui/state/userProfile.svelte.ts` (`loadPersistedSession`, `ensureValidAccessToken`, `logout`, `uploadUserReplay`, `fetchUserReplays`, `downloadUserReplay`, `deleteUserReplay`, `renameUserReplay`, `validateAccountUsername` `3..15` chars matching SQL)
- Modify: `packages/client/src/recorder/MatchRecorder.svelte.ts` (`LxrReplayFile` / `LxrReplayV2`, lossless gzip await fix, auto-upload on `stop()`, transient `showSavedCloudNotice`, remove local `.lxr` / `.webm` auto-download triggers)
- Create: `packages/client/src/recorder/ReplayHudCompositor.ts` (renders identical scaled Canvas 2D HUD overlays — Top-left Room card, Top-center Scoreboard + 30s warning pulse + Golden Goal badge, Bottom-left Chat messages, Center Banners VS/Countdown/Pause/Goal+Speed+Power+Curve/Victory — for on-demand `.webm` video export from `.lxr`)
- Modify: `packages/client/src/ui/modals/ReplayViewerModal.svelte` (opens directly to Cloud Replays List with Ver / Renombrar / Descargar Video `.webm` / Eliminar; Ver plays inside locked 16:9 stage with zoom scaled proportionally to recording viewport/player zoom, following recording player + toggle ball, rendering identical scaled HUD + minimap + `renderer.setTeamKits`; no `.lxr` import/export UI!)
- Test: `packages/client/tests/recorder/cloudReplaysAndCompositor.test.ts`

**Interfaces:**
- `LxrReplayFile` (v1/v2 union supported by `parseReplayText` / `decompressReplayGzip`): v2 adds `magic: 'LXR2', version: 2`, `recordingPlayerId?: number | null`, `recordingPlayerName?: string`, `cameraZoom: number`, `viewportWidth: number`, `viewportHeight: number`, `timeLimitSeconds: number`, `chatMessages: LxrChatEntry[]`, `banners: LxrBannerEvent[]`, and per-frame `isGoldenGoal?: boolean`.
- `userProfile.ensureValidAccessToken(): Promise<string | null>`: checks JWT `exp` with 60s skew; calls `/auth/v1/token?grant_type=refresh_token` if needed, updates persisted session, logs out cleanly if refresh token itself is rejected/revoked.
- `matchRecorder.recordChat(...)` & `matchRecorder.recordBanner(...)`: called by `App.svelte` (Task 6) while `matchRecorder.isRecording`.
- `matchRecorder.consumeSavedCloudNotice()`: controls transient post-stop banner in `InGameHUD.svelte`.

- [ ] **Step 1: Write failing tests in `packages/client/tests/recorder/cloudReplaysAndCompositor.test.ts`**
  Cover:
  1. `compressReplayGzip` + `decompressReplayGzip` awaits `writer.write`/`writer.close` and lossless-roundtrips `LXR2` payloads with chat/banners/zoom metadata AND reduces payload byte size.
  2. `userProfile.ensureValidAccessToken` detects an expired `jwt` (mocked base64 payload `exp < now`), calls Supabase refresh endpoint with `refreshToken`, updates `this.jwt` & retries `uploadUserReplay` without HTTP 400/403 `ERR_JWT_EXPIRED`; truncates `red_acronym`/`blue_acronym` to `<= 6` chars; deletes Storage object if DB insert fails.
  3. `userProfile.logout()` clears `username`, `displayName`, `email`, `nameChanged`, `elo = 1000`, `stats` zeroed, `personalRank = null`, sets `isAuthenticated = false, isGuest = true`.
  4. `computeReplayEffectiveZoom(savedZoom, recordedWidth, recordedHeight, stageWidth, stageHeight)` preserves exact player zoom ratio when container scales to 16:9.
  5. `MatchRecorder.stop()` never triggers browser `.lxr` or video download, triggers cloud upload for authenticated users, and sets `savedCloudNotice`.

- [ ] **Step 2: Run tests to verify failure**
  Run: `npm run test -w @legacyx/client -- cloudReplaysAndCompositor.test.ts` (Expected: FAIL).

- [ ] **Step 3: Implement `userProfile.svelte.ts` JWT refresh, cleanup & logout fixes**
  - Decode JWT `exp` cleanly (`atob` URL-safe base64); implement `ensureValidAccessToken()`.
  - Wire `ensureValidAccessToken()` into `fetchUserReplays`, `uploadUserReplay`, `downloadUserReplay`, `deleteUserReplay`, `renameUserReplay`.
  - Clamp `red_acronym` / `blue_acronym` to `.slice(0, 6)`, clean up uploaded Storage object (`DELETE /storage/v1/object/replays/...`) on `user_replays` insert error.
  - Fix `logout()` to clear all profile fields (`username`, `displayName`, `email`, `nameChanged = false`, `elo = 1000`, zero `stats`, `personalRank = null`) and sync `gameUI`.
  - Align `validateAccountUsername` to `3..15` chars (`^[a-zA-Z0-9_.-]{3,15}$`) matching SQL `VARCHAR(15)` and `check_no_guest_prefix`.

- [ ] **Step 4: Implement `MatchRecorder.svelte.ts` LXR2, Gzip await, auto-upload & remove `.lxr` download**
  - Upgrade to `LXR2` with `chatMessages`, `banners`, `cameraZoom`, `viewportWidth`, `viewportHeight`, `recordingPlayerId`, `recordingPlayerName`, `timeLimitSeconds`, `isGoldenGoal` on frames, keeping `LXR1` backwards-compatible in parser.
  - Fix `compressReplayGzip` (`await writer.write`, `await writer.close`).
  - Remove live `MediaRecorder` during match + remove `.lxr` download methods; on `stop()`, finalize `lastReplayData`, auto-upload `.lxr.gz` via `userProfile.uploadUserReplay(...)` if authenticated, and raise `savedCloudNotice` (`"Grabación guardada en tu cuenta. Para verla o descargar el video, abre el Visor de Repeticiones en el Lobby o HUD."`) for 5s!

- [ ] **Step 5: Implement `ReplayHudCompositor.ts` & Redesign `ReplayViewerModal.svelte`**
  - `ReplayHudCompositor.ts`: Canvas 2D renderer reproducing pixel-faithful Top-Left Room card, Top-Center Scoreboard (+30s red pulse + Golden Goal badge), Bottom-Left Chat box, and Center Banners (`VS`, Countdown, Pause, Goal + Speed + Power/Curve, Victory) on a 1280×720 stage for `.webm` video export (`exportReplayToWebm(replay, onProgress)`).
  - `ReplayViewerModal.svelte`:
    - Starts directly on Cloud List view (`viewMode = 'list' | 'player'`).
    - Auth-gated cleanly (shows message + button to sign in/register -> `GATEKEEPER` if opened unauthenticated).
    - List shows saved cloud replays with: inline Rename input, **Ver** (loads `.lxr.gz`, switches to `'player'`), **Descargar Video (.webm)** (exports via `ReplayHudCompositor` + `GameRenderer` with progress %, downloads `.webm`), and **Eliminar** (confirm). ZERO `.lxr` file upload/download UI!
    - Player view renders fixed **16:9 proportional stage** using `computeReplayEffectiveZoom(...)` (`scale = stageWidth / 1280`), follows `recordingPlayerId` (with optional Ball Focus toggle), draws synced DOM scaled HUD + Minimap, and calls `renderer.setTeamKits(redKit, blueKit)`.

- [ ] **Step 6: Run recorder & cloud replay tests**
  Run: `npm run test -w @legacyx/client -- cloudReplaysAndCompositor.test.ts` (Expected: PASS).

---

### Task 5: Client Svelte UI & Chat UX Fixes (`@legacyx/client/src/ui/**`)

**Files:**
- Modify: `packages/client/src/ui/utils/chatMentions.ts` (`findActiveMentionToken`, `getMentionCandidates`, `segmentChatMentions`)
- Modify: `packages/client/src/ui/hud/InGameHUD.svelte`
- Modify: `packages/client/src/ui/modals/PhysicsModal.svelte`
- Modify: `packages/client/src/ui/modals/TeamSelectModal.svelte`
- Delete (if confirmed unused across repo): `packages/client/src/ui/hud/PostMatchCarousel.svelte` (after verifying all needed design styles live in `TeamSelectModal.svelte`, per `ponytail` YAGNI)
- Modify: `packages/client/src/ui/modals/SettingsModal.svelte`
- Modify: `packages/client/src/ui/screens/Lobby.svelte`
- Test: `packages/client/tests/ui/chatMentionsAndUiFixes.test.ts`

- [ ] **Step 1: Write failing tests in `packages/client/tests/ui/chatMentionsAndUiFixes.test.ts`**
  Cover:
  1. `getMentionCandidates('@dan', roster, 'Daniel')` NEVER returns `'Daniel'` (self-mention excluded case-insensitively).
  2. After `applyMentionCandidate('@', token, 'Carlos')` produces `'@Carlos '` with cursor at `8`, `findActiveMentionToken('@Carlos ', 8)` returns `null` (so mention menu closes immediately and next `Enter` sends message instead of re-selecting!).
  3. `segmentChatMentions('@Daniel hola', 'Daniel', ['Daniel'], 'Daniel')` does NOT mark own message as self-alert when sender === local player.
  4. `TeamSelectModal` accordion key uses unique player IDs so toggling 1 player only opens that 1 player (`expandedPlayers.size === 1`), while team header toggle opens/closes all members of that team cleanly; breakdown omits `Toques` and includes `Gol +100`, `Gol Pot. +30`, `Gol Ef. +30`, `Asist. +50`, `Asist. Ef. +20`, `Atajada +100`, `Tiro +20`, `Pase +10`, `Hattrick +100`, `Autogol -50`.
  5. `chatOpacity` slider value `85` / `10` converts to `0.85` / `0.10` alpha (not raw `85`).

- [ ] **Step 2: Run tests to verify failure**
  Run: `npm run test -w @legacyx/client -- chatMentionsAndUiFixes.test.ts` (Expected: FAIL).

- [ ] **Step 3: Implement Chat, HUD, VS Banner & Recording Controls (`chatMentions.ts`, `InGameHUD.svelte`)**
  - `chatMentions.ts`:
    - `findActiveMentionToken`: stop matching once query contains ANY whitespace (`/\s/.test(query)` returns `null`) so completed `@Handle ` immediately closes menu and unlocks `Enter` to send!
    - `getMentionCandidates`: strictly exclude `excludeNickname` (handles + case-insensitive).
    - `segmentChatMentions`: accept optional `senderNickname` so own messages don't glow/chime as self-mentions.
  - `InGameHUD.svelte`:
    - Pass `gameUI.nickname` to `getMentionCandidates(..., gameUI.nickname)`.
    - **Item 6**: In `.hud-sliding-event-card`, render ONLY `<span class="event-badge">{event.eventType}</span>` and `<span class="event-points">{event.pointsText}</span>` (remove `<span class="event-player">` completely!). Support stacked/queued local events cleanly.
    - **Item 8**: Compute normalized opacity `Math.max(0.05, Math.min(1, raw > 1 ? raw / 100 : raw))` for `.hud-chat-container`.
    - **Item 9**: Update `isWarning30s` to `($derived((gameUI.matchPhase === 1 || gameUI.matchPhase === 2) && gameUI.timeLimit > 0 && !gameUI.isGoldenGoal && remainingSeconds <= 30 && remainingSeconds > 0))`; verify `.golden-goal-floating-badge` renders right of `.top-card-center` whenever `gameUI.isGoldenGoal`.
    - **Item 10**: Remove `<svg class="sys-bolt-svg"...>` from `.chat-system-notice` (and unused CSS).
    - **Item 14**: Fix `.vs-card` / `.vs-team-half` CSS (`1820-1889`) to solid opaque Cyber-Pitch card backgrounds (`#0c1424` / solid dark gradients framed with crisp borders and opaque text contrast instead of transparent/translucent washes!).
    - **Item 18, 19, 23**: Add **Replay Viewer button** immediately to the LEFT of the **Record button** inside `.top-card-right` (`disabled`/shows auth warning toast if `!userProfile.isAuthenticated`). Gate Record button with same visible auth toast. Render temporary `matchRecorder.savedCloudNotice` banner when recording stops (`"Grabación guardada en tu cuenta. Abre el Visor de Repeticiones en el Lobby o HUD para verla o descargar el video."`).
    - **Item 24**: Add `user-select: text; -webkit-user-select: text; cursor: text;` on `.chat-messages-scroll` and chat message items so players can select and copy chat text cleanly.

- [ ] **Step 4: Implement PhysicsModal, Stats Redesign (`TeamSelectModal.svelte`), Lobby, Settings `"Cuenta"`**
  - `PhysicsModal.svelte`: change `staminaRegenMovingRate.defaultVal` to `25` and Reset default `staminaRegenMoving` to `false`.
  - `TeamSelectModal.svelte`:
    - Slide 0 (`Stats`): Redesign with **Competitive Match Hero Header** (Team Kits, Giant Score, Match Duration, MVP Spotlight) + wider, cleaner parallel **Red & Blue Tables** (`PTS | G | A | S (Atajadas) | P | T (Tiros)`).
    - Add `"Desplegar todos"` button (`▲`/`▼`) on EACH team header (`toggleAllTeam('red' | 'blue')`).
    - Switch `expandedPlayerId` string -> `expandedPlayers = $state<Set<string>>(new Set())` keyed by guaranteed unique `player.playerId || `${team}:${index}:${player.nickname}`` so clicking one player NEVER opens others.
    - Remove `Toques` chip everywhere; render complete breakdown chips (`Gol`, `Gol Pot. +30`, `Gol Ef. +30`, `Asist.`, `Asist. Ef. +20`, `Atajada +100`, `Tiro +20`, `Pase +10`, `Hattrick +100`, `Autogol -50`). Check if `PostMatchCarousel.svelte` is imported anywhere else; remove dead duplicate file if unused (`ponytail`).
  - `Lobby.svelte`:
    - **Item 15**: Remove `estimateRoomPing` display; on card hover call `sharedSignaling.probeRoomPing(room.id)` and display `"Midiendo ping..."` until live `room.ping` resolves (`{room.ping} ms` + signal tier color).
    - **Item 18**: When unauthenticated and clicking `"VER REPETICIÓN"`, display visible Lobby banner/toast prompt (not invisible `pushScoreEvent`) telling player to sign in / create an account.
    - **Item 27**: Replace top-left `"Inicio"` button with working `"Cerrar sesión"` when `userProfile.isAuthenticated` (calling `logoutAndExitToGatekeeper()`) and remove duplicate `"CERRAR SESIÓN"` button from `.nick-row`.
    - **Item 28**: Deduplicate `ensureConnected()` / `room_list` listeners on mount/unmount.
  - `SettingsModal.svelte`:
    - **Item 29**: Extend `SettingsTab` to `'controls' | 'audio' | 'video' | 'kits' | 'avatar' | 'account'`. Add `'Cuenta'` nav button cleanly. Remove `.username-change-card` from `'avatar'` tab and place inside `'account'` tab along with account summary card (email, role badge, verified status, ELO, matches/wins/losses/draws/goals/assists/saves/MVP stats from `userProfile.stats`) for registered users, and an informative guest card with `"Iniciar sesión / Registrarse"` CTA for guests. Align username input `maxlength="15"` and validation (`3..15`).

- [ ] **Step 5: Run UI tests & `svelte-check`**
  Run: `npm run test -w @legacyx/client -- chatMentionsAndUiFixes.test.ts` (Expected: PASS).

---

### Task 6: Host & Non-Host Parity Integration (`SignalingClient`, `NetworkHost`, `NetworkClient`, `GameApp`, `gameUI.svelte.ts`, `App.svelte`)

**Files:**
- Modify: `packages/client/src/net/SignalingClient.ts` (`ensureConnected` `CONNECTING` guard, `userId`/`clientSessionId` identity in `JOIN_LOBBY`, `probeRoomPing(roomId)` live RTT measurement + host `PING_PROBE` -> `PONG_PROBE` echo handler)
- Modify: `packages/client/src/net/NetworkHost.ts` (`broadcastScoreEvent`, `broadcastBanner`)
- Modify: `packages/client/src/net/NetworkClient.ts` (handle `SCORE_EVENT`, `ROOM_STATE_SYNC`, `MATCH_STATS_SUMMARY`)
- Modify: `packages/client/src/net/GameApp.ts` (sync `playerName`, `speedKmh`, `isPower`, `isCurve`, `PING_PROBE` wiring, kickoff/golden-goal sync)
- Modify: `packages/client/src/ui/state/gameUI.svelte.ts` (`DEFAULT_PHYSICS_MODIFIERS` `staminaRegenMoving: false, staminaRegenMovingRate: 25`, `pushScoreEvent` FIFO/stack queue max 3 items preserving rapid local combo events, `resetRoomSession()` resets `isPracticeMode = false`, `activeSettingsTab` includes `'account'`)
- Modify: `packages/client/src/App.svelte` (blur/modal/chat clears + dispatches immediate guest input to prevent sticky turbo on host; `syncEngineMatchLimits` + `predEngine` receives `isGoldenGoal`, `isNeutralKickoff`, `kickoffPossessingTeam` from binary snapshots; `dispatchScoreEvent` strictly filters `ev.playerId === localPlayerId`, sends `playerName: ''`, NEVER calls `addFloatingScore` for BOTH Host and Non-Host; `GoalBannerDetails` populates `speedKmh`/`isPower`/`isCurve`; `renderer.setTeamKits` for captain colors; hooks `matchRecorder.recordChat` & `recordBanner` + zoom/viewport dims!)

- [ ] **Step 1: Write failing parity & integration tests (`packages/client/tests/net/hostGuestParityIntegration.test.ts`)**
  Cover:
  1. `SignalingClient.ensureConnected()` does NOT open a second WebSocket when `readyState === WebSocket.CONNECTING`.
  2. `SignalingClient` responds to `PING_PROBE` immediately with `PONG_PROBE` and updates `room.ping` cleanly on `ROOM_PING_RESULT`.
  3. Non-host `ClientPredictionReconciler` + `EngineInstance.setState` preserves `isGoldenGoal`, `isNeutralKickoff`, `kickoffPossessingTeam`, and enforces kickoff barriers identically to host in multiplayer `1v0` / post-goal states.
  4. Event filter parity: when `playerId: '2'` scores a Goal while local player is `'1'`, local HUD receives 0 event cards; when local player `'1'` scores with Power, local HUD renders `[GOL POTENTE]` + `[+130]` (NO player name).

- [ ] **Step 2: Run failing tests**
  Run: `npm run test -w @legacyx/client -- hostGuestParityIntegration.test.ts` (Expected: FAIL).

- [ ] **Step 3: Implement networking, state & `App.svelte` integration**
  - Update `SignalingClient.ts`, `NetworkHost.ts`, `NetworkClient.ts`, `GameApp.ts`, `gameUI.svelte.ts`, and `App.svelte` cleanly per interfaces above.
  - Ensure `App.svelte` global `onKeyDown` skips `e.preventDefault()` on `Ctrl+C`/`Cmd+C` when text is selected inside `.hud-chat-container` so copying chat works even in-game!
  - Ensure `App.svelte:79-82` Gatekeeper redirect does not trap logout cleanly (check `userProfile.logout()` clears state before navigating).

- [ ] **Step 4: Run integration tests & full workspace check/test/build**
  Run: `npm run check && npm run test && npm run build` (Expected: 0 errors across `@legacyx/core`, `@legacyx/server`, `@legacyx/client`).

---

### Task 7: Final Code Quality (`ponytail`), E2E `/browser` Verification & Walkthrough

- [ ] **Step 1: Run `ponytail` review across all modified diffs** to strip dead code (unused `PostMatchCarousel.svelte` / orphaned helpers), verify no `backdrop-filter: blur`, verify zero `shadowBlur` in hot paths, verify Svelte 5 runes compliance.
- [ ] **Step 2: Launch dev server (`signaling + client`) and run `/browser` (`Model: "flash"`) end-to-end visual + interactive verification**:
  - Verify Gatekeeper -> Guest & Auth UI, Lobby `"Cerrar sesión"` replacing `"Inicio"`, real online player count (`1` for registered user), hover room ping measuring live ms, Settings `"Cuenta"` tab (rename + stats/ELO), `"Ver Repeticiones"` auth warning gate.
  - Verify In-Game Host + Non-Host gameplay (Practice vs Multiplayer kickoff barriers, Stamina default off / 25%, Turbo non-sticky, Captain kit goalposts & keeper areas, Chat self-mention block + Enter after mention + opacity slider + copy chat + no join bolt, 30s constant pulse, Golden Goal badge, Goal speed `km/h`, Local-only `[EVENT] [+PTS]` card, Redesigned Stats + individual vs team expand-all toggle + curve/power sums, HUD Replay button + Recording stop toast + Cloud Replay Viewer 16:9 scaled HUD + WebM video export).
- [ ] **Step 3: Re-run full final check/test/build after any polish fixes** (`npm run check && npm run test && npm run build`) cleanly observing zero skipped/failing tests, and deliver final report.
