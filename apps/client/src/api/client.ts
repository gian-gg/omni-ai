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

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ── Chat / Conversations ──────────────────────────────────────────────────

export type ConversationItem = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type MessageItem = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  details: any | null;
  created_at: string;
};

export type ConversationCreateResponse = {
  conversation: ConversationItem;
  message: MessageItem;
};

export type ConversationListResponse = {
  items: ConversationItem[];
  total: number;
  limit: number;
  offset: number;
};

export type ConversationMessagesResponse = {
  items: MessageItem[];
};

export async function listConversations(limit = 50, offset = 0): Promise<ConversationListResponse> {
  return apiFetch<ConversationListResponse>(`/conversations?limit=${limit}&offset=${offset}`);
}

export async function listConversationMessages(conversationId: string): Promise<ConversationMessagesResponse> {
  return apiFetch<ConversationMessagesResponse>(`/conversations/${conversationId}/messages`);
}

export async function createConversation(prompt: string): Promise<ConversationCreateResponse> {
  return apiFetch<ConversationCreateResponse>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

export async function appendMessage(conversationId: string, prompt: string): Promise<MessageItem> {
  return apiFetch<MessageItem>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch<void>(`/conversations/${conversationId}`, {
    method: 'DELETE',
  });
}

/**
 * Send a plain-text prompt to the orchestrator and get a single response.
 * No streaming — just a direct POST → JSON round-trip.
 * @deprecated Use createConversation or appendMessage instead.
 */
export async function sendMessage(prompt: string): Promise<any> {
  return apiFetch<any>('/chat', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

export async function createTransaction(payload: TransactionUpdatePayload): Promise<TransactionItem> {
  return apiFetch<TransactionItem>('/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createTodo(payload: TodoUpdatePayload): Promise<TodoItem> {
  return apiFetch<TodoItem>('/todos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createNote(payload: NoteUpdatePayload): Promise<NoteItem> {
  return apiFetch<NoteItem>('/notes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Transactions ────────────────────────────────────────────────────

export type TransactionItem = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  category: string | null;
  description: string | null;
  date: string;
  created_at: string;
  updated_at: string;
};

export type TransactionListResponse = {
  items: TransactionItem[];
  total: number;
  limit: number;
  offset: number;
};

export async function listTransactions(
  limit = 50,
  offset = 0,
): Promise<TransactionListResponse> {
  return apiFetch<TransactionListResponse>(
    `/transactions?limit=${limit}&offset=${offset}`,
  );
}

export type TransactionUpdatePayload = {
  type?: 'income' | 'expense';
  amount?: number;
  currency?: string;
  category?: string | null;
  description?: string | null;
  date?: string;
};

export async function updateTransaction(
  id: string,
  payload: TransactionUpdatePayload,
): Promise<TransactionItem> {
  return apiFetch<TransactionItem>(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiFetch<void>(`/transactions/${id}`, {
    method: 'DELETE',
  });
}

// ── To-Dos ──────────────────────────────────────────────────────────

export type TodoItem = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  date: string;
  is_done: boolean;
  created_at: string;
  updated_at: string;
};

export type TodoListResponse = {
  items: TodoItem[];
  total: number;
  limit: number;
  offset: number;
};

export async function listTodos(
  limit = 50,
  offset = 0,
): Promise<TodoListResponse> {
  return apiFetch<TodoListResponse>(`/todos?limit=${limit}&offset=${offset}`);
}

export async function completeTodoApi(id: string): Promise<TodoItem> {
  return apiFetch<TodoItem>(`/todos/${id}/complete`, {
    method: 'POST',
  });
}

export type TodoUpdatePayload = {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: 'low' | 'medium' | 'high';
  is_done?: boolean;
};

export async function updateTodo(
  id: string,
  payload: TodoUpdatePayload,
): Promise<TodoItem> {
  return apiFetch<TodoItem>(`/todos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteTodo(id: string): Promise<void> {
  await apiFetch<void>(`/todos/${id}`, {
    method: 'DELETE',
  });
}

// ── Notes ───────────────────────────────────────────────────────────

export type NoteItem = {
  id: string;
  title: string | null;
  content: string;
  tags: string[];
  date: string;
  created_at: string;
  updated_at: string;
};

export type NoteListResponse = {
  items: NoteItem[];
  total: number;
  limit: number;
  offset: number;
};

export async function listNotes(
  limit = 50,
  offset = 0,
): Promise<NoteListResponse> {
  return apiFetch<NoteListResponse>(`/notes?limit=${limit}&offset=${offset}`);
}

export type NoteUpdatePayload = {
  title?: string | null;
  content?: string;
  tags?: string[];
};

export async function updateNote(
  id: string,
  payload: NoteUpdatePayload,
): Promise<NoteItem> {
  return apiFetch<NoteItem>(`/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteNote(id: string): Promise<void> {
  await apiFetch<void>(`/notes/${id}`, {
    method: 'DELETE',
  });
}
