import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QrScannerModal } from '@/components/QrScannerModal';
import { QuantitySlider } from '@/components/QuantitySlider';
import { getInspectionRecord } from '@/lib/inspectionMedia';
import { getCaptureMeta, formatCapturedAt } from '@/lib/captureMeta';
import { type InspectionOrder } from '@/lib/orders';
import { deleteBox, saveBox, type BoxPayload, type OrderContext } from '@/lib/packing';
import {
  enqueueCapture,
  processQueue,
  statusForAssignment,
  subscribe,
  type QueueItem,
} from '@/lib/uploadQueue';

const BLUE = '#5B9BD5';
const LABEL = '#6b7680';
const PRODUCT = '#37536b';
const BORDER = '#e3e6ea';

type OrderParam = Omit<InspectionOrder, 'raw'> & { raw?: any };

const CARGO_TYPES = ['Box', 'Carton', 'Pallet', 'Crate', 'Drum', 'Bag', 'Bundle', 'Loose', 'Other'];

function fmtDate(iso: string): string {
  if (!iso) return 'YY-MM-DD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'YY-MM-DD';
  return `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface BoxRow {
  key: string;
  sameAsAbove: boolean;
  length: string;
  width: string;
  height: string;
  weight: string;
  quantity: string;
  grossWeight: string;
  // QR-seal state: set once the box has been scanned + saved to the backend.
  saved?: boolean;
  saving?: boolean;
  qrCode?: string;
  boxId?: string;
}

const newBox = (i: number, sameAsAbove = true): BoxRow => ({
  key: `box-${i}-${Math.round(Math.random() * 1e6)}`,
  sameAsAbove,
  length: '',
  width: '',
  height: '',
  weight: '',
  quantity: '1',
  grossWeight: '',
  saved: false,
  saving: false,
});

export default function PackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order?: string; report?: string }>();

  let order: OrderParam | null = null;
  try {
    order = params.order ? (JSON.parse(params.order) as OrderParam) : null;
  } catch {
    order = null;
  }
  const detailReport = typeof params.report === 'string' ? params.report : '';

  const assignmentId = order?.id || '';
  const inquiryId = order?.inquiryId || '';

  const initialQty = useMemo(() => {
    const n = parseInt(String(order?.quantity || '').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 35;
  }, [order?.quantity]);

  const [cargoType, setCargoType] = useState('Box');
  const [cargoOpen, setCargoOpen] = useState(false);
  const [quantity, setQuantity] = useState(initialQty);
  const [boxes, setBoxes] = useState<BoxRow[]>([
    { ...newBox(0, false), quantity: '1' }, // Box 1 — full dimensions
    newBox(1),
  ]);
  const [haveProblem, setHaveProblem] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // QR scanner (bind mode): scan the sticker on a box → save that box linked to it.
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanForBox, setScanForBox] = useState<number | null>(null);

  // Media capture uses the shared offline queue (survives no-internet, uploads
  // automatically when back online) — same as the inspection detail page.
  const [queueItems, setQueueItems] = useState<QueueItem[]>(
    () => statusForAssignment(assignmentId).items,
  );
  useEffect(() => {
    const sync = () => setQueueItems(statusForAssignment(assignmentId).items);
    sync();
    return subscribe(sync);
  }, [assignmentId]);

  // Reopening an order: load the boxes already saved for this inquiry so the form
  // shows the real data instead of starting empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inquiryId) return;
      const rec = await getInspectionRecord(inquiryId);
      if (cancelled || !rec) return;
      if (rec?.inspectionData?.cargoType) setCargoType(String(rec.inspectionData.cargoType));
      const saved = Array.isArray(rec?.inspectionData?.boxes) ? rec.inspectionData.boxes : [];
      if (!saved.length) return;
      const rows: BoxRow[] = saved.map((b: any, idx: number) => ({
        key: `saved-${b?._id || idx}`,
        sameAsAbove: false, // saved boxes show their own real values
        length: b?.dimensions?.length != null ? String(b.dimensions.length) : '',
        width: b?.dimensions?.width != null ? String(b.dimensions.width) : '',
        height: b?.dimensions?.height != null ? String(b.dimensions.height) : '',
        weight: b?.weight?.value != null ? String(b.weight.value) : '',
        quantity: b?.quantity != null ? String(b.quantity) : '1',
        grossWeight: '',
        saved: true,
        saving: false,
        qrCode: b?.qrCode?.code,
        boxId: b?._id ? String(b._id) : undefined,
      }));
      setBoxes(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [inquiryId]);
  const mediaCount = (key: string) => queueItems.filter((i) => i.sectionKey === key).length;
  // Latest captured photo's date/time + location for a section (confirmation stamp).
  const lastStamp = (key: string) => {
    const last = [...queueItems].reverse().find((i) => i.sectionKey === key && i.capturedAt);
    if (!last) return null;
    const loc =
      last.locationAddress ||
      (typeof last.latitude === 'number' && typeof last.longitude === 'number'
        ? `${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}`
        : null);
    return { when: formatCapturedAt(last.capturedAt!), loc };
  };

  const capture = async (sectionKey: string, sectionTitle: string, video: boolean) => {
    if (!order) return;
    try {
      const useCamera = Platform.OS !== 'web';
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera permission needed', 'Please allow camera access to take inspection photos and videos.');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: video ? ['videos'] : ['images'],
        quality: 0.7,
        videoMaxDuration: 120,
        allowsMultipleSelection: !useCamera && !video,
      };
      const res = useCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.length) return;
      // Stamp every capture with the date/time + GPS location of this moment.
      const meta = await getCaptureMeta();
      for (const a of res.assets) {
        await enqueueCapture(
          { assignmentId: order.id, sectionKey, sectionTitle },
          {
            uri: a.uri,
            fileName: a.fileName,
            mimeType: a.mimeType,
            type: a.type,
            capturedAt: meta.capturedAt,
            latitude: meta.latitude,
            longitude: meta.longitude,
            locationAccuracy: meta.accuracy,
            locationAddress: meta.address,
          },
        );
      }
      processQueue();
    } catch {
      Alert.alert('Could not open the camera', 'Please try again.');
    }
  };

  const updateBox = (key: string, patch: Partial<BoxRow>) =>
    setBoxes((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const addBox = () => setBoxes((bs) => [...bs, newBox(bs.length)]);

  // Remove a box added by mistake. Box 1 stays (it's the base every "same as
  // above" box copies). If the box was already scanned/saved, delete it on the
  // server too.
  const removeBox = (i: number) => {
    const b = boxes[i];
    if (i === 0) return; // never remove the base box
    const doRemove = async () => {
      setBoxes((bs) => bs.filter((x) => x.key !== b.key));
      if (b.saved && b.boxId) {
        const r = await deleteBox(inquiryId, b.boxId);
        if (!r.ok) {
          Alert.alert(
            'Removed from list',
            `Box ${i + 1} was removed here, but could not be deleted on the server: ${r.message}`,
          );
        }
      }
    };
    Alert.alert(`Remove Box ${i + 1}?`, 'This box will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: doRemove },
    ]);
  };

  const makeCtx = (): OrderContext => ({
    inquiryId,
    orderId: order?.orderId || undefined,
    orderNumber: order?.orderNumber || undefined,
    productName: order?.product || undefined,
    cargoType,
  });

  // Build the payload for box `i`.
  //  • Box 1, or any box with "Same as above" UNticked → uses its OWN fields.
  //  • Box 2+ with "Same as above" ticked → auto-fills EVERYTHING (size, weight,
  //    quantity) from Box 1, live. Returns null when the source measurements
  //    aren't filled yet.
  const buildBoxPayload = (i: number): BoxPayload | null => {
    const first = boxes[0];
    const b = boxes[i];
    const inherit = i > 0 && b.sameAsAbove;
    const src = inherit ? first : b;
    const L = Number(src.length);
    const W = Number(src.width);
    const H = Number(src.height);
    const wt = Number(src.weight);
    const qty = Number(src.quantity) || 1;
    if (!(L > 0 && W > 0 && H > 0 && wt > 0)) return null;
    return {
      length: L,
      width: W,
      height: H,
      unit: 'mm',
      weightValue: wt,
      weightUnit: 'kg',
      quantity: qty,
    };
  };

  // Tap the scanner on a box → validate its measurements, then open the camera.
  const handleScanBox = (i: number) => {
    if (!order) return;
    const b = boxes[i];
    if (b.saved) {
      Alert.alert('Already linked', `Box ${i + 1} is already linked to a sticker.`);
      return;
    }
    if (!buildBoxPayload(i)) {
      Alert.alert(
        'Box 1 measurements needed',
        'Enter Length, Width, Height and Weight for Box 1 before scanning a sticker.',
      );
      return;
    }
    setScanForBox(i);
    setScannerOpen(true);
  };

  // Camera returned a code → save that box, linked to the scanned sticker.
  const onBoxScanned = async (code: string) => {
    setScannerOpen(false);
    const i = scanForBox;
    setScanForBox(null);
    if (i == null || !order) return;
    const payload = buildBoxPayload(i);
    if (!payload) return;

    setBoxes((bs) => bs.map((b, idx) => (idx === i ? { ...b, saving: true } : b)));
    const r = await saveBox(makeCtx(), { ...payload, qrCode: code });
    setBoxes((bs) =>
      bs.map((b, idx) =>
        idx === i
          ? {
              ...b,
              saving: false,
              saved: r.ok ? true : b.saved,
              qrCode: r.ok ? r.code || code : b.qrCode,
              boxId: r.ok ? r.boxId : b.boxId,
            }
          : b,
      ),
    );

    if (r.ok) {
      Alert.alert('Box linked', `Box ${i + 1} is now linked to sticker:\n${r.code || code}`);
    } else if (r.duplicate) {
      Alert.alert('QR already used', r.message);
    } else {
      Alert.alert('Could not link box', r.message);
    }
  };

  const onSubmit = async () => {
    if (!order) return;
    if (!buildBoxPayload(0)) {
      Alert.alert(
        'Box 1 measurements needed',
        'Please enter Length, Width, Height and Weight for Box 1.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const ctx = makeCtx();
      // Save any boxes not already linked via a QR scan — a scanned box was saved
      // the moment its sticker was scanned, so re-saving here would duplicate it.
      let okAll = true;
      const savedIdx: Record<number, { code?: string; boxId?: string }> = {};
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].saved) continue;
        const payload = buildBoxPayload(i);
        if (!payload) continue;
        const r = await saveBox(ctx, payload);
        okAll = okAll && r.ok;
        if (r.ok) savedIdx[i] = { code: r.code, boxId: r.boxId };
      }
      if (Object.keys(savedIdx).length) {
        setBoxes((bs) =>
          bs.map((b, idx) =>
            savedIdx[idx]
              ? { ...b, saved: true, qrCode: b.qrCode || savedIdx[idx].code, boxId: savedIdx[idx].boxId }
              : b,
          ),
        );
      }

      if (!okAll) {
        Alert.alert(
          'Partly saved',
          'Some boxes could not be saved. Please check your connection and try again.',
        );
        return;
      }

      // Boxes are saved. Move on to the Documents step, where the inspector
      // attaches the trade documents and does the final submit-for-review.
      const summary = [
        `Inspection report — Order ${order.orderNumber}`,
        detailReport,
        `Packing: ${cargoType}, total qty ${quantity}, ${boxes.length} box(es).` +
          (haveProblem ? ' ⚠ PROBLEM REPORTED.' : ''),
        notes.trim() ? `Notes: ${notes.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      processQueue(); // keep uploading any captured box photos in the background

      const { raw, ...orderRest } = order;
      router.push({
        pathname: '/documents',
        params: { order: JSON.stringify(orderRest), report: summary },
      });
    } catch {
      Alert.alert('Could not continue', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFill}>
          <Text style={{ color: LABEL }}>Order not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const thumb = order.images[0];
  const strip = order.images.length ? order.images.slice(0, 6) : [null, null, null, null, null, null];

  const MediaButtons = ({
    sectionKey,
    sectionTitle,
    onScan,
    linked,
  }: {
    sectionKey: string;
    sectionTitle: string;
    onScan?: () => void;
    linked?: boolean;
  }) => {
    const stamp = lastStamp(sectionKey);
    return (
    <View>
    <View style={styles.mediaRow}>
      <TouchableOpacity style={styles.lightBtn} activeOpacity={0.8} onPress={() => capture(sectionKey, sectionTitle, true)}>
        <Text style={styles.lightBtnText}>Start Video</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.lightBtn} activeOpacity={0.8} onPress={() => capture(sectionKey, sectionTitle, false)}>
        <Text style={styles.lightBtnText}>Take Photos</Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }} />
      {mediaCount(sectionKey) > 0 ? (
        <Text style={styles.mediaCount}>{mediaCount(sectionKey)} media</Text>
      ) : null}
      {onScan ? (
        <TouchableOpacity
          style={[styles.scanBtn, linked && styles.scanBtnLinked]}
          activeOpacity={0.8}
          onPress={onScan}>
          <Ionicons
            name={linked ? 'checkmark-circle' : 'qr-code-outline'}
            size={18}
            color={linked ? '#00a651' : PRODUCT}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.scanBtn}>
          <Ionicons name="qr-code-outline" size={18} color={PRODUCT} />
        </View>
      )}
    </View>
    {stamp ? (
      <View style={styles.stampBox}>
        <View style={styles.stampRow}>
          <Ionicons name="time-outline" size={13} color={BLUE} />
          <Text style={styles.stampText}>{stamp.when}</Text>
        </View>
        <View style={styles.stampRow}>
          <Ionicons name="location-outline" size={13} color={BLUE} />
          <Text style={styles.stampText}>{stamp.loc || 'Location not available'}</Text>
        </View>
      </View>
    ) : null}
    </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={PRODUCT} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Inspection</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ===== Order card ===== */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.ph]}>
                <Ionicons name="image-outline" size={22} color="#c4ced8" />
              </View>
            )}
            <View style={styles.info}>
              <Text style={styles.infoLine}>Order No. {order.orderNumber}</Text>
              <Text style={styles.infoLine}>Sample No.: {order.sampleNumber}</Text>
              <Text style={styles.productName} numberOfLines={2}>
                {order.product}
              </Text>
            </View>
          </View>
          <Text style={styles.metaText}>
            Qty.: {order.quantity || '0,000'} Pcs. {order.target ? `/ ${order.target}` : ''}
          </Text>
          {order.labTest ? <Text style={styles.metaText}>Lab Test: {order.labTest}</Text> : null}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaText}>Order Date: {fmtDate(order.orderDate)}</Text>
              <Text style={styles.metaText}>Complition Date: {fmtDate(order.completionDate)}</Text>
            </View>
            <TouchableOpacity
              style={styles.contractBtn}
              activeOpacity={0.85}
              onPress={() => Alert.alert('Order Contract', 'The order contract will be available here soon.')}>
              <Text style={styles.contractText}>Order Contract</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
            {strip.map((img, i) =>
              img ? (
                <Image key={i} source={{ uri: img }} style={styles.stripImg} contentFit="cover" />
              ) : (
                <View key={i} style={[styles.stripImg, styles.ph]}>
                  <Ionicons name="image-outline" size={16} color="#c4ced8" />
                </View>
              ),
            )}
          </ScrollView>
        </View>

        {/* ===== Quantity slider ===== */}
        <Text style={styles.sliderLabel}>Quantity:</Text>
        <QuantitySlider value={quantity} min={0} max={100} onChange={setQuantity} color={BLUE} />

        {/* ===== Cargo type ===== */}
        <Text style={styles.sectionHeading}>1. Select cargo Type</Text>
        <TouchableOpacity style={styles.dropdown} activeOpacity={0.8} onPress={() => setCargoOpen(true)}>
          <Text style={styles.dropdownText}>{cargoType}</Text>
          <Ionicons name="chevron-down" size={18} color={LABEL} />
        </TouchableOpacity>

        {/* ===== Boxes ===== */}
        {boxes.map((b, i) => (
          <View key={b.key} style={styles.boxBlock}>
            <View style={styles.boxHeaderRow}>
              <Text style={styles.boxTitle}>Box {i + 1}</Text>
              {i > 0 ? (
                <View style={styles.boxHeaderActions}>
                  <TouchableOpacity onPress={() => removeBox(i)} hitSlop={8} accessibilityLabel={`Remove Box ${i + 1}`}>
                    <Ionicons name="trash-outline" size={18} color="#e06666" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={addBox} hitSlop={8}>
                    <Text style={styles.addNew}>Add New</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {i === 0 ? (
              <>
                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Length</Text>
                    <View style={styles.unitInput}>
                      <TextInput style={styles.input} keyboardType="number-pad" value={b.length} onChangeText={(t) => updateBox(b.key, { length: t })} placeholder="100" placeholderTextColor="#c4ced8" />
                      <Text style={styles.unit}>mm</Text>
                    </View>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Width</Text>
                    <View style={styles.unitInput}>
                      <TextInput style={styles.input} keyboardType="number-pad" value={b.width} onChangeText={(t) => updateBox(b.key, { width: t })} placeholder="100" placeholderTextColor="#c4ced8" />
                      <Text style={styles.unit}>mm</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Height</Text>
                    <View style={styles.unitInput}>
                      <TextInput style={styles.input} keyboardType="number-pad" value={b.height} onChangeText={(t) => updateBox(b.key, { height: t })} placeholder="100" placeholderTextColor="#c4ced8" />
                      <Text style={styles.unit}>mm</Text>
                    </View>
                  </View>
                  <View style={styles.col} />
                </View>
                <View style={styles.twoCol}>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Weight</Text>
                    <View style={styles.unitInput}>
                      <TextInput style={styles.input} keyboardType="number-pad" value={b.weight} onChangeText={(t) => updateBox(b.key, { weight: t })} placeholder="1" placeholderTextColor="#c4ced8" />
                      <Text style={styles.unit}>Kg</Text>
                    </View>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Quantity</Text>
                    <View style={styles.unitInput}>
                      <TextInput style={styles.input} keyboardType="number-pad" value={b.quantity} onChangeText={(t) => updateBox(b.key, { quantity: t })} placeholder="1" placeholderTextColor="#c4ced8" />
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.checkRow} activeOpacity={0.8} onPress={() => updateBox(b.key, { sameAsAbove: !b.sameAsAbove })}>
                  <View style={[styles.checkbox, b.sameAsAbove && styles.checkboxOn]}>
                    {b.sameAsAbove ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                  </View>
                  <Text style={styles.checkLabel}>Same as above</Text>
                </TouchableOpacity>

                {b.sameAsAbove ? (
                  // Same design as Box 1 — the inputs just show Box 1's values,
                  // read-only (they mirror Box 1 while "Same as above" is on).
                  <>
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Length</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} editable={false} value={boxes[0].length} placeholder="100" placeholderTextColor="#c4ced8" />
                          <Text style={styles.unit}>mm</Text>
                        </View>
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Width</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} editable={false} value={boxes[0].width} placeholder="100" placeholderTextColor="#c4ced8" />
                          <Text style={styles.unit}>mm</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Height</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} editable={false} value={boxes[0].height} placeholder="100" placeholderTextColor="#c4ced8" />
                          <Text style={styles.unit}>mm</Text>
                        </View>
                      </View>
                      <View style={styles.col} />
                    </View>
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Weight</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} editable={false} value={boxes[0].weight} placeholder="1" placeholderTextColor="#c4ced8" />
                          <Text style={styles.unit}>Kg</Text>
                        </View>
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Quantity</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} editable={false} value={boxes[0].quantity} placeholder="1" placeholderTextColor="#c4ced8" />
                        </View>
                      </View>
                    </View>
                  </>
                ) : (
                  // Custom measurements for this box.
                  <>
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Length</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} keyboardType="number-pad" value={b.length} onChangeText={(t) => updateBox(b.key, { length: t })} placeholder="100" placeholderTextColor="#c4ced8" />
                          <Text style={styles.unit}>mm</Text>
                        </View>
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Width</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} keyboardType="number-pad" value={b.width} onChangeText={(t) => updateBox(b.key, { width: t })} placeholder="100" placeholderTextColor="#c4ced8" />
                          <Text style={styles.unit}>mm</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Height</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} keyboardType="number-pad" value={b.height} onChangeText={(t) => updateBox(b.key, { height: t })} placeholder="100" placeholderTextColor="#c4ced8" />
                          <Text style={styles.unit}>mm</Text>
                        </View>
                      </View>
                      <View style={styles.col} />
                    </View>
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Weight</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} keyboardType="number-pad" value={b.weight} onChangeText={(t) => updateBox(b.key, { weight: t })} placeholder="1" placeholderTextColor="#c4ced8" />
                          <Text style={styles.unit}>Kg</Text>
                        </View>
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.fieldLabel}>Quantity</Text>
                        <View style={styles.unitInput}>
                          <TextInput style={styles.input} keyboardType="number-pad" value={b.quantity} onChangeText={(t) => updateBox(b.key, { quantity: t })} placeholder="1" placeholderTextColor="#c4ced8" />
                        </View>
                      </View>
                    </View>
                  </>
                )}
              </>
            )}

            <MediaButtons
              sectionKey={`box-${i + 1}`}
              sectionTitle={`Box ${i + 1}`}
              onScan={() => handleScanBox(i)}
              linked={b.saved}
            />
            {b.saving ? (
              <View style={styles.linkedRow}>
                <ActivityIndicator size="small" color={BLUE} />
                <Text style={styles.linkingText}>Linking box…</Text>
              </View>
            ) : b.saved ? (
              <View style={styles.linkedRow}>
                <Ionicons name="checkmark-circle" size={15} color="#00a651" />
                <Text style={styles.linkedText}>Linked to sticker</Text>
              </View>
            ) : (
              <Text style={styles.scanHint}>
                Fill the details, then tap the QR button to scan this box&apos;s sticker.
              </Text>
            )}
          </View>
        ))}

        <View style={styles.divider} />

        {/* ===== Have Problem ===== */}
        <TouchableOpacity style={styles.problemRow} activeOpacity={0.8} onPress={() => setHaveProblem((v) => !v)}>
          <View style={[styles.checkbox, haveProblem && styles.checkboxOn]}>
            {haveProblem ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
          </View>
          <Text style={styles.problemText}>Have Problem?</Text>
        </TouchableOpacity>

        {/* ===== Notes ===== */}
        <Text style={styles.notesLabel}>Notes:</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Write your inspection notes…"
          placeholderTextColor="#9aa4ad"
          multiline
          value={notes}
          onChangeText={setNotes}
        />
        <MediaButtons sectionKey="notes" sectionTitle="Notes" />

        {/* ===== Submit ===== */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={submitting}
          activeOpacity={0.85}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* ===== Cargo type picker ===== */}
      <Modal visible={cargoOpen} transparent animationType="fade" onRequestClose={() => setCargoOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCargoOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select cargo type</Text>
            {CARGO_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.modalItem}
                onPress={() => {
                  setCargoType(t);
                  setCargoOpen(false);
                }}>
                <Text style={[styles.modalItemText, t === cargoType && { color: BLUE, fontWeight: '700' }]}>{t}</Text>
                {t === cargoType ? <Ionicons name="checkmark" size={18} color={BLUE} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ===== QR scanner (link a box to its sticker) ===== */}
      <QrScannerModal
        visible={scannerOpen}
        title={scanForBox != null ? `Scan sticker — Box ${scanForBox + 1}` : 'Scan box sticker'}
        subtitle="Point the camera at the sticker on this box to link it."
        onClose={() => {
          setScannerOpen(false);
          setScanForBox(null);
        }}
        onScanned={onBoxScanned}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  topTitle: { fontSize: 16, fontWeight: '700', color: PRODUCT },
  scroll: { paddingHorizontal: 16, paddingBottom: 30 },

  card: { backgroundColor: '#f6f7f9', borderRadius: 10, borderWidth: 1, borderColor: '#eceef1', padding: 12 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#f1f2f4' },
  ph: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  infoLine: { fontSize: 12.5, color: LABEL },
  productName: { fontSize: 13.5, color: PRODUCT, fontWeight: '600', marginTop: 2 },
  metaText: { fontSize: 12.5, color: LABEL, marginTop: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  contractBtn: { backgroundColor: BLUE, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  contractText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  strip: { marginTop: 12 },
  stripContent: { gap: 8, paddingRight: 4 },
  stripImg: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#f1f2f4' },

  sliderLabel: { fontSize: 13, color: PRODUCT, fontWeight: '600', marginTop: 18 },

  sectionHeading: { fontSize: 15, fontWeight: '700', color: PRODUCT, marginTop: 16, marginBottom: 10 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: BORDER, borderRadius: 8, height: 48, paddingHorizontal: 14 },
  dropdownText: { fontSize: 14.5, color: '#2b3138' },

  boxBlock: { marginTop: 18 },
  boxHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  boxHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  boxTitle: { fontSize: 15, fontWeight: '700', color: PRODUCT },
  addNew: { color: BLUE, fontSize: 13, fontWeight: '600' },

  twoCol: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  col: { flex: 1 },
  fieldLabel: { fontSize: 12.5, color: PRODUCT, marginBottom: 6 },
  unitInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BORDER, borderRadius: 8, height: 48, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 14.5, color: '#2b3138', height: 48 },
  unit: { fontSize: 12.5, color: '#9aa4ad' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  checkLabel: { fontSize: 13, color: PRODUCT },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: '#c4ced8', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: BLUE, borderColor: BLUE },

  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  stampBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f4f8fc',
    borderWidth: 1,
    borderColor: '#e3edf6',
    gap: 3,
  },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stampText: { color: '#37536b', fontSize: 11.5, flexShrink: 1 },
  lightBtn: { backgroundColor: '#eaf3fb', borderRadius: 7, paddingHorizontal: 14, paddingVertical: 8 },
  lightBtnText: { color: BLUE, fontSize: 12.5, fontWeight: '600' },
  mediaCount: { color: '#00a651', fontSize: 12, fontWeight: '600', marginRight: 6 },
  scanBtn: { width: 38, height: 34, borderRadius: 7, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  scanBtnLinked: { borderColor: '#00a651', backgroundColor: '#eafaf0' },

  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  linkedText: { color: '#00a651', fontSize: 12.5, fontWeight: '600' },
  linkingText: { color: BLUE, fontSize: 12.5, fontWeight: '600' },
  scanHint: { color: '#9aa4ad', fontSize: 11.5, marginTop: 8 },

  divider: { height: 1, backgroundColor: '#eceef1', marginVertical: 20 },

  problemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  problemText: { fontSize: 15, fontWeight: '700', color: PRODUCT },

  notesLabel: { fontSize: 12.5, color: LABEL, marginTop: 14, marginBottom: 6 },
  notesInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, minHeight: 70, padding: 12, fontSize: 13, color: '#2b3138', textAlignVertical: 'top' },

  submitBtn: { backgroundColor: BLUE, borderRadius: 8, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 30 },
  modalTitle: { fontSize: 14, fontWeight: '700', color: PRODUCT, marginBottom: 8 },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f2f4' },
  modalItemText: { fontSize: 15, color: '#2b3138' },
});
