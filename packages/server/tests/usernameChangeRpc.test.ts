import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/AuthService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  '../../../supabase/migrations/20261113203000_fix_username_change_rpc_and_backfill.sql'
);

describe('AuthService authoritative profile hydration & username change SQL migration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchFullProfile keeps authoritative profiles.username over mismatched display_name when name_changed is true', async () => {
    const svc = new AuthService();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'u-victor',
              username: 'Yami',
              display_name: 'Victor OAuth Full Name',
              email: 'victor@legacyx.gg',
              role: 'jugador',
              is_verified: true,
              name_changed: true
            }
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              elo: 1200,
              matches_played: 8,
              wins: 5,
              losses: 2,
              draws: 1,
              goals: 11,
              assists: 4,
              saves: 3,
              mvp_count: 2
            }
          ]),
          { status: 200 }
        )
      );

    const profile = await svc.fetchFullProfile('u-victor', 'jwt-token');
    expect(profile).not.toBeNull();
    expect(profile?.username).toBe('Yami');
    expect(profile?.displayName).toBe('Yami');
    expect(profile?.nameChanged).toBe(true);
  });

  it('login uses authoritative profiles.username rather than GoTrue OAuth user_metadata', async () => {
    const svc = new AuthService();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            found: true,
            id: 'u-victor',
            username: 'Yami',
            email: 'victor@legacyx.gg',
            is_verified: true
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'jwt-access',
            refresh_token: 'jwt-refresh',
            user: {
              id: 'u-victor',
              user_metadata: {
                username: 'victorsamchez40',
                display_name: 'Google OAuth Name',
                full_name: 'Google OAuth Name'
              }
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'u-victor',
              username: 'Yami',
              display_name: 'Google OAuth Name',
              email: 'victor@legacyx.gg',
              role: 'jugador',
              is_verified: true,
              name_changed: true
            }
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ elo: 1200, matches_played: 8 }]), { status: 200 })
      );

    const res = await svc.login({ identifier: 'Yami', password: 'password123' });
    expect(res.success).toBe(true);
    expect(res.profile?.username).toBe('Yami');
    expect(res.profile?.displayName).toBe('Yami');
    expect(res.profile?.nameChanged).toBe(true);
  });

  it('migration defines atomic SECURITY DEFINER change_username_once RPC with guard bypass and backfill', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/app\.bypass_profile_guard/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.change_username_once\s*\(\s*p_new_username text\s*\)/i);
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/SET search_path TO 'public', 'auth', 'pg_temp'/i);
    expect(sql).toMatch(/auth\.uid\(\)/i);
    expect(sql).toMatch(/FOR UPDATE/i);
    expect(sql).toMatch(/raw_user_meta_data/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.change_username_once\(text\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.change_username_once\(text\) TO authenticated/i);
  });
});
