import { API_BASE_URL } from '@/constants/api';
import { getAccessToken, getStoredUser } from '@/lib/auth';
import { authedFetch } from '@/lib/http';

/**
 * Media + inspection-record helpers that mirror the Transportation web app's
 * inspection flow (src/components/inspection/InspectionOrderDetailBody.tsx):
 *
 *   1. capture/pick a photo or video
 *   2. POST the file to the shared media library → get a hosted URL
 *   3. attach that URL to the assignment as a progress update
 *        (progressUpdates[].images) so admin/buyer/vendor all see it
 *   4. on Submit, send the finished report to /submit (completionReport)
 *
 * The media-library endpoint is multipart, so it can't go through authedFetch
 * (which forces application/json) — we build the request by hand and let fetch
 * set the multipart boundary.
 */

export interface CapturedAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  type?: 'image' | 'video' | string | null; // expo-image-picker asset.type
  // Capture metadata — the date/time and GPS location of the moment the photo
  // was taken (see lib/captureMeta.ts). All optional / best-effort.
  capturedAt?: number; // epoch ms
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number; // metres
  locationAddress?: string; // reverse-geocoded place
}

export interface UploadedMedia {
  url: string;
  caption: string;
  kind: 'photo' | 'video';
}

const MEDIA_UPLOAD_URL = `${API_BASE_URL}/common-service/medialibrary-service/mediaLibrary/create`;

function guessName(asset: CapturedAsset, index: number): string {
  if (asset.fileName) return asset.fileName;
  const isVideo = asset.type === 'video' || (asset.mimeType || '').startsWith('video');
  const ext = isVideo ? 'mp4' : 'jpg';
  return `inspection-${Date.now()}-${index}.${ext}`;
}

function guessMime(asset: CapturedAsset): string {
  if (asset.mimeType) return asset.mimeType;
  return asset.type === 'video' ? 'video/mp4' : 'image/jpeg';
}

/**
 * Upload captured photos/videos to the shared media library. Returns the hosted
 * URLs (data.uploaded[].url) plus any per-file failures the service reported.
 */
export async function uploadInspectionMedia(
  assets: CapturedAsset[],
  context = 'inspection-photos',
): Promise<{ ok: boolean; uploaded: UploadedMedia[]; error?: string }> {
  if (!assets.length) return { ok: true, uploaded: [] };

  const token = await getAccessToken();
  if (!token) return { ok: false, uploaded: [], error: 'Your session has expired. Please log in again.' };
  const user = await getStoredUser();

  const form = new FormData();
  assets.forEach((a, i) => {
    // React Native FormData file part.
    form.append('files', {
      uri: a.uri,
      name: guessName(a, i),
      type: guessMime(a),
    } as any);
  });
  form.append('context', context);

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (user?.email) headers['x-user-email'] = user.email;
  // NOTE: do NOT set Content-Type — fetch adds the multipart boundary itself.

  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      res = await fetch(MEDIA_UPLOAD_URL, {
        method: 'POST',
        headers,
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ok: false, uploaded: [], error: 'Upload failed — check your internet connection.' };
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }

  const items = Array.isArray(json?.data) ? json.data : json?.data?.uploaded || [];
  const uploaded: UploadedMedia[] = items
    .filter((it: any) => it?.url)
    .map((it: any, idx: number) => {
      const a = assets[idx] || assets[0];
      const isVideo =
        a?.type === 'video' || (a?.mimeType || '').startsWith('video') || /\.(mp4|mov|webm)$/i.test(it.url);
      return {
        url: it.url,
        caption: `Inspection ${isVideo ? 'video' : 'image'}: ${a?.fileName || it.originalName || 'capture'}`,
        kind: isVideo ? 'video' : 'photo',
      };
    });

  if (!res.ok || uploaded.length === 0) {
    const reason = json?.data?.failed?.[0]?.error || json?.message || `Upload failed (${res.status}).`;
    return { ok: false, uploaded, error: reason };
  }
  return { ok: true, uploaded };
}

/**
 * Attach already-uploaded media URLs to the assignment as a progress update —
 * the same shape the transportation app uses (progressUpdates[].images). This
 * makes the photos/videos visible on the admin/buyer/vendor order pages.
 */
export interface ProgressImage {
  url: string;
  caption?: string;
  // Structured capture metadata — sent alongside the caption so a backend that
  // stores these fields keeps them; ignored harmlessly otherwise. The caption
  // still carries a human-readable copy, which always persists.
  capturedAt?: number; // epoch ms
  latitude?: number;
  longitude?: number;
  locationAddress?: string;
}

export async function attachInspectionProgress(
  assignmentId: string,
  images: ProgressImage[],
  message: string,
  // First-class progress location (backend stores this as progressUpdates[].location,
  // shown on the buyer/vendor order pages). The caption also carries a copy.
  location?: string,
): Promise<{ ok: boolean; message: string }> {
  let res: Response;
  try {
    res = await authedFetch(`/service-provider/work/assignments/${assignmentId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ message, images, location }),
    });
  } catch {
    return { ok: false, message: 'Cannot reach the server. Check your internet connection.' };
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: res.ok, message: data?.message || (res.ok ? 'OK' : `Failed (${res.status}).`) };
}

/**
 * Fetch the shared order-inspection record for an inquiry (the same record the
 * transportation app reads) — carries the product and any packing boxes the
 * inspector registered. Non-fatal: returns null when there's no record yet.
 */
export async function getInspectionRecord(inquiryId: string): Promise<any | null> {
  if (!inquiryId) return null;
  let res: Response;
  try {
    res = await authedFetch(`/inspection-service/order-inspections/by-inquiry/${inquiryId}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows[0] || null;
}
