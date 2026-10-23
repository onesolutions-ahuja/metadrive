import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  completeMfa,
  deleteStoredSession,
  loadSessionMetadata,
  loadStoredSession,
  normalizeApiBase,
  signInWithPassword,
  signOutRemote,
  syncBriefcase,
  type MobileSession
} from '../lib/mobileApi';
import { clearCachedRecords, readCachedRecords, replaceCachedRecords, type CachedRecord } from '../lib/offlineStore';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected mobile application error.';
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function recordTitle(item: CachedRecord): string {
  const name = item.record.Name ?? item.record.Subject ?? item.record.Title;
  return typeof name === 'string' && name.trim() ? name : `${item.objectApi} record`;
}

export default function HomeScreen() {
  const [session, setSession] = useState<MobileSession | null>(null);
  const [apiUrl, setApiUrl] = useState(configuredApiUrl);
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const tenantApiUrlRef = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const tenantSlugRef = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const emailRef = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const passwordRef = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [records, setRecords] = useState<CachedRecord[]>([]);
  const [recordQuery, setRecordQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking');

  const visibleRecords = records.filter(item => (`${recordTitle(item)} ${item.objectApi} ${item.recordId}`).toLocaleLowerCase().includes(recordQuery.trim().toLocaleLowerCase()));

  const refreshCache = useCallback(async (activeSession: MobileSession) => {
    try {
      setRecords(await readCachedRecords(activeSession.identity));
    } catch (cause) {
      setError(`Unable to read encrypted offline records: ${messageFor(cause)}`);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await loadStoredSession();
        if (!active) return;
        if (!stored) return;
        setSession(stored);
        setApiUrl(stored.apiBase);
        await refreshCache(stored);
        try {
          await loadSessionMetadata(stored);
          if (active) setConnection('online');
        } catch (cause) {
          if (active) {
            setConnection('offline');
            setNotice(`Offline mode: ${messageFor(cause)}`);
          }
        }
      } catch (cause) {
        if (active) setError(messageFor(cause));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [refreshCache]);

  const acceptSession = async (nextSession: MobileSession) => {
    setSession(nextSession);
    setApiUrl(nextSession.apiBase);
    setChallengeToken('');
    setPassword('');
    setError('');
    setNotice('');
    setConnection('online');
    await refreshCache(nextSession);
  };

  const submitPassword = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await signInWithPassword({ apiUrl, tenantSlug, email, password });
      if (result.challengeToken) {
        setApiUrl(result.apiBase);
        setChallengeToken(result.challengeToken);
        setNotice('Enter the verification code from your authenticator to finish signing in.');
      } else if (result.session) {
        await acceptSession(result.session);
      }
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  };

  const submitMfa = async () => {
    if (!challengeToken) return;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const session = await completeMfa(normalizeApiBase(apiUrl), challengeToken, mfaCode);
      await acceptSession(session);
      setMfaCode('');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  };

  const synchronize = async () => {
    if (!session || syncing) return;
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const payload = await syncBriefcase(session);
      const count = await replaceCachedRecords(session.identity, payload);
      setRecords(await readCachedRecords(session.identity));
      setConnection('online');
      setNotice(`Synced ${count} read-only records at ${new Date(payload.syncedAt).toLocaleString()}.`);
    } catch (cause) {
      setConnection('offline');
      setError(`Sync failed. Existing offline records were kept. ${messageFor(cause)}`);
    } finally {
      setSyncing(false);
    }
  };

  const signOut = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    let failure: unknown;
    try {
      await signOutRemote(session);
    } catch (cause) {
      failure = cause;
    }
    try {
      await clearCachedRecords(session.identity);
    } catch (cause) {
      failure ??= cause;
    }
    try {
      await deleteStoredSession();
    } catch (cause) {
      failure ??= cause;
    }
    setSession(null);
    setRecords([]);
    setChallengeToken('');
    setConnection('checking');
    setNotice('');
    if (failure) setError(`Signed out locally, but cleanup was incomplete: ${messageFor(failure)}`);
    setLoading(false);
  };

  const confirmSignOut = () => {
    const message = connection === 'offline'
      ? 'You are offline. Clearing this device cache means records cannot be downloaded again until the connection is restored.'
      : 'This removes the locally cached offline records from this device.';
    Alert.alert('Sign out and clear offline data?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out and clear', style: 'destructive', onPress: () => { void signOut(); } }
    ]);
  };

  const refreshIdentity = async () => {
    if (!session) return;
    setError('');
    setNotice('');
    try {
      await loadSessionMetadata(session);
      setConnection('online');
      setNotice('Connection restored.');
    } catch (cause) {
      setConnection('offline');
      setError(messageFor(cause));
    }
  };

  if (loading && !session) {
    return <SafeAreaView style={styles.center}>
      <ActivityIndicator size="large" color="#315fca" />
      <Text style={styles.muted}>Loading MetaDrive…</Text>
    </SafeAreaView>;
  }

  if (!session) {
    return <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardAvoiding}>
      <ScrollView contentContainerStyle={styles.loginContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.brandMark}>M</Text>
          <Text style={styles.brandTitle}>MetaDrive</Text>
          <Text style={styles.muted}>Secure mobile access to your offline briefcase</Text>
        </View>
        <View style={styles.panel}>
          <Text style={styles.heading}>{challengeToken ? 'Verify your identity' : 'Sign in'}</Text>
          {challengeToken ? <>
            <Text style={styles.muted}>Enter the MFA code for your account.</Text>
            <TextInput
              style={styles.input}
              value={mfaCode}
              onChangeText={setMfaCode}
              placeholder="Verification code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={() => void submitMfa()}
              accessibilityLabel="MFA verification code"
            />
            <PrimaryButton title="Verify and continue" onPress={() => void submitMfa()}
              disabled={loading || mfaCode.trim().length === 0} />
            <Pressable onPress={() => { setChallengeToken(''); setMfaCode(''); setNotice(''); }}>
              <Text style={styles.link}>Back to sign in</Text>
            </Pressable>
          </> : <>
            <Field label="Tenant API URL" value={apiUrl} onChangeText={setApiUrl}
              inputRef={tenantApiUrlRef} returnKeyType="next" onSubmitEditing={() => tenantSlugRef.current?.focus()}
              placeholder="https://tenant.example.com" autoCapitalize="none" keyboardType="url" />
            <Field label="Tenant slug" value={tenantSlug} onChangeText={setTenantSlug}
              inputRef={tenantSlugRef} returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()}
              placeholder="your-tenant" autoCapitalize="none" />
            <Field label="Email" value={email} onChangeText={setEmail}
              inputRef={emailRef} returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()}
              placeholder="name@example.com" autoCapitalize="none" keyboardType="email-address"
              autoComplete="email" textContentType="emailAddress" />
            <Field label="Password" value={password} onChangeText={setPassword}
              inputRef={passwordRef} placeholder="Password" secureTextEntry
              autoComplete="current-password" textContentType="password"
              returnKeyType="done" onSubmitEditing={() => void submitPassword()} />
            <PrimaryButton title={loading ? 'Signing in…' : 'Sign in'}
              onPress={() => void submitPassword()} disabled={loading || !apiUrl.trim() || !email.trim() || !password} />
          </>}
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {notice ? <Text style={styles.notice} accessibilityRole="status">{notice}</Text> : null}
        </View>
        <Text style={styles.footer}>Offline records are encrypted on this device and available read-only.</Text>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.safe}>
    <FlatList
      data={visibleRecords}
      keyExtractor={item => `${item.objectApi}:${item.recordId}`}
      initialNumToRender={10}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.listHeader}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>METADRIVE MOBILE</Text>
          <Text style={styles.title}>Offline briefcase</Text>
          <Text style={styles.muted}>Read-only records for {session.identity.userId}</Text>
        </View>
        <View style={[styles.connectionBadge, connection === 'online' ? styles.onlineBadge : styles.offlineBadge]}>
          <Text style={styles.connectionText}>{connection === 'online' ? 'Online' : 'Offline'}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton title={syncing ? 'Syncing…' : 'Sync now'} onPress={() => void synchronize()} disabled={syncing} />
        {connection === 'offline' ? <SecondaryButton title="Retry connection" onPress={() => void refreshIdentity()} /> : null}
        <SecondaryButton title="Sign out and clear data" onPress={confirmSignOut} disabled={syncing || loading} />
      </View>

      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {notice ? <Text style={styles.notice} accessibilityRole="status">{notice}</Text> : null}
      <Text style={styles.sectionTitle}>Cached records ({records.length})</Text>
      {records.length > 0 && <TextInput style={styles.input} placeholder="Search cached records…" value={recordQuery} onChangeText={setRecordQuery} accessibilityLabel="Search offline records" autoCorrect={false} clearButtonMode="while-editing" />}
      </View>}
      ListEmptyComponent={<View style={styles.empty}>
        {records.length === 0 ? <>
          <Text style={styles.emptyTitle}>No offline records yet</Text>
          <Text style={styles.muted}>Ask your administrator to configure your briefcase, then sync while online.</Text>
        </> : <>
          <Text style={styles.emptyTitle}>No matching records</Text>
          <Text style={styles.muted}>Try another search term.</Text>
        </>}
      </View>}
      renderItem={({ item }) => <View style={styles.recordCard}>
        <View style={styles.recordHeading}>
          <View style={styles.recordTitleBlock}>
            <Text style={styles.recordName}>{recordTitle(item)}</Text>
            <Text style={styles.recordMeta}>{item.objectApi} · {item.recordId}</Text>
          </View>
          <Text style={styles.readOnly}>READ ONLY</Text>
        </View>
        {Object.entries(item.record).filter(([, value]) => value !== null && value !== undefined)
          .slice(0, 12).map(([name, value]) => <View key={name} style={styles.recordField}>
            <Text style={styles.recordLabel}>{name}</Text>
            <Text style={styles.recordValue}>{displayValue(value)}</Text>
          </View>)}
      </View>}
      ListFooterComponent={records.length > 0 ? <Text style={styles.footer}>
        Last synced {new Date(records[0].syncedAt).toLocaleString()}. Changes are not available offline.
      </Text> : undefined}
    />
  </SafeAreaView>;
}

