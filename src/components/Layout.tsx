import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  BookOpen,
  Headphones,
  Library,
  Search,
  Settings,
  SlidersHorizontal,
  Waves,
} from 'lucide-react';

interface Props {
  children: ReactNode;
}

const navItems = [
  { to: '/dashboard', label: 'Library', icon: Library },
  { to: '/add', label: 'Convert', icon: BookOpen },
  { to: '/voices', label: 'Voices', icon: Waves },
  { to: '/audiobooks', label: 'Audiobooks', icon: Headphones },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function Layout({ children }: Props) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-transparent text-foreground md:grid md:min-h-screen md:grid-cols-[15rem_minmax(0,1fr)] md:items-stretch">
      <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:min-h-screen md:flex-col">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-sidebar-border bg-[radial-gradient(circle_at_35%_25%,rgb(184_155_77_/_45%),rgb(243_232_214_/_14%)_42%,rgb(243_232_214_/_6%))] font-heading text-4xl font-semibold leading-none shadow-[0_10px_30px_rgb(0_0_0_/_18%)]">K</span>
          <div>
            <p className="font-heading text-xl font-semibold leading-none">KenGUI</p>
            <p className="mt-1 text-xs text-sidebar-foreground/70">Kenku scriptorium</p>
          </div>
        </div>

        <div className="px-4 py-5">
          <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent px-3 py-2 text-sm text-sidebar-foreground/75">
            <Search className="size-4" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Search library or conversions</span>
            <kbd className="rounded border border-sidebar-border px-1.5 py-0.5 text-[0.65rem]">
              Ctrl K
            </kbd>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 text-sm">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = isActive(location.pathname, to);
            const className = active
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground/78 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

            const content = (
              <>
                <Icon className="size-4" aria-hidden="true" />
                <span>{label}</span>
              </>
            );

            return (
              <Link
                key={label}
                to={to}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 transition-colors ${className}`}
              >
                {content}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-sidebar-border p-4 text-xs leading-relaxed text-sidebar-foreground/68">
          A careful little mimic turns pages into voices — local, external, or hosted.
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/92 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border bg-card font-heading text-3xl font-semibold leading-none shadow-sm">K</span>
            <div>
              <p className="font-heading text-xl font-semibold leading-none">KenGUI</p>
              <p className="mt-1 text-xs text-muted-foreground">Kenku scriptorium</p>
            </div>
          </div>
          <Link
            to="/settings"
            aria-label="Open settings"
            className="flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
          </Link>
        </header>

        <main className="flex-1 overflow-auto px-4 py-5 pb-24 md:min-h-screen md:px-8 md:py-8">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-card/95 text-xs shadow-[0_-8px_24px_rgb(40_58_66_/_10%)] backdrop-blur md:hidden">
          {navItems
            .filter((item) => ['Library', 'Convert', 'Voices', 'Settings'].includes(item.label))
            .map(({ to, label, icon: Icon }) => {
              const active = isActive(location.pathname, to);
              const className = `flex min-h-14 flex-col items-center justify-center gap-1 ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`;
              const content = (
                <>
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{label}</span>
                </>
              );

              return (
                <Link key={label} to={to} className={className}>
                  {content}
                </Link>
              );
            })}
        </nav>
      </div>
    </div>
  );
}
