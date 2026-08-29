import { Ionicons } from '@expo/vector-icons';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getInspectionRecord, type CapturedAsset } from '@/lib/inspectionMedia';
import { getCaptureMeta, formatCapturedAt } from '@/lib/captureMeta';
import { type InspectionOrder } from '@/lib/orders';
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

type OrderParam = Omit<InspectionOrder, 'raw'> & { raw?: any };

function fmtDate(iso: string): string {
  if (!iso) return 'YY-MM-DD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'YY-MM-DD';
  return `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The three standard inspection steps every order goes through.
const SECTIONS = [
  {
    key: 'visual',
    title: '1. Visual Appearance & Workmanship',
    subtitle: 'Visual Quality & Surface Finish Inspection',
  },
  {
    key: 'dimension',
    title: '2. Dimension & Weight Check',
    subtitle: 'Key Dimension & Weight Verification',
  },
  {
    key: 'function',
    title: '3. Key Profile & Lock Fit Test',
    subtitle: 'Key Compatibility / Functional Operation Test',
  },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order?: string }>();

  let order: OrderParam | null = null;
  try {
    order = params.order ? (JSON.parse(params.order) as OrderParam) : null;
  } catch {
    order = null;
  }

  // "Match or Not" — the ORIGINAL product/packing details the inspector matches
  // the goods against. Sources, most-authoritative first:
  //   1. requesterInfo.cargo specs the vendor entered at manufacturing (size,
  //      color, coverMaterial, packing) — filled by the backend pipeline
  //   2. the shared order-inspection record's packing boxes (real box dims)
  //   3. the assignment cargo/delivery fallbacks
  const cargo = order?.raw?.requesterInfo?.cargo || {};
  const delivery = order?.raw?.requesterInfo?.delivery || {};
  const inquiryId = order?.inquiryId || '';

  // Packing boxes / product from the shared inspection record (reachable with
  // the inspector token — same endpoint the transportation app uses).
  const [record, setRecord] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!inquiryId) return;
      const rec = await getInspectionRecord(inquiryId);
      if (alive) setRecord(rec);
    })();
    return () => {
      alive = false;
    };
  }, [inquiryId]);

  const firstBox = record?.inspectionData?.boxes?.[0];
  const boxSize = firstBox?.dimensions
    ? `${firstBox.dimensions.length ?? '?'}×${firstBox.dimensions.width ?? '?'}×${firstBox.dimensions.height ?? '?'} ${firstBox.dimensions.unit || 'cm'}`
    : '';
  const boxCount = record?.inspectionData?.boxes?.length || 0;

  const firstNonEmpty = (...vals: any[]): string => {
    for (const v of vals) {
      const s = v == null ? '' : String(v).trim();
      if (s) return s;
    }
    return '—';
  };

  const specs: { label: string; value: string }[] = [
    { label: 'Size:', value: firstNonEmpty(cargo.size, cargo.dimensions, boxSize) },
    {
      label: 'Packing:',
      value: firstNonEmpty(
        cargo.packing,
        cargo.cargoType,
        delivery.containerType,
        boxCount ? `${boxCount} box${boxCount > 1 ? 'es' : ''}` : '',
      ),
    },
    { label: 'Cover Material:', value: firstNonEmpty(cargo.coverMaterial, cargo.material) },
    { label: 'Color:', value: firstNonEmpty(cargo.color) },
  ];
  // Only show specs that actually have a value — keep each row's original index
  // so the checkbox state still maps correctly. When the vendor entered no
  // manufacturing/packing detail, every value is "—" and the whole "Match or
  // Not" section is hidden rather than showing empty rows.
  const availableSpecs = specs
    .map((s, index) => ({ ...s, index }))
    .filter((s) => s.value && s.value !== '—');
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);

  const [notes, setNotes] = useState<Record<SectionKey, string>>({
    visual: '',
    dimension: '',
    function: '',
  });
  const [notesOpen, setNotesOpen] = useState<Record<SectionKey, boolean>>({
    visual: false,
    dimension: false,
    function: false,
  });
  const [showAll, setShowAll] = useState<Record<SectionKey, boolean>>({
    visual: false,
    dimension: false,
    function: false,
  });
  const [notesSaved, setNotesSaved] = useState<Record<SectionKey, boolean>>({
    visual: false,
    dimension: false,
    function: false,
  });
  // Captured media is handled by the persistent offline queue — it survives no
  // internet, the app closing, and phone restarts, and uploads automatically the
  // moment we're back online. We just subscribe to its state for this order.
  const assignmentId = order?.id || '';
  const [queueItems, setQueueItems] = useState<QueueItem[]>(
    () => statusForAssignment(assignmentId).items,
  );
  useEffect(() => {
    const sync = () => setQueueItems(statusForAssignment(assignmentId).items);
    sync();
    const unsub = subscribe(sync);
    return unsub;
  }, [assignmentId]);
  const itemsFor = (key: SectionKey) => queueItems.filter((i) => i.sectionKey === key);

  const addMedia = async (key: SectionKey, video: boolean) => {
    if (!order) return;
    let assets: ImagePicker.ImagePickerAsset[] = [];
    try {
      // Native phones open the CAMERA directly (photo or video). Web has no
      // camera, so it falls back to the file picker.
      const useCamera = Platform.OS !== 'web';
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Camera permission needed',
            'Please allow camera access so you can take inspection photos and videos.',
          );
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
      assets = res.assets;
    } catch {
      Alert.alert(
        video ? 'Could not open the camera' : 'Could not open the camera',
        'Please try again.',
      );
      return;
    }

    // Save each capture to the persistent offline queue (survives no-internet /
    // app-close / restart), then kick a drain. If we're online it uploads now
    // through the existing endpoints; if not, it stays "Pending" and uploads
    // automatically once the device is back online.
    const sectionTitle = SECTIONS.find((s) => s.key === key)?.title || 'Inspection';
    // Stamp every capture with the date/time + GPS location of this moment.
    const meta = await getCaptureMeta();
    for (const a of assets) {
      const capture: CapturedAsset = {
        uri: a.uri,
        fileName: a.fileName,
        mimeType: a.mimeType,
        type: a.type,
        capturedAt: meta.capturedAt,
        latitude: meta.latitude,
        longitude: meta.longitude,
        locationAccuracy: meta.accuracy,
        locationAddress: meta.address,
      };
      await enqueueCapture({ assignmentId: order.id, sectionKey: key, sectionTitle }, capture);
    }
    processQueue();
  };

  // "Submit" here CONTINUES to the packing-boxes step — it does NOT finish the
  // inspection. The job stays in progress so photos captured on both this screen
  // and the packing screen keep attaching; the real submit-for-review happens
  // from the packing screen's Submit. The Match-or-Not + section summary is
  // forwarded so the final report includes it.
  const onSubmit = async () => {
    if (!order) return;
    const report = [
      ...availableSpecs.map(
        (s) => `${s.label.replace(':', '')}: ${s.value} — ${checks[s.index] ? 'Match' : 'Not checked'}`,
      ),
      ...SECTIONS.map((s) => {
        const n = itemsFor(s.key).filter((i) => i.status === 'done').length;
        return `${s.title} — media: ${n}${notes[s.key] ? ` | notes: ${notes[s.key]}` : ''}`;
      }),
    ].join('\n');
    processQueue();
    router.replace({ pathname: '/packing', params: { order: params.order, report } });
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
  const strip = order.images.length ? order.images.slice(0, 8) : [null, null, null, null];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#37536b" />
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
              <Text style={styles.productName}>{order.product}</Text>
            </View>
          </View>

          {order.quantity ? (
            <View style={styles.qtyRow}>
              <Text style={styles.metaText}>
                Qty.: {order.quantity}
                {order.target ? ` / ${order.target}` : ''}
              </Text>
              <Ionicons name="cube" size={15} color="#00a651" />
            </View>
          ) : null}
          {order.labTest ? <Text style={styles.metaText}>Lab Test: {order.labTest}</Text> : null}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaText}>Order Date: {fmtDate(order.orderDate)}</Text>
              <Text style={styles.metaText}>Complition Date: {fmtDate(order.completionDate)}</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.strip}
            contentContainerStyle={styles.stripContent}>
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

        {/* ===== Match or Not — only shown when there are real specs to match ===== */}
        {availableSpecs.length > 0 && (
          <>
            <Text style={styles.matchHeader}>Match or Not</Text>
            {availableSpecs.map((s) => (
              <View key={s.label} style={styles.specRow}>
                <Text style={styles.specLabel}>{s.label}</Text>
                <Text style={styles.specValue} numberOfLines={1}>
                  {s.value}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setChecks((c) => c.map((v, j) => (j === s.index ? !v : v)))
                  }
                  hitSlop={8}
                  style={[styles.checkbox, checks[s.index] && styles.checkboxOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: checks[s.index] }}>
                  {checks[s.index] ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* ===== Inspection sections ===== */}
        {SECTIONS.map((section) => {
          const items = itemsFor(section.key);
          const visible = showAll[section.key] ? items : items.slice(0, 10);
          const nPending = items.filter((i) => i.status === 'pending').length;
          const nUploading = items.filter((i) => i.status === 'uploading').length;
          const nDone = items.filter((i) => i.status === 'done').length;
          const nFailed = items.filter((i) => i.status === 'failed').length;
          return (
            <View key={section.key}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <Text style={styles.sectionSub}>{section.subtitle}</Text>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.lightBtn}
                  activeOpacity={0.8}
                  onPress={() => addMedia(section.key, true)}>
                  <Text style={styles.lightBtnText}>Start Video</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.lightBtn}
                  activeOpacity={0.8}
                  onPress={() => addMedia(section.key, false)}>
                  <Text style={styles.lightBtnText}>Take Photos</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  style={styles.viewAllBtn}
                  activeOpacity={0.8}
                  onPress={() => setShowAll((v) => ({ ...v, [section.key]: !v[section.key] }))}>
                  <Text style={styles.viewAllText}>View All Image</Text>
                </TouchableOpacity>
              </View>

              {visible.length > 0 ? (
                <View style={styles.grid}>
                  {visible.map((item) => (
                    <View key={item.id} style={styles.gridTile}>
                      <Image
                        source={{ uri: item.url || item.localUri }}
                        style={styles.gridImg}
                        contentFit="cover"
                      />
                      {item.kind === 'video' ? (
                        <View style={styles.videoBadge}>
                          <Ionicons name="videocam" size={11} color="#fff" />
                        </View>
                      ) : null}
                      <View style={styles.statusBadge}>
                        {item.status === 'done' ? (
                          <Ionicons name="checkmark-circle" size={14} color="#00a651" />
                        ) : item.status === 'uploading' ? (
                          <ActivityIndicator size="small" color={BLUE} />
                        ) : item.status === 'failed' ? (
                          <Ionicons name="alert-circle" size={14} color="#d64545" />
                        ) : (
                          <Ionicons name="time-outline" size={14} color="#e08a1e" />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noPhotos}>No photos yet — tap “Take Photos” to add.</Text>
              )}

              {(() => {
                // Show the date/time + location captured with the latest photo,
                // so the inspector can confirm the stamp was recorded.
                const last = [...items].reverse().find((i) => i.capturedAt);
                if (!last) return null;
                const loc =
                  last.locationAddress ||
                  (typeof last.latitude === 'number' && typeof last.longitude === 'number'
                    ? `${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}`
                    : null);
                return (
                  <View style={styles.stampBox}>
                    <View style={styles.stampRow}>
                      <Ionicons name="time-outline" size={13} color="#5B9BD5" />
                      <Text style={styles.stampText}>{formatCapturedAt(last.capturedAt!)}</Text>
                    </View>
                    <View style={styles.stampRow}>
                      <Ionicons name="location-outline" size={13} color="#5B9BD5" />
                      <Text style={styles.stampText}>{loc || 'Location not available'}</Text>
                    </View>
                  </View>
                );
              })()}

              {items.length > 0 ? (
                <View style={styles.uploadStatusRow}>
                  {nUploading > 0 ? (
                    <>
                      <ActivityIndicator size="small" color={BLUE} />
                      <Text style={styles.uploadingText}>Uploading {nUploading}…</Text>
                    </>
                  ) : null}
                  {nDone > 0 ? (
                    <Text style={styles.uploadedText}>✓ {nDone} uploaded</Text>
                  ) : null}
                  {nPending > 0 ? (
                    <Text style={styles.pendingText}>
                      ⏱ {nPending} pending — uploads when online
                    </Text>
                  ) : null}
                  {nFailed > 0 ? (
                    <TouchableOpacity onPress={() => processQueue()}>
                      <Text style={styles.retryText}>⤾ {nFailed} failed — tap to retry</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.notesRow}>
                <TouchableOpacity
                  style={styles.notesBtn}
                  activeOpacity={0.8}
                  onPress={() => setNotesOpen((v) => ({ ...v, [section.key]: !v[section.key] }))}>
                  <Ionicons name="pencil-outline" size={12} color={LABEL} />
                  <Text style={styles.notesBtnText}>Notes</Text>
                </TouchableOpacity>
                {notesSaved[section.key] && !notesOpen[section.key] && notes[section.key] ? (
                  <View style={styles.notesSavedTag}>
                    <Ionicons name="checkmark-circle" size={13} color="#00a651" />
                    <Text style={styles.notesSavedText}>Saved</Text>
                  </View>
                ) : null}
              </View>
              {notesOpen[section.key] && (
                <>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Write your inspection notes…"
                    placeholderTextColor="#9aa4ad"
                    multiline
                    value={notes[section.key]}
                    onChangeText={(t) => {
                      setNotes((n) => ({ ...n, [section.key]: t }));
                      // Editing again clears the saved flag until re-saved.
                      setNotesSaved((s) => (s[section.key] ? { ...s, [section.key]: false } : s));
                    }}
                  />
                  <TouchableOpacity
                    style={styles.saveNoteBtn}
                    activeOpacity={0.85}
                    onPress={() => {
                      setNotesSaved((s) => ({ ...s, [section.key]: true }));
                      setNotesOpen((v) => ({ ...v, [section.key]: false }));
                    }}>
                    <Ionicons name="checkmark" size={15} color="#fff" />
                    <Text style={styles.saveNoteText}>Save Note</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          );
        })}

        {/* ===== Submit → continues to the packing step ===== */}
        <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} activeOpacity={0.85}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: PRODUCT },
  scroll: { paddingHorizontal: 14, paddingBottom: 28 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eceef1',
    padding: 14,
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#f1f2f4' },
  ph: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  infoLine: { fontSize: 12.5, color: LABEL },
  productName: { fontSize: 13.5, color: PRODUCT, fontWeight: '600', marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { fontSize: 12.5, color: LABEL, marginTop: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'flex-end' },
  contractBtn: {
    backgroundColor: BLUE,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  contractText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  strip: { marginTop: 12 },
  stripContent: { gap: 8, paddingRight: 4 },
  stripImg: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#f1f2f4' },

  matchHeader: {
    alignSelf: 'flex-end',
    fontSize: 12.5,
    color: PRODUCT,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 6,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  specLabel: { width: 105, fontSize: 13, color: PRODUCT, fontWeight: '500' },
  specValue: { flex: 1, fontSize: 13, color: LABEL },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#c4ced8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: BLUE, borderColor: BLUE },

  sectionHeader: {
    backgroundColor: '#e8f1fa',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 16,
  },
  sectionTitle: { fontSize: 13.5, fontWeight: '700', color: PRODUCT },
  sectionSub: { fontSize: 12.5, color: LABEL, marginTop: 10 },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  lightBtn: {
    backgroundColor: '#eaf3fb',
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  lightBtnText: { color: BLUE, fontSize: 12.5, fontWeight: '600' },
  uploadStatusRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  uploadingText: { color: BLUE, fontSize: 12 },
  uploadedText: { color: '#00a651', fontSize: 12, fontWeight: '600' },
  viewAllBtn: {
    borderWidth: 1,
    borderColor: '#dfe3e8',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  viewAllText: { color: PRODUCT, fontSize: 11.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
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
  gridTile: { width: 44, height: 44 },
  gridImg: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#f1f2f4' },
  statusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    top: 2,
    left: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  pendingText: { color: '#e08a1e', fontSize: 12, fontWeight: '600' },
  retryText: { color: '#d64545', fontSize: 12, fontWeight: '600' },
  noPhotos: { fontSize: 12, color: '#9aa4ad', marginTop: 10 },

  notesRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10 },
  notesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#dfe3e8',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  notesBtnText: { color: LABEL, fontSize: 12 },
  notesSavedTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  notesSavedText: { color: '#00a651', fontSize: 11.5, fontWeight: '600' },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e3e6ea',
    borderRadius: 8,
    minHeight: 70,
    padding: 12,
    marginTop: 8,
    fontSize: 13,
    color: '#2b3138',
    textAlignVertical: 'top',
  },
  saveNoteBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BLUE,
    borderRadius: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  saveNoteText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },

  submitBtn: {
    backgroundColor: BLUE,
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
