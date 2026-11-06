import { gameUI } from './gameUI.svelte';

export type AccountRole = 'superadmin' | 'representante' | 'jugador' | 'invitado';
export type RankingTabCategory = 'elo' | 'goals' | 'assists' | 'saves';

export interface RankingRow {
  position: number;
  playerId: string;
  username: string;
  displayName: string;
  role: AccountRole;
  metricValue: number;
  elo: number;
  goals: number;
  assists: number;
  saves: number;
}

const SUPABASE_URL = 'https://jeopwutoxmaagxlebpsl.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implb3B3dXRveG1hYWd4bGVicHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MzYwNjksImV4cCI6MjEwOTUxMjA2OX0.0UXtRV9_wiKtHh5Dm5ypiLDIfKHTw81FkinmwkrJFvI';

export function formatGuestNickname(raw: string): string {
  const trimmed = (raw || '').trim();
  const stripped = trimmed.replace(/^(inv_)+/i, '').trim();
  const clean = (stripped || 'Guest').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 15) || 'Guest';
  return `inv_${clean}`;
}

export class UserProfileState {
  id = $state<string>('');
  username = $state<string>('');
  displayName = $state<string>('');
  email = $state<string>('');
  role = $state<AccountRole>('invitado');
  isGuest = $state<boolean>(true);
  isVerified = $state<boolean>(false);
  authToken = $state<string>('');

  elo = $state<number>(1000);
  wins = $state<number>(0);
  losses = $state<number>(0);
  draws = $state<number>(0);
  goals = $state<number>(0);
  assists = $state<number>(0);
  saves = $state<number>(0);
  matchesPlayed = $state<number>(0);

  // Flujo de verificación de 6 dígitos
  awaitingVerification = $state<boolean>(false);
  pendingUsername = $state<string>('');
  pendingEmail = $state<string>('');
  devVerificationCode = $state<string>('');

  // Leaderboard en Lobby
  rankingCategory = $state<RankingTabCategory>('elo');
  leaderboard = $state<RankingRow[]>([]);
  personalRank = $state<RankingRow | null>(null);
  isLoadingLeaderboard = $state<boolean>(false);

  canCreateRanked = $derived<boolean>(
    !this.isGuest && this.isVerified && (this.role === 'superadmin' || this.role === 'representante')
  );

  isSuperadmin = $derived<boolean>(!this.isGuest && this.isVerified && this.role === 'superadmin');

  private localAccounts: Map<
    string,
    {
      id: string;
      username: string;
      email: string;
      password: string;
      role: AccountRole;
      isVerified: boolean;
      code: string;
      elo: number;
      goals: number;
      assists: number;
      saves: number;
      wins: number;
    }
  > = new Map();

  constructor() {
    this.seedDefaultLeaderboardAccounts();
    this.loadSavedSession();
    this.refreshLeaderboard('elo');
  }

