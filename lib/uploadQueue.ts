import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { acknowledgeAssignment, startAssignment } from '@/lib/inspection';
import { attachInspectionProgress, uploadInspectionMedia, type CapturedAsset } from '@/lib/inspectionMedia';
import { metaCaptionSuffix } from '@/lib/captureMeta';

/**
 * Offline-first upload queue for inspection photos/videos.
 *
 * When an inspector captures media, the file is copied into permanent app
 * storage and added to this queue (persisted in AsyncStorage, so it survives the
 * app being closed or the phone restarting). The queue then uploads each item
 * through the SAME existing endpoints the online path uses — the media library
 * `create` endpoint, then the assignment `progress` endpoint — retrying whenever
 * the device is online. Nothing new on the backend; this only adds resilience.
 *
 * Draining happens: (1) right after a capture, (2) whenever connectivity is
 * restored while the app is open, (3) periodically via a background task.
 */

export type QueueStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface QueueItem {
  id: string;
  assignmentId: string;
  sectionKey: string;
  sectionTitle: string;
  localUri: string; // persistent file:// uri (survives restart)
  fileName: string;
  mimeType: string;
  kind: 'photo' | 'video';
  caption: string;
  status: QueueStatus;
  url?: string; // media-library URL once uploaded
  attempts: number;
  createdAt: number;
  // Capture metadata — date/time + GPS location of the moment of capture.
  capturedAt?: number; // epoch ms (falls back to createdAt)
  latitude?: number;
  longitude?: number;
  locationAccuracy?: number; // metres
  locationAddress?: string; // reverse-geocoded place
}

const STORE_KEY = 'inspection_upload_queue_v1';
const QUEUE_DIR = `${FileSystem.documentDirectory}inspection-queue/`;

let queue: QueueItem[] = [];
let loaded = false;
let processing = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function ensureDir() {
  try {
    const info = await FileSystem.getInfoAsync(QUEUE_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  } catch {
    /* ignore */
  }
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(queue));
  } catch {
    /* ignore */
  }
  notify();
}

export async function loadQueue(): Promise<QueueItem[]> {
  if (loaded) return queue;
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    queue = raw ? JSON.parse(raw) : [];
  } catch {
    queue = [];
  }
  // Any item left "uploading" from a killed run goes back to pending.
  queue = queue.map((it) => (it.status === 'uploading' ? { ...it, status: 'pending' } : it));
  loaded = true;
  return queue;
}

export function getItems(): QueueItem[] {
  return queue;
}

export interface AssignmentQueueStatus {
  pending: number;
  uploading: number;
  done: number;
  failed: number;
  items: QueueItem[];
}

export function statusForAssignment(assignmentId: string): AssignmentQueueStatus {
  const items = queue.filter((it) => it.assignmentId === assignmentId);
  return {
    pending: items.filter((i) => i.status === 'pending').length,
    uploading: items.filter((i) => i.status === 'uploading').length,
    done: items.filter((i) => i.status === 'done').length,
    failed: items.filter((i) => i.status === 'failed').length,
    items,
  };
}

/** Copy a freshly captured asset into permanent storage and queue it. */
export async function enqueueCapture(
  params: { assignmentId: string; sectionKey: string; sectionTitle: string },
  asset: CapturedAsset,
): Promise<QueueItem> {
  await loadQueue();
  await ensureDir();

  const isVideo = asset.type === 'video' || (asset.mimeType || '').startsWith('video');
  const ext = (asset.fileName?.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
  const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const dest = `${QUEUE_DIR}${id}.${ext}`;

  let localUri = asset.uri;
  try {
    await FileSystem.copyAsync({ from: asset.uri, to: dest });
    localUri = dest;
  } catch {
    // If the copy fails we still queue the original cache uri (best effort).
    localUri = asset.uri;
  }

  const capturedAt = asset.capturedAt ?? Date.now();
  // Human-readable date/time + location baked into the caption so it always
  // persists and shows on the admin/buyer/vendor order pages.
  const metaSuffix = metaCaptionSuffix({
    capturedAt,
    latitude: asset.latitude,
    longitude: asset.longitude,
    address: asset.locationAddress,
  });

  const item: QueueItem = {
    id,
    assignmentId: params.assignmentId,
    sectionKey: params.sectionKey,
    sectionTitle: params.sectionTitle,
    localUri,
    fileName: asset.fileName || `inspection-${id}.${ext}`,
    mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
    kind: isVideo ? 'video' : 'photo',
    caption: `${params.sectionTitle} — ${isVideo ? 'video' : 'photo'}${metaSuffix}`,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
    capturedAt,
    latitude: asset.latitude,
    longitude: asset.longitude,
    locationAccuracy: asset.locationAccuracy,
    locationAddress: asset.locationAddress,
  };
  queue = [...queue, item];
  await persist();
  return item;
}

async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    // isInternetReachable can be null (unknown) — treat unknown-but-connected as online.
    return !!state.isConnected && state.isInternetReachable !== false;
  } catch {
    // NetInfo native module unavailable (e.g. Expo Go). Be optimistic and let the
    // actual upload decide — a real failure just leaves the item queued to retry.
    return true;
  }
}

