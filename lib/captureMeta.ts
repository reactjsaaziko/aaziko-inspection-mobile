import * as Location from 'expo-location';

/**
 * Capture metadata = the date/time AND the GPS location of the moment an
 * inspector takes (or uploads) a photo/video. We grab this ourselves with
 * expo-location instead of relying on the photo's EXIF, because camera EXIF is
 * often stripped inside Expo Go and library picks may carry no GPS at all.
 *
 * Everything here is best-effort and NEVER blocks a capture: if the inspector
 * denies location or GPS is slow, we still return the timestamp so the photo is
 * always at least stamped with the date/time.
 */

export interface CaptureMeta {
  capturedAt: number; // epoch ms — the exact moment of capture
  latitude?: number;
  longitude?: number;
  accuracy?: number; // GPS accuracy radius in metres, if known
  address?: string; // reverse-geocoded human-readable place, if resolvable
}

// Ask for location permission only once per app session — repeated prompts
// while taking many photos would be annoying.
let permissionAsked = false;
let permissionGranted = false;

async function ensurePermission(): Promise<boolean> {
  if (permissionAsked) return permissionGranted;
  permissionAsked = true;
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status === 'granted') {
      permissionGranted = true;
      return true;
    }
    const req = await Location.requestForegroundPermissionsAsync();
    permissionGranted = req.status === 'granted';
  } catch {
    permissionGranted = false;
  }
  return permissionGranted;
}

/** Race a promise against a timeout so a slow GPS/geocode fix can't hang capture. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, ms);
    p.then(
      (v) => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(v);
        }
      },
      () => {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(null);
        }
      },
    );
  });
}

/**
 * Grab the date/time + GPS location for a capture. Always resolves — the
 * timestamp is guaranteed; latitude/longitude/address are added when available.
 */
export async function getCaptureMeta(): Promise<CaptureMeta> {
  const meta: CaptureMeta = { capturedAt: Date.now() };

  const granted = await ensurePermission();
  if (!granted) return meta;

  const pos = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    12000,
  );
  if (!pos) return meta;

  meta.latitude = pos.coords.latitude;
  meta.longitude = pos.coords.longitude;
  if (typeof pos.coords.accuracy === 'number') meta.accuracy = pos.coords.accuracy;

  // Reverse geocode is a bonus — never let it delay or fail the capture.
  const places = await withTimeout(
    Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    }),
    8000,
  );
  const p = places?.[0];
  if (p) {
    meta.address = [p.name, p.street, p.city || p.subregion, p.region, p.country]
      .filter(Boolean)
      // de-dupe consecutive repeats (name===street etc.)
      .filter((v, i, arr) => v !== arr[i - 1])
      .join(', ');
  }

  return meta;
}

/** Format the capture date/time as a short, human-readable stamp. */
export function formatCapturedAt(ms: number): string {
  try {
    const d = new Date(ms);
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

/**
 * Build the human-readable "· date/time · location" suffix appended to a photo
 * caption. This is the channel that reliably persists and shows up on the
 * admin/buyer/vendor order pages.
 */
export function metaCaptionSuffix(meta: {
  capturedAt?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
}): string {
  const parts: string[] = [];
  if (meta.capturedAt) parts.push(formatCapturedAt(meta.capturedAt));
  if (typeof meta.latitude === 'number' && typeof meta.longitude === 'number') {
    const coords = `${meta.latitude.toFixed(5)}, ${meta.longitude.toFixed(5)}`;
    parts.push(meta.address ? `${meta.address} (${coords})` : coords);
  } else if (meta.address) {
    parts.push(meta.address);
  }
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}
