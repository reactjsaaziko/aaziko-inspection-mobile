import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BLUE = '#5B9BD5';
const PRODUCT = '#37536b';

// Barcode formats a warehouse sticker might use — QR first, then common 1D codes.
const BARCODE_TYPES: BarcodeType[] = [
  'qr',
  'ean13',
  'ean8',
  'code128',
  'code39',
  'code93',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
  'datamatrix',
  'pdf417',
  'aztec',
];

interface Props {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  /** Fired once with the scanned code. */
  onScanned: (code: string) => void;
}

/**
 * Full-screen camera scanner used both to LINK a box to a sticker (packing form)
 * and to LOOK UP a box by scanning it (orders screen). Camera scan only — there
 * is no manual code entry. Handles the camera permission and guards against
 * firing multiple times for one sticker.
 */
export function QrScannerModal({ visible, title, subtitle, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  // A single sticker fires onBarcodeScanned many times per second — accept once.
  const handledRef = useRef(false);

  // Reset each time the scanner is (re)opened.
  useEffect(() => {
    if (visible) handledRef.current = false;
  }, [visible]);

  const fire = (code: string) => {
    const clean = String(code || '').trim();
    if (!clean || handledRef.current) return;
    handledRef.current = true;
    onScanned(clean);
  };

  const canScan = Platform.OS !== 'web' && permission?.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title || 'Scan QR'}</Text>
          <View style={{ width: 26 }} />
        </View>

        {canScan ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={({ data }) => fire(data)}
            />
            {/* Scan frame overlay */}
            <View style={[styles.overlay, { pointerEvents: 'none' }]}>
              <View style={styles.frame} />
              <Text style={styles.hint}>{subtitle || 'Point the camera at the box sticker'}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.fallback}>
            {Platform.OS === 'web' ? (
              <>
                <Ionicons name="phone-portrait-outline" size={40} color={BLUE} />
                <Text style={styles.fallbackTitle}>Scan on the phone</Text>
                <Text style={styles.fallbackText}>
                  QR scanning is available in the phone app. Please open it on your device.
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="camera-outline" size={40} color={BLUE} />
                <Text style={styles.fallbackTitle}>Camera permission needed</Text>
                <Text style={styles.fallbackText}>Allow camera access to scan the box sticker.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
                  <Text style={styles.primaryBtnText}>Allow camera</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0e1720' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  cameraWrap: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#ffffff',
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 18,
    textAlign: 'center',
    paddingHorizontal: 30,
  },

  fallback: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  fallbackTitle: { fontSize: 17, fontWeight: '700', color: PRODUCT, marginTop: 14 },
  fallbackText: { fontSize: 13.5, color: '#6b7680', textAlign: 'center', marginTop: 6 },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: BLUE,
    borderRadius: 8,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
