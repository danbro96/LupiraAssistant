import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import * as WebBrowser from 'expo-web-browser';
import { useOidcLogin } from '@danbro96/lupira-expo-oidc/useOidcLogin';
import { OIDC_REDIRECT_PATH, OIDC_SCHEME, OIDC_SCOPES } from '../../data/auth/oidc-config';
import { oidc } from '../../data/auth/oidc';
import { useAuth } from '../../state/auth-store';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { spacing, useColors, type Palette } from '../theme';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';

// Dismisses the in-app browser when the auth redirect returns.
WebBrowser.maybeCompleteAuthSession();

export function SignInScreen() {
  const c = useColors();
  const styles = makeStyles(c);

  const { status, error, retry, signIn } = useOidcLogin({
    oidc,
    scopes: OIDC_SCOPES,
    scheme: OIDC_SCHEME,
    path: OIDC_REDIRECT_PATH,
    onTokens: (tokens) => useAuth.getState().setSession(tokens),
    log: logDebug,
  });

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>Lupira Assistant</Text>
      <Button
        title="Sign in with Authentik"
        onPress={() => {
          signIn().catch(() => toastError('Sign-in failed'));
        }}
        disabled={status !== 'ready'}
        loading={status === 'busy'}
      />
      {status === 'busy' ? <ActivityIndicator style={styles.spinner} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status === 'unavailable' ? <Button title="Retry" variant="secondary" onPress={retry} /> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: c.bg, gap: spacing.md },
    title: { textAlign: 'center', marginBottom: spacing.lg },
    spinner: { marginTop: spacing.md },
    error: { color: c.danger, textAlign: 'center', marginTop: spacing.md },
  });
