// Identical security guards to @pionne/react-native — duplicated rather
// than shared via a package because each SDK ships standalone with no
// runtime dependency on the others. Keep this file in lock-step with
// pionne-react-native/src/security.ts.

const TOKEN_PREFIX = 'pio_live_';
const MIN_TOKEN_LENGTH = TOKEN_PREFIX.length + 16;

export function validateEndpoint(endpoint: string, isLocalhost: boolean): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol === 'https:') return true;
    if (u.protocol !== 'http:') return false;
    if (!isLocalhost) return false;
    return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local)$/.test(u.hostname);
  } catch {
    return false;
  }
}

export function validateToken(token: string): boolean {
  if (typeof token !== 'string') return false;
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  if (token.length < MIN_TOKEN_LENGTH) return false;
  const lower = token.toLowerCase();
  for (const bad of ['xxx', 'yyy', 'todo', 'fixme', 'replace', 'changeme']) {
    if (lower.includes(bad)) return false;
  }
  return true;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private capacity: number,
    private refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  allow(): boolean {
    if (this.refillPerSecond <= 0) return true;
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs > 0) {
      const refill = (elapsedMs / 1000) * this.refillPerSecond;
      this.tokens = Math.min(this.capacity, this.tokens + refill);
      this.lastRefill = now;
    }
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
