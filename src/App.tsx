import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConnectionStore, loadPersistedSettings } from './store/connection';
import { createRuntimeAdapter, waitForRuntimeHealth } from './runtime/runtime';
import { connectCurrentRuntime } from './runtime/connectRuntime';
import { nativeEvents } from './platform';
import Installing from './pages/Installing';
import Connect from './pages/Connecting';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Voices from './pages/Voices';
import Audiobooks from './pages/Audiobooks';
import AddJob from './pages/AddJob';

const queryClient = new QueryClient();
const APP_ROUTES = ['/dashboard', '/add', '/settings', '/voices', '/audiobooks'];
const LOCAL_RUNTIME_ENABLED = import.meta.env.VITE_KENGUI_ENABLE_LOCAL !== 'false';

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

function AppRouter() {
  const { serverMode, serverUrl, lastConnectedAt, setConnectionStatus, setConnectionError, markConnected } = useConnectionStore();
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);
  const connectionAttemptRef = useRef(0);

  useEffect(() => {
    loadPersistedSettings().then(() => setInitialized(true));
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!lastConnectedAt || (serverMode === 'local' && !LOCAL_RUNTIME_ENABLED)) {
      if (!isAppRoute(window.location.pathname)) {
        navigate('/connect', { replace: true });
      }
      return;
    }

    let cancelled = false;
    const attemptId = connectionAttemptRef.current + 1;
    connectionAttemptRef.current = attemptId;
    const isCurrentAttempt = () =>
      !cancelled && connectionAttemptRef.current === attemptId;
    const navigateToConnect = () => {
      if (!isAppRoute(window.location.pathname)) {
        navigate('/connect', { replace: true });
      }
    };
    const navigateAfterConnected = () => {
      if (!isAppRoute(window.location.pathname)) {
        navigate('/dashboard', { replace: true });
      }
    };

    navigateToConnect();
    connectCurrentRuntime()
      .then(() => {
        if (!isCurrentAttempt()) return;
        setConnectionError(null);
        navigateAfterConnected();
      })
      .catch((error) => {
        if (!isCurrentAttempt()) return;
        setConnectionError(
          error instanceof Error
            ? error.message
            : 'Could not reach kenkui. Check that it is running and try again.'
        );
        setConnectionStatus(
          useConnectionStore.getState().connectionStatus === 'not_found'
            ? 'not_found'
            : 'error'
        );
        navigateToConnect();
      });
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
          setConnectionError(null);
          setConnectionStatus('connected');
          markConnected();
          if (!isAppRoute(window.location.pathname)) {
            navigate('/dashboard');
          }
        })
        .catch((error) => {
          setConnectionError(
            error instanceof Error
              ? error.message
              : 'Could not reach kenkui. Check that it is running and try again.'
          );
          setConnectionStatus('error');
        });
    });
    const error = nativeEvents.onServerError((message) => {
      setConnectionError(message || 'The managed kenkui process exited before becoming ready.');
      setConnectionStatus('error');
    });
    return () => {
      ready.then((fn) => fn());
      error.then((fn) => fn());
    };
  }, [navigate, markConnected, setConnectionError, setConnectionStatus]);

  return (
    <Routes>
      <Route path="/installing" element={<Installing />} />
      <Route path="/connect" element={<Connect />} />
      <Route path="/connecting" element={<Connect />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/audiobooks" element={<Audiobooks />} />
      <Route path="/voices" element={<Voices />} />
      <Route path="/add/*" element={<AddJob />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Connect />} />
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
