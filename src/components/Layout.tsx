import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function Layout({ children }: Props) {
  const location = useLocation();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-lg font-semibold">kengui</span>
        <nav className="flex gap-4 text-sm">
          <Link
            to="/dashboard"
            className={location.pathname === '/dashboard' ? 'font-medium' : 'text-muted-foreground'}
          >
            Queue
          </Link>
          <Link
            to="/settings"
            className={location.pathname === '/settings' ? 'font-medium' : 'text-muted-foreground'}
          >
            Settings
          </Link>
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
