import crypto from 'node:crypto';

export type UserRole = 'superadmin' | 'representante' | 'jugador';
export type RoomCompetitionType = 'casual' | 'ranked';
export type LeaderboardCategory = 'elo' | 'goals' | 'assists' | 'saves';

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isVerified: boolean;
  verificationCode: string | null;
  codeExpiresAt: number | null;
  elo: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  assists: number;
  saves: number;
  mvpCount: number;
  createdAt: number;
}

export interface PublicUserProfile {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  role: UserRole | 'invitado';
  isGuest: boolean;
  isVerified: boolean;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  assists: number;
  saves: number;
  matchesPlayed: number;
}

export interface LeaderboardEntry {
  position: number;
  playerId: string;
  username: string;
  displayName: string;
  role: UserRole;
  metricValue: number;
  elo: number;
  goals: number;
  assists: number;
  saves: number;
}

export interface RankedMatchSession {
  matchToken: string;
  roomId: string;
  hostId: string;
  stadiumId: string;
  participantIds: string[];
  status: 'ACTIVE' | 'COMPLETED' | 'ABORTED';
  createdAt: number;
}

export interface RankedParticipantResult {
  playerId: string;
  username?: string;
  team: 'red' | 'blue';
  goals: number;
  assists: number;
  saves: number;
  isMvp?: boolean;
}

const DEFAULT_SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://jeopwutoxmaagxlebpsl.supabase.co';
const DEFAULT_SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implb3B3dXRveG1hYWd4bGVicHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MzYwNjksImV4cCI6MjEwOTUxMjA2OX0.0UXtRV9_wiKtHh5Dm5ypiLDIfKHTw81FkinmwkrJFvI';
const JWT_SECRET = process.env.JWT_SECRET || 'legacyx-go-cyber-pitch-jwt-secret-2026';

export class AuthService {
  private accountsById: Map<string, UserAccount> = new Map();
  private accountsByUsername: Map<string, string> = new Map();
  private accountsByEmail: Map<string, string> = new Map();
  private rankedMatchesByToken: Map<string, RankedMatchSession> = new Map();
  private activeRoomMatchTokens: Map<string, string> = new Map();
  private superadminUsers: Set<string>;

  constructor() {
    const envAdmins = (process.env.SUPERADMIN_USERS || 'superadmin,daniel,admin')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    this.superadminUsers = new Set(envAdmins);
    this.seedDefaultAccounts();
  }