function Field({ label, inputRef, ...props }: {
  label: string;
  inputRef?: React.Ref<React.ElementRef<typeof TextInput>>;
} & React.ComponentProps<typeof TextInput>) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput ref={inputRef} style={styles.input} autoCorrect={false} {...props} />
  </View>;
}

function PrimaryButton({ title, onPress, disabled }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return <Pressable style={[styles.primaryButton, disabled && styles.disabledButton]}
    accessibilityRole="button" disabled={disabled} onPress={onPress}>
    <Text style={styles.primaryButtonText}>{title}</Text>
  </Pressable>;
}

function SecondaryButton({ title, onPress, disabled }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return <Pressable style={[styles.secondaryButton, disabled && styles.disabledButton]}
    accessibilityRole="button" disabled={disabled} onPress={onPress}>
    <Text style={styles.secondaryButtonText}>{title}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f7fb' },
  keyboardAvoiding: { flex: 1 },
  listHeader: { gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f4f7fb' },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 16 },
  loginContent: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 20 },
  brand: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  brandMark: { width: 54, height: 54, overflow: 'hidden', borderRadius: 16, backgroundColor: '#315fca',
    color: '#fff', textAlign: 'center', textAlignVertical: 'center', fontSize: 30, fontWeight: '800' },
  brandTitle: { color: '#14213d', fontSize: 26, fontWeight: '800' },
  panel: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 14, borderColor: '#e1e7f0', borderWidth: 1 },
  heading: { color: '#15233e', fontSize: 21, fontWeight: '700' },
  field: { gap: 6 },
  fieldLabel: { color: '#344258', fontSize: 13, fontWeight: '600' },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: '#cad4e2',
    borderRadius: 9, backgroundColor: '#fff', color: '#172338', fontSize: 15 },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18,
    borderRadius: 10, backgroundColor: '#315fca' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabledButton: { opacity: 0.55 },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: 9, borderWidth: 1, borderColor: '#c7d2e2', backgroundColor: '#fff' },
  secondaryButtonText: { color: '#26374f', fontWeight: '600', fontSize: 13 },
  link: { color: '#315fca', fontSize: 14, fontWeight: '600', textAlign: 'center', padding: 8 },
  error: { color: '#b42318', backgroundColor: '#fff0ee', borderRadius: 8, padding: 10, fontSize: 13 },
  notice: { color: '#245b3c', backgroundColor: '#eaf7ef', borderRadius: 8, padding: 10, fontSize: 13 },
  muted: { color: '#64748b', fontSize: 13, lineHeight: 19 },
  footer: { color: '#64748b', fontSize: 12, lineHeight: 18, textAlign: 'center', padding: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingVertical: 10 },
  eyebrow: { color: '#587199', fontSize: 12, letterSpacing: 1.2, fontWeight: '800' },
  title: { color: '#14213d', fontSize: 25, fontWeight: '800', marginVertical: 4 },
  connectionBadge: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  onlineBadge: { backgroundColor: '#e5f5eb' },
  offlineBadge: { backgroundColor: '#fff1df' },
  connectionText: { color: '#26374f', fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionTitle: { color: '#14213d', fontWeight: '700', fontSize: 18, marginTop: 8 },
  empty: { backgroundColor: '#fff', borderRadius: 14, padding: 20, gap: 6, borderWidth: 1, borderColor: '#e1e7f0' },
  emptyTitle: { color: '#14213d', fontSize: 15, fontWeight: '700' },
  recordCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 12,
    borderWidth: 1, borderColor: '#e1e7f0' },
  recordHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  recordTitleBlock: { flex: 1, gap: 4 },
  recordName: { color: '#14213d', fontSize: 16, fontWeight: '700' },
  recordMeta: { color: '#64748b', fontSize: 12 },
  readOnly: { color: '#46618c', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  recordField: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6ebf2', paddingTop: 8, gap: 3 },
  recordLabel: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  recordValue: { color: '#25344b', fontSize: 13, lineHeight: 18 }
});
