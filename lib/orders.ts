import { getStoredUser } from '@/lib/auth';
import { authedFetch } from '@/lib/http';

export interface InspectionOrder {
  id: string;
  orderNumber: string;
  sampleNumber: string;
  // Cross-service references used to look up the shared inspection record and
  // packing boxes (same identifiers the transportation app uses).
  inquiryId: string;
  orderId: string;
  product: string;
  quantity: string;
  target: string;
  labTest: string;
  orderDate: string; // raw ISO or ''
  completionDate: string; // raw ISO or ''
  code: string;
  status: string; // work-assignment status (pending_review/completed/… )
  images: string[];
  // Vendor (seller) contact — only present when the request carried the seller's
  // phone (buyer inspection form). Auto-created sample-approval requests have no
  // seller block, so vendorPhone is '' there and the Call button is hidden.
  vendorName: string;
  vendorPhone: string; // dial-ready ('' when we have no vendor number)
  location: {
    address: string;
    city: string;
    state: string;
    country: string;
    latitude?: number;
    longitude?: number;
  };
  raw: any;
}

/** A location is "real" (mappable) when it has coordinates, or a non-placeholder
 * address/city we can geocode. */
export function hasRealLocation(loc: InspectionOrder['location']): boolean {
  if (loc.latitude != null && loc.longitude != null) return true;
  const bad = (v: string) => !v || ['n/a', 'to be confirmed', '-'].includes(v.trim().toLowerCase());
  return !bad(loc.address) || !bad(loc.city);
}

/** Build a geocodable address string from the order location (drops placeholders). */
export function locationQuery(loc: InspectionOrder['location']): string {
  const bad = (v: string) => !v || ['n/a', 'to be confirmed', '-'].includes(v.trim().toLowerCase());
  return [loc.address, loc.city, loc.state, loc.country].filter((v) => !bad(v)).join(', ');
}

/** Broader fallback (city/state/country only) for when a specific street address
 * doesn't geocode. */
export function broadLocationQuery(loc: InspectionOrder['location']): string {
  const bad = (v: string) => !v || ['n/a', 'to be confirmed', '-'].includes(v.trim().toLowerCase());
  return [loc.city, loc.state, loc.country].filter((v) => !bad(v)).join(', ');
}

/** Statuses where the inspector's work is finished — reopening should show a
 * read-only completed view, NOT the editable process. `revision_requested` is
 * deliberately excluded (the inspector must be able to redo it). */
export const DONE_STATUSES = ['pending_review', 'completed', 'cancelled'];
export function isInspectionDone(status?: string): boolean {
  return DONE_STATUSES.includes(String(status || '').toLowerCase());
}

/** A newly-assigned task the provider hasn't accepted yet — needs Accept/Decline. */
export function isPendingAssignment(status?: string): boolean {
  return ['pending', 'assigned'].includes(String(status || '').toLowerCase());
}

export type OrdersResult =
  | { ok: true; orders: InspectionOrder[] }
  | { ok: false; error: string; sessionExpired?: boolean };

function pick(...vals: any[]): any {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** Normalize a raw phone value into a dial-ready string, or '' if it isn't a
 * real number. Keeps a leading '+' and digits (spaces stripped); rejects
 * placeholders like 'N/A' or '-' and anything with fewer than 6 digits. */
function normalizePhone(...vals: any[]): string {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const raw = String(v).trim();
    if (!raw) continue;
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 6) continue;
    const plus = raw.trim().startsWith('+') ? '+' : '';
    return plus + digits;
  }
  return '';
}

