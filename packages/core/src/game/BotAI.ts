import {
  INPUT_KICK,
  INPUT_TURBO,
  INPUT_DASH,
  INPUT_MAGNUS_LEFT,
  INPUT_MAGNUS_RIGHT,
  INPUT_MOUSE_AIM
} from './Player';
import type { PlayerPosition } from './GameConfig';
import type { PlayerInput } from '../protocol/BinaryProtocol';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface BotConfig {
  id: number;
  team: 'red' | 'blue';
  position: PlayerPosition;
  difficulty: BotDifficulty;
}

export interface BotWorldPlayer {
  id: number;
  team: 'red' | 'blue' | 'spec';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  position?: PlayerPosition;
}

export interface BotDecisionContext {
  ballX: number;
  ballY: number;
  ballVx: number;
  ballVy: number;
  ballRadius: number;
  halfWidth: number;
  halfHeight: number;
  goalHalfHeight: number;
  kickMargin: number;
  currentTick: number;
  isKickoff: boolean;
  players: readonly BotWorldPlayer[];
}

function clampVal(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function deterministicJitter(tick: number, botId: number): number {
  const seed = Math.sin(tick * 0.17 + botId * 19.37) * 43758.5453;
  return (seed - Math.floor(seed)) * 2 - 1;
}

/**
 * Computes deterministic, team-aware tactical input for an AI teammate/opponent.
 * Supports GK, DFC, MC, ST spatial roles and easy/medium/hard difficulty tiers.
 */
export function computeBotInput(
  bot: BotWorldPlayer,
  cfg: BotConfig,
  stamina: number,
  ctx: BotDecisionContext
): PlayerInput {
  const attackDir = cfg.team === 'red' ? 1 : -1; // Red attacks +X, Blue attacks -X
  const ownGoalX = -attackDir * ctx.halfWidth;
  const oppGoalX = attackDir * ctx.halfWidth;

  const predSeconds =
    cfg.difficulty === 'hard' ? 0.28 : cfg.difficulty === 'medium' ? 0.14 : 0.0;
  const predBallX = clampVal(ctx.ballX + ctx.ballVx * predSeconds, -ctx.halfWidth, ctx.halfWidth);
  const predBallY = clampVal(ctx.ballY + ctx.ballVy * predSeconds, -ctx.halfHeight, ctx.halfHeight);

  // Measure team spacing around the ball
  let nearestTeammateId = bot.id;
  let nearestTeammateDist = Math.hypot(predBallX - bot.x, predBallY - bot.y);
  let nearestTeamFieldDist = Infinity;
  let hasPossession = false;

  const teammates: BotWorldPlayer[] = [];
  let oppKeeperY = 0;

  for (const p of ctx.players) {
    if (p.team !== 'red' && p.team !== 'blue') continue;
    if (p.team === cfg.team) {
      teammates.push(p);
      const d = Math.hypot(predBallX - p.x, predBallY - p.y);
      if (d < nearestTeammateDist - 6) {
        nearestTeammateDist = d;
        nearestTeammateId = p.id;
      }
      if (p.position !== 'GK' && d < nearestTeamFieldDist) {
        nearestTeamFieldDist = d;
      }
    } else if (p.position === 'GK') {
      oppKeeperY = p.y;
    }
  }

  // Opponent proximity vs our team
  let nearestOppDist = Infinity;
  for (const p of ctx.players) {
    if (p.team !== 'red' && p.team !== 'blue') continue;
    if (p.team !== cfg.team) {
      const d = Math.hypot(predBallX - p.x, predBallY - p.y);
      if (d < nearestOppDist) nearestOppDist = d;
    }
  }
  hasPossession = nearestTeammateDist <= nearestOppDist + 18;

  const myBallDist = Math.hypot(ctx.ballX - bot.x, ctx.ballY - bot.y);
  const myPredDist = Math.hypot(predBallX - bot.x, predBallY - bot.y);
  const isClosestTeammate = nearestTeammateId === bot.id;

  // Pick passing/shooting target
  let passTarget: BotWorldPlayer | null = null;
  let bestPassScore = -Infinity;
  for (const mate of teammates) {
    if (mate.id === bot.id) continue;
    const forwardGain = (mate.x - bot.x) * attackDir;
    const dist = Math.hypot(mate.x - bot.x, mate.y - bot.y);
    if (dist < 75 || dist > ctx.halfWidth * 1.15) continue;
    // Prefer open teammates positioned further upfield than passer
    if (forwardGain > 30 || cfg.position === 'GK') {
      const score = forwardGain - dist * 0.25 + (mate.position === 'ST' ? 50 : 0);
      if (score > bestPassScore) {
        bestPassScore = score;
        passTarget = mate;
      }
    }
  }

  // Target aim point when striking the ball
  let kickTargetX = oppGoalX;
  let kickTargetY =
    Math.abs(oppKeeperY) < ctx.goalHalfHeight * 0.45
      ? (ctx.ballY >= 0 ? -ctx.goalHalfHeight * 0.62 : ctx.goalHalfHeight * 0.62)
      : -Math.sign(oppKeeperY || 1) * ctx.goalHalfHeight * 0.65;

  const distToOppGoal = Math.hypot(oppGoalX - ctx.ballX, -ctx.ballY);
  if (passTarget && (cfg.position === 'GK' || (cfg.position === 'DFC' && distToOppGoal > ctx.halfWidth * 0.9) || (cfg.position === 'MC' && distToOppGoal > ctx.halfWidth * 0.85))) {
    kickTargetX = passTarget.x + passTarget.vx * 0.15;
    kickTargetY = passTarget.y + passTarget.vy * 0.15;
  }

  // Determine tactical destination based on role + ball state
  let targetX = predBallX;
  let targetY = predBallY;
  let shouldChaseBall = isClosestTeammate;

  const ballInOwnBoxZone = (ctx.ballX - ownGoalX) * attackDir < ctx.halfWidth * 0.42;
  const ballInOwnHalf = (ctx.ballX - 0) * attackDir <= 25;

  if (cfg.position === 'GK') {
    const gkHomeX = ownGoalX + attackDir * (bot.radius + 16);
    const gkHomeY = clampVal(predBallY * 0.68, -ctx.goalHalfHeight * 0.78, ctx.goalHalfHeight * 0.78);
    // GK only leaves line if ball is in defensive box and nobody else is much closer
    const emergencySweep =
      ballInOwnBoxZone &&
      myPredDist < 190 &&
      (isClosestTeammate || Math.abs(ctx.ballVx) < 40);
    shouldChaseBall = emergencySweep;
    if (!shouldChaseBall) {
      targetX = gkHomeX;
      targetY = gkHomeY;
    }
  } else if (cfg.position === 'DFC') {
    if (isClosestTeammate || (ballInOwnHalf && myPredDist < nearestTeammateDist + 55)) {
      shouldChaseBall = true;
    } else {
      shouldChaseBall = false;
      targetX = clampVal(ownGoalX + attackDir * ctx.halfWidth * 0.42 + predBallX * 0.28, -ctx.halfWidth * 0.85, ctx.halfWidth * 0.85);
      // Cover opposite lane to attacker if ball isn't ours
      targetY = clampVal(predBallY * 0.58 - Math.sign(predBallY || 1) * 18, -ctx.halfHeight * 0.72, ctx.halfHeight * 0.72);
    }
  } else if (cfg.position === 'MC') {
    if (isClosestTeammate) {
      shouldChaseBall = true;
    } else {
      shouldChaseBall = false;
      const supportShift = hasPossession ? attackDir * 110 : -attackDir * 70;
      targetX = clampVal(ctx.ballX + supportShift, -ctx.halfWidth * 0.72, ctx.halfWidth * 0.72);
      const oppSideY = ctx.ballY > 25 ? -95 : ctx.ballY < -25 ? 95 : 85 * ((bot.id % 2 === 0) ? 1 : -1);
      targetY = clampVal(oppSideY, -ctx.halfHeight * 0.75, ctx.halfHeight * 0.75);
    }
  } else {
    // ST (Delantero)
    const ballAhead = (ctx.ballX - ownGoalX) * attackDir > ctx.halfWidth * 0.75;
    if (isClosestTeammate && (ballAhead || !ballInOwnBoxZone)) {
      shouldChaseBall = true;
    } else {
      shouldChaseBall = false;
      targetX = clampVal(oppGoalX - attackDir * ctx.halfWidth * 0.32, -ctx.halfWidth * 0.55, ctx.halfWidth * 0.84);
      const laneOffset = ctx.ballY > 20 ? -ctx.goalHalfHeight * 0.72 : ctx.goalHalfHeight * 0.72;
      targetY = clampVal(laneOffset, -ctx.halfHeight * 0.76, ctx.halfHeight * 0.76);
    }
  }

  // Approach behind the ball relative to kick target to prevent own goals
  const kickVecX = kickTargetX - ctx.ballX;
  const kickVecY = kickTargetY - ctx.ballY;
  const kickLen = Math.hypot(kickVecX, kickVecY) || 1;
  const kickDirX = kickVecX / kickLen;
  const kickDirY = kickVecY / kickLen;

  if (shouldChaseBall) {
    const contactDist = bot.radius + ctx.ballRadius + 2;
    const approachX = predBallX - kickDirX * contactDist;
    const approachY = predBallY - kickDirY * contactDist;

    const toBallX = ctx.ballX - bot.x;
    const toBallY = ctx.ballY - bot.y;
    const distToBallNow = Math.hypot(toBallX, toBallY) || 1;
    const alignDot = (toBallX / distToBallNow) * kickDirX + (toBallY / distToBallNow) * kickDirY;

    // Wrong side of the ball relative to target goal/pass? Swing around laterally first
    if (alignDot < -0.15 && distToBallNow < 115 && cfg.position !== 'GK') {
      const perpSign = (bot.y - ctx.ballY) >= 0 ? 1 : -1;
      const perpX = -kickDirY * perpSign;
      const perpY = kickDirX * perpSign;
      targetX = ctx.ballX - kickDirX * (contactDist + 26) + perpX * (contactDist + 22);
      targetY = ctx.ballY - kickDirY * (contactDist + 26) + perpY * (contactDist + 22);
    } else {
      targetX = approachX;
      targetY = approachY;
    }
  }

  targetX = clampVal(targetX, -ctx.halfWidth + bot.radius, ctx.halfWidth - bot.radius);
  targetY = clampVal(targetY, -ctx.halfHeight + bot.radius, ctx.halfHeight - bot.radius);

  // Move vector
  const moveDx = targetX - bot.x;
  const moveDy = targetY - bot.y;
  const moveDist = Math.hypot(moveDx, moveDy);

  let aimAngle = Math.atan2(moveDy, moveDx);
  const jitterId = Number.isFinite(cfg.id) ? cfg.id : bot.id;
  if (cfg.difficulty === 'easy') {
    aimAngle += deterministicJitter(Math.floor(ctx.currentTick / 10), jitterId) * 0.24;
  } else if (cfg.difficulty === 'medium') {
    aimAngle += deterministicJitter(Math.floor(ctx.currentTick / 6), jitterId) * 0.08;
  }

  let aimThrottle = 0;
  if (moveDist > 4) {
    const baseMaxThrottle =
      cfg.difficulty === 'easy' ? 0.68 : cfg.difficulty === 'medium' ? 0.90 : 1.0;
    aimThrottle = moveDist < 22 ? Math.max(0.25, (moveDist / 22) * baseMaxThrottle) : baseMaxThrottle;
  }

  let inputMask = aimThrottle > 0 ? INPUT_MOUSE_AIM : 0;

  // Kick logic: strike cleanly when in range and not facing own goal
  const kickRange = bot.radius + ctx.ballRadius + ctx.kickMargin + 3.5;
  if (myBallDist <= kickRange && !ctx.isKickoff) {
    const bdx = (ctx.ballX - bot.x) / (myBallDist || 1);
    const bdy = (ctx.ballY - bot.y) / (myBallDist || 1);
    const facingForward = bdx * attackDir > -0.15 || cfg.position === 'GK';
    const alignedToTarget = bdx * kickDirX + bdy * kickDirY > 0.35;
    const hitChanceGate = cfg.difficulty === 'easy' ? ctx.currentTick % 4 !== 0 : true;
    if (facingForward && (alignedToTarget || cfg.position === 'GK') && hitChanceGate) {
      inputMask |= INPUT_KICK;
      if (cfg.difficulty === 'hard' && Math.abs(ctx.ballY) > 35 && distToOppGoal < ctx.halfWidth * 0.85) {
        inputMask |= ctx.ballY > 0 ? INPUT_MAGNUS_LEFT : INPUT_MAGNUS_RIGHT;
      }
    }
  }

  // Turbo & Dash usage by difficulty
  if (aimThrottle > 0.5 && cfg.difficulty !== 'easy') {
    const wantsSprint = shouldChaseBall && myPredDist > 90;
    const needsRecovery = !hasPossession && (ctx.ballX - bot.x) * attackDir < -70;
    if ((wantsSprint || needsRecovery) && stamina > (cfg.difficulty === 'hard' ? 22 : 35)) {
      inputMask |= INPUT_TURBO;
    }

    if (
      shouldChaseBall &&
      !ctx.isKickoff &&
      stamina > (cfg.difficulty === 'hard' ? 42 : 60) &&
      myPredDist > 80 &&
      myPredDist < 170
    ) {
      const dashInterval = cfg.difficulty === 'hard' ? 75 : 150;
      if (ctx.currentTick % dashInterval === (jitterId * 13) % dashInterval) {
        inputMask |= INPUT_DASH;
      }
    }
  }

  return {
    inputMask,
    aimAngle: aimThrottle > 0 ? aimAngle : null,
    aimThrottle
  };
}
