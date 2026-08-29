import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const BLUE = '#5B9BD5';
const LABEL = '#6b7680';
const PRODUCT = '#37536b';

export interface ScannedBox {
  boxNumber?: number;
  dimensions?: { length?: number; width?: number; height?: number; unit?: string };
  weight?: { value?: number; unit?: string };
  quantity?: number;
  qrCode?: { code?: string; scannedAt?: string; registeredBy?: { name?: string } };
  media?: { photos?: any[]; videos?: any[] };
  notes?: string;
  createdAt?: string;
}

export interface ScannedOrder {
  orderNumber?: string;
  product?: string;
  cargoType?: string;
  sellerName?: string;
  status?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
  box?: ScannedBox | null;
  order?: ScannedOrder | null;
}

function Row({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{String(value)}</Text>
    </View>
  );
}

/** Details shown when a box sticker is scanned for viewing. */
export function BoxDetailModal({ visible, onClose, loading, error, box, order }: Props) {
  const d = box?.dimensions;
  const dims =
    d && (d.length || d.width || d.height)
      ? `${d.length ?? '?'} × ${d.width ?? '?'} × ${d.height ?? '?'} ${d.unit || 'mm'}`
      : undefined;
  const weight =
    box?.weight?.value != null ? `${box.weight.value} ${box.weight.unit || 'kg'}` : undefined;
  const photos = box?.media?.photos?.length || 0;
  const videos = box?.media?.videos?.length || 0;
  const media = photos + videos > 0 ? `${photos} photo(s), ${videos} video(s)` : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />

          {loading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator color={BLUE} />
              <Text style={styles.centerText}>Looking up this box…</Text>
            </View>
          ) : error ? (
            <View style={styles.centerPad}>
              <Ionicons name="alert-circle-outline" size={38} color="#e06666" />
              <Text style={styles.errorTitle}>Not found</Text>
              <Text style={styles.centerText}>{error}</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.titleRow}>
                <View style={styles.qrBadge}>
                  <Ionicons name="cube-outline" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Box {box?.boxNumber ?? '—'}</Text>
                  {box?.qrCode?.code ? (
                    <Text style={styles.codeText}>Sealed</Text>
                  ) : null}
                </View>
              </View>

              <Text style={styles.section}>Order</Text>
              <Row label="Order No." value={order?.orderNumber} />
              <Row label="Product" value={order?.product} />
              <Row label="Cargo type" value={order?.cargoType} />
              <Row label="Vendor" value={order?.sellerName} />
              <Row label="Status" value={order?.status} />

              <Text style={styles.section}>Box measurements</Text>
              <Row label="Dimensions" value={dims} />
              <Row label="Weight" value={weight} />
              <Row label="Quantity" value={box?.quantity} />
              <Row label="Media" value={media} />
              <Row label="Notes" value={box?.notes} />
              <Row label="Registered by" value={box?.qrCode?.registeredBy?.name} />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '80%',
  },
  grip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#dfe3e8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  centerPad: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  centerText: { color: LABEL, fontSize: 13.5, textAlign: 'center' },
  errorTitle: { fontSize: 16, fontWeight: '700', color: PRODUCT, marginTop: 4 },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  qrBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: PRODUCT },
  codeText: { fontSize: 12.5, color: BLUE, fontWeight: '600', marginTop: 2 },

  section: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9aa4ad',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f4',
    gap: 16,
  },
  rowLabel: { fontSize: 13, color: LABEL },
  rowValue: { fontSize: 13.5, color: '#2b3138', fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
