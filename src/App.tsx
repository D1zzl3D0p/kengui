import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useConnectionStore, loadPersistedSettings } from './store/connection';
import Installing from './pages/Installing';
import Connecting from './pages/Connecting';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import AddJob from './pages/AddJob';

const queryClient = new QueryClient();

function AppRouter() {
  const { serverMode, serverUrl, setConnectionStatus } = useConnectionStore();
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    loadPersistedSettings().then(() => setInitialized(true));
  }, []);

  useEffect(() => {
    if (!initialized) return;

    if (serverMode === 'local') {
      invoke<boolean>('check_kenkui').then((found) => {
        if (!found) {
          setConnectionStatus('not_found');
          navigate('/installing');
          return;
        }
        setConnectionStatus('checking');
        navigate('/connecting');
        invoke('spawn_server').catch(() => setConnectionStatus('error'));
      });
    } else {
      fetch(`${serverUrl}/health`)
        .then(() => {
          setConnectionStatus('connected');
          navigate('/dashboard');
        })
        .catch(() => {
          setConnectionStatus('error');
          navigate('/connecting');
        });
    }
  }, [initialized]);

  useEffect(() => {
    const ready = listen('server-ready', () => {
      setConnectionStatus('connected');
      navigate('/dashboard');
    });
    const error = listen<string>('server-error', () => {
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
