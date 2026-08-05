/**
 * Detects whether the app is running inside the Tauri desktop webview.
 *
 * Tauri v2 injects `__TAURI_INTERNALS__` onto `window` in every webview, so its
 * presence is a reliable synchronous signal that native commands are available.
 * On the hosted web build (plain browser) none of these are present.
 */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return (
    '__TAURI_INTERNALS__' in w || '__TAURI__' in w || w.isTauri === true
  );
}
