import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getStoredUser, logout, type ServiceProviderUser } from '@/lib/auth';

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<ServiceProviderUser | null>(null);

  useEffect(() => {
    getStoredUser().then(setUser);
  }, []);

  const onLogout = async () => {
    await logout();
    router.replace('/');
  };

  const name = user?.username || user?.email || 'Inspector';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Image
          source={require('../assets/images/aaziko-icon.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.title}>Welcome, {name}</Text>
        <Text style={styles.sub}>You&apos;re logged in to the Aaziko Inspection app.</Text>

        <TouchableOpacity style={styles.logout} onPress={onLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  logo: { width: 88, height: 88, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#2b3138' },
  sub: { fontSize: 14, color: '#7b8792', textAlign: 'center' },
  logout: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 8,
    backgroundColor: '#f1f2f4',
  },
  logoutText: { color: '#5B9BD5', fontSize: 15, fontWeight: '600' },
});
