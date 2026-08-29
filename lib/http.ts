import { API_BASE_URL } from '@/constants/api';
import { getAccessToken, refreshAccessToken, reloginWithStoredCredentials } from '@/lib/auth';

/**
 * Authenticated fetch against the Aaziko backend.
 * - Attaches the stored access token.
 * - On a 401 (expired token), transparently refreshes the token once and retries.
 * - 20s timeout so a stalled request can't hang the UI forever.
 *
 * Check `res.status === 401` after this returns to detect a truly expired session
 * (refresh already failed by then).
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const run = async (token: string | null): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const token = await getAccessToken();
  let res = await run(token);

  if (res.status === 401) {
    // 1) Try the refresh token. 2) If that fails (expired/blocked), silently
    // re-login with the stored credentials — this is what keeps the user logged
    // in "until uninstall" instead of being bounced to the login screen.
    let newToken = await refreshAccessToken();
    if (!newToken) newToken = await reloginWithStoredCredentials();
    if (newToken) {
      res = await run(newToken);
    }
  }

  return res;
}
