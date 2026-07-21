import { useAuthStore } from './store/authStore';
import AuthPage from './pages/AuthPage';
import MainPage from './pages/MainPage';
import TitleBar from './components/TitleBar';

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#070b13]">
        <TitleBar />
        <div className="flex-1 overflow-hidden">
          <AuthPage />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#070b13]">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        <MainPage />
      </div>
    </div>
  );
}

export default App;
