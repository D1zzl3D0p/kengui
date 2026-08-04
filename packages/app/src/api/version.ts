/**
 * Runtime API-version handshake.
 *
 * kengui is generated against a pinned kenkui version (see
 * `packages/app/src/api/generated/meta.ts`, produced by `npm run contract:generate`). At
 * connect time we compare the server's advertised `api_version` (from the
 * /health endpoint) against the version the client was built for. Per kenkui's
 * compatibility policy (docs/API_COMPATIBILITY.md), the API is additive-only
 * within a major version, so a matching major means the client is compatible.
 * A mismatch is a non-blocking, UI-visible warning -- never a hard gate.
 */
import { BUILT_FOR_API_VERSION } from './generated/meta';

export type VersionCompatibility = 'compatible' | 'server-newer' | 'server-older' | 'unknown';

export interface VersionHandshake {
  compatibility: VersionCompatibility;
  builtFor: string;
  server: string | null;
  /** Human-readable warning, or null when compatible/unknown-but-quiet. */
  warning: string | null;
}

/** Parse a major version from an api_version string like "v1", "v2", "1", "2.3". */
export function parseMajor(version: string | null | undefined): number | null {
  if (!version) return null;
  const match = /v?(\d+)/i.exec(version.trim());
  if (!match?.[1]) return null;
  const major = Number.parseInt(match[1], 10);
  return Number.isNaN(major) ? null : major;
}

/**
 * Pure comparison of the server's API version against the built-for version.
 * Both default-safe: unparseable inputs yield 'unknown'.
 */
export function compareApiVersion(
  builtForVersion: string,
  serverVersion: string | null | undefined
): VersionCompatibility {
  const builtMajor = parseMajor(builtForVersion);
  const serverMajor = parseMajor(serverVersion);
  if (builtMajor === null || serverMajor === null) return 'unknown';
  if (serverMajor === builtMajor) return 'compatible';
  return serverMajor > builtMajor ? 'server-newer' : 'server-older';
}

function warningFor(
  compatibility: VersionCompatibility,
  builtFor: string,
  server: string | null
): string | null {
  switch (compatibility) {
    case 'server-newer':
      return `The server speaks a newer API (${server}) than this app was built for (${builtFor}). Some responses may not be understood; update kengui.`;
    case 'server-older':
      return `The server speaks an older API (${server}) than this app was built for (${builtFor}). Some features may be unavailable; update the kenkui server.`;
    default:
      return null;
  }
}

/**
 * Build a handshake result from a health payload's `api_version`. Uses the
 * compiled-in built-for version unless overridden (tests).
 */
export function evaluateVersionHandshake(
  serverApiVersion: string | null | undefined,
  builtForVersion: string = BUILT_FOR_API_VERSION
): VersionHandshake {
  const server = serverApiVersion ?? null;
  const compatibility = compareApiVersion(builtForVersion, server);
  return {
    compatibility,
    builtFor: builtForVersion,
    server,
    warning: warningFor(compatibility, builtForVersion, server),
  };
}
