/**
 * userProfile.svelte.ts
 * Estado reactivo Svelte 5 ($state, $derived) para Cuentas Oficiales, Invitados (inv_),
 * Roles (superadmin, representante, jugador), Sesión JWT y Rankings Globales en Supabase.
 */

import { gameUI } from './gameUI.svelte.js';

export type UserRole = 'superadmin' | 'representante' | 'jugador';
export type LeaderboardCategory = 'elo' | 'goals' | 'assists' | 'saves';

export interface PlayerRankingStats {
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
  playerId: string;
  username: string;
  metricValue: number;
  elo: number;
}

export interface PersonalRankSummary {
  position: number;
  elo: number;
  goals: number;
  assists: number;
  saves: number;
}

export const AUTH_SESSION_STORAGE_KEY = 'legacyx_auth_session_v1';
export const GUEST_MODE_STORAGE_KEY = 'legacyx_is_guest_v1';

const DEFAULT_SUPABASE_URL = 'https://jeopwutoxmaagxlebpsl.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YLPCQO9kz0l9oFkuEPIXow_uRebEaEf';

function getEnvVar(name: string, fallback: string): string {
  try {
    const meta = (import.meta as any)?.env;
    if (meta && typeof meta[name] === 'string' && meta[name].trim()) {
      return meta[name].trim();
    }
  } catch {
    // Ignorar entorno fuera de Vite
  }
  return fallback;
}

export function formatGuestNickname(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^(inv_)+/i, '')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_\-]/gu, '')
    .slice(0, 18);
  const clean = stripped.length > 0 ? stripped : 'Jugador';
  return `inv_${clean}`;
}

export function validateAccountUsername(raw: string): { valid: boolean; error?: string } {
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 15) {
    return { valid: false, error: 'El usuario debe tener entre 3 y 15 caracteres.' };
  }
  if (/^inv_/i.test(trimmed)) {
    return { valid: false, error: 'El prefijo inv_ está reservado exclusivamente para invitados.' };
  }
  if (!/^[a-zA-Z0-9_]{3,15}$/.test(trimmed)) {
    return { valid: false, error: 'Solo se permiten letras, números y guiones bajos.' };
  }
  return { valid: true };
}

class UserProfileStore {
  public isAuthenticated = $state<boolean>(false);
  public isGuest = $state<boolean>(true);
  public jwt = $state<string | null>(null);
  public refreshToken = $state<string | null>(null);
  public id = $state<string | null>(null);
  public username = $state<string>('');
  public displayName = $state<string>('');
  public email = $state<string>('');
  public role = $state<UserRole>('jugador');
  public isVerified = $state<boolean>(false);
  public elo = $state<number>(1000);
  public stats = $state<PlayerRankingStats>({
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    mvpCount: 0
  });

  // Flujo de Gatekeeper y Verificación de 6 Dígitos
  public gatekeeperTab = $state<'login' | 'register' | 'verify'>('login');
  public pendingVerificationEmail = $state<string>('');
  public devVerificationCodeHint = $state<string | null>(null);
  private pendingPasswordCache: string = '';

  // Estado de UI
  public isLoading = $state<boolean>(false);
  public authError = $state<string | null>(null);
  public authNotice = $state<string | null>(null);

  // Leaderboard Global en el Lobby
  public leaderboardCategory = $state<LeaderboardCategory>('elo');
  public leaderboard = $state<LeaderboardEntry[]>([]);
  public personalRank = $state<PersonalRankSummary | null>(null);
  public isLeaderboardLoading = $state<boolean>(false);

  public readonly canCreateRanked = $derived(
    !this.isGuest &&
      this.isAuthenticated &&
      this.isVerified &&
      (this.role === 'representante' || this.role === 'superadmin')
  );

  public readonly canJoinRanked = $derived(
    !this.isGuest && this.isAuthenticated && this.isVerified
  );

  private readonly supabaseUrl = getEnvVar('VITE_SUPABASE_URL', DEFAULT_SUPABASE_URL);
  private readonly supabaseKey = getEnvVar(
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    DEFAULT_SUPABASE_PUBLISHABLE_KEY
  );

  constructor() {
    this.loadPersistedSession();
    void this.handleOAuthRedirect();
  }

