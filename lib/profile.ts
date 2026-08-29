import AsyncStorage from '@react-native-async-storage/async-storage';

import { getStoredUser } from '@/lib/auth';
import { authedFetch } from '@/lib/http';

/**
 * Per-user "onboarding finished" flag (address + work details, or explicitly
 * skipped). Once set, a returning user goes straight to Orders on login instead
 * of being bounced back through the address page every time. Keyed by the user's
 * email/id and NOT cleared on logout, so logging in again with the same account
 * skips onboarding as expected.
 */
async function onboardingKey(): Promise<string | null> {
  const user = await getStoredUser();
  const who = user?.email || user?.id || (user as any)?._id;
  return who ? `onboarding_done:${String(who).toLowerCase()}` : null;
}

export async function isOnboardingDone(): Promise<boolean> {
  try {
    const key = await onboardingKey();
    return key ? (await AsyncStorage.getItem(key)) === '1' : false;
  } catch {
    return false;
  }
}

export async function markOnboardingDone(): Promise<void> {
  try {
    const key = await onboardingKey();
    if (key) await AsyncStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

export interface ContactInfo {
  companyName?: string;
  email?: string;
  contactNo?: string;
  address?: {
    locality?: string;
    pincode?: string;
    city?: string;
    state?: string;
    country?: string;
    addressDetails?: string;
  };
  workAddress?: string;
  documents?: string[];
  [key: string]: any;
}

async function providerId(): Promise<string | null> {
  const user = await getStoredUser();
  return (user?.serviceProviderId || user?.id || (user as any)?._id) ?? null;
}

/** True when the provider already has a usable address on file. */
export function hasAddress(c: ContactInfo | null | undefined): boolean {
  if (!c) return false;
  const a = c.address && typeof c.address === 'object' ? c.address : {};
  const any = (v: any) => Boolean(v && String(v).trim());
  return any(a.city) || any(a.pincode) || any(a.addressDetails) || any(a.locality);
}

/** Fetch the provider's stored contact/address.
 * `{ ok: false }` means we couldn't determine it (network/auth) — callers should
 * NOT force the address screen in that case. */
export async function getContactInfo(): Promise<
  { ok: true; contact: ContactInfo | null } | { ok: false }
> {
  const id = await providerId();
  if (!id) return { ok: false };

  let res: Response;
  try {
    res = await authedFetch(`/service-provider/dashboard/${id}/contact`);
  } catch {
    return { ok: false };
  }

  if (res.status === 404) return { ok: true, contact: null };
  if (!res.ok) return { ok: false };

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: true, contact: (body?.data as ContactInfo) || null };
}

/** True when the provider already has work contact details (contact, email, work address). */
export function hasWorkDetails(c: ContactInfo | null | undefined): boolean {
  if (!c) return false;
  const any = (v: any) => Boolean(v && String(v).trim());
  return any(c.contactNo) && any(c.email) && any(c.workAddress);
}

/** After login, decide where to send the user. Only force the address screen
 * when we positively know there is no address on file. */
export async function needsAddress(): Promise<boolean> {
  const r = await getContactInfo();
  if (!r.ok) return false;
  return !hasAddress(r.contact);
}

/** Onboarding router: address first (if missing), then work details (if missing),
 * then Orders. Returns '/orders' when we cannot determine (never block the user). */
export async function nextOnboardingRoute(): Promise<'/address' | '/workdetails' | '/orders'> {
  // Onboarding (address / work details) NEVER blocks login. Every inspector —
  // new or returning — lands straight on their Orders. The address screen is
  // still reachable (e.g. via its own button / Skip flow) but is fully optional,
  // so no one is ever bounced to it just for logging in.
  return '/orders';
}

/** Where to go after the address screen is saved. Never returns '/address'
 * (so a not-yet-reflected save can't bounce the user back to the same page). */
export async function routeAfterAddress(): Promise<'/workdetails' | '/orders'> {
  const r = await getContactInfo();
  if (!r.ok) return '/workdetails';
  if (hasWorkDetails(r.contact)) {
    await markOnboardingDone();
    return '/orders';
  }
  return '/workdetails';
}

export async function saveWorkDetails(fields: {
  contact: string;
  email: string;
  workAddress: string;
  documents: { name: string }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await providerId();
  if (!id) return { ok: false, error: 'Your session expired. Please log in again.' };

  const payload: Record<string, any> = {
    contactNo: fields.contact.trim(),
    email: fields.email.trim(),
    workAddress: fields.workAddress.trim(),
  };
  if (fields.documents.length) {
    payload.documents = fields.documents.map((d) => d.name);
  }

  let res: Response;
  try {
    res = await authedFetch(`/service-provider/dashboard/${id}/contact`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { ok: false, error: 'The server took too long. Please try again.' };
    }
    return { ok: false, error: 'Cannot reach the server. Check your internet connection.' };
  }

  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    return { ok: false, error: body?.message || `Could not save details (${res.status}).` };
  }

  return { ok: true };
}

export async function saveAddress(fields: {
  locality: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
  addressDetails: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await providerId();
  if (!id) return { ok: false, error: 'Your session expired. Please log in again.' };

  const payload = {
    address: {
      locality: fields.locality.trim(),
      pincode: fields.postalCode.trim(),
      city: fields.city.trim(),
      state: fields.state.trim(),
      country: fields.country.trim(),
      addressDetails: fields.addressDetails.trim(),
    },
  };

  let res: Response;
  try {
    res = await authedFetch(`/service-provider/dashboard/${id}/contact`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { ok: false, error: 'The server took too long. Please try again.' };
    }
    return { ok: false, error: 'Cannot reach the server. Check your internet connection.' };
  }

  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    return { ok: false, error: body?.message || `Could not save address (${res.status}).` };
  }

  return { ok: true };
}
