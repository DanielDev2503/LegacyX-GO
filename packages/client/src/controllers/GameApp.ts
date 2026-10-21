/**
 * Validates whether a peer is authorized to move a target player between teams.
 * - Host/Admin can always move any player regardless of teamsLocked.
 * - Regular players can only move themselves, and only when teamsLocked is false.
 */
export function canChangeTeam(
  senderPeerId: string,
  targetPlayerId: string,
  teamsLocked: boolean,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (teamsLocked) return false;
  return senderPeerId === targetPlayerId;
}

export * from '../net/GameApp.js';
