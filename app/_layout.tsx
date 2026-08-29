import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AazikoSplash } from '@/components/AazikoSplash';
// Importing this registers the background-sync TaskManager task at module load,
// which the OS needs in order to run it on a cold background launch.
import { registerBackgroundSync } from '@/lib/backgroundSync';
import { loadQueue, processQueue, startConnectivityWatcher } from '@/lib/uploadQueue';

// Keep the native splash up until our in-app Aaziko splash takes over (no white flash).
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [splashDone, setSplashDone] = useState(false);

  // Offline upload queue: load any pending captures, watch connectivity so they
  // upload the moment we're back online, register best-effort background sync,
  // and retry whenever the app returns to the foreground.
  useEffect(() => {
    (async () => {
      await loadQueue();
      startConnectivityWatcher();
      await registerBackgroundSync();
      processQueue();
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') processQueue();
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="address" />
          <Stack.Screen name="workdetails" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="detail" />
          <Stack.Screen name="packing" />
          <Stack.Screen name="documents" />
          <Stack.Screen name="completed" />
          <Stack.Screen name="map" />
          <Stack.Screen name="home" />
        </Stack>
        <StatusBar style="dark" />
        {!splashDone && <AazikoSplash onDone={() => setSplashDone(true)} />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
