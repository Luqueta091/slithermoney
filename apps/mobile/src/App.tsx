import { AuthProvider, useAuth } from './context/auth';
import { LoadingScreen } from './screens/LoadingScreen';
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

  return <HomeScreen />;
}