  private seedDefaultAccounts(): void {
    const seeds: Array<{
      id: string;
      username: string;
      displayName: string;
      email: string;
      role: UserRole;
      elo: number;
      goals: number;
      assists: number;
      saves: number;
      wins: number;
    }> = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'DanielDev',
        displayName: 'DanielDev',
        email: 'daniel@legacyx.go',
        role: 'superadmin',
        elo: 1480,
        goals: 42,
        assists: 29,
        saves: 35,
        wins: 24
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        username: 'LigaRep',
        displayName: 'LigaRep',
        email: 'rep@legacyx.go',
        role: 'representante',
        elo: 1340,
        goals: 31,
        assists: 38,
        saves: 22,
        wins: 18
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        username: 'CyberStriker',
        displayName: 'CyberStriker',
        email: 'striker@legacyx.go',
        role: 'jugador',
        elo: 1265,
        goals: 54,
        assists: 16,
        saves: 14,
        wins: 15
      },
      {
        id: '00000000-0000-4000-8000-000000000004',
        username: 'NeonKeeper',
        displayName: 'NeonKeeper',
        email: 'keeper@legacyx.go',
        role: 'jugador',
        elo: 1210,
        goals: 12,
        assists: 25,
        saves: 61,
        wins: 14
      }
    ];

    for (const s of seeds) {
      const acc: UserAccount = {
        id: s.id,
        username: s.username,
        displayName: s.displayName,
        email: s.email,
        passwordHash: this.hashPassword('LegacyX2026!'),
        role: s.role,
        isVerified: true,
        verificationCode: null,
        codeExpiresAt: null,
        elo: s.elo,
        matchesPlayed: s.wins + 4,
        wins: s.wins,
        losses: 3,
        draws: 1,
        goals: s.goals,
        assists: s.assists,
        saves: s.saves,
        mvpCount: Math.floor(s.wins / 3),
        createdAt: Date.now()
      };
      this.accountsById.set(acc.id, acc);
      this.accountsByUsername.set(acc.username.toLowerCase(), acc.id);
      this.accountsByEmail.set(acc.email.toLowerCase(), acc.id);
    }
  }

  public static normalizeGuestNickname(rawName: string): string {
    const trimmed = (rawName || '').trim();
    const withoutPrefix = trimmed.replace(/^(inv_)+/i, '').trim();
    const clean = (withoutPrefix || 'Guest').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 15) || 'Guest';
    return `inv_${clean}`;
  }

  public static isGuestNickname(name: string): boolean {
    return /^inv_/i.test((name || '').trim());
  }

  public createGuestProfile(rawName: string): PublicUserProfile {
    const guestName = AuthService.normalizeGuestNickname(rawName);
    return {
      id: `guest_${crypto.randomBytes(6).toString('hex')}`,
      username: guestName,
      displayName: guestName,
      role: 'invitado',
      isGuest: true,
      isVerified: false,
      elo: 1000,
      wins: 0,
      losses: 0,
      draws: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      matchesPlayed: 0
    };
  }

  private hashPassword(password: string): string {
    return crypto.createHmac('sha256', JWT_SECRET).update(password).digest('hex');
  }

  private generateSixDigitCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  public signToken(account: UserAccount): string {
    const payload = {
      sub: account.id,
      username: account.username,
      role: account.role,
      isVerified: account.isVerified,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  public verifyToken(token?: string | null): UserAccount | null {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(encoded).digest('base64url');
    if (sig !== expectedSig) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      return this.accountsById.get(payload.sub) ?? null;
    } catch {
      return null;
    }
  }

  public toPublicProfile(account: UserAccount): PublicUserProfile {
    return {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      email: account.email,
      role: account.role,
      isGuest: false,
      isVerified: account.isVerified,
      elo: account.elo,
      wins: account.wins,
      losses: account.losses,
      draws: account.draws,
      goals: account.goals,
      assists: account.assists,
      saves: account.saves,
      matchesPlayed: account.matchesPlayed
    };
  }

  private syncAccountToSupabase(account: UserAccount): void {
    if (process.env.VITEST) return;
    const url = `${DEFAULT_SUPABASE_URL}/rest/v1/rpc/sync_player_profile`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: DEFAULT_SUPABASE_KEY,
        Authorization: `Bearer ${DEFAULT_SUPABASE_KEY}`
      },
      body: JSON.stringify({
        p_id: account.id,
        p_username: account.username,
        p_display_name: account.displayName,
        p_email: account.email,
        p_password_hash: account.passwordHash,
        p_role: account.role,
        p_is_verified: account.isVerified,
        p_verification_code: account.verificationCode,
        p_code_expires_at: account.codeExpiresAt ? new Date(account.codeExpiresAt).toISOString() : null,
        p_elo: account.elo
      })
    }).catch(() => {
      // Fallback silencioso a memoria en entornos sin red
    });
  }

  public register(input: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
  }): {
    ok: boolean;
    error?: string;
    verificationCode?: string;
    expiresInSeconds?: number;
    username?: string;
    email?: string;
  } {
    const username = (input.username || '').trim();
    const email = (input.email || '').trim().toLowerCase();
    const password = input.password || '';

    if (/^inv_/i.test(username)) {
      return { ok: false, error: 'El nombre de usuario no puede iniciar con el prefijo reservado "inv_".' };
    }
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(username)) {
      return {
        ok: false,
        error: 'El nombre de usuario debe tener entre 3 y 15 caracteres alfanuméricos (sin espacios).'
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Ingresa un correo electrónico válido.' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
    }

    const existingByUser = this.accountsByUsername.get(username.toLowerCase());
    if (existingByUser) {
      const existingAcc = this.accountsById.get(existingByUser);
      if (existingAcc && existingAcc.isVerified) {
        return { ok: false, error: 'Ese nombre de usuario ya está registrado.' };
      }
    }

    const existingByEmail = this.accountsByEmail.get(email);
    if (existingByEmail) {
      const existingAcc = this.accountsById.get(existingByEmail);
      if (existingAcc && existingAcc.isVerified) {
        return { ok: false, error: 'Ese correo electrónico ya está vinculado a una cuenta verificada.' };
      }
    }

    const code = this.generateSixDigitCode();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const isSuperadmin = this.superadminUsers.has(username.toLowerCase());
    const role: UserRole = isSuperadmin ? 'superadmin' : 'jugador';

    const id = existingByUser || existingByEmail || crypto.randomUUID();
    const account: UserAccount = {
      id,
      username,
      displayName: (input.displayName || username).trim().slice(0, 20),
      email,
      passwordHash: this.hashPassword(password),
      role,
      isVerified: false,
      verificationCode: code,
      codeExpiresAt: expiresAt,
      elo: 1000,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      mvpCount: 0,
      createdAt: Date.now()
    };

    this.accountsById.set(id, account);
    this.accountsByUsername.set(username.toLowerCase(), id);
    this.accountsByEmail.set(email, id);
    this.syncAccountToSupabase(account);

    return {
      ok: true,
      verificationCode: code,
      expiresInSeconds: 900,
      username: account.username,
      email: account.email
    };
  }

  public verifyEmail(input: {
    usernameOrEmail: string;
    code: string;
  }): {
    ok: boolean;
    error?: string;
    token?: string;
    user?: PublicUserProfile;
  } {
    const key = (input.usernameOrEmail || '').trim().toLowerCase();
    const code = (input.code || '').trim();
    const accountId = this.accountsByUsername.get(key) ?? this.accountsByEmail.get(key);
    if (!accountId) {
      return { ok: false, error: 'No se encontró una cuenta pendiente de verificación.' };
    }
    const account = this.accountsById.get(accountId);
    if (!account) {
      return { ok: false, error: 'Cuenta no encontrada.' };
    }
    if (account.isVerified) {
      return {
        ok: true,
        token: this.signToken(account),
        user: this.toPublicProfile(account)
      };
    }
    if (!/^\d{6}$/.test(code) || account.verificationCode !== code) {
      return { ok: false, error: 'El código de verificación de 6 dígitos es incorrecto.' };
    }
    if (account.codeExpiresAt && Date.now() > account.codeExpiresAt) {
      return { ok: false, error: 'El código de verificación ha expirado (validez 15 min).' };
    }

    account.isVerified = true;
    account.verificationCode = null;
    account.codeExpiresAt = null;
    account.elo = 1000;
    this.syncAccountToSupabase(account);

    return {
      ok: true,
      token: this.signToken(account),
      user: this.toPublicProfile(account)
    };
  }

  public login(input: {
    usernameOrEmail: string;
    password: string;
  }): {
    ok: boolean;
    error?: string;
    requiresVerification?: boolean;
    token?: string;
    user?: PublicUserProfile;
  } {
    const key = (input.usernameOrEmail || '').trim().toLowerCase();
    const password = input.password || '';
    const accountId = this.accountsByUsername.get(key) ?? this.accountsByEmail.get(key);
    if (!accountId) {
      return { ok: false, error: 'Usuario o contraseña incorrectos.' };
    }
    const account = this.accountsById.get(accountId);
    if (!account || account.passwordHash !== this.hashPassword(password)) {
      return { ok: false, error: 'Usuario o contraseña incorrectos.' };
    }
    if (!account.isVerified) {
      return {
        ok: false,
        requiresVerification: true,
        error: 'Tu cuenta aún no está verificada. Ingresa el código de 6 dígitos enviado a tu correo.'
      };
    }

    return {
      ok: true,
      token: this.signToken(account),
      user: this.toPublicProfile(account)
    };
  }

  public canCreateRankedRoom(user: { role?: string; isGuest?: boolean; isVerified?: boolean } | null | undefined): boolean {
    if (!user || user.isGuest || !user.isVerified) return false;
    return user.role === 'superadmin' || user.role === 'representante';
  }

  public validateRoomJoin(
    roomType: RoomCompetitionType,
    user: { username?: string; role?: string; isGuest?: boolean; isVerified?: boolean } | null | undefined
  ): { allowed: boolean; reason?: string } {
    if (roomType !== 'ranked') {
      return { allowed: true };
    }
    const isGuest =
      !user ||
      Boolean(user.isGuest) ||
      !user.isVerified ||
      user.role === 'invitado' ||
      AuthService.isGuestNickname(user.username || '');

    if (isGuest) {
      return {
        allowed: false,
        reason: 'Esta sala es Clasificatoria. Debes iniciar sesión con una cuenta verificada para entrar.'
      };
    }
    return { allowed: true };
  }

  public updateUserRole(input: {
    requesterToken?: string;
    requesterId?: string;
    targetUsername: string;
    newRole: UserRole;
  }): { ok: boolean; error?: string; updatedUser?: PublicUserProfile } {
    let requester = input.requesterToken ? this.verifyToken(input.requesterToken) : null;
    if (!requester && input.requesterId) {
      requester = this.accountsById.get(input.requesterId) ?? null;
    }
    if (!requester || requester.role !== 'superadmin') {
      return { ok: false, error: 'Solo un superadmin puede asignar o revocar roles de representante.' };
    }

    const targetId = this.accountsByUsername.get((input.targetUsername || '').trim().toLowerCase());
    if (!targetId) {
      return { ok: false, error: `No existe ningún usuario registrado con el nombre "${input.targetUsername}".` };
    }
    const target = this.accountsById.get(targetId)!;
    target.role = input.newRole;
    this.syncAccountToSupabase(target);

    return {
      ok: true,
      updatedUser: this.toPublicProfile(target)
    };
  }

  public issueRankedMatchToken(params: {
    roomId: string;
    hostId: string;
    stadiumId: string;
    participantIds: string[];
  }): { ok: boolean; error?: string; matchToken?: string } {
    const hostAcc = this.accountsById.get(params.hostId);
    if (!hostAcc || (hostAcc.role !== 'superadmin' && hostAcc.role !== 'representante')) {
      return {
        ok: false,
        error: 'Solo un Host con rol representante o superadmin puede iniciar partidas Clasificatorias (Ranked).'
      };
    }

    const nonce = crypto.randomBytes(12).toString('hex');
    const raw = `${params.roomId}:${params.hostId}:${params.stadiumId}:${Date.now()}:${nonce}`;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(raw).digest('hex');
    const matchToken = `lxr_ranked_${Buffer.from(raw).toString('base64url')}.${sig}`;

    const session: RankedMatchSession = {
      matchToken,
      roomId: params.roomId,
      hostId: params.hostId,
      stadiumId: params.stadiumId,
      participantIds: [...params.participantIds],
      status: 'ACTIVE',
      createdAt: Date.now()
    };

    this.rankedMatchesByToken.set(matchToken, session);
    this.activeRoomMatchTokens.set(params.roomId, matchToken);

    return { ok: true, matchToken };
  }

  public abortRankedMatchForRoom(roomId: string): boolean {
    const token = this.activeRoomMatchTokens.get(roomId);
    if (!token) return false;
    return this.abortRankedMatchByToken(token);
  }

  public abortRankedMatchByToken(matchToken: string): boolean {
    const session = this.rankedMatchesByToken.get(matchToken);
    if (!session || session.status !== 'ACTIVE') return false;
    session.status = 'ABORTED';
    this.activeRoomMatchTokens.delete(session.roomId);

    if (!process.env.VITEST) {
      fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/rpc/report_ranked_match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: DEFAULT_SUPABASE_KEY,
          Authorization: `Bearer ${DEFAULT_SUPABASE_KEY}`
        },
        body: JSON.stringify({
          p_match_token: session.matchToken,
          p_host_id: session.hostId,
          p_stadium_id: session.stadiumId,
          p_duration_seconds: Math.max(0, Math.round((Date.now() - session.createdAt) / 1000)),
          p_red_score: 0,
          p_blue_score: 0,
          p_winner: 'draw',
          p_status: 'ABORTED',
          p_participants: []
        })
      }).catch(() => {});
    }
    return true;
  }

  public reportRankedMatch(params: {
    matchToken: string;
    roomType?: RoomCompetitionType;
    isPracticeMode?: boolean;
    durationSeconds: number;
    redScore: number;
    blueScore: number;
    winner: 'red' | 'blue' | 'draw';
    participants: RankedParticipantResult[];
  }): { ok: boolean; error?: string; status?: 'COMPLETED' | 'ABORTED'; eloChanges?: Record<string, number> } {
    if (params.isPracticeMode || params.roomType === 'casual') {
      return { ok: false, error: 'Las partidas Casual o en Modo Entrenamiento no suman estadísticas ni ELO.' };
    }

    const session = this.rankedMatchesByToken.get(params.matchToken);
    if (!session) {
      return { ok: false, error: 'MatchToken inválido o no registrado.' };
    }
    if (session.status === 'ABORTED') {
      return { ok: false, status: 'ABORTED', error: 'La partida fue abortada por desconexión; no se deduce ELO.' };
    }
    if (session.status === 'COMPLETED') {
      return { ok: false, error: 'Esta partida clasificatoria ya fue reportada.' };
    }

    session.status = 'COMPLETED';
    this.activeRoomMatchTokens.delete(session.roomId);

    const eloChanges: Record<string, number> = {};
    const rpcParticipants: Array<Record<string, unknown>> = [];

    for (const p of params.participants) {
      const accountId =
        this.accountsById.has(p.playerId)
          ? p.playerId
          : (p.username ? this.accountsByUsername.get(p.username.toLowerCase()) : undefined);
      if (!accountId) continue;
      const acc = this.accountsById.get(accountId);
      if (!acc || !acc.isVerified || AuthService.isGuestNickname(acc.username)) continue;

      const isDraw = params.winner === 'draw';
      const won = !isDraw && p.team === params.winner;
      const eloDelta = isDraw ? 5 : won ? 25 : -18;

      acc.elo = Math.max(100, acc.elo + eloDelta);
      acc.matchesPlayed += 1;
      if (isDraw) acc.draws += 1;
      else if (won) acc.wins += 1;
      else acc.losses += 1;

      acc.goals += Math.max(0, p.goals || 0);
      acc.assists += Math.max(0, p.assists || 0);
      acc.saves += Math.max(0, p.saves || 0);
      if (p.isMvp) acc.mvpCount += 1;

      eloChanges[acc.id] = eloDelta;
      rpcParticipants.push({
        player_id: acc.id,
        elo_delta: eloDelta,
        goals: Math.max(0, p.goals || 0),
        assists: Math.max(0, p.assists || 0),
        saves: Math.max(0, p.saves || 0),
        is_mvp: Boolean(p.isMvp),
        won,
        draw: isDraw
      });
    }

    if (!process.env.VITEST) {
      fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/rpc/report_ranked_match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: DEFAULT_SUPABASE_KEY,
          Authorization: `Bearer ${DEFAULT_SUPABASE_KEY}`
        },
        body: JSON.stringify({
          p_match_token: session.matchToken,
          p_host_id: session.hostId,
          p_stadium_id: session.stadiumId,
          p_duration_seconds: Math.max(1, Math.round(params.durationSeconds || 180)),
          p_red_score: params.redScore,
          p_blue_score: params.blueScore,
          p_winner: params.winner,
          p_status: 'COMPLETED',
          p_participants: rpcParticipants
        })
      }).catch(() => {});
    }

    return { ok: true, status: 'COMPLETED', eloChanges };
  }

  public getLeaderboard(
    category: LeaderboardCategory = 'elo',
    limit: number = 50,
    viewerUserId?: string
  ): {
    category: LeaderboardCategory;
    entries: LeaderboardEntry[];
    personalEntry: LeaderboardEntry | null;
  } {
    const verifiedAccounts = Array.from(this.accountsById.values()).filter(
      (acc) => acc.isVerified && !AuthService.isGuestNickname(acc.username)
    );

    const getMetric = (acc: UserAccount): number => {
      switch (category) {
        case 'goals':
          return acc.goals;
        case 'assists':
          return acc.assists;
        case 'saves':
          return acc.saves;
        case 'elo':
        default:
          return acc.elo;
      }
    };

    verifiedAccounts.sort((a, b) => {
      const diff = getMetric(b) - getMetric(a);
      if (diff !== 0) return diff;
      return b.elo - a.elo;
    });

    const allRanked: LeaderboardEntry[] = verifiedAccounts.map((acc, index) => ({
      position: index + 1,
      playerId: acc.id,
      username: acc.username,
      displayName: acc.displayName,
      role: acc.role,
      metricValue: getMetric(acc),
      elo: acc.elo,
      goals: acc.goals,
      assists: acc.assists,
      saves: acc.saves
    }));

    const personalEntry = viewerUserId
      ? allRanked.find((e) => e.playerId === viewerUserId || e.username.toLowerCase() === viewerUserId.toLowerCase()) ?? null
      : null;

    return {
      category,
      entries: allRanked.slice(0, Math.max(1, Math.min(100, limit))),
      personalEntry
    };
  }
}

export const authService = new AuthService();
