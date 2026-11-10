import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { RankedParticipantStat } from '@legacyx/core';

export type UserRole = 'superadmin' | 'representante' | 'jugador';
export type LeaderboardCategory = 'elo' | 'goals' | 'assists' | 'saves';

export const RANKED_GUEST_REJECT_MESSAGE =
  'Esta sala es Clasificatoria. Debes iniciar sesión con una cuenta verificada para entrar.';

export const DEFAULT_SUPABASE_URL = 'https://jeopwutoxmaagxlebpsl.supabase.co';
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YLPCQO9kz0l9oFkuEPIXow_uRebEaEf';

export interface UserProfileRecord {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
  elo: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  assists: number;
  saves: number;
  mvpCount: number;
}

export interface LeaderboardEntry {
  position: number;
  player_id: string;
  username: string;
  metric_value: number;
  elo: number;
}

export interface SignedMatchTokenPayload {
  roomId: string;
  hostUserId: string;
  stadiumId: string;
  participantUserIds: string[];
  issuedAt: number;
  nonce: string;
}

export function formatGuestNickname(rawName: string): string {
  const trimmed = String(rawName ?? '').trim();
  const withoutGuestPrefix = trimmed.replace(/^(inv_)+/i, '').trim();
  const sanitized = withoutGuestPrefix.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim();
  const base = (sanitized || `Player${randomInt(100, 999)}`).slice(0, 16);
  return `inv_${base}`;
}

export function isGuestNickname(name?: string | null): boolean {
  if (!name) return true;
  return /^inv_/i.test(name.trim());
}

export function validateRegistrationUsername(username: string): { valid: boolean; error?: string } {
  const clean = String(username ?? '').trim();
  if (clean.length < 3 || clean.length > 15) {
    return { valid: false, error: 'El nombre de usuario debe tener entre 3 y 15 caracteres.' };
  }
  if (/^inv_/i.test(clean)) {
    return { valid: false, error: 'El prefijo inv_ está reservado exclusivamente para invitados.' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
    return { valid: false, error: 'Usa únicamente letras, números o guion bajo (_).' };
  }
  return { valid: true };
}

export function canCreateRankedRoom(role?: UserRole | string | null, isGuest: boolean = false): boolean {
  if (isGuest) return false;
  return role === 'representante' || role === 'superadmin';
}

export function canJoinRankedRoom(opts: {
  isGuest?: boolean;
  isVerified?: boolean;
  nickname?: string | null;
}): { allowed: boolean; error?: string } {
  if (opts.isGuest || !opts.isVerified || isGuestNickname(opts.nickname)) {
    return {
      allowed: false,
      error: RANKED_GUEST_REJECT_MESSAGE
    };
  }
  return { allowed: true };
}

export function calculateEloDelta(
  playerElo: number,
  opponentAvgElo: number,
  outcome: 'win' | 'loss' | 'draw',
  kFactor: number = 32
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentAvgElo - playerElo) / 400));
  const actual = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  return Math.round(kFactor * (actual - expected));
}

export class AuthService {
  private readonly supabaseUrl: string;
  private readonly apiKey: string;
  private readonly serviceRoleKey: string;
  private readonly tokenSecret: string;
  private readonly superadminIdentifiers: Set<string>;