function collectImages(...sources: any[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    if (!s) continue;
    const arr = Array.isArray(s) ? s : [s];
    for (const item of arr) {
      const url = typeof item === 'string' ? item : item?.url || item?.uri || item?.src;
      // De-dup so the product photo (which is also stored in referenceImages)
      // doesn't appear twice in the strip.
      if (url && !seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
  }
  return out;
}

/** Map a raw work-assignment into the fields the Orders card shows. Defensive: the
 * exact backend field names vary, so we try several paths and fall back gracefully. */
function mapOrder(wa: any): InspectionOrder {
  const ri = wa?.requesterInfo || {};
  const cargo = ri?.cargo || wa?.cargo || {};
  const delivery = ri?.delivery || {};
  return {
    id: String(wa?._id || wa?.id || ''),
    orderNumber: String(pick(ri.orderNumber, wa?.orderNumber, wa?.assignmentId, wa?._id) ?? '—'),
    // Real sample reference the admin attached (sampleId), not the internal inquiry id.
    sampleNumber: String(pick(ri.sampleId, ri.sampleNumber, wa?.sampleNumber) ?? '—'),
    inquiryId: String(pick(ri.inquiryId, wa?.inquiryId) ?? ''),
    orderId: String(pick(ri.orderId, wa?.orderId) ?? ''),
    product: String(pick(cargo.product, wa?.product, wa?.title) ?? 'Inspection Job'),
    // Piece quantity is not on the assignment (it lives on the order); only show
    // a real value if one exists — never a fake "0,000".
    quantity: String(pick(delivery.containerQuantity, cargo.quantity, wa?.quantity) ?? ''),
    target: String(pick(cargo.targetQuantity, wa?.targetQuantity) ?? ''),
    labTest: String(pick(wa?.labTest, cargo.labTest) ?? ''),
    orderDate: String(pick(wa?.createdAt, wa?.orderDate) ?? ''),
    completionDate: String(pick(wa?.dueDate, wa?.completionDate, wa?.assignedAt) ?? ''),
    code: String(pick(cargo.hsCode, ri.orderNumber) ?? ''),
    status: String(pick(wa?.status) ?? ''),
    // Vendor contact — the seller (vendor) phone the buyer supplied. Defensive
    // across a couple of field spellings; '' when the order has no vendor number.
    vendorName: String(pick(ri?.seller?.fullName, ri?.seller?.companyName) ?? ''),
    vendorPhone: normalizePhone(
      ri?.seller?.phone,
      ri?.seller?.mobile,
      ri?.seller?.phoneNumber,
      wa?.seller?.phone,
    ),
    // Real product photos, most-relevant first so images[0] is the card thumbnail:
    //   1. requesterInfo.productPhoto  — the buyer-form / auto-request main photo
    //   2. referenceImages[]           — admin-attached reference photos (Job Assign)
    //   3. cargo.images / documents / attachments — any other attached media
    // referenceImages is the canonical admin image array; it was previously missed,
    // so admin-assigned jobs never showed a photo even when one was attached.
    images: collectImages(
      ri.productPhoto,
      wa?.referenceImages,
      cargo.images,
      ri.documents,
      wa?.images,
      wa?.attachments,
      wa?.photos,
    ),
    // Vendor factory location — comes from the assignment's location (copied from the
    // vendor's factory address at order creation), falling back to the seller address.
    location: {
      address: String(pick(wa?.location?.address, ri?.seller?.address) ?? ''),
      city: String(pick(wa?.location?.city, ri?.seller?.city) ?? ''),
      state: String(pick(wa?.location?.state, ri?.seller?.state) ?? ''),
      country: String(pick(wa?.location?.country, ri?.seller?.country) ?? ''),
      latitude: wa?.location?.coordinates?.latitude ?? undefined,
      longitude: wa?.location?.coordinates?.longitude ?? undefined,
    },
    raw: wa,
  };
}

/** Fetch the logged-in inspection provider's orders from the same backend the
 * Transportation app uses. */
export async function getInspectionOrders(): Promise<OrdersResult> {
  const user = await getStoredUser();
  const serviceProviderId = user?.serviceProviderId || user?.id || (user as any)?._id;

  if (!serviceProviderId) {
    // Keep the user logged in — don't force the login page (rare edge case).
    return { ok: false, error: 'Could not read your account. Pull down to retry.' };
  }

  const path = `/service-provider/work/service-providers/${serviceProviderId}/assignments?serviceType=Inspection`;

  let res: Response;
  try {
    res = await authedFetch(path);
  } catch {
    return { ok: false, error: 'Cannot reach the server. Check your internet connection.' };
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }

  // Don't log the user out on a 401 — keep the stored session so the login page
  // never reappears. They stay logged in until they tap Log out or reinstall.
  // (Access tokens expire hourly; renewal is handled by http.ts / re-login.)
  if (res.status === 401) {
    return { ok: false, error: 'Could not refresh right now. Pull down to retry.' };
  }

  if (!res.ok) {
    return { ok: false, error: body?.message || `Could not load orders (${res.status}).` };
  }

  const arr = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return { ok: true, orders: arr.map(mapOrder) };
}
