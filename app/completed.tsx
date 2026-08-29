import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getInspectionRecord } from '@/lib/inspectionMedia';
import { type InspectionOrder } from '@/lib/orders';

const BLUE = '#5B9BD5';
const LABEL = '#6b7680';
const PRODUCT = '#37536b';
const GREEN = '#00a651';

type OrderParam = Omit<InspectionOrder, 'raw'> & { raw?: any };

function fmtDate(iso: string): string {
  if (!iso) return 'YY-MM-DD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'YY-MM-DD';
  return `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function banner(status: string): { title: string; sub: string; color: string; icon: any } {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return { title: 'Inspection Completed', sub: 'This inspection has been approved and completed.', color: GREEN, icon: 'checkmark-circle' };
    case 'cancelled':
      return { title: 'Inspection Cancelled', sub: 'This assignment was cancelled.', color: '#9aa4ad', icon: 'close-circle' };
    default:
      return { title: 'Inspection Submitted', sub: 'Your inspection was sent for review. No further action needed.', color: BLUE, icon: 'time' };
  }
}

export default function CompletedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ order?: string }>();

  let order: OrderParam | null = null;
  try {
    order = params.order ? (JSON.parse(params.order) as OrderParam) : null;
  } catch {
    order = null;
  }
  const inquiryId = order?.inquiryId || '';

  const [loading, setLoading] = useState(true);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [cargoType, setCargoType] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inquiryId) {
        setLoading(false);
        return;
      }
      const rec = await getInspectionRecord(inquiryId);
      if (cancelled) return;
      setBoxes(Array.isArray(rec?.inspectionData?.boxes) ? rec.inspectionData.boxes : []);
      setCargoType(rec?.inspectionData?.cargoType || '');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [inquiryId]);

  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerFill}>
          <Text style={{ color: LABEL }}>Order not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const b = banner(order.status);
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
          <Text style={styles.metaText}>Order Date: {fmtDate(order.orderDate)}</Text>
          <Text style={styles.metaText}>Complition Date: {fmtDate(order.completionDate)}</Text>
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

        {/* ===== Completion banner ===== */}
        <View style={[styles.banner, { borderColor: b.color }]}>
          <Ionicons name={b.icon} size={30} color={b.color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: b.color }]}>{b.title}</Text>
            <Text style={styles.bannerSub}>{b.sub}</Text>
          </View>
        </View>

        {/* ===== Read-only submitted boxes ===== */}
        <Text style={styles.sectionHeading}>Packed boxes {cargoType ? `· ${cargoType}` : ''}</Text>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={BLUE} />
            <Text style={styles.loadingText}>Loading saved details…</Text>
          </View>
        ) : boxes.length === 0 ? (
          <Text style={styles.emptyText}>No box details were recorded for this order.</Text>
        ) : (
          boxes.map((box, i) => {
            const d = box?.dimensions || {};
            const dims = `${d.length ?? '?'} × ${d.width ?? '?'} × ${d.height ?? '?'} ${d.unit || 'mm'}`;
            return (
              <View key={box?._id || i} style={styles.boxRow}>
                <View style={styles.boxHead}>
                  <Ionicons name="cube-outline" size={16} color={PRODUCT} />
                  <Text style={styles.boxTitle}>Box {box?.boxNumber ?? i + 1}</Text>
                  {box?.qrCode?.code ? <Text style={styles.qrText}>Sealed</Text> : null}
                </View>
                <Text style={styles.boxMeta}>Size: {dims}</Text>
                <Text style={styles.boxMeta}>
                  Weight: {box?.weight?.value ?? '?'} {box?.weight?.unit || 'kg'}   ·   Qty: {box?.quantity ?? '?'}
                </Text>
              </View>
            );
          })
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.85} onPress={() => router.replace('/orders')}>
          <Text style={styles.backBtnText}>Back to Orders</Text>
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
  strip: { marginTop: 12 },
  stripContent: { gap: 8, paddingRight: 4 },
  stripImg: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#f1f2f4' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 18, backgroundColor: '#fbfdff' },
  bannerTitle: { fontSize: 16, fontWeight: '800' },
  bannerSub: { fontSize: 12.5, color: LABEL, marginTop: 3 },

  sectionHeading: { fontSize: 14.5, fontWeight: '700', color: PRODUCT, marginTop: 22, marginBottom: 8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  loadingText: { color: LABEL, fontSize: 13 },
  emptyText: { color: '#9aa4ad', fontSize: 13, paddingVertical: 8 },

  boxRow: { borderWidth: 1, borderColor: '#eceef1', borderRadius: 10, padding: 12, marginBottom: 10 },
  boxHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  boxTitle: { fontSize: 14, fontWeight: '700', color: PRODUCT },
  qrText: { fontSize: 11.5, color: BLUE, fontWeight: '600', marginLeft: 'auto' },
  boxMeta: { fontSize: 12.5, color: '#2b3138', marginTop: 2 },

  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderTopWidth: 1, borderTopColor: '#f1f2f4' },
  backBtn: { backgroundColor: BLUE, borderRadius: 8, height: 52, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