  constructor() {
    this.supabaseUrl = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
    this.apiKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      DEFAULT_SUPABASE_PUBLISHABLE_KEY;
    this.serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    this.tokenSecret =
      process.env.MATCH_TOKEN_SECRET || 'legacyx_go_ranked_match_token_hmac_v1';
    this.superadminIdentifiers = new Set(
      (process.env.SUPERADMIN_IDENTIFIERS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  private buildHeaders(bearerToken?: string, useServiceRole: boolean = false): Record<string, string> {
    const key = useServiceRole && this.serviceRoleKey ? this.serviceRoleKey : this.apiKey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: key
    };
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    } else if (useServiceRole && this.serviceRoleKey) {
      headers.Authorization = `Bearer ${this.serviceRoleKey}`;
    }
    return headers;
  }

  private generateSixDigitCode(): string {
    return String(randomInt(100000, 1000000));
  }

  private async callRpc<T = any>(
    fnName: string,
    args: Record<string, unknown>,
    bearerToken?: string,
    useServiceRole: boolean = false
  ): Promise<T> {
    const res = await fetch(`${this.supabaseUrl}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: this.buildHeaders(bearerToken, useServiceRole),
      body: JSON.stringify(args)
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const msg = parsed?.message || parsed?.error_description || parsed?.error || `RPC ${fnName} failed (${res.status})`;
      throw new Error(msg);
    }
    return parsed as T;
  }

  private async maybeSendVerificationEmail(email: string, username: string, code: string): Promise<boolean> {
    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    const from = process.env.VERIFICATION_FROM_EMAIL || 'LegacyX-GO <noreply@legacyx-go.gg>';

    const emailHtml = `<div style="font-family:sans-serif;background:#090d14;color:#e6edf3;padding:24px;border:1px solid #00e5ff;border-radius:8px;max-width:480px;margin:0 auto">
      <h2 style="color:#00e5ff;margin:0 0 12px;letter-spacing:1px">LEGACYX-GO // VERIFICACIÓN</h2>
      <p style="color:#cbd5e1;font-size:15px;line-height:1.5">Hola <strong>${username}</strong>, ingresa este código de 6 dígitos en la aplicación web para activar tu cuenta competitiva:</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:10px;color:#ffd700;margin:24px 0;background:#05070a;padding:16px;text-align:center;border-radius:6px;border:1px dashed #ffd700">${code}</div>
      <p style="font-size:13px;color:#8b949e;margin:0">Válido durante 15 minutos. Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p>
    </div>`;

    // 1. Envío directo mediante Brevo API (Recomendado)
    if (brevoApiKey) {
      try {
        const senderMatch = from.match(/^(.*?)\s*<(.+)>$/);
        const senderName = senderMatch ? senderMatch[1].trim() : 'LegacyX-GO';
        const senderEmail = senderMatch ? senderMatch[2].trim() : from;

        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': brevoApiKey,
            Accept: 'application/json'
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email, name: username }],
            subject: `Tu código de verificación LegacyX-GO: ${code}`,
            htmlContent: emailHtml
          })
        });
        if (res.ok) {
          console.info(`[AuthService] Código ${code} enviado con éxito vía Brevo a ${email}`);
          return true;
        } else {
          const errText = await res.text();
          console.warn(`[AuthService] Falló envío Brevo API (${res.status}): ${errText}`);
        }
      } catch (err) {
        console.warn('[AuthService] Error de conexión con Brevo API:', err);
      }
    }

    // 2. Envío mediante Resend API
    if (resendKey) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`
          },
          body: JSON.stringify({
            from,
            to: [email],
            subject: `Tu código de verificación LegacyX-GO: ${code}`,
            html: emailHtml
          })
        });
        if (res.ok) {
          console.info(`[AuthService] Código ${code} enviado con éxito vía Resend a ${email}`);
          return true;
        }
      } catch (err) {
        console.warn('[AuthService] Fallo envío Resend:', err);
      }
    }

    console.info(`[AuthService] Código de verificación para ${username} <${email}>: ${code} (expira en 15m)`);
    return false;
  }

  public async fetchFullProfile(userId: string, bearerToken?: string): Promise<UserProfileRecord | null> {
    const profileRes = await fetch(
      `${this.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,username,display_name,email,role,is_verified`,
      { headers: this.buildHeaders(bearerToken, Boolean(this.serviceRoleKey)) }
    );
    if (!profileRes.ok) return null;
    const profiles = (await profileRes.json()) as any[];
    const p = profiles[0];
    if (!p) return null;

    const rankRes = await fetch(
      `${this.supabaseUrl}/rest/v1/player_rankings?player_id=eq.${encodeURIComponent(userId)}&select=*`,
      { headers: this.buildHeaders(bearerToken, Boolean(this.serviceRoleKey)) }
    );
    const ranks = rankRes.ok ? ((await rankRes.json()) as any[]) : [];
    const r = ranks[0] || {};

    return {
      id: p.id,
      username: p.username,
      displayName: p.display_name || p.username,
      email: p.email,
      role: (p.role as UserRole) || 'jugador',
      isVerified: Boolean(p.is_verified),
      elo: Number(r.elo ?? 1000),
      matchesPlayed: Number(r.matches_played ?? 0),
      wins: Number(r.wins ?? 0),
      losses: Number(r.losses ?? 0),
      draws: Number(r.draws ?? 0),
      goals: Number(r.goals ?? 0),
      assists: Number(r.assists ?? 0),
      saves: Number(r.saves ?? 0),
      mvpCount: Number(r.mvp_count ?? 0)
    };
  }

  public async register(params: {
    username: string;
    email: string;
    password: string;
  }): Promise<{
    success: boolean;
    requiresVerification?: boolean;
    email?: string;
    username?: string;
    verificationCode?: string;
    emailDelivered?: boolean;
    error?: string;
  }> {
    const cleanUsername = String(params.username ?? '').trim();
    const cleanEmail = String(params.email ?? '').trim().toLowerCase();
    const password = String(params.password ?? '');

    const uCheck = validateRegistrationUsername(cleanUsername);
    if (!uCheck.valid) {
      return { success: false, error: uCheck.error };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { success: false, error: 'Ingresa un correo electrónico válido.' };
    }
    if (password.length < 8) {
      return { success: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
    }

    const avail = await this.callRpc<{ username_taken: boolean; email_taken: boolean }>(
      'check_account_availability',
      { p_username: cleanUsername, p_email: cleanEmail }
    );
    if (avail?.username_taken) {
      return { success: false, error: 'Ese nombre de usuario ya está en uso.' };
    }
    if (avail?.email_taken) {
      return { success: false, error: 'Ese correo electrónico ya está registrado.' };
    }

    const code = this.generateSixDigitCode();
    const signupRes = await fetch(`${this.supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        email: cleanEmail,
        password,
        data: {
          username: cleanUsername,
          display_name: cleanUsername,
          verification_code: code
        }
      })
    });

    const signupBody = (await signupRes.json()) as any;
    if (!signupRes.ok) {
      const rawErr = signupBody?.msg || signupBody?.error_description || signupBody?.message || '';
      const isSmtpErr =
        rawErr.toLowerCase().includes('mail') || rawErr.toLowerCase().includes('smtp') || signupRes.status >= 500;
      return {
        success: false,
        error: isSmtpErr
          ? 'Error al enviar el correo (SMTP): Verifica en Supabase la clave SMTP de Brevo (o desactiva "Confirm email" en Authentication > Providers > Email para permitir registro directo).'
          : rawErr || 'Error al registrar la cuenta.'
      };
    }

    if (
      this.serviceRoleKey &&
      (this.superadminIdentifiers.has(cleanUsername.toLowerCase()) ||
        this.superadminIdentifiers.has(cleanEmail))
    ) {
      try {
        await this.callRpc(
          'admin_set_user_role',
          { p_target_username: cleanUsername, p_new_role: 'superadmin' },
          undefined,
          true
        );
      } catch (err) {
        console.warn('[AuthService] No se pudo auto-elevar superadmin:', err);
      }
    }

    const delivered = await this.maybeSendVerificationEmail(cleanEmail, cleanUsername, code);

    return {
      success: true,
      requiresVerification: true,
      email: cleanEmail,
      username: cleanUsername,
      emailDelivered: delivered,
      verificationCode: delivered ? undefined : code
    };
  }

  public async verifyCode(params: {
    email: string;
    code: string;
    password?: string;
  }): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    profile?: UserProfileRecord;
    error?: string;
  }> {
    const cleanEmail = String(params.email ?? '').trim().toLowerCase();
    const cleanCode = String(params.code ?? '').trim();

    const rpcResult = await this.callRpc<{
      success: boolean;
      user_id?: string;
      username?: string;
      error?: string;
    }>('verify_account_code', {
      p_email: cleanEmail,
      p_code: cleanCode
    });

    if (!rpcResult?.success) {
      return { success: false, error: rpcResult?.error || 'Código inválido o expirado.' };
    }

    if (params.password) {
      const loginRes = await this.login({
        identifier: cleanEmail,
        password: params.password
      });
      if (loginRes.success) {
        return {
          success: true,
          accessToken: loginRes.accessToken,
          refreshToken: loginRes.refreshToken,
          profile: loginRes.profile
        };
      }
    }

    const profile = rpcResult.user_id ? await this.fetchFullProfile(rpcResult.user_id) : undefined;
    return {
      success: true,
      profile: profile ?? undefined
    };
  }

  public async resendVerificationCode(email: string): Promise<{
    success: boolean;
    verificationCode?: string;
    emailDelivered?: boolean;
    error?: string;
  }> {
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const newCode = this.generateSixDigitCode();
    const rpcRes = await this.callRpc<{ success: boolean; error?: string }>(
      'refresh_verification_code',
      { p_email: cleanEmail, p_new_code: newCode }
    );
    if (!rpcRes?.success) {
      return { success: false, error: rpcRes?.error || 'No se pudo regenerar el código.' };
    }
    const delivered = await this.maybeSendVerificationEmail(cleanEmail, cleanEmail.split('@')[0] || 'Jugador', newCode);
    return {
      success: true,
      emailDelivered: delivered,
      verificationCode: delivered ? undefined : newCode
    };
  }

  public async login(params: {
    identifier: string;
    password: string;
  }): Promise<{
    success: boolean;
    requiresVerification?: boolean;
    email?: string;
    verificationCode?: string;
    accessToken?: string;
    refreshToken?: string;
    profile?: UserProfileRecord;
    error?: string;
  }> {
    const rawId = String(params.identifier ?? '').trim();
    const password = String(params.password ?? '');
    if (!rawId || !password) {
      return { success: false, error: 'Ingresa tu usuario/correo y contraseña.' };
    }

    const resolved = await this.callRpc<{
      found: boolean;
      id?: string;
      username?: string;
      email?: string;
      is_verified?: boolean;
    }>('resolve_login_identifier', { p_identifier: rawId });

    const emailToUse = resolved?.found && resolved.email ? resolved.email : rawId.toLowerCase();

    if (resolved?.found && !resolved.is_verified && resolved.email) {
      const resend = await this.resendVerificationCode(resolved.email);
      return {
        success: false,
        requiresVerification: true,
        email: resolved.email,
        verificationCode: resend.verificationCode,
        error: 'Tu cuenta aún no está verificada. Ingresa el código de 6 dígitos.'
      };
    }

    const tokenRes = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        email: emailToUse,
        password
      })
    });

    const tokenBody = (await tokenRes.json()) as any;
    if (!tokenRes.ok || !tokenBody?.access_token) {
      return {
        success: false,
        error: 'Credenciales inválidas. Verifica tu usuario/correo y contraseña.'
      };
    }

    const userId = tokenBody.user?.id || resolved?.id;
    const profile = userId ? await this.fetchFullProfile(userId, tokenBody.access_token) : null;
    if (!profile) {
      return { success: false, error: 'No se encontró el perfil asociado a esta cuenta.' };
    }

    if (!profile.isVerified) {
      const resend = await this.resendVerificationCode(profile.email);
      return {
        success: false,
        requiresVerification: true,
        email: profile.email,
        verificationCode: resend.verificationCode,
        error: 'Debes verificar tu correo con el código de 6 dígitos antes de ingresar.'
      };
    }

    return {
      success: true,
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token,
      profile
    };
  }

  public async verifySession(accessToken?: string | null): Promise<UserProfileRecord | null> {
    if (!accessToken) return null;
    try {
      const userRes = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: this.buildHeaders(accessToken)
      });
      if (!userRes.ok) return null;
      const user = (await userRes.json()) as any;
      if (!user?.id) return null;
      const profile = await this.fetchFullProfile(user.id, accessToken);
      if (!profile || !profile.isVerified) return null;
      return profile;
    } catch {
      return null;
    }
  }

  public async getLeaderboard(
    category: LeaderboardCategory = 'elo',
    limit: number = 50,
    playerId?: string
  ): Promise<{
    entries: LeaderboardEntry[];
    personalRank: (LeaderboardEntry & { matches_played?: number }) | null;
  }> {
    const safeCategory: LeaderboardCategory =
      category === 'goals' || category === 'assists' || category === 'saves' ? category : 'elo';
    const entries = await this.callRpc<LeaderboardEntry[]>('get_leaderboard', {
      category: safeCategory,
      limit_count: Math.max(1, Math.min(100, limit))
    });

    let personalRank: any = null;
    if (playerId) {
      const summary = await this.callRpc<any[]>('get_player_rank_summary', {
        target_player_id: playerId,
        category: safeCategory
      });
      if (Array.isArray(summary) && summary.length > 0) {
        personalRank = summary[0];
      }
    }

    return {
      entries: Array.isArray(entries) ? entries : [],
      personalRank
    };
  }

  public issueMatchToken(params: {
    roomId: string;
    hostUserId: string;
    stadiumId: string;
    participantUserIds: string[];
  }): string {
    const payload: SignedMatchTokenPayload = {
      roomId: params.roomId,
      hostUserId: params.hostUserId,
      stadiumId: params.stadiumId,
      participantUserIds: Array.from(new Set(params.participantUserIds)),
      issuedAt: Date.now(),
      nonce: String(randomInt(100000, 999999))
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = createHmac('sha256', this.tokenSecret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  public verifyMatchToken(token: string): SignedMatchTokenPayload | null {
    if (!token || !token.includes('.')) return null;
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = createHmac('sha256', this.tokenSecret).update(encoded).digest('base64url');
    const bufA = Buffer.from(sig);
    const bufB = Buffer.from(expectedSig);
    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedMatchTokenPayload;
      if (!parsed.roomId || !parsed.hostUserId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  public async reportRankedMatch(params: {
    matchToken: string;
    hostUserId: string;
    stadiumId: string;
    durationSeconds: number;
    redScore: number;
    blueScore: number;
    winner: 'red' | 'blue' | 'draw';
    status?: 'COMPLETED' | 'ABORTED';
    participants: RankedParticipantStat[];
    accessToken?: string;
  }): Promise<{ success: boolean; status?: string; error?: string }> {
    const verified = this.verifyMatchToken(params.matchToken);
    if (!verified || verified.hostUserId !== params.hostUserId) {
      return { success: false, error: 'MatchToken inválido o no coincide con el Host autorizado.' };
    }

    const status = params.status === 'ABORTED' ? 'ABORTED' : 'COMPLETED';

    const redPlayers = params.participants.filter((p) => p.team === 'red' && p.userId);
    const bluePlayers = params.participants.filter((p) => p.team === 'blue' && p.userId);
    const redAvgElo =
      redPlayers.length > 0
        ? redPlayers.reduce((sum, p) => sum + (p.elo ?? 1000), 0) / redPlayers.length
        : 1000;
    const blueAvgElo =
      bluePlayers.length > 0
        ? bluePlayers.reduce((sum, p) => sum + (p.elo ?? 1000), 0) / bluePlayers.length
        : 1000;

    const playerUpdates =
      status === 'COMPLETED'
        ? params.participants
            .filter((p) => Boolean(p.userId))
            .map((p) => {
              const isDraw = params.winner === 'draw';
              const won = !isDraw && p.team === params.winner;
              const outcome: 'win' | 'loss' | 'draw' = isDraw ? 'draw' : won ? 'win' : 'loss';
              const oppElo = p.team === 'red' ? blueAvgElo : redAvgElo;
              const eloDelta = calculateEloDelta(p.elo ?? 1000, oppElo, outcome);

              return {
                player_id: p.userId,
                won,
                draw: isDraw,
                result: outcome,
                elo_delta: eloDelta,
                goals: Math.max(0, Math.floor(p.goals || 0)),
                assists: Math.max(0, Math.floor(p.assists || 0)),
                saves: Math.max(0, Math.floor(p.saves || 0)),
                is_mvp: Boolean(p.isMvp)
              };
            })
        : [];

    try {
      const rpcRes = await this.callRpc<{ success: boolean; status?: string; error?: string }>(
        'report_ranked_match',
        {
          p_match_token: params.matchToken,
          p_host_id: params.hostUserId,
          p_stadium_id: params.stadiumId || verified.stadiumId || 'mediano',
          p_duration_seconds: Math.max(0, Math.round(params.durationSeconds || 0)),
          p_red_score: Math.max(0, Math.round(params.redScore || 0)),
          p_blue_score: Math.max(0, Math.round(params.blueScore || 0)),
          p_winner: params.winner || 'draw',
          p_status: status,
          p_player_updates: playerUpdates
        },
        params.accessToken,
        Boolean(this.serviceRoleKey)
      );
      return rpcRes;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error al registrar partida clasificatoria.' };
    }
  }

  public async abortRankedMatch(params: {
    matchToken: string;
    hostUserId: string;
    stadiumId: string;
    accessToken?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return this.reportRankedMatch({
      matchToken: params.matchToken,
      hostUserId: params.hostUserId,
      stadiumId: params.stadiumId,
      durationSeconds: 0,
      redScore: 0,
      blueScore: 0,
      winner: 'draw',
      status: 'ABORTED',
      participants: [],
      accessToken: params.accessToken
    });
  }

  public async setUserRole(params: {
    accessToken: string;
    targetUsername: string;
    newRole: UserRole;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      return await this.callRpc<{ success: boolean; error?: string }>(
        'admin_set_user_role',
        {
          p_target_username: params.targetUsername,
          p_new_role: params.newRole
        },
        params.accessToken,
        Boolean(this.serviceRoleKey)
      );
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error al actualizar rol.' };
    }
  }
}

export const authService = new AuthService();
