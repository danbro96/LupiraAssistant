import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  OIDC_CLIENT_ID,
  OIDC_ISSUER,
  OIDC_REDIRECT_PATH,
  OIDC_SCHEME,
  OIDC_SCOPES,
} from '../../data/auth/oidc-config';
import { decodeJwt } from '@danbro96/lupira-expo-oidc/oidc';
import { oidc } from '../../data/auth/oidc';
import { useAuth } from '../../state/auth-store';
import { Button } from '@danbro96/lupira-expo-paper/components/Button';
import { spacing, useColors, type Palette } from '../theme';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Dismisses the in-app browser when the auth redirect returns.
WebBrowser.maybeCompleteAuthSession();

async function exchangeCodeForSession(
  discovery: AuthSession.DiscoveryDocument,
  request: AuthSession.AuthRequest,
  code: string,
  redirectUri: string,
  setBusy: (busy: boolean) => void,
  setError: (error: string | null) => void,
) {
  setBusy(true);
  setError(null);
  try {
    const tokenEndpoint = discovery.tokenEndpoint;
    if (!tokenEndpoint) {
      setError('Discovery returned no token endpoint.');
      return;
    }
    const token = await oidc.exchangeAuthCode({
      tokenEndpoint,
      code,
      redirectUri,
      codeVerifier: request.codeVerifier,
    });
    const claims = decodeJwt(token.idToken ?? token.accessToken);
    const email = (claims.email as string) ?? (claims.preferred_username as string) ?? (claims.sub as string) ?? '';
    const name = (claims.name as string) ?? undefined;
    await useAuth.getState().setSession(
      {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: Date.now() + (token.expiresIn ?? 3600) * 1000,
      },
      { sub: email, displayName: name },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logDebug('signin:error', msg);
    setError(msg);
  } finally {
    setBusy(false);
  }
}

export function SignInScreen() {
  const c = useColors();
  const styles = makeStyles(c);

  const discovery = AuthSession.useAutoDiscovery(OIDC_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: OIDC_SCHEME, path: OIDC_REDIRECT_PATH });
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    { clientId: OIDC_CLIENT_ID, scopes: OIDC_SCOPES, redirectUri, usePKCE: true },
    discovery,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    // createTask:false keeps the auth tab in the app's task so the redirect returns into it.
    const response = await promptAsync({ createTask: false }).catch((e: unknown) => {
      setError(String(e));
      return null;
    });
    if (!response || response.type !== 'success' || !discovery || !request) return;
    await exchangeCodeForSession(discovery, request, response.params.code, redirectUri, setBusy, setError);
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>Lupira Assistant</Text>
      <Button
        title="Sign in with Authentik"
        onPress={() => void handleSignIn()}
        disabled={!request || busy}
        loading={busy}
      />
      {busy ? <ActivityIndicator style={styles.spinner} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
