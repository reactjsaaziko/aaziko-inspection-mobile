import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL, ENDPOINTS } from '@/constants/api';

// Credentials are stored ENCRYPTED in the device keystore (expo-secure-store) so
// the app can silently log back in when the session expires — giving a
// "stay logged in until uninstall" experience. Cleared only on explicit logout.
const CRED_KEY = 'sp_credentials';

async function saveCredentials(email: string, password: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(CRED_KEY, JSON.stringify({ email, password }));
  } catch {
    /* keystore unavailable — silent re-login just won't be possible */
  }
}

export async function getStoredCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    const raw = await SecureStore.getItemAsync(CRED_KEY);
    return raw ? (JSON.parse(raw) as { email: string; password: string }) : null;
  } catch {
    return null;
  }
}

async function clearCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CRED_KEY);
  } catch {
    /* ignore */
  }
}

export interface ServiceProviderUser {
  id: string;
  username: string;
  email: string;
  role: string;
  allowedServices?: string[];
  mustChangePassword?: boolean;
  [key: string]: any;
}

interface LoginData {
  user: ServiceProviderUser;
  accessToken: string;
  refreshToken: string;
  expiresIn?: string;
}

const KEYS = {
  accessToken: 'jwt_access_token',
  refreshToken: 'jwt_refresh_token',
  user: 'user',
};

export type LoginResult =
  | { ok: true; user: ServiceProviderUser }
  | { ok: false; error: string };

/**
 * A user may use the Inspection app if they are an admin, a legacy user
 * (no allowedServices restriction), or explicitly allowed the "Inspection" service.
 * This matches how the Transportation web app gates its Inspection section.
 */
export function hasInspectionAccess(user: ServiceProviderUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const allowed = Array.isArray(user.allowedServices) ? user.allowedServices : [];
  if (allowed.length === 0) return true; // legacy account = all services
  return allowed.includes('Inspection');
}

/**
 * Log in against the same Service Provider backend the Transportation app uses.
 * `identifier` is the email the admin issued (the field is labelled "Username").
 */
export async function login(identifier: string, password: string): Promise<LoginResult> {
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    res = await fetch(`${API_BASE_URL}${ENDPOINTS.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: identifier.trim(), password }),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') {
      return { ok: false, error: 'The server took too long to respond. Please try again.' };
    }
    return { ok: false, error: 'Cannot reach the server. Check your internet connection.' };
  }
  clearTimeout(timer);

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !body?.success || !body?.data) {
    if (res.status === 401) return { ok: false, error: 'Invalid email or password.' };
    if (res.status === 403) {
      return { ok: false, error: 'Access denied. Only service providers can log in.' };
    }
    return { ok: false, error: body?.message || 'Login failed. Please try again.' };
  }

  const data: LoginData = body.data;

  if (!hasInspectionAccess(data.user)) {
    return {
      ok: false,
      error: 'Your account does not have Inspection access. Please ask the admin to enable it.',
    };
  }

  try {
    await AsyncStorage.multiSet([
      [KEYS.accessToken, data.accessToken ?? ''],
      [KEYS.refreshToken, data.refreshToken ?? ''],
      [KEYS.user, JSON.stringify(data.user)],
    ]);
  } catch {
    // Storage failure shouldn't block a successful login.
  }

  // Remember the login so the app can silently re-authenticate later (lifetime
  // login until the user logs out or uninstalls).
  await saveCredentials(identifier.trim(), password);

  return { ok: true, user: data.user };
}

/**
 * Silent re-login using the stored credentials — the backstop that keeps a user
 * logged in past the refresh-token lifetime. Returns a fresh access token, or
 * null if there are no stored credentials or the login is no longer valid
 * (e.g. password changed / account disabled).
 */
export async function reloginWithStoredCredentials(): Promise<string | null> {
  const creds = await getStoredCredentials();
  if (!creds?.email || !creds?.password) return null;
  const result = await login(creds.email, creds.password);
  if (result.ok) return getAccessToken();
  return null;
}

export async function getStoredUser(): Promise<ServiceProviderUser | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.user);
    return raw ? (JSON.parse(raw) as ServiceProviderUser) : null;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEYS.accessToken);
  } catch {
    return null;
  }
}

/** Exchange the stored refresh token for a fresh access token (access tokens
 * expire in ~1h; the refresh token lasts ~7 days). Returns the new access token,
 * or null if refresh is not possible (expired / invalid). Rotates both tokens. */
export async function refreshAccessToken(): Promise<string | null> {
  let refreshToken: string | null = null;
  try {
    refreshToken = await AsyncStorage.getItem(KEYS.refreshToken);
  } catch {
    return null;
  }
  if (!refreshToken) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${ENDPOINTS.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);

  if (!res.ok) return null;
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const newAccess = body?.data?.accessToken;
  const newRefresh = body?.data?.refreshToken;
  if (!newAccess) return null;

  try {
    await AsyncStorage.multiSet([
      [KEYS.accessToken, newAccess],
      [KEYS.refreshToken, newRefresh ?? refreshToken],
    ]);
  } catch {
    /* ignore storage failure */
  }
  return newAccess;
}

export async function logout(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEYS.accessToken, KEYS.refreshToken, KEYS.user]);
  } catch {
    /* ignore */
  }
  // Also forget the saved credentials so the app doesn't silently log back in.
  await clearCredentials();
}
