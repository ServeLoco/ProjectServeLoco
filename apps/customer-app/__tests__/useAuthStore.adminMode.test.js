/**
 * ADMIN TASK 6 — useAuthStore admin/adminToken plumbing.
 */
jest.mock('../src/api/adminApi', () => ({
  adminApi: { mintSession: jest.fn() },
}));
jest.mock('../src/api/authApi', () => ({
  authApi: { getMe: jest.fn(), logout: jest.fn().mockResolvedValue(undefined) },
}));

import { useAuthStore } from '../src/stores/useAuthStore';
import { adminApi } from '../src/api/adminApi';
import { authApi } from '../src/api/authApi';

// validateSession short-circuits on isJwtExpired(token) before ever calling
// /auth/me — needs a real (if unsigned) 3-part JWT with a future `exp`, not
// an arbitrary string, or every "still logged in" test would secretly be
// exercising the logout path instead.
function fakeJwt(expiresInSeconds = 3600) {
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${b64url({ alg: 'none' })}.${b64url({ exp })}.sig`;
}

describe('useAuthStore — admin mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      token: null, user: null, profile: null, shop: null, rider: null,
      admin: null, adminToken: null, isAuthenticated: false,
      sessionGeneration: 0, sessionChecked: false,
    });
  });

  it('setSession with admin present mints an admin token', async () => {
    adminApi.mintSession.mockResolvedValue({ token: 'admin-jwt-1' });

    useAuthStore.getState().setSession('cust-jwt', { id: 1 }, null, null, { id: 4, active: true });
    // mintAdminSession is fire-and-forget inside setSession — flush it.
    await new Promise((r) => setImmediate(r));

    expect(useAuthStore.getState().admin).toEqual({ id: 4, active: true });
    expect(useAuthStore.getState().adminToken).toBe('admin-jwt-1');
  });

  it('setSession without admin never calls mintSession', () => {
    useAuthStore.getState().setSession('cust-jwt', { id: 1 }, null, null, null);
    expect(adminApi.mintSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().adminToken).toBeNull();
  });

  it('mintAdminSession clears admin state on a definitive 403 (deactivated)', async () => {
    useAuthStore.setState({ admin: { id: 4, active: true }, adminToken: 'old-token' });
    adminApi.mintSession.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    const result = await useAuthStore.getState().mintAdminSession();

    expect(result).toBeNull();
    expect(useAuthStore.getState().admin).toBeNull();
    expect(useAuthStore.getState().adminToken).toBeNull();
  });

  it('mintAdminSession keeps admin state on a transient network error', async () => {
    useAuthStore.setState({ admin: { id: 4, active: true }, adminToken: null });
    adminApi.mintSession.mockRejectedValue(Object.assign(new Error('Network request failed'), { code: 'NETWORK_ERROR' }));

    const result = await useAuthStore.getState().mintAdminSession();

    expect(result).toBeNull();
    // Admin role survives the blip — the AdminMintGate retries instead of
    // the phone silently demoting to the customer shell.
    expect(useAuthStore.getState().admin).toEqual({ id: 4, active: true });
    expect(useAuthStore.getState().adminToken).toBeNull();
  });

  it('clearAdminSession wipes both fields', () => {
    useAuthStore.setState({ admin: { id: 4 }, adminToken: 'x' });
    useAuthStore.getState().clearAdminSession();
    expect(useAuthStore.getState().admin).toBeNull();
    expect(useAuthStore.getState().adminToken).toBeNull();
  });

  it('validateSession clears adminToken when the server no longer reports admin', async () => {
    useAuthStore.setState({
      token: fakeJwt(), isAuthenticated: true,
      admin: { id: 4, active: true }, adminToken: 'old-token',
    });
    authApi.getMe.mockResolvedValue({ user: { id: 1 }, shop: null, rider: null, admin: null });

    await useAuthStore.getState().validateSession();

    expect(authApi.getMe).toHaveBeenCalled();
    expect(useAuthStore.getState().admin).toBeNull();
    expect(useAuthStore.getState().adminToken).toBeNull();
  });

  it('validateSession re-mints when the server still reports an active admin', async () => {
    useAuthStore.setState({ token: fakeJwt(), isAuthenticated: true });
    authApi.getMe.mockResolvedValue({ user: { id: 1 }, shop: null, rider: null, admin: { id: 4, active: true } });
    adminApi.mintSession.mockResolvedValue({ token: 'admin-jwt-2' });

    await useAuthStore.getState().validateSession();
    await new Promise((r) => setImmediate(r));

    expect(useAuthStore.getState().admin).toEqual({ id: 4, active: true });
    expect(useAuthStore.getState().adminToken).toBe('admin-jwt-2');
  });

  it('logout clears admin and adminToken', async () => {
    useAuthStore.setState({
      token: fakeJwt(), isAuthenticated: true,
      admin: { id: 4 }, adminToken: 'x',
    });
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().admin).toBeNull();
    expect(useAuthStore.getState().adminToken).toBeNull();
  });

  it('setSession replaces user/profile wholesale and bumps sessionGeneration', () => {
    useAuthStore.setState({
      token: 'old',
      user: { id: '2', phone: '9999999999', name: 'Demo User' },
      profile: { id: '2', phone: '9999999999', name: 'Demo User' },
      sessionGeneration: 1,
      isAuthenticated: true,
    });

    useAuthStore.getState().setSession(
      'new-jwt',
      { id: '3', phone: '8888888888', name: 'Blocked User' },
      null,
      null,
      null,
    );

    const s = useAuthStore.getState();
    expect(s.token).toBe('new-jwt');
    expect(s.user).toEqual({ id: '3', phone: '8888888888', name: 'Blocked User' });
    expect(s.profile).toEqual({ id: '3', phone: '8888888888', name: 'Blocked User' });
    expect(s.sessionGeneration).toBe(2);
    expect(s.adminToken).toBeNull();
  });

  it('setProfile ignores a profile for a different user id (stale getMe)', () => {
    useAuthStore.setState({
      token: 'jwt-3',
      user: { id: '3', phone: '8888888888', name: 'Blocked User' },
      profile: { id: '3', phone: '8888888888', name: 'Blocked User' },
      isAuthenticated: true,
    });

    useAuthStore.getState().setProfile({
      id: '2', phone: '9999999999', name: 'Demo User',
    });

    const s = useAuthStore.getState();
    expect(s.user.phone).toBe('8888888888');
    expect(s.user.id).toBe('3');
    expect(s.profile.phone).toBe('8888888888');
  });

  it('validateSession ignores a stale getMe after re-login', async () => {
    let resolveGetMe;
    authApi.getMe.mockImplementation(
      () => new Promise((resolve) => { resolveGetMe = resolve; }),
    );

    const tokenA = fakeJwt();
    useAuthStore.setState({
      token: tokenA,
      user: { id: '2', phone: '9999999999' },
      profile: { id: '2', phone: '9999999999' },
      isAuthenticated: true,
      sessionGeneration: 1,
    });

    const pending = useAuthStore.getState().validateSession();

    // Re-login as a different user while /auth/me for A is still in flight.
    useAuthStore.getState().setSession(
      'jwt-b',
      { id: '3', phone: '8888888888', name: 'B' },
    );

    resolveGetMe({
      user: { id: '2', phone: '9999999999', name: 'A' },
      shop: null,
      rider: null,
      admin: null,
    });
    await pending;

    const s = useAuthStore.getState();
    expect(s.token).toBe('jwt-b');
    expect(s.user.phone).toBe('8888888888');
    expect(s.user.id).toBe('3');
  });
});
