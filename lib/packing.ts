import { authedFetch } from '@/lib/http';

/**
 * Packing-box registration — same inspection-service endpoints the transportation
 * app uses (src/components/inspection/InspectionOrderDetailBody.tsx):
 *   POST /inspection-service/order-inspections/:inquiryId/boxes
 *   GET  /inspection-service/order-inspections/boxes/by-qr/:code
 * The record is created on first write from the order context (orderId required).
 *
 * QR seal: the inspector scans the sticker already on the box and we send its
 * value as `qrCode`. The backend links that code to the box (one code per box),
 * so anyone can later scan the same sticker to pull up the box details.
 */

export interface BoxPayload {
  length: number;
  width: number;
  height: number;
  unit?: string; // dimension unit (mm/cm)
  weightValue: number;
  weightUnit?: string; // kg
  quantity: number;
  qrCode?: string; // scanned sticker code (optional — auto-generated if absent)
}

export interface OrderContext {
  inquiryId: string;
  orderId?: string;
  orderNumber?: string;
  productName?: string;
  cargoType?: string;
}

export interface SaveBoxResult {
  ok: boolean;
  message: string;
  duplicate?: boolean; // the scanned code is already linked to another box
  box?: any; // the created box (boxNumber, qrCode.code, _id, …)
  code?: string; // the linked QR code
  boxId?: string;
}

export async function saveBox(ctx: OrderContext, box: BoxPayload): Promise<SaveBoxResult> {
  if (!ctx.inquiryId) return { ok: false, message: 'Missing order reference.' };
  let res: Response;
  try {
    res = await authedFetch(
      `/inspection-service/order-inspections/${ctx.inquiryId}/boxes`,
      {
        method: 'POST',
        body: JSON.stringify({
          dimensions: {
            length: box.length,
            width: box.width,
            height: box.height,
            unit: box.unit || 'mm',
          },
          weight: { value: box.weightValue, unit: box.weightUnit || 'kg' },
          quantity: box.quantity,
          qrCode: box.qrCode || undefined,
          cargoType: ctx.cargoType,
          inquiryId: ctx.inquiryId,
          orderId: ctx.orderId,
          orderNumber: ctx.orderNumber,
          productName: ctx.productName,
        }),
      },
    );
  } catch {
    return { ok: false, message: 'Cannot reach the server. Check your internet connection.' };
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (res.status === 409) {
    return {
      ok: false,
      duplicate: true,
      message: data?.message || 'This QR is already linked to another box.',
    };
  }
  const createdBox = data?.box;
  return {
    ok: res.ok,
    message: data?.message || (res.ok ? 'OK' : `Failed (${res.status}).`),
    box: createdBox,
    code: createdBox?.qrCode?.code || box.qrCode,
    boxId: createdBox?._id,
  };
}

/** Delete a box that was already saved to the server (e.g. added by mistake).
 * `orderRef` is the inquiryId (the same id used to save the box). */
export async function deleteBox(
  orderRef: string,
  boxId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!orderRef || !boxId) return { ok: false, message: 'Missing box reference.' };
  let res: Response;
  try {
    res = await authedFetch(
      `/inspection-service/order-inspections/${orderRef}/boxes/${boxId}`,
      { method: 'DELETE' },
    );
  } catch {
    return { ok: false, message: 'Cannot reach the server. Check your internet connection.' };
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: res.ok, message: data?.message || (res.ok ? 'Deleted' : `Failed (${res.status}).`) };
}

export interface LookupResult {
  ok: boolean;
  message: string;
  box?: any;
  order?: any;
}

/** Resolve a box by the scanned sticker code (view flow). */
export async function lookupBoxByQr(code: string): Promise<LookupResult> {
  const clean = String(code || '').trim();
  if (!clean) return { ok: false, message: 'No code scanned.' };
  let res: Response;
  try {
    res = await authedFetch(
      `/inspection-service/order-inspections/boxes/by-qr/${encodeURIComponent(clean)}`,
    );
  } catch {
    return { ok: false, message: 'Cannot reach the server. Check your internet connection.' };
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return {
      ok: false,
      message: data?.message || (res.status === 404 ? 'No box is linked to this QR yet.' : `Failed (${res.status}).`),
    };
  }
  return { ok: true, message: 'OK', box: data?.data?.box, order: data?.data?.order };
}
