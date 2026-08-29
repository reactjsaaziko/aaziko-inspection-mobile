import { authedFetch } from '@/lib/http';

/** Backend flow for an assignment: acknowledge → start → submit-for-review.
 * The submit endpoint requires status 'in_progress' and a summary. */

async function post(path: string, body?: any): Promise<{ ok: boolean; message: string }> {
  let res: Response;
  try {
    res = await authedFetch(path, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
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

export async function acknowledgeAssignment(id: string) {
  return post(`/service-provider/work/assignments/${id}/acknowledge`);
}

/** Decline a newly-assigned task — it goes back to admin to reassign. */
export async function declineAssignment(id: string, reason?: string) {
  return post(`/service-provider/work/assignments/${id}/decline`, reason ? { reason } : {});
}

export async function startAssignment(id: string) {
  return post(`/service-provider/work/assignments/${id}/start`);
}

export interface CompletionImage {
  url: string;
  caption?: string;
  beforeAfter?: 'before' | 'after' | 'during';
}

/** Submit the finished inspection. Auto-advances the assignment through
 * acknowledge/start first, so a fresh job can be submitted in one tap.
 *
 * `completionImages` are the photos/videos captured during the inspection (their
 * hosted media-library URLs). They're saved on the assignment's completionReport
 * so the admin review screen shows the evidence, mirroring the transportation
 * submit flow. */
export async function submitInspection(
  id: string,
  summary: string,
  completionImages: CompletionImage[] = [],
): Promise<{ ok: boolean; message: string }> {
  const body = completionImages.length ? { summary, completionImages } : { summary };
  const trySubmit = () => post(`/service-provider/work/assignments/${id}/submit`, body);

  let res = await trySubmit();
  if (res.ok) return res;

  // Not in progress yet — advance the status chain and retry once.
  await acknowledgeAssignment(id);
  await startAssignment(id);
  res = await trySubmit();
  return res;
}
