import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConnectionStore, loadPersistedSettings } from './store/connection';
import { createRuntimeAdapter, RuntimeCompatibilityError, waitForRuntimeHealth } from './runtime/runtime';
import { getRequestedLocalChapterThreads } from './runtime/threadBudget';
import { updateConfig } from './api/config';
import { nativeEvents } from './platform';
import Installing from './pages/Installing';
import Connecting from './pages/Connecting';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Voices from './pages/Voices';
import AddJob from './pages/AddJob';

const queryClient = new QueryClient();
const APP_ROUTES = ['/dashboard', '/add', '/settings', '/voices'];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

function AppRouter() {
  const { serverMode, serverUrl, setConnectionStatus, setConnectionError } = useConnectionStore();
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
        setConnectionError(null);
        navigateToConnecting();
        runtime
          .health()
          .then(() => {
            if (!isCurrentAttempt()) return;
            setConnectionError(null);
            setConnectionStatus('connected');
            navigateAfterConnected();
          })
          .catch((healthError) => {
            if (!isCurrentAttempt()) return;
            if (healthError instanceof RuntimeCompatibilityError) {
              setConnectionError(healthError.message);
              setConnectionStatus('error');
              navigateToConnecting();
              return;
            }

            runtime
              .start()
              .then(() => waitForRuntimeHealth(runtime))
              .then(async () => {
                if (!isCurrentAttempt()) return;
                const requestedThreads = getRequestedLocalChapterThreads();
                try {
                  await updateConfig({ chapter_threads: requestedThreads });
                } catch (error) {
                  console.warn('Failed to submit local chapter thread config.', error);
                }
                if (!isCurrentAttempt()) return;
                setConnectionError(null);
                setConnectionStatus('connected');
                navigateAfterConnected();
              })
              .catch((startError) => {
                if (!isCurrentAttempt()) return;
                setConnectionError(
                  startError instanceof Error
                    ? startError.message
                    : 'Could not reach kenkui. Check that it is running and try again.'
                );
                setConnectionStatus('error');
                navigateToConnecting();
              });
          });
      });
    } else {
      setConnectionStatus('checking');
      setConnectionError(null);
      navigateToConnecting();
      runtime
        .health()
        .then(() => {
          if (!isCurrentAttempt()) return;
          setConnectionError(null);
          setConnectionStatus('connected');
          navigateAfterConnected();
        })
        .catch((error) => {
          if (!isCurrentAttempt()) return;
          setConnectionError(
            error instanceof Error
              ? error.message
              : 'Could not reach kenkui. Check that it is running and try again.'
          );
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
          setConnectionError(null);
          setConnectionStatus('connected');
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
  }, [navigate, setConnectionError, setConnectionStatus]);

  return (
    <Routes>
      <Route path="/installing" element={<Installing />} />
      <Route path="/connecting" element={<Connecting />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/voices" element={<Voices />} />
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