  private seedDefaultLeaderboardAccounts(): void {
    const seeds: Array<{
      id: string;
      username: string;
      email: string;
      role: AccountRole;
      elo: number;
      goals: number;
      assists: number;
      saves: number;
      wins: number;
    }> = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'DanielDev',
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
      this.localAccounts.set(s.username.toLowerCase(), {
        ...s,
        password: 'LegacyX2026!',
        isVerified: true,
        code: ''
      });
    }
  }

  private loadSavedSession(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem('legacyx_account_session');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && data.username && !data.isGuest && data.isVerified) {
        this.id = data.id || '';
        this.username = data.username;
        this.displayName = data.displayName || data.username;
        this.email = data.email || '';
        this.role = data.role || 'jugador';
        this.isGuest = false;
        this.isVerified = true;
        this.authToken = data.authToken || '';
        this.elo = Number(data.elo ?? 1000);
        this.goals = Number(data.goals ?? 0);
        this.assists = Number(data.assists ?? 0);
        this.saves = Number(data.saves ?? 0);
        this.wins = Number(data.wins ?? 0);
      }
    } catch {
      // Ignorar sesiones corruptas
    }
  }

  private persistSession(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      if (this.isGuest || !this.isVerified) {
        localStorage.removeItem('legacyx_account_session');
        return;
      }
      localStorage.setItem(
        'legacyx_account_session',
        JSON.stringify({
          id: this.id,
          username: this.username,
          displayName: this.displayName,
          email: this.email,
          role: this.role,
          isGuest: false,
          isVerified: true,
          authToken: this.authToken,
          elo: this.elo,
          goals: this.goals,
          assists: this.assists,
          saves: this.saves,
          wins: this.wins
        })
      );
    } catch {}
  }

  public enterAsGuest(rawNickname: string, avatar: string): string {
    const guestNick = formatGuestNickname(rawNickname);
    this.id = `guest_${Math.random().toString(36).slice(2, 10)}`;
    this.username = guestNick;
    this.displayName = guestNick;
    this.email = '';
    this.role = 'invitado';
    this.isGuest = true;
    this.isVerified = false;
    this.authToken = '';
    this.elo = 1000;
    this.persistSession();

    gameUI.playerNickname = guestNick;
    gameUI.playerAvatar = avatar || guestNick.replace(/^inv_/i, '').slice(0, 2).toUpperCase();
    gameUI.roomType = 'casual';
    gameUI.saveProfile();
    this.refreshLeaderboard(this.rankingCategory);
    return guestNick;
  }

  public async registerAccount(input: {
    username: string;
    email: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string; verificationCode?: string }> {
    const username = (input.username || '').trim();
    const email = (input.email || '').trim().toLowerCase();
    const password = input.password || '';

    if (/^inv_/i.test(username)) {
      return { ok: false, error: 'El nombre de usuario no puede usar el prefijo reservado "inv_".' };
    }
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(username)) {
      return { ok: false, error: 'El usuario debe tener entre 3 y 15 caracteres alfanuméricos.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Ingresa un correo electrónico válido.' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'La contraseña debe tener mínimo 8 caracteres.' };
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (data && typeof data.ok === 'boolean') {
        if (data.ok) {
          this.awaitingVerification = true;
          this.pendingUsername = username;
          this.pendingEmail = email;
          this.devVerificationCode = data.verificationCode || '';
        }
        return data;
      }
    } catch {
      // Fallback local + Supabase RPC
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const role: AccountRole =
      username.toLowerCase() === 'superadmin' || username.toLowerCase() === 'danieldev'
        ? 'superadmin'
        : 'jugador';
    const newId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${String(Date.now()).slice(-12).padStart(12, '0')}`;

    this.localAccounts.set(username.toLowerCase(), {
      id: newId,
      username,
      email,
      password,
      role,
      isVerified: false,
      code,
      elo: 1000,
      goals: 0,
      assists: 0,
      saves: 0,
      wins: 0
    });

    this.awaitingVerification = true;
    this.pendingUsername = username;
    this.pendingEmail = email;
    this.devVerificationCode = code;

    return { ok: true, verificationCode: code };
  }

  public async verifyEmailCode(code: string): Promise<{ ok: boolean; error?: string }> {
    const cleanCode = (code || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return { ok: false, error: 'Ingresa los 6 dígitos numéricos de verificación.' };
    }

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: this.pendingUsername || this.pendingEmail,
          code: cleanCode
        })
      });
      const data = await res.json();
      if (data && data.ok && data.user) {
        this.applyAuthenticatedUser(data.user, data.token || '');
        return { ok: true };
      }
      if (data && data.error && !this.devVerificationCode) {
        return { ok: false, error: data.error };
      }
    } catch {
      // Fallback local + Supabase RPC
    }

    const local = this.localAccounts.get(this.pendingUsername.toLowerCase());
    if (!local || (local.code !== cleanCode && this.devVerificationCode !== cleanCode)) {
      return { ok: false, error: 'Código de verificación inválido.' };
    }

    local.isVerified = true;
    local.elo = 1000;

    // Sincronizar con Supabase RPC
    fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_player_profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        p_id: local.id,
        p_username: local.username,
        p_display_name: local.username,
        p_email: local.email,
        p_password_hash: 'verified_client_hash',
        p_role: local.role,
        p_is_verified: true,
        p_verification_code: null,
        p_code_expires_at: null,
        p_elo: 1000
      })
    }).catch(() => {});

    this.applyAuthenticatedUser(
      {
        id: local.id,
        username: local.username,
        displayName: local.username,
        email: local.email,
        role: local.role,
        elo: 1000,
        goals: local.goals,
        assists: local.assists,
        saves: local.saves,
        wins: local.wins
      },
      `local_jwt_${local.id}`
    );

    return { ok: true };
  }

  public async loginWithAccount(
    usernameOrEmail: string,
    password: string
  ): Promise<{ ok: boolean; error?: string; requiresVerification?: boolean }> {
    const key = (usernameOrEmail || '').trim();
    if (!key || !password) {
      return { ok: false, error: 'Ingresa tu usuario/correo y contraseña.' };
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: key, password })
      });
      const data = await res.json();
      if (data && data.ok && data.user) {
        this.applyAuthenticatedUser(data.user, data.token || '');
        return { ok: true };
      }
      if (data && data.requiresVerification) {
        this.awaitingVerification = true;
        this.pendingUsername = key;
        return { ok: false, requiresVerification: true, error: data.error };
      }
    } catch {
      // Fallback local
    }

    for (const acc of this.localAccounts.values()) {
      if (
        (acc.username.toLowerCase() === key.toLowerCase() ||
          acc.email.toLowerCase() === key.toLowerCase()) &&
        acc.password === password
      ) {
        if (!acc.isVerified) {
          this.awaitingVerification = true;
          this.pendingUsername = acc.username;
          this.pendingEmail = acc.email;
          this.devVerificationCode = acc.code;
          return {
            ok: false,
            requiresVerification: true,
            error: 'Cuenta pendiente de verificación por código de 6 dígitos.'
          };
        }
        this.applyAuthenticatedUser(
          {
            id: acc.id,
            username: acc.username,
            displayName: acc.username,
            email: acc.email,
            role: acc.role,
            elo: acc.elo,
            goals: acc.goals,
            assists: acc.assists,
            saves: acc.saves,
            wins: acc.wins
          },
          `local_jwt_${acc.id}`
        );
        return { ok: true };
      }
    }

    return { ok: false, error: 'Credenciales inválidas o cuenta no registrada.' };
  }

  private applyAuthenticatedUser(user: any, token: string): void {
    this.id = user.id || '';
    this.username = user.username;
    this.displayName = user.displayName || user.username;
    this.email = user.email || '';
    this.role = (user.role as AccountRole) || 'jugador';
    this.isGuest = false;
    this.isVerified = true;
    this.authToken = token;
    this.elo = Number(user.elo ?? 1000);
    this.goals = Number(user.goals ?? 0);
    this.assists = Number(user.assists ?? 0);
    this.saves = Number(user.saves ?? 0);
    this.wins = Number(user.wins ?? 0);
    this.awaitingVerification = false;
    this.devVerificationCode = '';
    this.persistSession();

    gameUI.playerNickname = this.username;
    gameUI.playerAvatar = this.username.slice(0, 2).toUpperCase();
    gameUI.saveProfile();
    this.refreshLeaderboard(this.rankingCategory);
  }

  public logout(): void {
    this.id = '';
    this.username = '';
    this.displayName = '';
    this.email = '';
    this.role = 'invitado';
    this.isGuest = true;
    this.isVerified = false;
    this.authToken = '';
    this.awaitingVerification = false;
    this.persistSession();
  }

  public async assignRole(
    targetUsername: string,
    newRole: 'representante' | 'jugador'
  ): Promise<{ ok: boolean; message: string }> {
    if (!this.isSuperadmin) {
      return { ok: false, message: 'Permiso denegado: se requiere rol superadmin.' };
    }
    try {
      const res = await fetch('/api/admin/role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          token: this.authToken,
          targetUsername,
          newRole
        })
      });
      const data = await res.json();
      if (data && data.ok) {
        this.refreshLeaderboard(this.rankingCategory);
        return {
          ok: true,
          message: `Rol de ${targetUsername} actualizado a ${newRole.toUpperCase()}.`
        };
      }
    } catch {}

    const target = this.localAccounts.get(targetUsername.trim().toLowerCase());
    if (!target) {
      return { ok: false, message: `Usuario "${targetUsername}" no encontrado.` };
    }
    target.role = newRole;
    this.refreshLeaderboard(this.rankingCategory);
    return {
      ok: true,
      message: `Rol de ${target.username} actualizado a ${newRole.toUpperCase()}.`
    };
  }

  public async refreshLeaderboard(category: RankingTabCategory = this.rankingCategory): Promise<void> {
    this.rankingCategory = category;
    this.isLoadingLeaderboard = true;

    try {
      const viewerParam = !this.isGuest && this.username ? `&viewerId=${encodeURIComponent(this.username)}` : '';
      const res = await fetch(`/api/rankings?category=${category}&limit=50${viewerParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.entries)) {
          this.leaderboard = data.entries;
          this.personalRank = data.personalEntry ?? null;
          this.isLoadingLeaderboard = false;
          return;
        }
      }
    } catch {}

    try {
      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_leaderboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ category, limit_count: 50 })
      });
      if (rpcRes.ok) {
        const rows = await rpcRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          this.leaderboard = rows.map((r: any, idx: number) => ({
            position: Number(r.position || idx + 1),
            playerId: String(r.player_id),
            username: String(r.username),
            displayName: String(r.username),
            role: 'jugador',
            metricValue: Number(r.metric_value ?? 1000),
            elo: Number(r.elo ?? 1000),
            goals: category === 'goals' ? Number(r.metric_value ?? 0) : 0,
            assists: category === 'assists' ? Number(r.metric_value ?? 0) : 0,
            saves: category === 'saves' ? Number(r.metric_value ?? 0) : 0
          }));
          this.personalRank = !this.isGuest
            ? this.leaderboard.find((e) => e.username.toLowerCase() === this.username.toLowerCase()) ?? null
            : null;
          this.isLoadingLeaderboard = false;
          return;
        }
      }
    } catch {}

    // Fallback determinista con cuentas verificadas locales (nunca invitados)
    const verified = Array.from(this.localAccounts.values()).filter(
      (a) => a.isVerified && !/^inv_/i.test(a.username)
    );
    const getVal = (a: typeof verified[number]) =>
      category === 'goals'
        ? a.goals
        : category === 'assists'
          ? a.assists
          : category === 'saves'
            ? a.saves
            : a.elo;

    verified.sort((a, b) => getVal(b) - getVal(a) || b.elo - a.elo);
    this.leaderboard = verified.map((a, i) => ({
      position: i + 1,
      playerId: a.id,
      username: a.username,
      displayName: a.username,
      role: a.role,
      metricValue: getVal(a),
      elo: a.elo,
      goals: a.goals,
      assists: a.assists,
      saves: a.saves
    }));
    this.personalRank = !this.isGuest
      ? this.leaderboard.find((e) => e.username.toLowerCase() === this.username.toLowerCase()) ?? null
      : null;
    this.isLoadingLeaderboard = false;
  }
}

export const userProfile = new UserProfileState();
