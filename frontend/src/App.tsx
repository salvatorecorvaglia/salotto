import { useAuthStore } from './store/authStore';
import AuthPage from './pages/AuthPage';
import MainPage from './pages/MainPage';

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return <MainPage />;
}

export default App;