  public loginWithGoogle(): void {
    if (typeof window === 'undefined') return;
    const redirectUrl = window.location.origin;
    window.location.href = `${this.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;
  }

  public async handleOAuthRedirect(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) {
      return false;
    }

    try {
      this.isLoading = true;
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken) return false;

      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      const userRes = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: this.supabaseHeaders(accessToken)
      });
      if (!userRes.ok) return false;
      const userData = await userRes.json();
      const userId = userData?.id;
      if (!userId) return false;

      let profile: any = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const pRes = await fetch(
          `${this.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
          { headers: this.supabaseHeaders(accessToken) }
        );
        if (pRes.ok) {
          const rows = await pRes.json();
          profile = Array.isArray(rows) ? rows[0] : null;
          if (profile) break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!profile) return false;

      const rankRes = await fetch(
        `${this.supabaseUrl}/rest/v1/player_rankings?player_id=eq.${encodeURIComponent(userId)}&select=*`,
        { headers: this.supabaseHeaders(accessToken) }
      );
      const ranks = rankRes.ok ? await rankRes.json() : [];
      const ranking = Array.isArray(ranks) ? ranks[0] : {};

      this.applyServerProfilePayload({
        profile,
        ranking,
        session: { access_token: accessToken, refresh_token: refreshToken }
      });
      void this.fetchLeaderboard(this.leaderboardCategory);
      gameUI.navigateTo('LOBBY');
      return true;
    } catch (err) {
      console.warn('[userProfile] Error procesando retorno OAuth:', err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  private supabaseHeaders(token?: string | null): Record<string, string> {
    return {
      apikey: this.supabaseKey,
      Authorization: `Bearer ${token || this.supabaseKey}`,
      'Content-Type': 'application/json'
    };
  }

  private persistSession(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (this.isAuthenticated && this.jwt && this.id) {
        localStorage.setItem(
          AUTH_SESSION_STORAGE_KEY,
          JSON.stringify({
            jwt: this.jwt,
            refreshToken: this.refreshToken,
            id: this.id,
            username: this.username,
            displayName: this.displayName,
            email: this.email,
            role: this.role,
            isVerified: this.isVerified,
            elo: this.elo,
            stats: this.stats
          })
        );
        localStorage.setItem(GUEST_MODE_STORAGE_KEY, 'false');
      } else {
        localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
        localStorage.setItem(GUEST_MODE_STORAGE_KEY, 'true');
      }
    } catch {
      // Ignorar límites de almacenamiento
    }
  }

  public loadPersistedSession(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!raw) {
        this.isGuest = true;
        this.isAuthenticated = false;
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && parsed.jwt && parsed.id && parsed.username && parsed.isVerified) {
        this.jwt = parsed.jwt;
        this.refreshToken = parsed.refreshToken ?? null;
        this.id = parsed.id;
        this.username = parsed.username;
        this.displayName = parsed.displayName ?? parsed.username;
        this.email = parsed.email ?? '';
        this.role = parsed.role ?? 'jugador';
        this.isVerified = Boolean(parsed.isVerified);
        this.elo = Number(parsed.elo ?? 1000);
        if (parsed.stats) {
          this.stats = { ...this.stats, ...parsed.stats };
        }
        this.isAuthenticated = true;
        this.isGuest = false;
        gameUI.setPlayerNickname(this.username);
      }
    } catch {
      this.isGuest = true;
      this.isAuthenticated = false;
    }
  }

  public enterAsGuest(
    rawNick: string,
    avatar: string = '1',
    avatarMode: 'letters' | 'emoji' = 'letters'
  ): string {
    const guestNick = formatGuestNickname(rawNick);
    this.isAuthenticated = false;
    this.isGuest = true;
    this.jwt = null;
    this.refreshToken = null;
    this.id = null;
    this.username = guestNick;
    this.displayName = guestNick;
    this.email = '';
    this.role = 'jugador';
    this.isVerified = false;
    this.elo = 1000;
    this.personalRank = null;
    this.authError = null;
    this.authNotice = null;
    this.persistSession();
    gameUI.saveProfile(guestNick, avatar, avatarMode);
    return guestNick;
  }

  public logout(): void {
    this.isAuthenticated = false;
    this.isGuest = true;
    this.jwt = null;
    this.refreshToken = null;
    this.id = null;
    this.role = 'jugador';
    this.isVerified = false;
    this.personalRank = null;
    this.authError = null;
    this.authNotice = null;
    this.persistSession();
  }

  private applyServerProfilePayload(payload: any): void {
    const profile = payload.profile ?? payload;
    const ranking = payload.ranking ?? {};
    const session = payload.session ?? {};

    this.id = profile.id;
    this.username = profile.username;
    this.displayName = profile.display_name ?? profile.displayName ?? profile.username;
    this.email = profile.email ?? this.email;
    this.role = (profile.role as UserRole) ?? 'jugador';
    this.isVerified = Boolean(profile.is_verified ?? profile.isVerified ?? true);
    this.elo = Number(ranking.elo ?? profile.elo ?? 1000);
    this.stats = {
      matchesPlayed: Number(ranking.matches_played ?? ranking.matchesPlayed ?? 0),
      wins: Number(ranking.wins ?? 0),
      losses: Number(ranking.losses ?? 0),
      draws: Number(ranking.draws ?? 0),
      goals: Number(ranking.goals ?? 0),
      assists: Number(ranking.assists ?? 0),
      saves: Number(ranking.saves ?? 0),
      mvpCount: Number(ranking.mvp_count ?? ranking.mvpCount ?? 0)
    };
    if (session.access_token || payload.accessToken || payload.jwt) {
      this.jwt = session.access_token ?? payload.accessToken ?? payload.jwt;
    }
    if (session.refresh_token || payload.refreshToken) {
      this.refreshToken = session.refresh_token ?? payload.refreshToken;
    }
    this.isAuthenticated = Boolean(this.jwt && this.isVerified);
    this.isGuest = !this.isAuthenticated;
    this.persistSession();
    if (this.isAuthenticated && this.username) {
      gameUI.setPlayerNickname(this.username);
    }
  }

  private async tryServerApi(path: string, init?: RequestInit): Promise<{ handled: boolean; ok: boolean; status: number; data: any }> {
    if (typeof fetch === 'undefined') {
      return { handled: false, ok: false, status: 0, data: null };
    }
    try {
      const res = await fetch(path, init);
      const contentType = res.headers.get('content-type') || '';
      if (res.status === 404 && !contentType.includes('application/json')) {
        return { handled: false, ok: false, status: 404, data: null };
      }
      if (!contentType.includes('application/json')) {
        return { handled: false, ok: false, status: res.status, data: null };
      }
      const data = await res.json();
      return { handled: true, ok: res.ok && data?.ok !== false, status: res.status, data };
    } catch {
      return { handled: false, ok: false, status: 0, data: null };
    }
  }

  public async register(
    rawUsername: string,
    rawEmail: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> {
    this.authError = null;
    this.authNotice = null;
    this.devVerificationCodeHint = null;

    const userCheck = validateAccountUsername(rawUsername);
    if (!userCheck.valid) {
      this.authError = userCheck.error!;
      return { ok: false, error: this.authError };
    }

    const cleanEmail = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      this.authError = 'Ingresa un correo electrónico válido.';
      return { ok: false, error: this.authError };
    }

    if (password.length < 8) {
      this.authError = 'La contraseña debe tener al menos 8 caracteres.';
      return { ok: false, error: this.authError };
    }

    const cleanUsername = rawUsername.trim();
    this.isLoading = true;

    try {
      const apiRes = await this.tryServerApi('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          displayName: cleanUsername,
          email: cleanEmail,
          password
        })
      });

      if (apiRes.handled) {
        if (!apiRes.ok) {
          this.authError = apiRes.data?.error || 'No se pudo completar el registro.';
          return { ok: false, error: this.authError ?? undefined };
        }
        this.pendingVerificationEmail = cleanEmail;
        this.pendingPasswordCache = password;
        this.devVerificationCodeHint = apiRes.data?.devVerificationCode ?? null;
        this.gatekeeperTab = 'verify';
        this.authNotice = 'Cuenta creada. Ingresa el código de 6 dígitos enviado a tu correo.';
        return { ok: true };
      }

      // Fallback directo contra Supabase Auth + RPC check_account_availability
      const availRes = await fetch(`${this.supabaseUrl}/rest/v1/rpc/check_account_availability`, {
        method: 'POST',
        headers: this.supabaseHeaders(),
        body: JSON.stringify({ p_username: cleanUsername, p_email: cleanEmail })
      });
      if (availRes.ok) {
        const avail = await availRes.json();
        const row = Array.isArray(avail) ? avail[0] : avail;
        if (row?.username_taken) {
          this.authError = 'Ese nombre de usuario ya está en uso.';
          return { ok: false, error: this.authError };
        }
        if (row?.email_taken) {
          this.authError = 'Ese correo electrónico ya está registrado.';
          return { ok: false, error: this.authError };
        }
      }

      const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
      const signupRes = await fetch(`${this.supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: this.supabaseHeaders(),
        body: JSON.stringify({
          email: cleanEmail,
          password,
          data: {
            username: cleanUsername,
            display_name: cleanUsername,
            verification_code: generatedCode
          }
        })
      });

      const signupData = await signupRes.json();
      if (!signupRes.ok) {
        const rawErr = signupData?.msg || signupData?.error_description || signupData?.message || '';
        if (rawErr.toLowerCase().includes('mail') || rawErr.toLowerCase().includes('smtp') || signupRes.status >= 500) {
          this.authError =
            'Error al enviar el correo (SMTP): Verifica en Supabase la clave SMTP de Brevo (o desactiva "Confirm email" en Authentication > Providers > Email para permitir registro directo).';
        } else {
          this.authError = rawErr || 'Error al registrar la cuenta.';
        }
        return { ok: false, error: this.authError ?? undefined };
      }

      this.pendingVerificationEmail = cleanEmail;
      this.pendingPasswordCache = password;
      this.devVerificationCodeHint = generatedCode;
      this.gatekeeperTab = 'verify';
      this.authNotice = 'Cuenta creada. Ingresa el código de verificación de 6 dígitos.';
      return { ok: true };
    } catch {
      this.authError = 'Error de conexión al registrar tu cuenta.';
      return { ok: false, error: this.authError };
    } finally {
      this.isLoading = false;
    }
  }

  public async verifyCode(
    emailInput: string,
    codeInput: string,
    passwordInput?: string
  ): Promise<{ ok: boolean; error?: string }> {
    this.authError = null;
    this.authNotice = null;
    const cleanEmail = (emailInput || this.pendingVerificationEmail).trim().toLowerCase();
    const cleanCode = codeInput.trim();
    const pwd = passwordInput || this.pendingPasswordCache;

    if (!/^\d{6}$/.test(cleanCode)) {
      this.authError = 'Ingresa los 6 dígitos numéricos del código de verificación.';
      return { ok: false, error: this.authError };
    }

    this.isLoading = true;
    try {
      const apiRes = await this.tryServerApi('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode, password: pwd })
      });

      if (apiRes.handled) {
        if (!apiRes.ok) {
          this.authError = apiRes.data?.error || 'Código inválido o expirado.';
          return { ok: false, error: this.authError ?? undefined };
        }
        this.applyServerProfilePayload(apiRes.data);
        this.pendingPasswordCache = '';
        this.devVerificationCodeHint = null;
        void this.fetchLeaderboard(this.leaderboardCategory);
        return { ok: true };
      }

      // Fallback directo contra Supabase RPC verify_account_code + token login
      const rpcRes = await fetch(`${this.supabaseUrl}/rest/v1/rpc/verify_account_code`, {
        method: 'POST',
        headers: this.supabaseHeaders(),
        body: JSON.stringify({ p_email: cleanEmail, p_code: cleanCode })
      });
      const rpcData = await rpcRes.json();
      const verifyRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rpcRes.ok || !verifyRow?.success) {
        this.authError = verifyRow?.message || 'Código de verificación inválido o expirado.';
        return { ok: false, error: this.authError ?? undefined };
      }

      if (pwd) {
        return await this.login(cleanEmail, pwd);
      }

      this.gatekeeperTab = 'login';
      this.authNotice = 'Cuenta verificada con 1000 ELO inicial. Inicia sesión para entrar.';
      return { ok: true };
    } catch {
      this.authError = 'No se pudo validar el código de verificación.';
      return { ok: false, error: this.authError };
    } finally {
      this.isLoading = false;
    }
  }

  public async resendCode(emailInput?: string): Promise<{ ok: boolean; error?: string }> {
    this.authError = null;
    const cleanEmail = (emailInput || this.pendingVerificationEmail).trim().toLowerCase();
    if (!cleanEmail) {
      this.authError = 'No hay correo pendiente de verificación.';
      return { ok: false, error: this.authError };
    }

    this.isLoading = true;
    try {
      const apiRes = await this.tryServerApi('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      if (apiRes.handled) {
        if (!apiRes.ok) {
          this.authError = apiRes.data?.error || 'No se pudo reenviar el código.';
          return { ok: false, error: this.authError ?? undefined };
        }
        this.devVerificationCodeHint = apiRes.data?.devVerificationCode ?? this.devVerificationCodeHint;
        this.authNotice = 'Se generó un nuevo código válido por 15 minutos.';
        return { ok: true };
      }

      const newCode = String(Math.floor(100000 + Math.random() * 900000));
      const rpcRes = await fetch(`${this.supabaseUrl}/rest/v1/rpc/refresh_verification_code`, {
        method: 'POST',
        headers: this.supabaseHeaders(),
        body: JSON.stringify({ p_email: cleanEmail, p_new_code: newCode })
      });
      if (!rpcRes.ok) {
        this.authError = 'No se pudo regenerar el código.';
        return { ok: false, error: this.authError };
      }
      this.devVerificationCodeHint = newCode;
      this.authNotice = 'Nuevo código de 6 dígitos generado (válido por 15 min).';
      return { ok: true };
    } catch {
      this.authError = 'Error de red al reenviar el código.';
      return { ok: false, error: this.authError };
    } finally {
      this.isLoading = false;
    }
  }

  public async login(
    identifier: string,
    password: string
  ): Promise<{ ok: boolean; needsVerification?: boolean; error?: string }> {
    this.authError = null;
    this.authNotice = null;
    const cleanId = identifier.trim();
    if (!cleanId || !password) {
      this.authError = 'Ingresa tu usuario/correo y contraseña.';
      return { ok: false, error: this.authError };
    }

    this.isLoading = true;
    try {
      const apiRes = await this.tryServerApi('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanId, password })
      });

      if (apiRes.handled) {
        if (!apiRes.ok) {
          if (apiRes.data?.needsVerification && apiRes.data?.email) {
            this.pendingVerificationEmail = apiRes.data.email;
            this.pendingPasswordCache = password;
            this.devVerificationCodeHint = apiRes.data?.devVerificationCode ?? null;
            this.gatekeeperTab = 'verify';
            this.authNotice = 'Tu cuenta aún no está verificada. Ingresa tu código de 6 dígitos.';
            return { ok: false, needsVerification: true };
          }
          this.authError = apiRes.data?.error || 'Credenciales inválidas.';
          return { ok: false, error: this.authError ?? undefined };
        }
        this.applyServerProfilePayload(apiRes.data);
        void this.fetchLeaderboard(this.leaderboardCategory);
        return { ok: true };
      }

      // Fallback directo contra Supabase Auth + PostgREST
      let loginEmail = cleanId.toLowerCase();
      if (!cleanId.includes('@')) {
        const resolveRes = await fetch(
          `${this.supabaseUrl}/rest/v1/rpc/resolve_login_identifier`,
          {
            method: 'POST',
            headers: this.supabaseHeaders(),
            body: JSON.stringify({ p_identifier: cleanId })
          }
        );
        if (resolveRes.ok) {
          const rows = await resolveRes.json();
          const first = Array.isArray(rows) ? rows[0] : rows;
          if (!first?.email) {
            this.authError = 'Usuario o contraseña incorrectos.';
            return { ok: false, error: this.authError };
          }
          loginEmail = first.email;
          if (first.is_verified === false) {
            this.pendingVerificationEmail = loginEmail;
            this.pendingPasswordCache = password;
            this.gatekeeperTab = 'verify';
            this.authNotice = 'Debes verificar tu correo con el código de 6 dígitos.';
            return { ok: false, needsVerification: true };
          }
        }
      }

      const tokenRes = await fetch(
        `${this.supabaseUrl}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: this.supabaseHeaders(),
          body: JSON.stringify({ email: loginEmail, password })
        }
      );
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData?.access_token) {
        this.authError = 'Usuario/correo o contraseña incorrectos.';
        return { ok: false, error: this.authError };
      }

      const userId = tokenData.user?.id;
      const accessToken = tokenData.access_token as string;
      const profileRes = await fetch(
        `${this.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
        { headers: this.supabaseHeaders(accessToken) }
      );
      const profileRows = await profileRes.json();
      const profile = Array.isArray(profileRows) ? profileRows[0] : null;
      if (!profile) {
        this.authError = 'No se encontró el perfil asociado a esta cuenta.';
        return { ok: false, error: this.authError };
      }
      if (!profile.is_verified) {
        this.pendingVerificationEmail = profile.email;
        this.pendingPasswordCache = password;
        this.gatekeeperTab = 'verify';
        this.authNotice = 'Verifica tu cuenta ingresando el código de 6 dígitos.';
        return { ok: false, needsVerification: true };
      }

      const rankRes = await fetch(
        `${this.supabaseUrl}/rest/v1/player_rankings?player_id=eq.${encodeURIComponent(userId)}&select=*`,
        { headers: this.supabaseHeaders(accessToken) }
      );
      const rankRows = await rankRes.json();
      const ranking = Array.isArray(rankRows) ? rankRows[0] : {};

      this.applyServerProfilePayload({
        profile,
        ranking,
        session: tokenData
      });
      void this.fetchLeaderboard(this.leaderboardCategory);
      return { ok: true };
    } catch {
      this.authError = 'Error de conexión al iniciar sesión.';
      return { ok: false, error: this.authError };
    } finally {
      this.isLoading = false;
    }
  }

  public async fetchLeaderboard(
    category: LeaderboardCategory = this.leaderboardCategory
  ): Promise<void> {
    this.leaderboardCategory = category;
    this.isLeaderboardLoading = true;

    try {
      const apiRes = await this.tryServerApi(
        `/api/leaderboard?category=${encodeURIComponent(category)}&limit=50${
          this.id ? `&playerId=${encodeURIComponent(this.id)}` : ''
        }`
      );

      if (apiRes.handled && apiRes.ok) {
        const rows = Array.isArray(apiRes.data?.entries ?? apiRes.data?.leaderboard)
          ? (apiRes.data.entries ?? apiRes.data.leaderboard)
          : [];
        this.leaderboard = rows
          .filter((r: any) => r?.username && !/^inv_/i.test(String(r.username)))
          .map((r: any) => ({
            position: Number(r.position),
            playerId: String(r.player_id ?? r.playerId),
            username: String(r.username),
            metricValue: Number(r.metric_value ?? r.metricValue ?? 0),
            elo: Number(r.elo ?? 1000)
          }));
        if (apiRes.data?.personalRank) {
          this.personalRank = apiRes.data.personalRank;
        } else {
          this.syncPersonalRankFromList();
        }
        return;
      }

      // Fallback directo contra Supabase RPC get_leaderboard
      const rpcRes = await fetch(`${this.supabaseUrl}/rest/v1/rpc/get_leaderboard`, {
        method: 'POST',
        headers: this.supabaseHeaders(this.jwt),
        body: JSON.stringify({ category, limit_count: 50 })
      });
      if (rpcRes.ok) {
        const rows = await rpcRes.json();
        if (Array.isArray(rows)) {
          this.leaderboard = rows
            .filter((r: any) => r?.username && !/^inv_/i.test(String(r.username)))
            .map((r: any) => ({
              position: Number(r.position),
              playerId: String(r.player_id),
              username: String(r.username),
              metricValue: Number(r.metric_value ?? 0),
              elo: Number(r.elo ?? 1000)
            }));
        }
      }

      if (this.isAuthenticated && this.id) {
        const pRes = await fetch(`${this.supabaseUrl}/rest/v1/rpc/get_player_rank_summary`, {
          method: 'POST',
          headers: this.supabaseHeaders(this.jwt),
          body: JSON.stringify({ p_player_id: this.id, p_category: category })
        });
        if (pRes.ok) {
          const pRows = await pRes.json();
          const pRow = Array.isArray(pRows) ? pRows[0] : pRows;
          if (pRow && pRow.rank_position) {
            this.personalRank = {
              position: Number(pRow.rank_position),
              elo: Number(pRow.elo ?? this.elo),
              goals: Number(pRow.goals ?? this.stats.goals),
              assists: Number(pRow.assists ?? this.stats.assists),
              saves: Number(pRow.saves ?? this.stats.saves)
            };
            this.elo = this.personalRank.elo;
            return;
          }
        }
        this.syncPersonalRankFromList();
      } else {
        this.personalRank = null;
      }
    } catch {
      // Mantener último estado en caso offline
    } finally {
      this.isLeaderboardLoading = false;
    }
  }

  private syncPersonalRankFromList(): void {
    if (!this.isAuthenticated || !this.id) {
      this.personalRank = null;
      return;
    }
    const found = this.leaderboard.find((item) => item.playerId === this.id);
    if (found) {
      this.personalRank = {
        position: found.position,
        elo: found.elo,
        goals: this.stats.goals,
        assists: this.stats.assists,
        saves: this.stats.saves
      };
      this.elo = found.elo;
    } else {
      this.personalRank = {
        position: this.leaderboard.length + 1,
        elo: this.elo,
        goals: this.stats.goals,
        assists: this.stats.assists,
        saves: this.stats.saves
      };
    }
  }
}

export const userProfile = new UserProfileStore();
