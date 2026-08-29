import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
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

import { getContactInfo, markOnboardingDone, saveWorkDetails } from '@/lib/profile';

const BLUE = '#5B9BD5';
const INPUT_BORDER = '#e3e6ea';
const PLACEHOLDER = '#9aa4ad';
const ERROR = '#e5484d';

interface PickedDoc {
  name: string;
  uri: string;
}

export default function WorkDetailsScreen() {
  const router = useRouter();
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  const [docs, setDocs] = useState<PickedDoc[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const r = await getContactInfo();
      if (r.ok && r.contact) {
        setContact((v) => v || r.contact!.contactNo || '');
        setEmail((v) => v || r.contact!.email || '');
        setWorkAddress((v) => v || r.contact!.workAddress || '');
      }
    })();
  }, []);

  const pickDocuments = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.ms-excel'],
      });
      if (!res.canceled && res.assets?.length) {
        setDocs((prev) => [...prev, ...res.assets.map((a) => ({ name: a.name, uri: a.uri }))]);
      }
    } catch {
      setError('Could not open the file picker.');
    }
  };

  const onNext = async () => {
    const anyFilled = [contact, email, workAddress].some((v) => v.trim().length > 0);
    if (!anyFilled) {
      setError('Please fill your work contact, email and address.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await saveWorkDetails({
        contact,
        email,
        workAddress,
        documents: docs.map((d) => ({ name: d.name })),
      });
      if (res.ok) {
        await markOnboardingDone();
        router.replace('/orders');
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
    keyboardType: 'default' | 'email-address' | 'phone-pad' = 'default',
  ) => (
    <View style={styles.inputWrap}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        value={value}
        autoCapitalize="none"
        keyboardType={keyboardType}
        onChangeText={(t) => {
          onChange(t);
          if (error) setError('');
        }}
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
          <View style={styles.illustration}>
            <View style={styles.halo}>
              <Ionicons name="briefcase" size={70} color={BLUE} />
            </View>
            <View style={styles.illoRow}>
              <Ionicons name="cube" size={24} color="#d7dee4" />
              <Ionicons name="people" size={34} color="#c4ced8" />
              <Ionicons name="cube" size={24} color="#d7dee4" />
            </View>
          </View>

          {field('Work contact', contact, setContact, 'phone-pad')}
          {field('Work Email address', email, setEmail, 'email-address')}
          {field('Work address', workAddress, setWorkAddress)}

          <TouchableOpacity style={styles.uploadBox} onPress={pickDocuments} activeOpacity={0.7}>
            <Text style={styles.uploadText}>Upload Documents</Text>
            <Ionicons name="cloud-upload-outline" size={26} color="#9aa4ad" />
          </TouchableOpacity>

          {docs.length > 0 && (
            <View style={styles.docList}>
              {docs.map((d, i) => (
                <View key={`${d.name}-${i}`} style={styles.docRow}>
                  <Ionicons name="document-text-outline" size={16} color={BLUE} />
                  <Text style={styles.docName} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setDocs((prev) => prev.filter((_, j) => j !== i))}
                    hitSlop={8}>
                    <Ionicons name="close" size={16} color="#9aa4ad" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

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
            onPress={async () => {
              await markOnboardingDone();
              router.replace('/orders');
            }}
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

  inputWrap: {
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    marginBottom: 14,
  },
  input: { height: 52, paddingHorizontal: 16, fontSize: 15, color: '#2b3138' },

  uploadBox: {
    borderWidth: 1.5,
    borderColor: '#d7dee4',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  uploadText: { color: PLACEHOLDER, fontSize: 14 },

  docList: { gap: 8, marginBottom: 14 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f6f8fa',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  docName: { flex: 1, fontSize: 13, color: '#2b3138' },

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
