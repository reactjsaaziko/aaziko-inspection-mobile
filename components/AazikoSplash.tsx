import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Aaziko brand colours (from the logo mark).
const BRAND = { green: '#00A651', red: '#ED1C24', blue: '#27AAE1' };

/**
 * Full-screen animated Aaziko logo shown when the app opens.
 *
 * Sequence:
 *  1. White screen, native splash hidden as soon as this mounts (seamless).
 *  2. Logo rises up + scales in + fades in (spring).
 *  3. Three brand-colour dots pulse underneath (a real "loading" feel).
 *  4. Hold, then the whole overlay fades out to reveal the app.
 *
 * Runs in Expo Go too (Expo Go often skips the native app.json splash).
 */
export function AazikoSplash({ onDone }: { onDone: () => void }) {
  const overlay = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoY = useRef(new Animated.Value(26)).current;
  const d1 = useRef(new Animated.Value(0.3)).current;
  const d2 = useRef(new Animated.Value(0.3)).current;
  const d3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Reveal our overlay (both are white with the Aaziko logo -> no flash).
    SplashScreen.hideAsync().catch(() => {});

    // Logo entrance.
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
      Animated.spring(logoY, { toValue: 0, friction: 7, tension: 55, useNativeDriver: true }),
    ]).start();

    // Three brand dots pulsing, staggered.
    const pulse = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
    const loops = [pulse(d1, 0), pulse(d2, 160), pulse(d3, 320)];
    loops.forEach((l) => l.start());

    // Hold, then fade the overlay away and reveal the app.
    let doneTimer: ReturnType<typeof setTimeout>;
    const timer = setTimeout(() => {
      Animated.timing(overlay, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
      // Guaranteed dismissal on every platform (web ignores the native driver,
      // so we can't rely on the animation's finished callback).
      doneTimer = setTimeout(onDone, 520);
    }, 2100);

    return () => {
      clearTimeout(timer);
      clearTimeout(doneTimer);
      loops.forEach((l) => l.stop());
    };
  }, [d1, d2, d3, logoOpacity, logoScale, logoY, overlay, onDone]);

  const dotStyle = (v: Animated.Value, color: string) => ({
    backgroundColor: color,
    opacity: v,
    transform: [{ scale: v.interpolate({ inputRange: [0.3, 1], outputRange: [0.85, 1.25] }) }],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: overlay, pointerEvents: 'none' }]}>
      <Animated.Image
        source={require('../assets/images/aaziko-icon.png')}
        resizeMode="contain"
        style={[
          styles.logo,
          { opacity: logoOpacity, transform: [{ translateY: logoY }, { scale: logoScale }] },
        ]}
      />
      <View style={styles.dots}>
        <Animated.View style={[styles.dot, dotStyle(d1, BRAND.green)]} />
        <Animated.View style={[styles.dot, dotStyle(d2, BRAND.red)]} />
        <Animated.View style={[styles.dot, dotStyle(d3, BRAND.blue)]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    zIndex: 999,
  },
  logo: {
    width: 128,
    height: 128,
  },
  dots: {
    flexDirection: 'row',
    marginTop: 36,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginHorizontal: 5,
  },
});
