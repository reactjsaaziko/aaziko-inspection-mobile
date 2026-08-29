import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  acknowledgeAssignment,
  startAssignment,
  submitInspection,
  type CompletionImage,
} from '@/lib/inspection';
import { type InspectionOrder } from '@/lib/orders';
import {
  clearDoneForAssignment,
  enqueueCapture,
  processQueue,
  statusForAssignment,
  subscribe,
  type QueueItem,
} from '@/lib/uploadQueue';
import { getCaptureMeta, formatCapturedAt } from '@/lib/captureMeta';

const BLUE = '#5B9BD5';
const LABEL = '#6b7680';
const PRODUCT = '#37536b';
const BORDER = '#e3e6ea';

type OrderParam = Omit<InspectionOrder, 'raw'> & { raw?: any };

// The trade documents an inspector attaches, in order.
const DOC_TYPES = [
  { key: 'commercial-invoice', label: 'Commercial Invoice' },
  { key: 'packing-list', label: 'Packing List' },
  { key: 'shipping-bill', label: 'Shipping Bill' },
  { key: 'bill-of-lading', label: 'Bill of Lading' },
];

function fmtDate(iso: string): string {
  if (!iso) return 'YY-MM-DD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'YY-MM-DD';
  return `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DocumentsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order?: string; report?: string }>();

  let order: OrderParam | null = null;
  try {
    order = params.order ? (JSON.parse(params.order) as OrderParam) : null;
  } catch {
    order = null;
  }
  const report = typeof params.report === 'string' ? params.report : '';
  const assignmentId = order?.id || '';

  const [submitting, setSubmitting] = useState(false);

  // Reuse the shared offline upload queue (same as packing / detail).
  const [queueItems, setQueueItems] = useState<QueueItem[]>(
    () => statusForAssignment(assignmentId).items,
  );
  useEffect(() => {
    const sync = () => setQueueItems(statusForAssignment(assignmentId).items);
    sync();
    return subscribe(sync);
  }, [assignmentId]);
  const docCount = (key: string) => queueItems.filter((i) => i.sectionKey === `doc-${key}`).length;
  // Latest capture's date/time + location for a document (confirmation stamp).
  const docStamp = (key: string) => {
    const last = [...queueItems]
      .reverse()
      .find((i) => i.sectionKey === `doc-${key}` && i.capturedAt);
    if (!last) return null;
    const loc =
      last.locationAddress ||
      (typeof last.latitude === 'number' && typeof last.longitude === 'number'
        ? `${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}`
        : null);
    return { when: formatCapturedAt(last.capturedAt!), loc };
  };

  // Take a photo of a document with the camera.
  const takePhoto = async (key: string, label: string) => {
    if (!order) return;
    try {
      const useCamera = Platform.OS !== 'web';
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera permission needed', 'Please allow camera access to photograph documents.');
          return;
        }
      }
      const res = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true });
      if (res.canceled || !res.assets?.length) return;
      // Stamp the document photo with the date/time + GPS location of capture.
      const meta = await getCaptureMeta();
      for (const a of res.assets) {
        await enqueueCapture(
          { assignmentId: order.id, sectionKey: `doc-${key}`, sectionTitle: label },
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

  // Pick a file (PDF / image) from the device.
  const uploadFile = async (key: string, label: string) => {
    if (!order) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.length) return;
      // Stamp the uploaded file with the date/time + GPS location of upload.
      const meta = await getCaptureMeta();
      for (const a of res.assets) {
        await enqueueCapture(
          { assignmentId: order.id, sectionKey: `doc-${key}`, sectionTitle: label },
          {
            uri: a.uri,
            fileName: a.name,
            mimeType: a.mimeType,
            type: 'document',
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
      Alert.alert('Could not open files', 'Please try again.');
    }
  };

  const onSubmit = async () => {
    if (!order) return;
    setSubmitting(true);
    try {
      // 1. Move the job to "in progress" FIRST. The backend only accepts document
      //    uploads and the final submit once work has started. These no-op safely
      //    if the job is already further along.
      await acknowledgeAssignment(order.id);
      await startAssignment(order.id);

      // 2. Finish uploading the captured documents so they attach as evidence
      //    (done in order, not racing the submit).
      await processQueue();

      // 3. Everything uploaded for this job (box photos + documents) becomes the
      //    completion evidence.
      const done = statusForAssignment(order.id).items.filter((i) => i.status === 'done' && i.url);
      const completionImages: CompletionImage[] = done.map((m) => ({
        url: m.url as string,
        caption: m.caption,
        beforeAfter: 'during' as const,
      }));

      const docNote = DOC_TYPES.map((d) => ({ d, n: docCount(d.key) }))
        .filter((x) => x.n > 0)
        .map((x) => `${x.d.label}: ${x.n} file(s)`)
        .join(', ');
      // Never send an empty summary — the backend requires one.
      const summary =
        [report, docNote ? `Documents — ${docNote}` : ''].filter(Boolean).join('\n') ||
        `Inspection documents — Order ${order.orderNumber}`;

      // 4. Submit for review.
      const sres = await submitInspection(order.id, summary, completionImages);

      if (sres.ok) {
        await clearDoneForAssignment(order.id);
        Alert.alert('Submitted', 'Your inspection was sent for review.', [
          { text: 'OK', onPress: () => router.replace('/orders') },
        ]);
      } else {
        // A job already sent for review can't be submitted again — say so plainly.
        const already = /work in progress/i.test(sres.message);
        Alert.alert(
          already ? 'Already submitted' : 'Could not submit',
          already
            ? 'This order has already been submitted for review.'
            : sres.message,
          [{ text: 'OK', onPress: already ? () => router.replace('/orders') : undefined }],
        );
      }
    } catch {
      Alert.alert('Could not submit', 'Something went wrong. Please try again.');
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

        {/* ===== Documents header ===== */}
        <View style={styles.sectionBar}>
          <Text style={styles.sectionBarText}>Documents</Text>
        </View>

        {/* ===== Document rows ===== */}
        {DOC_TYPES.map((d) => {
          const n = docCount(d.key);
          const stamp = docStamp(d.key);
          return (
            <View key={d.key}>
            <View style={styles.docRow}>
              <View style={styles.docLeft}>
                <Ionicons name="document-text-outline" size={17} color={PRODUCT} />
                <Text style={styles.docLabel}>{d.label}</Text>
                {n > 0 ? (
                  <View style={styles.badge}>
                    <Ionicons name="checkmark" size={11} color="#fff" />
                    <Text style={styles.badgeText}>{n}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.docActions}>
                <TouchableOpacity style={styles.outBtn} activeOpacity={0.8} onPress={() => takePhoto(d.key, d.label)}>
                  <Ionicons name="camera-outline" size={14} color={PRODUCT} />
                  <Text style={styles.outBtnText}>Take Photos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.outBtn} activeOpacity={0.8} onPress={() => uploadFile(d.key, d.label)}>
                  <Ionicons name="cloud-upload-outline" size={14} color={PRODUCT} />
                  <Text style={styles.outBtnText}>Upload</Text>
                </TouchableOpacity>
              </View>
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
        })}

        <View style={{ height: 12 }} />
      </ScrollView>

      {/* ===== Floating call button ===== */}
      <TouchableOpacity
        style={styles.callFab}
        activeOpacity={0.85}
        accessibilityLabel="Call support"
        onPress={() => Alert.alert('Support', 'Support calling will be available here soon.')}>
        <Ionicons name="call" size={20} color="#fff" />
      </TouchableOpacity>

      {/* ===== Submit ===== */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={submitting}
          activeOpacity={0.85}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  topTitle: { fontSize: 16, fontWeight: '700', color: PRODUCT },
  scroll: { paddingHorizontal: 16, paddingBottom: 20 },

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

  sectionBar: { backgroundColor: '#eaf2fb', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 9, marginTop: 18, marginBottom: 6 },
  sectionBarText: { fontSize: 14.5, fontWeight: '700', color: PRODUCT },

  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f4',
    gap: 10,
  },
  docLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  docLabel: { fontSize: 13.5, color: '#2b3138', flexShrink: 1 },
  stampBox: {
    marginTop: -2,
    marginBottom: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f4f8fc',
    borderWidth: 1,
    borderColor: '#e3edf6',
    gap: 3,
  },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stampText: { color: '#37536b', fontSize: 11.5, flexShrink: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#00a651', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  docActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  outBtnText: { color: PRODUCT, fontSize: 11.5, fontWeight: '600' },

  callFab: {
    position: 'absolute',
    right: 18,
    bottom: 92,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 3px 8px rgba(0,0,0,0.18)',
  },

  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#f1f2f4' },
  submitBtn: { backgroundColor: BLUE, borderRadius: 8, height: 52, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
