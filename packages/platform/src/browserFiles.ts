const BROWSER_FILE_PREFIX = 'browser-file:';
const BROWSER_DOWNLOAD_PREFIX = 'browser-download:';

const browserFiles = new Map<string, File>();
let nextBrowserFileId = 0;

/**
 * Retains the browser's opaque File while exposing only a serializable token to
 * shared application state. A new selection supersedes the previous one.
 */
export function registerBrowserFile(file: File): string {
  browserFiles.clear();
  nextBrowserFileId += 1;
  const token = `${BROWSER_FILE_PREFIX}${Date.now()}-${nextBrowserFileId}/${encodeURIComponent(file.name)}`;
  browserFiles.set(token, file);
  return token;
}

export function getBrowserFile(token: string): File | undefined {
  return browserFiles.get(token);
}

export function isBrowserFilePath(path: string): boolean {
  return path.startsWith(BROWSER_FILE_PREFIX);
}

export function browserDownloadPath(filename: string): string {
  return `${BROWSER_DOWNLOAD_PREFIX}${encodeURIComponent(filename)}`;
}

export function browserDownloadName(path: string): string | null {
  if (!path.startsWith(BROWSER_DOWNLOAD_PREFIX)) return null;
  try {
    return decodeURIComponent(path.slice(BROWSER_DOWNLOAD_PREFIX.length));
  } catch {
    return null;
  }
}
