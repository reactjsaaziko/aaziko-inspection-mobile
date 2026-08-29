import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoxDetailModal, type ScannedBox, type ScannedOrder } from '@/components/BoxDetailModal';
import { QrScannerModal } from '@/components/QrScannerModal';
import { logout } from '@/lib/auth';
import { acknowledgeAssignment, declineAssignment } from '@/lib/inspection';
import {
  getInspectionOrders,
  isInspectionDone,
  isPendingAssignment,
  type InspectionOrder,
} from '@/lib/orders';
import { lookupBoxByQr } from '@/lib/packing';

const BLUE = '#5B9BD5';
const LABEL = '#6b7680';
const PRODUCT = '#37536b';

function fmtDate(iso: string): string {
  if (!iso) return 'YY-MM-DD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'YY-MM-DD';
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Start a call to the vendor: opens the phone dialer with the number already
 * entered so the user just taps the green call key.
 *
 * We deliberately do NOT gate on Linking.canOpenURL('tel:…') — on many Android
 * devices it wrongly returns false for the tel: scheme, which made the Call
 * button do nothing (it only showed a popup). Calling openURL directly launches
 * the dialer reliably; we only fall back to an alert if that genuinely throws
 * (e.g. a tablet with no phone app or the web build). */
async function callVendor(phone: string) {
  const num = (phone || '').trim();
  if (!num) return;
  try {
    await Linking.openURL(`tel:${num}`);
  } catch {
    Alert.alert('Call vendor', `Couldn't open the dialer. Vendor number: ${num}`);
  }
}

type Notif = {
  id: string;
  kind: 'new' | 'revision';
  title: string;
  body: string;
  order: InspectionOrder;
};

function OrderCard({
  order,
  onOpenMap,
  onOpenDetail,
  onAccept,
  onDecline,
  busy,
}: {
  order: InspectionOrder;
  onOpenMap: (o: InspectionOrder) => void;
  onOpenDetail: (o: InspectionOrder) => void;
  onAccept: (o: InspectionOrder) => void;
  onDecline: (o: InspectionOrder) => void;
  busy: boolean;
}) {
  const thumb = order.images[0];
  const strip = order.images.length ? order.images.slice(0, 8) : [null, null, null, null];
  const pending = isPendingAssignment(order.status);

  return (
    <Pressable style={styles.card} onPress={() => onOpenDetail(order)}>
      <View style={styles.cardTop}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.placeholder]}>
            <Ionicons name="image-outline" size={22} color="#c4ced8" />
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.infoLine}>Order No. {order.orderNumber}</Text>
          <Text style={styles.infoLine}>Sample No.: {order.sampleNumber}</Text>
          <Text style={styles.productName} numberOfLines={2}>
            {order.product}
          </Text>
          {isInspectionDone(order.status) ? (
            <View
              style={[
                styles.statusChip,
                order.status === 'completed'
                  ? styles.chipGreen
                  : order.status === 'cancelled'
                    ? styles.chipGrey
                    : styles.chipBlue,
              ]}>
              <Ionicons
                name={
                  order.status === 'completed'
                    ? 'checkmark-circle'
                    : order.status === 'cancelled'
                      ? 'close-circle'
                      : 'time'
                }
                size={11}
                color="#fff"
              />
              <Text style={styles.statusChipText}>
                {order.status === 'completed'
                  ? 'Completed'
                  : order.status === 'cancelled'
                    ? 'Cancelled'
                    : 'Submitted'}
              </Text>
            </View>
          ) : null}
          {pending ? (
            <View style={[styles.statusChip, styles.chipAmber]}>
              <Ionicons name="mail-unread" size={11} color="#fff" />
              <Text style={styles.statusChipText}>New task</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.dirBtn}
          activeOpacity={0.85}
          accessibilityLabel="Show vendor location on map"
          onPress={() => onOpenMap(order)}>
          <Ionicons name="navigate" size={17} color="#fff" />
        </TouchableOpacity>
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
      <Text style={styles.metaText}>Order Date: {fmtDate(order.orderDate)}</Text>
      <Text style={styles.metaText}>Complition Date: {fmtDate(order.completionDate)}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}>
        {strip.map((img, i) =>
          img ? (
            <Image key={i} source={{ uri: img }} style={styles.stripImg} contentFit="cover" />
          ) : (
            <View key={i} style={[styles.stripImg, styles.placeholder]}>
              <Ionicons name="image-outline" size={16} color="#c4ced8" />
            </View>
          ),
        )}
      </ScrollView>

      {pending ? (
        <View style={styles.acceptRow}>
          <TouchableOpacity
            style={styles.declineBtn}
            activeOpacity={0.85}
            disabled={busy}
            onPress={() => onDecline(order)}>
            <Ionicons name="close" size={15} color="#e06666" />
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.acceptBtn, busy && { opacity: 0.6 }]}
            activeOpacity={0.85}
            disabled={busy}
            onPress={() => onAccept(order)}>
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={15} color="#fff" />
                <Text style={styles.acceptText}>Accept</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {order.vendorPhone ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.callBtn}
            activeOpacity={0.8}
            accessibilityLabel={
              order.vendorName ? `Call ${order.vendorName}` : 'Call vendor'
            }
            onPress={() => callVendor(order.vendorPhone)}>
            <Ionicons name="call-outline" size={14} color={BLUE} />
            <Text style={styles.callText}>Call</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {order.code ? (
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{order.code}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<InspectionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Scan-to-view a box: scan any linked sticker → show that box's details.
  const [scanOpen, setScanOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBox, setLookupBox] = useState<ScannedBox | null>(null);
  const [lookupOrder, setLookupOrder] = useState<ScannedOrder | null>(null);

  const onScanLookup = useCallback(async (code: string) => {
    setScanOpen(false);
    setDetailOpen(true);
    setLookupLoading(true);
    setLookupError(null);
    setLookupBox(null);
    setLookupOrder(null);
    const r = await lookupBoxByQr(code);
    setLookupLoading(false);
    if (r.ok) {
      setLookupBox(r.box);
      setLookupOrder(r.order);
    } else {
      setLookupError(r.message);
    }
  }, []);

  const load = useCallback(async () => {
    const res = await getInspectionOrders();
    if (res.ok) {
      setOrders(res.orders);
      setError('');
    } else {
      // Never bounce to the login page on a fetch error — keep the user logged
      // in. The login screen only shows on first install or explicit Log out.
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Silent background refresh — updates the list with no spinner and without
  // hiding it on a transient error (only replaces data on success).
  const refreshSilently = useCallback(async () => {
    const res = await getInspectionOrders();
    if (res.ok) {
      setOrders(res.orders);
      setError('');
    }
  }, []);

  // Auto-pick-up newly-assigned tasks: poll every 15s while the screen is open,
  // and refresh the moment the app returns to the foreground.
  useEffect(() => {
    const id = setInterval(refreshSilently, 15000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshSilently();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refreshSilently]);

  // Refresh when this screen regains focus (e.g. returning from a detail page).
  useFocusEffect(
    useCallback(() => {
      refreshSilently();
    }, [refreshSilently]),
  );

  const onLogout = async () => {
    await logout();
    router.replace('/');
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need to log in again next time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: onLogout },
    ]);
  };

  const openMap = useCallback(
    (order: InspectionOrder) => {
      router.push({
        pathname: '/map',
        params: {
          order: JSON.stringify({
            orderNumber: order.orderNumber,
            sampleNumber: order.sampleNumber,
            product: order.product,
            image: order.images[0] || '',
            location: order.location,
          }),
        },
      });
    },
    [router],
  );

  const openDetail = useCallback(
    (order: InspectionOrder) => {
      const { raw, ...rest } = order;
      // Already finished (submitted / completed / cancelled): open the read-only
      // completed view instead of sending the inspector back through the process.
      if (isInspectionDone(order.status)) {
        router.push({ pathname: '/completed', params: { order: JSON.stringify(rest) } });
        return;
      }
      router.push({
        pathname: '/detail',
        params: {
          order: JSON.stringify({
            ...rest,
            // Only the raw slices the detail page reads (keeps the URL small).
            raw: {
              requesterInfo: {
                cargo: raw?.requesterInfo?.cargo,
                delivery: raw?.requesterInfo?.delivery,
              },
            },
          }),
        },
      });
    },
    [router],
  );

  // Accept / decline a newly-assigned task.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  const onAccept = useCallback(
    async (order: InspectionOrder) => {
      setBusyId(order.id);
      const r = await acknowledgeAssignment(order.id);
      setBusyId(null);
      if (r.ok) {
        await load();
        Alert.alert('Task accepted', `You accepted Order ${order.orderNumber}. You can start the inspection now.`);
      } else {
        Alert.alert('Could not accept', r.message);
      }
    },
    [load],
  );

  const onDecline = useCallback(
    (order: InspectionOrder) => {
      Alert.alert('Decline this task?', `Order ${order.orderNumber} will be returned to the admin.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setBusyId(order.id);
            const r = await declineAssignment(order.id);
            setBusyId(null);
            if (r.ok) await load();
            else Alert.alert('Could not decline', r.message);
          },
        },
      ]);
    },
    [load],
  );

  // In-app notifications derived from the orders (new assignments + change requests).
  const notifications: Notif[] = orders.flatMap((o): Notif[] => {
    const s = (o.status || '').toLowerCase();
    if (['pending', 'assigned'].includes(s)) {
      return [{ id: o.id, kind: 'new', title: 'New inspection assigned', body: `Order ${o.orderNumber} — ${o.product}`, order: o }];
    }
    if (s === 'revision_requested') {
      return [{ id: o.id, kind: 'revision', title: 'Changes requested', body: `Order ${o.orderNumber} — please review and resubmit`, order: o }];
    }
    return [];
  });
  const notifCount = notifications.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => {}} activeOpacity={0.7}>
            <Text style={styles.headerLink}>List of needed things</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setNotifOpen(true)}
            activeOpacity={0.8}
            style={styles.bellBtn}
            accessibilityLabel="Notifications">
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {notifCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{notifCount > 9 ? '9+' : notifCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirmLogout}
            activeOpacity={0.8}
            style={styles.bellBtn}
            accessibilityLabel="Log out">
            <Ionicons name="log-out-outline" size={23} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : error && orders.length === 0 ? (
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle-outline" size={44} color="#c4ced8" />
          <Text style={styles.stateText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.85}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o, i) => o.id || String(i)}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onOpenMap={openMap}
              onOpenDetail={openDetail}
              onAccept={onAccept}
              onDecline={onDecline}
              busy={busyId === item.id}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />
          }
          ListEmptyComponent={
            <View style={styles.centerFill}>
              <Ionicons name="clipboard-outline" size={48} color="#c4ced8" />
              <Text style={styles.stateText}>No inspection orders yet.</Text>
              <Text style={styles.stateSub}>Pull down to refresh.</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity style={styles.logout} onPress={onLogout} activeOpacity={0.7}>
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          }
        />
      )}

      {/* Floating scan button — scan a box sticker to view its details. */}
      <TouchableOpacity
        style={styles.scanFab}
        activeOpacity={0.85}
        accessibilityLabel="Scan a box QR to view its details"
        onPress={() => setScanOpen(true)}>
        <Ionicons name="qr-code" size={20} color="#fff" />
        <Text style={styles.scanFabText}>Scan box</Text>
      </TouchableOpacity>

      <QrScannerModal
        visible={scanOpen}
        title="Scan a box sticker"
        subtitle="Scan a box's sticker to see its saved details."
        onClose={() => setScanOpen(false)}
        onScanned={onScanLookup}
      />

      <BoxDetailModal
        visible={detailOpen}
        onClose={() => setDetailOpen(false)}
        loading={lookupLoading}
        error={lookupError}
        box={lookupBox}
        order={lookupOrder}
      />

      {/* ===== Notifications ===== */}
      <Modal visible={notifOpen} transparent animationType="slide" onRequestClose={() => setNotifOpen(false)}>
        <Pressable style={styles.notifBackdrop} onPress={() => setNotifOpen(false)}>
          <Pressable style={styles.notifSheet} onPress={() => {}}>
            <View style={styles.notifGrip} />
            <Text style={styles.notifTitle}>Notifications</Text>
            {notifications.length === 0 ? (
              <View style={styles.notifEmpty}>
                <Ionicons name="notifications-off-outline" size={34} color="#c4ced8" />
                <Text style={styles.notifEmptyText}>No new notifications.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {notifications.map((n) => (
                  <TouchableOpacity
                    key={`${n.kind}-${n.id}`}
                    style={styles.notifRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      setNotifOpen(false);
                      if (n.kind === 'new') onAccept(n.order);
                      else openDetail(n.order);
                    }}>
                    <View style={[styles.notifIcon, n.kind === 'new' ? styles.chipAmber : styles.chipBlue]}>
                      <Ionicons name={n.kind === 'new' ? 'mail-unread' : 'create'} size={16} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifRowTitle}>{n.title}</Text>
                      <Text style={styles.notifRowBody} numberOfLines={2}>
                        {n.body}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#c4ced8" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6f8' },
  header: {
    backgroundColor: BLUE,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  headerLink: { color: '#ffffff', fontSize: 13, textDecorationLine: 'underline' },

  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { color: '#7b8792', fontSize: 14, textAlign: 'center' },
  stateSub: { color: '#a7b0ba', fontSize: 12 },
  retryBtn: {
    marginTop: 6,
    backgroundColor: BLUE,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  listContent: { padding: 14 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#eceef1',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  thumb: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#f1f2f4' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  infoLine: { fontSize: 12.5, color: LABEL },
  productName: { fontSize: 13.5, color: PRODUCT, fontWeight: '600', marginTop: 2 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  statusChipText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  chipGreen: { backgroundColor: '#00a651' },
  chipBlue: { backgroundColor: BLUE },
  chipGrey: { backgroundColor: '#9aa4ad' },
  chipAmber: { backgroundColor: '#e6a23c' },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bellBtn: { position: 'relative', padding: 2 },
  bellBadge: { position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#e5484d', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  acceptRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#f0c4c4', borderRadius: 8, paddingVertical: 11, backgroundColor: '#fdf3f3' },
  declineText: { color: '#e06666', fontSize: 14, fontWeight: '700' },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 8, paddingVertical: 11, backgroundColor: '#00a651' },
  acceptText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  notifBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  notifSheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28 },
  notifGrip: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#dfe3e8', alignSelf: 'center', marginBottom: 12 },
  notifTitle: { fontSize: 16, fontWeight: '800', color: PRODUCT, marginBottom: 10 },
  notifEmpty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  notifEmptyText: { color: LABEL, fontSize: 13 },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f2f4' },
  notifIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  notifRowTitle: { fontSize: 13.5, fontWeight: '700', color: PRODUCT },
  notifRowBody: { fontSize: 12.5, color: LABEL, marginTop: 1 },
  dirBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  metaText: { fontSize: 12.5, color: LABEL, marginTop: 4 },

  strip: { marginTop: 12 },
  stripContent: { gap: 8, paddingRight: 4 },
  stripImg: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#f1f2f4' },

  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: BLUE,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  callText: { color: BLUE, fontSize: 13, fontWeight: '600' },

  codeBox: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#dfe3e8',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  codeText: { color: '#6b7680', fontSize: 13, fontVariant: ['tabular-nums'] },

  logout: {
    marginTop: 6,
    marginBottom: 20,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  logoutText: { color: BLUE, fontSize: 14, fontWeight: '600' },

  scanFab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BLUE,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 26,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.18)',
  },
  scanFabText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
