import { Ionicons } from '@expo/vector-icons';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getAccessToken,
  getStoredCredentials,
  getStoredUser,
  hasInspectionAccess,
  login,
} from '@/lib/auth';
import { nextOnboardingRoute } from '@/lib/profile';

const BLUE = '#5B9BD5';
const INPUT_BG = '#f1f2f4';
const PLACEHOLDER = '#9aa4ad';
const ERROR = '#e5484d';

export default function LoginScreen() {
  const router = useRouter();
  const rootNavState = useRootNavigationState();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Decide where to go ONLY after the navigator is ready — navigating too early
  // on a real device throws "failed to validate session state". If already
  // logged in with inspection access, skip the login form; otherwise show it.
  useEffect(() => {
    if (!rootNavState?.key) return;
    let cancelled = false;
    (async () => {
      const [user, token, creds] = await Promise.all([
        getStoredUser(),
        getAccessToken(),
        getStoredCredentials(),
      ]);
      if (cancelled) return;
      // Logged in if we have a valid token OR saved credentials (the app can
      // silently re-login from those) — so the login page only ever shows on a
      // fresh install or after an explicit Log out. Lifetime login until uninstall.
      const loggedIn = (!!token && hasInspectionAccess(user)) || !!creds;
      if (loggedIn) {
        const route = await nextOnboardingRoute();
        if (!cancelled) router.replace(route);
      } else {
        setCheckingAuth(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rootNavState?.key, router]);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading;

  const onLogin = async () => {
    if (!canSubmit) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.ok) {
        const route = await nextOnboardingRoute();
        router.replace(route);
        return;
      }
      setError(result.error);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // While checking for a saved login, show a blank white screen so the login
  // form never flashes before an automatic redirect to Orders.
  if (checkingAuth) {
    return <View style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          {/* Illustration (placeholder — swap with your exact picture) */}
          <View style={styles.illustration}>
            <View style={styles.halo}>
              <Ionicons name="location" size={92} color={BLUE} />
            </View>
            <View style={styles.illoRow}>
              <Ionicons name="cube" size={28} color="#d7dee4" />
              <Ionicons name="people" size={40} color="#c4ced8" />
              <Ionicons name="cube" size={28} color="#d7dee4" />
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={username}
                onChangeText={(t) => {
                  setUsername(t);
                  if (error) setError('');
                }}
                editable={!loading}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, styles.inputWithIcon]}
                placeholder="Password"
                placeholderTextColor={PLACEHOLDER}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError('');
                }}
                editable={!loading}
                returnKeyType="go"
                onSubmitEditing={onLogin}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={12}
                style={styles.eyeBtn}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={22}
                  color={PLACEHOLDER}
                />
              </Pressable>
            </View>

            <TouchableOpacity
              onPress={() => {
                /* TODO: connect with admin flow */
              }}
              style={styles.adminLinkWrap}
              activeOpacity={0.7}>
              <Text style={styles.adminLink}>Connect with Admin</Text>
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <View style={styles.spacer} />

          {/* Log in */}
          <TouchableOpacity
            style={[styles.loginBtn, !canSubmit && styles.loginBtnDisabled]}
            onPress={onLogin}
            activeOpacity={0.85}
            disabled={!canSubmit}>
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginText}>Log in</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  illustration: {
    height: '42%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  halo: {
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: '#eef4fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  form: { gap: 14 },
  inputWrap: {
    backgroundColor: INPUT_BG,
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
  },
  input: {
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#2b3138',
  },
  inputWithIcon: { paddingRight: 48 },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    height: 52,
    justifyContent: 'center',
  },
  adminLinkWrap: { alignSelf: 'flex-end', paddingVertical: 2 },
  adminLink: { color: BLUE, fontSize: 13, fontWeight: '500' },
  errorText: { color: ERROR, fontSize: 13, marginTop: 2 },
  spacer: { flex: 1 },
  loginBtn: {
    backgroundColor: BLUE,
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
