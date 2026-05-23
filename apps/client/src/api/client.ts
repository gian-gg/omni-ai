import * as SecureStore from 'expo-secure-store';

const API_BASE = 'https://omni-api.giann.dev/api/v1';

let refreshPromise: Promise<string | null> | null = null;

/**
 * Call the backend's /auth/refresh endpoint to swap the stored
 * refresh_token for a fresh access_token + refresh_token pair.
 * Returns the new access_token on success, or null on failure
 * (in which case both tokens are wiped so the app can redirect to login).
 */
async function refreshAccessToken(): Promise<string | null> {
  // If a refresh is already in flight, wait for that one instead of firing another.
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (!refreshToken) return null;

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        // Refresh token is invalid / expired — wipe everything.
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        return null;
      }

      const data = await res.json();
      const newAccessToken: string | null = data.access_token ?? null;
      const newRefreshToken: string | null = data.refresh_token ?? null;

      if (newAccessToken) {
        await SecureStore.setItemAsync('access_token', newAccessToken);
      }
      if (newRefreshToken) {
        await SecureStore.setItemAsync('refresh_token', newRefreshToken);
      }

      return newAccessToken;
    } catch {
      // Network error during refresh — wipe tokens to be safe.
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ── Generic request helper ──────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false,
): Promise<T> {
  const token = await SecureStore.getItemAsync('access_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // If we got a 401 and haven't retried yet, attempt a silent token refresh.
  if (res.status === 401 && !_isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      // Retry the original request with the fresh token.
      return apiFetch<T>(path, options, true);
    }
    // Refresh failed — fall through to the error below.
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ── Chat ────────────────────────────────────────────────────────────

export type ChatResponse = {
  response: string;
};

/**
 * Send a plain-text prompt to the orchestrator and get a single response.
 * No streaming — just a direct POST → JSON round-trip.
 */
export async function sendMessage(prompt: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}