/** Upload+attach one item through the existing endpoints. Returns true if done. */
async function processItem(item: QueueItem): Promise<boolean> {
  // Upload to the media library (skip if we already have a URL from a prior
  // partial attempt — only the attach failed last time).
  let url = item.url;
  if (!url) {
    const res = await uploadInspectionMedia(
      [{ uri: item.localUri, fileName: item.fileName, mimeType: item.mimeType, type: item.kind }],
      `inspection-${item.sectionKey}`,
    );
    url = res.uploaded[0]?.url;
    if (!url) return false;
    // Record the URL immediately so a later attach retry won't re-upload.
    item.url = url;
    queue = queue.map((q) => (q.id === item.id ? { ...q, url } : q));
    await persist();
  }

  // Attach to the assignment as a progress update (same as the online path),
  // carrying the capture date/time + GPS location both in the caption (always
  // persists) and as structured fields (stored when the backend supports them).
  const coords =
    typeof item.latitude === 'number' && typeof item.longitude === 'number'
      ? `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`
      : '';
  // Location string stored in the backend's first-class progress location field.
  const locationStr = item.locationAddress
    ? coords
      ? `${item.locationAddress} (${coords})`
      : item.locationAddress
    : coords;
  const locNote = locationStr ? ` at ${locationStr}` : '';
  const attach = () =>
    attachInspectionProgress(
      item.assignmentId,
      [
        {
          url: url as string,
          caption: item.caption,
          capturedAt: item.capturedAt,
          latitude: item.latitude,
          longitude: item.longitude,
          locationAddress: item.locationAddress,
        },
      ],
      `${item.sectionTitle} — 1 ${item.kind} uploaded${locNote}`,
      locationStr || undefined,
    );

  let att = await attach();
  if (!att.ok) {
    // The backend only accepts progress once the job is "in progress" — a fresh
    // assignment is still pending/assigned, which returns 400 "can only be added
    // for work in progress". Advance it (acknowledge → start), then retry once —
    // the same auto-advance the submit flow does. Taking photos == work started.
    try {
      await acknowledgeAssignment(item.assignmentId);
    } catch {
      /* already acknowledged — fine */
    }
    try {
      await startAssignment(item.assignmentId);
    } catch {
      /* already started — fine */
    }
    att = await attach();
  }
  return att.ok;
}

/** Drain all pending/failed items. Safe to call often; only one run at a time. */
export async function processQueue(): Promise<void> {
  await loadQueue();
  if (processing) return;
  const pending = queue.filter((it) => it.status === 'pending' || it.status === 'failed');
  if (pending.length === 0) return;
  if (!(await isOnline())) return;

  processing = true;
  try {
    for (const item of pending) {
      // Refresh from the live array (it may have changed).
      const current = queue.find((q) => q.id === item.id);
      if (!current || current.status === 'done') continue;

      queue = queue.map((q) => (q.id === item.id ? { ...q, status: 'uploading' } : q));
      await persist();

      let ok = false;
      try {
        ok = await processItem(current);
      } catch {
        ok = false;
      }

      queue = queue.map((q) =>
        q.id === item.id
          ? { ...q, status: ok ? 'done' : 'failed', attempts: q.attempts + 1 }
          : q,
      );
      await persist();

      if (ok) {
        // Free the local file once it's safely on the server.
        try {
          if (current.localUri.startsWith(QUEUE_DIR)) {
            await FileSystem.deleteAsync(current.localUri, { idempotent: true });
          }
        } catch {
          /* ignore */
        }
      } else if (!(await isOnline())) {
        // Lost connectivity mid-run — stop; the rest stays pending/failed.
        break;
      }
    }
  } finally {
    processing = false;
    notify();
  }
}

/** Remove the finished (done) items for an assignment from the queue. Call after
 * a successful submit so the badges reset. */
export async function clearDoneForAssignment(assignmentId: string): Promise<void> {
  await loadQueue();
  queue = queue.filter((it) => !(it.assignmentId === assignmentId && it.status === 'done'));
  await persist();
}

let netUnsub: (() => void) | null = null;

/** Start watching connectivity so the queue drains the moment we're back online
 * (while the app is open). Call once at app start. */
export function startConnectivityWatcher() {
  if (netUnsub) return;
  try {
    netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        processQueue();
      }
    });
  } catch {
    // NetInfo unavailable (Expo Go) — foreground drains still fire on app-active
    // and right after each capture; a dev/standalone build gets live detection.
    netUnsub = null;
  }
}
