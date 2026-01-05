import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/space-grotesk';
import { AuthProvider, useAuth } from './src/context/auth';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { IdentityScreen, type PixKeyType } from './src/screens/IdentityScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { sanitizeCpf } from './src/utils/validation';

export default function App(): JSX.Element | null {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <AppContent />
    </AuthProvider>
  );
}

function AppContent(): JSX.Element {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return <LoadingScreen />;
  }

  if (auth.status === 'signedOut') {
    return <AuthFlow />;
  }

  if (auth.status === 'needsIdentity') {
    return <IdentityFlow />;
  }

  return (
    <LobbyScreen
      identity={auth.identity}
      accountId={auth.accountId ?? ''}
      onSignOut={auth.signOut}
    />
  );
}

function AuthFlow(): JSX.Element {
  const auth = useAuth();
  const [mode, setMode] = useState<'welcome' | 'login'>('welcome');
  const [accountId, setAccountId] = useState('');

  if (mode === 'welcome') {
    return (
      <WelcomeScreen
        onCreate={auth.signUp}
        onLogin={() => {
          auth.resetError();
          setMode('login');
        }}
      />
    );
  }

  return (
    <LoginScreen
      accountId={accountId}
      onAccountIdChange={(value) => {
        auth.resetError();
        setAccountId(value);
      }}
      onSubmit={() => auth.signIn(accountId)}
      onBack={() => {
        auth.resetError();
        setMode('welcome');
      }}
      error={auth.error}
    />
  );
}

function IdentityFlow(): JSX.Element {
  const auth = useAuth();
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('email');
  const [pixKey, setPixKey] = useState('');

  return (
    <IdentityScreen
      accountId={auth.accountId ?? ''}
      fullName={fullName}
      cpf={cpf}
      pixKey={pixKey}
      pixKeyType={pixKeyType}
      onFullNameChange={(value) => {
        auth.resetError();
        setFullName(value);
      }}
      onCpfChange={(value) => {
        auth.resetError();
        setCpf(value);
      }}
      onPixKeyChange={(value) => {
        auth.resetError();
        setPixKey(value);
      }}
      onPixKeyTypeChange={(value) => {
        auth.resetError();
        setPixKeyType(value);
      }}
      onSubmit={() =>
        auth.completeIdentity({
          fullName: fullName.trim(),
          cpf: sanitizeCpf(cpf),
          pixKey: pixKey.trim(),
          pixKeyType,
        })
      }
      onSignOut={auth.signOut}
      error={auth.error}
    />
  );
}
