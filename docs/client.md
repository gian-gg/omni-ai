# Mobile Client

The Omni client (`apps/client`) is an **Expo SDK 54 / React Native 0.81 /
React 19** app written in TypeScript. It is the primary interface for logging
transactions, todos, and notes by natural language and for browsing the
structured data the backend captures. Bun is the package manager.

## Structure

```txt
apps/client/
├── app/                      # expo-router file-based routes
│   ├── _layout.tsx           # root Stack; loads fonts, splash, theme provider
│   ├── index.tsx             # entry redirect: token? → (tabs) : welcome
│   ├── welcome.tsx           # auth / onboarding entry
│   ├── modal.tsx             # modal route
│   └── (tabs)/               # bottom-tab navigator
│       ├── _layout.tsx       # Chat · Spaces · Profile tabs
│       ├── index.tsx         # Chat
│       ├── profile.tsx       # Profile
│       └── spaces/           # nested stack
│           ├── _layout.tsx
│           ├── index.tsx     # Spaces home
│           ├── transactions.tsx
│           ├── todos.tsx
│           ├── thoughts.tsx  # notes
│           └── analytics.tsx
├── src/
│   ├── api/client.ts         # typed fetch wrapper + all endpoint functions
│   ├── components/           # themed text/view, markdown, action sheet, date picker…
│   │   └── ui/
│   ├── constants/theme.ts    # Omni color palette, fonts, gradient
│   └── hooks/                # use-color-scheme, use-theme-color
├── assets/images/            # icons, splash, logo
├── app.json                  # Expo config (plugins, permissions, EAS id)
├── eas.json                  # EAS build profiles
└── package.json
```

## Routing & navigation

File-based routing via **expo-router** with typed routes enabled
(`experiments.typedRoutes`) and the React Compiler on. The root `Stack`
(`app/_layout.tsx`) hosts `index`, `welcome`, `(tabs)`, and a `modal`.

`app/index.tsx` is the gate: it reads `access_token` from Secure Store and
redirects to `(tabs)` when present, otherwise to `welcome`.

The tab navigator (`app/(tabs)/_layout.tsx`) has three tabs:

| Tab | Route | Purpose |
|-----|-------|---------|
| **Chat** | `(tabs)/index` | The conversational entrypoint — type/speak intent. |
| **Spaces** | `(tabs)/spaces/*` | Browse structured data: transactions, todos, thoughts (notes), and analytics. |
| **Profile** | `(tabs)/profile` | Account + preferences (display name, currency). |

## API client (`src/api/client.ts`)

A single typed `apiFetch<T>` wrapper backs all calls:

- Base URL: `https://omni-api.giann.dev/api/v1` (the hosted backend).
- Attaches the bearer token, handles `401` → silent refresh → one retry,
  and treats `204` / empty bodies as `undefined`. See [`auth.md`](./auth.md).
- Exposes typed functions per resource:
  - **Auth/profile** — `getMe`, `updateProfile`.
  - **Conversations** — `listConversations`, `listConversationMessages`,
    `createConversation`, `appendMessage`, `deleteConversation`.
  - **Suggestions** — `getSuggestions`.
  - **Transactions** — `listTransactions`, `createTransaction`,
    `updateTransaction`, `deleteTransaction`.
  - **Todos** — `listTodos`, `createTodo`, `updateTodo`, `completeTodoApi`,
    `deleteTodo`.
  - **Notes** — `listNotes`, `createNote`, `updateNote`, `deleteNote`.

> Migration note: the backend chat endpoints stream over **SSE**
> (`POST /conversations` and `/conversations/{id}/messages`). The current
> `src/api/client.ts` wrappers are JSON-shaped and a legacy `sendMessage("/chat")`
> helper is marked `@deprecated`. When wiring live streaming, consume the
> `text/event-stream` response (`meta` → `delta` → `message`) described in
> [`api-reference.md`](./api-reference.md) rather than awaiting a single JSON
> body.

## State & storage

- **Session tokens** live in Expo Secure Store (`access_token`,
  `refresh_token`).
- No global state library; screens fetch through the API client and manage
  local component state. Server data is the source of truth.

## Native capabilities

- **Voice input** — `expo-speech-recognition` (mic + speech-recognition
  permissions declared in `app.json` for iOS and Android).
- **Haptics** — `expo-haptics` (tab presses use a `HapticTab`).
- **Auth/OAuth** — `expo-auth-session`, `expo-web-browser`, `jwt-decode`.
- **Dates** — `react-native-calendars` (an `OmniDatePicker` component).

## Styling

Hand-rolled theme, no UI kit (`src/constants/theme.ts`):

- **Palette** (`OmniColors`) — a zinc-like neutral ramp from `ink` (`#0B0B0D`)
  to `paper` (`#FAFAFA`), plus a dark `OmniGradient`.
- **Fonts** (`OmniFonts`) — Syne (headings), Manrope (body),
  IBM Plex Mono (data/numbers), loaded via `@expo-google-fonts/*` and gated
  behind the splash screen until ready.
- Light/dark navigation themes via `@react-navigation/native` driven by
  `useColorScheme`.

## Running

See [`development.md`](./development.md). In short: `bun install`, then
`bun start` (or `bun run ios` / `bun run android`). A dev client is configured
(`expo-dev-client`), and EAS build profiles live in `eas.json`.
