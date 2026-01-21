import { useState } from 'react';
import { AuthProvider, useAuth } from './context/auth';
import { sanitizeCpf } from './utils/validation';
import { LoadingScreen } from './screens/LoadingScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { IdentityScreen, type PixKeyType } from './screens/IdentityScreen';
import { HomeScreen } from './screens/HomeScreen';

export default function App(): JSX.Element {
  return (
    <AuthProvider>
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
    <HomeScreen
      identity={auth.identity}
      accountId={auth.accountId ?? ''}
      onSignOut={auth.signOut}
    />
  );
}

function AuthFlow(): JSX.Element {
  const auth = useAuth();
  const [mode, setMode] = useState<'welcome' | 'login'>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
      email={email}
      password={password}
      onEmailChange={(value) => {
        auth.resetError();
        setEmail(value);
      }}
      onPasswordChange={(value) => {
        auth.resetError();
        setPassword(value);
      }}
      onSubmit={() => auth.signIn(email, password)}
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
  const [termsAccepted, setTermsAccepted] = useState(false);

  return (
    <IdentityScreen
      accountId={auth.accountId ?? ''}
      fullName={fullName}
      cpf={cpf}
      pixKey={pixKey}
      pixKeyType={pixKeyType}
      termsAccepted={termsAccepted}
      onTermsChange={(value) => {
        auth.resetError();
        setTermsAccepted(value);
      }}
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
      onSignOut={() => {
        auth.signOut();
        setTermsAccepted(false);
      }}
      error={auth.error}
    />
  );
}
