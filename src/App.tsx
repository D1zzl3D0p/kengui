import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConnectionStore, loadPersistedSettings } from './store/connection';
import { createRuntimeAdapter, waitForRuntimeHealth } from './runtime/runtime';
import { nativeEvents } from './platform';
import Installing from './pages/Installing';
import Connecting from './pages/Connecting';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import AddJob from './pages/AddJob';

const queryClient = new QueryClient();
const APP_ROUTES = ['/dashboard', '/add', '/settings'];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

function AppRouter() {
  const { serverMode, serverUrl, setConnectionStatus } = useConnectionStore();
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);
  const connectionAttemptRef = useRef(0);

  useEffect(() => {
    loadPersistedSettings().then(() => setInitialized(true));
  }, []);

  useEffect(() => {
    if (!initialized) return;

    let cancelled = false;
    const attemptId = connectionAttemptRef.current + 1;
    connectionAttemptRef.current = attemptId;
    const runtime = createRuntimeAdapter(serverMode, serverUrl);
    const isCurrentAttempt = () =>
      !cancelled && connectionAttemptRef.current === attemptId;
    const navigateToConnecting = () => {
      if (!isAppRoute(window.location.pathname)) {
        navigate('/connecting', { replace: true });
      }
    };
    const navigateAfterConnected = () => {
      if (!isAppRoute(window.location.pathname)) {
        navigate('/dashboard', { replace: true });
      }
    };

    if (serverMode === 'local') {
      runtime.checkAvailable().then((found) => {
        if (!isCurrentAttempt()) return;
        if (!found) {
          setConnectionStatus('not_found');
          navigate('/installing', { replace: true });
          return;
        }
        setConnectionStatus('checking');
        navigateToConnecting();
        runtime
          .start()
          .then(() => waitForRuntimeHealth(runtime))
          .then(() => {
            if (!isCurrentAttempt()) return;
            setConnectionStatus('connected');
            navigateAfterConnected();
          })
          .catch(() => {
            if (!isCurrentAttempt()) return;
            setConnectionStatus('error');
            navigateToConnecting();
          });
      });
    } else {
      setConnectionStatus('checking');
      navigateToConnecting();
      runtime
        .health()
        .then(() => {
          if (!isCurrentAttempt()) return;
          setConnectionStatus('connected');
          navigateAfterConnected();
        })
        .catch(() => {
          if (!isCurrentAttempt()) return;
          setConnectionStatus('error');
          navigateToConnecting();
        });
    }
    return () => {
      cancelled = true;
    };
  }, [initialized, navigate, serverMode, serverUrl, setConnectionStatus]);

  useEffect(() => {
    const ready = nativeEvents.onServerReady(() => {
      const runtime = createRuntimeAdapter(
        useConnectionStore.getState().serverMode,
        useConnectionStore.getState().serverUrl
      );
      waitForRuntimeHealth(runtime)
        .then(() => {
          setConnectionStatus('connected');
          if (!isAppRoute(window.location.pathname)) {
            navigate('/dashboard');
          }
        })
        .catch(() => {
          setConnectionStatus('error');
        });
    });
    const error = nativeEvents.onServerError(() => {
      setConnectionStatus('error');
    });
    return () => {
      ready.then((fn) => fn());
      error.then((fn) => fn());
    };
  }, []);

  return (
    <Routes>
      <Route path="/installing" element={<Installing />} />
      <Route path="/connecting" element={<Connecting />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/add/*" element={<AddJob />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Connecting />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
