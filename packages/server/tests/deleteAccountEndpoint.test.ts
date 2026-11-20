import { describe, it, expect, vi, afterEach } from 'vitest';
import { AuthService } from '../src/auth/AuthService';

describe('AuthService.deleteAccount Self-Service GDPR Deletion', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects empty access token immediately', async () => {
    const svc = new AuthService();
    const res = await svc.deleteAccount('');
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('rejects invalid/expired session token when Supabase /auth/v1/user rejects it', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid' })
    })) as any;

    const svc = new AuthService();
    const res = await svc.deleteAccount('bad-jwt');
    expect(res.success).toBe(false);
  });

  it('invokes delete_own_account RPC after validating user session and returns success', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/auth/v1/user')) {
        const body = { id: 'user-123' };
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(body),
          json: async () => body
        };
      }
      if (url.includes('/rest/v1/rpc/delete_own_account')) {
        const body = { success: true };
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(body),
          json: async () => body
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as any;

    const svc = new AuthService();
    const res = await svc.deleteAccount('valid-jwt');
    expect(res.success).toBe(true);
    expect(calls.some((u) => u.includes('/auth/v1/user'))).toBe(true);
    expect(calls.some((u) => u.includes('/rest/v1/rpc/delete_own_account'))).toBe(true);
  });
});
