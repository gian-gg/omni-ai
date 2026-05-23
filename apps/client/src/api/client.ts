import * as SecureStore from 'expo-secure-store';

// ── Base URL ────────────────────────────────────────────────────────
// Swap this to your tunnel/production URL when testing on a physical device.
const API_BASE = 'https://omni-api.giann.dev/api/v1';

// ── Generic request helper ──────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
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
