import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { markOnboardingDone, routeAfterAddress, saveAddress } from '@/lib/profile';

const BLUE = '#5B9BD5';
const INPUT_BORDER = '#e3e6ea';
const PLACEHOLDER = '#9aa4ad';
const ERROR = '#e5484d';

export default function AddressScreen() {
  const router = useRouter();
  const [locality, setLocality] = useState('');
  const [pincode, setPincode] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [country, setCountry] = useState('');
  const [addressDetails, setAddressDetails] = useState('');

  const [detecting, setDetecting] = useState(true);
  const [detectNote, setDetectNote] = useState('Detecting your location…');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const detect = async () => {
    setDetecting(true);
    setDetectNote('Detecting your location…');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDetectNote('Location permission off — please fill your address manually.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const p = places?.[0];
      if (p) {
        setLocality((v) => v || p.district || p.subregion || p.name || '');
        setPincode((v) => v || p.postalCode || '');
        setCity((v) => v || p.city || p.subregion || '');
        setStateName((v) => v || p.region || '');
        setCountry((v) => v || p.country || '');
        setAddressDetails((v) => v || [p.name, p.street].filter(Boolean).join(', '));
        setDetectNote('Location auto-filled — please check and edit if needed.');
      } else {
        setDetectNote('Could not detect address — please fill it manually.');
      }
    } catch {
      setDetectNote('Could not detect location — please fill it manually.');
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Let the user skip onboarding and go straight to their orders. Remembered
  // per-account, so they won't be asked again on the next login.
  const onSkip = async () => {
    await markOnboardingDone();
    router.replace('/orders');
  };

  const onNext = async () => {
    const anyFilled = [locality, pincode, city, stateName, country, addressDetails].some(
      (v) => v.trim().length > 0,
    );
    if (!anyFilled) {
      setError('Please fill your address, or tap Retry to detect your location.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await saveAddress({
        locality,
        postalCode: pincode,
        city,
        state: stateName,
        country,
        addressDetails,
      });
      if (res.ok) {
        const route = await routeAfterAddress();
        router.replace(route);
        return;
      }
      setError(res.error);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    placeholder: string,
    value: string,
    onChange: (t: string) => void,
    keyboardType: 'default' | 'number-pad' = 'default',
  ) => (
    <View style={styles.inputWrap}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        value={value}
        onChangeText={(t) => {
          onChange(t);
          if (error) setError('');
        }}
        keyboardType={keyboardType}
        editable={!saving}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Illustration */}
          <View style={styles.illustration}>
            <View style={styles.halo}>
              <Ionicons name="location" size={78} color={BLUE} />
            </View>
            <View style={styles.illoRow}>
              <Ionicons name="cube" size={24} color="#d7dee4" />
              <Ionicons name="people" size={34} color="#c4ced8" />
              <Ionicons name="cube" size={24} color="#d7dee4" />
            </View>
          </View>

          {/* Detect status */}
          <View style={styles.detectRow}>
            {detecting ? <ActivityIndicator size="small" color={BLUE} /> : (
              <Ionicons name="navigate-circle-outline" size={16} color={BLUE} />
            )}
            <Text style={styles.detectText}>{detectNote}</Text>
            {!detecting && (
              <TouchableOpacity onPress={detect} hitSlop={8}>
                <Text style={styles.retryLink}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Fields */}
          {field('Locality', locality, setLocality)}
          {field('Pincode', pincode, setPincode, 'number-pad')}
          {field('City', city, setCity)}
          {field('State', stateName, setStateName)}
          {field('Country', country, setCountry)}
          {field('Address Details', addressDetails, setAddressDetails)}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
            onPress={onNext}
            activeOpacity={0.85}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.nextText}>Next</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onSkip}
            activeOpacity={0.7}
            disabled={saving}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },
  illustration: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 18 },
  halo: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#eef4fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illoRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },

  detectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  detectText: { flex: 1, fontSize: 12.5, color: '#6b7680' },
  retryLink: { color: BLUE, fontSize: 12.5, fontWeight: '600' },

  inputWrap: {
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    marginBottom: 14,
  },
  input: { height: 52, paddingHorizontal: 16, fontSize: 15, color: '#2b3138' },

  errorText: { color: ERROR, fontSize: 13, marginBottom: 10 },

  nextBtn: {
    backgroundColor: BLUE,
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  nextBtnDisabled: { opacity: 0.6 },
  nextText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  skipBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  skipText: { color: '#6b7680', fontSize: 14, fontWeight: '600' },
});
