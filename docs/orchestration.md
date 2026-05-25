# Orchestration

The orchestrator turns one user prompt into one structured result. It is a
hand-rolled streaming runner (`app/services/orchestrator.py`) over a set of
LangGraph-style nodes (`app/graph/nodes/`) that share a typed state
(`app/graph/state.py`).

## Shared state

`OrchestratorState` (a `TypedDict`) threads through every node:

| Field | Meaning |
|-------|---------|
| `user_id` | Local user id (enables RAG + tools); `None` for anonymous runs. |
| `currency` | The user's display currency (ISO 4217), used as an LLM hint. |
| `user_input` | The current prompt. |
| `history` | Recent `{role, content}` turns (normalized, capped at 10). |
| `intent` | `finance` \| `todo` \| `note` \| `chat`. |
| `response` | The user-facing reply. |
| `complete_response` / `cancelled_response` | Capture-intent approve/cancel strings. |
| `data` | Typed payload for capture intents (else `None`). |
| `tokens` | Accumulated token usage (reducer = `add`). |
| `notes_context` | Retrieved notes passed to the LLM as grounding. |
| `sources` | Citable retrieved notes `{id, title, similarity}`. |
| `used_source_ids` | Which sources the model actually used. |
| `tool_calls` | Executed read-only tool calls and their results. |

## The pipeline

```txt
                       ┌──────────┐
   user_input ───────▶ │ classify │  intent ∈ {finance,todo,note,chat}
                       └────┬─────┘
                            ▼
                       ┌──────────┐
                       │ retrieve │  top-k notes from pgvector (needs user_id)
                       └────┬─────┘
                            ▼
                       ┌──────────┐
                       │  query   │  read-only tools (chat intent only)
                       └────┬─────┘
                            ▼
                   route_by_intent
              ┌─────────────┼───────────────┐
              ▼             ▼                ▼
      extract_finance  extract_todo /   chat_reply
                       extract_note     (streamed)
              │             │                │
              └─────────────┴────────────────┘
                            ▼
                    OrchestratorResult
```

`classify`, `retrieve`, and `query` always run first (token usage from each is
summed). Then `route_by_intent` picks the branch:

- A **capture intent** runs its extractor once and finishes (no token deltas
  streamed — the payload arrives whole).
- The **chat intent** streams the reply token-by-token.

Either branch ends with exactly one terminal result.

## Nodes

### `classify` (`app/graph/nodes/classify.py`)

Calls the LLM in JSON mode with a strict system prompt whose decisive question
is *"is the user RECORDING new data, or doing anything else?"*. Returns one of
the four intents; anything unparseable or unknown coerces to `chat`. Lookups and
questions about finance/todos/notes are explicitly classified as `chat`.

### `retrieve` (`app/graph/nodes/retrieve.py`) — RAG

Embeds the prompt with Gemini (`task_type="RETRIEVAL_QUERY"`) and runs a
cosine-distance search over the user's notes in `pgvector`:

```sql
SELECT id, title, content, date,
       1 - (embedding <=> CAST(:query_vector AS vector)) AS similarity
FROM notes
WHERE user_id = :user_id AND embedding IS NOT NULL
ORDER BY embedding <=> CAST(:query_vector AS vector) ASC
LIMIT :limit
```

- `TOP_K = 3`, `SIMILARITY_THRESHOLD = 0.65`, content capped at 500 chars.
- No `user_id`, no embedding, or a failed query → empty context (the run
  continues without grounding).
- Produces both `notes_context` (for the prompt) and `sources` (for citation).

### `query` (`app/graph/nodes/query.py`) — read-only tools

Only runs for the **chat** intent with a known `user_id`. Asks DeepSeek (with the
tool specs) whether any read-only tool should be called to answer a
data-dependent question. The system prompt is deliberately conservative: *when in
doubt, return zero tool calls*. Executed tool results are attached to
`tool_calls` and later fed to the reply node.

Available tools (`app/services/tools.py`):

| Tool | Purpose |
|------|---------|
| `list_transactions` | List transactions, filtered by date range / type / category (cap 50). |
| `aggregate_transactions` | `sum` / `count` / `avg`, optionally grouped by `category` / `day` / `type`. |
| `list_todos` | List todos, filtered by completion / priority / due date (cap 50). |
| `count_todos` | Count todos, optionally filtered. |
| `get_current_date` | Today's date, so the model can resolve relative phrases. |

All tools are scoped to the authenticated `user_id` and never mutate data.

### `extract` (`app/graph/nodes/extract.py`)

One function per capture intent (`extract_finance_node`, `extract_todo_node`,
`extract_note_node`) sharing `_run_extractor`. Each calls the LLM in JSON mode
with a schema-locked prompt and returns:

```jsonc
{
  "response": "...",            // proposal inviting confirmation
  "complete_response": "...",   // shown after approve
  "cancelled_response": "...",  // shown after cancel
  "used_source_ids": [],        // retrieved notes actually used
  "data": { /* typed payload */ }
}
```

Typed payloads:

- **Finance** — `type` (income|expense), `amount` (positive; sign carried by
  `type`), `category`, `description`, `date`.
- **Todo** — `title`, `description`, `due_date`, `priority` (low|medium|high),
  `date`.
- **Note** — `title`, `content`, `tags` (0–5, lowercase kebab-case), `date`.

If `data.date` is missing it defaults to today. Unparseable model output falls
back to a clean `Captured: <input>` confirmation instead of leaking raw text.
Currency, retrieved notes, and tool results are prepended to the extractor
prompt as context blocks.

### `chat_reply` (`app/graph/nodes/chat_reply.py`)

Generates the final chat answer.

- **Streaming path** (`stream_chat_reply`, used in production): always plain
  text. When notes/tool context exists, the prompt instructs the model to weave
  it in directly (no JSON, no source-id lists). Token deltas are yielded as they
  arrive.
- **Non-streaming path** (`chat_reply_node`): when context exists it uses a
  JSON-with-`used_source_ids` shape so citations are explicit; without context
  it returns plain prose.

## Streaming and the JSON-trailer guard

`stream_orchestrator` yields a sequence of events:

- `StreamTextDelta(text=...)` — incremental prose chunks (chat intent only).
- `StreamDone(result=OrchestratorResult)` — always exactly one, terminal.

Because the model sometimes appends a trailing JSON object (e.g.
`{"used_source_ids": [...]}`) after the prose, the runner withholds everything
from the first top-level `{`. When the stream ends it:

1. parses the withheld trailer — if it is JSON, the reply is the prose only and
   any `used_source_ids` it cites are honored (restricted to notes actually
   retrieved); or
2. if it does not parse as JSON, the withheld text belongs to the reply and is
   flushed.

`OrchestratorResult` is then assembled with the final reply, intent, typed
`data`, approve/cancel strings, summed tokens, completion `datetime`, the
**filtered** cited `sources`, and any `tool_calls`.

## Where the orchestrator is invoked

The conversations service (`app/services/conversations.py`) drives the streaming
orchestrator, maps its events to SSE events (`meta` → `delta` → `message`), and
persists the assistant turn (with `intent`, `data`, `sources`, `tool_calls`, and
`tokens` in the message `details` JSON) once the stream completes. See the
conversations endpoints in [`api-reference.md`](./api-reference.md).
