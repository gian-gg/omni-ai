import json
import unittest
from collections.abc import Iterator
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.auth import (
    AuthenticatedUser,
    VerifiedTokenClaims,
    get_current_authenticated_user,
)
from app.db.base import Base
from app.db.session import get_db_session
from app.graph.nodes._llm_client import LLMStreamEvent, stream_llm
from app.main import app
from app.models import Conversation, Message, User  # noqa: F401 — populate metadata
from app.services.orchestrator import (
    OrchestratorResult,
    StreamDone,
    StreamTextDelta,
    stream_orchestrator,
)


def _build_authenticated_user(user_id: str = "local-user-123") -> AuthenticatedUser:
    return AuthenticatedUser(
        claims=VerifiedTokenClaims(
            subject=f"supabase-{user_id}",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email=f"{user_id}@example.com",
            role="authenticated",
        ),
        user=User(
            id=user_id,
            supabase_user_id=f"supabase-{user_id}",
            email=f"{user_id}@example.com",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )


def _result(response: str = "Hello there", **overrides) -> OrchestratorResult:
    base = {
        "intent": "chat",
        "response": response,
        "complete_response": None,
        "cancelled_response": None,
        "data": None,
        "tokens": 9,
        "datetime": datetime(2026, 5, 25, 12, 0, tzinfo=UTC),
        "sources": [],
        "tool_calls": [],
    }
    base.update(overrides)
    return OrchestratorResult(**base)


def _fake_stream(*deltas: str, result: OrchestratorResult | None = None):
    """A stand-in for stream_orchestrator: emit deltas then one StreamDone."""

    def _gen(*_args, **_kwargs) -> Iterator:
        for delta in deltas:
            yield StreamTextDelta(text=delta)
        yield StreamDone(result=result or _result("".join(deltas)))

    return _gen


def _parse_sse(body: str) -> list[tuple[str, object]]:
    events: list[tuple[str, object]] = []
    for block in body.strip().split("\n\n"):
        if not block.strip():
            continue
        name = None
        data = None
        for line in block.splitlines():
            if line.startswith("event:"):
                name = line[len("event:") :].strip()
            elif line.startswith("data:"):
                data = line[len("data:") :].strip()
        events.append((name, json.loads(data) if data is not None else None))
    return events


class ConversationsStreamingTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine, autoflush=False, expire_on_commit=False
        )

        with self.session_factory() as setup_session:
            setup_session.add_all(
                [
                    User(
                        id="local-user-123",
                        supabase_user_id="supabase-local-user-123",
                        email="local-user-123@example.com",
                    ),
                    User(
                        id="other-user-456",
                        supabase_user_id="supabase-other-user-456",
                        email="other-user-456@example.com",
                    ),
                ]
            )
            setup_session.commit()

        def override_db_session() -> Iterator[Session]:
            session = self.session_factory()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db_session] = override_db_session
        app.dependency_overrides[get_current_authenticated_user] = (
            lambda: _build_authenticated_user("local-user-123")
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _act_as(self, user_id: str) -> None:
        app.dependency_overrides[get_current_authenticated_user] = (
            lambda: _build_authenticated_user(user_id)
        )

    def _messages(self, conversation_id: str) -> list[Message]:
        with self.session_factory() as session:
            return list(
                session.scalars(
                    select(Message)
                    .where(Message.conversation_id == conversation_id)
                    .order_by(Message.created_at.asc())
                )
            )

    # ----- create stream ------------------------------------------------------

    def test_create_stream_emits_meta_deltas_and_message(self) -> None:
        with patch(
            "app.services.conversations.stream_orchestrator",
            _fake_stream("Hel", "lo", result=_result("Hello", tokens=11)),
        ):
            response = self.client.post(
                "/api/v1/conversations",
                json={"prompt": "  hi   there  "},
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers["content-type"])
        events = _parse_sse(response.text)
        names = [name for name, _ in events]
        self.assertEqual(names, ["meta", "delta", "delta", "message"])

        meta = events[0][1]
        self.assertTrue(meta["conversation_id"])
        self.assertEqual(meta["title"], "hi there")

        self.assertEqual(events[1][1], {"text": "Hel"})
        self.assertEqual(events[2][1], {"text": "lo"})

        message = events[3][1]
        self.assertEqual(message["role"], "assistant")
        self.assertEqual(message["content"], "Hello")
        self.assertEqual(message["details"]["tokens"], 11)

    def test_create_stream_persists_user_and_assistant_messages(self) -> None:
        with patch(
            "app.services.conversations.stream_orchestrator",
            _fake_stream("done", result=_result("done")),
        ):
            response = self.client.post(
                "/api/v1/conversations",
                json={"prompt": "remember the milk"},
            )

        meta = _parse_sse(response.text)[0][1]
        messages = self._messages(meta["conversation_id"])
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0].role, "user")
        self.assertEqual(messages[0].content, "remember the milk")
        self.assertEqual(messages[1].role, "assistant")
        self.assertEqual(messages[1].content, "done")

    # ----- add-message stream -------------------------------------------------

    def _seed_conversation(self, user_id: str = "local-user-123") -> str:
        with self.session_factory() as session:
            conversation = Conversation(user_id=user_id, title="seed")
            session.add(conversation)
            session.flush()
            session.add(
                Message(
                    conversation_id=conversation.id,
                    user_id=user_id,
                    role="user",
                    content="earlier turn",
                )
            )
            session.commit()
            return conversation.id

    def test_add_message_stream_appends_and_streams(self) -> None:
        conversation_id = self._seed_conversation()
        with patch(
            "app.services.conversations.stream_orchestrator",
            _fake_stream("re", "ply", result=_result("reply")),
        ):
            response = self.client.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                json={"prompt": "and then?"},
            )

        self.assertEqual(response.status_code, 200)
        names = [name for name, _ in _parse_sse(response.text)]
        self.assertEqual(names, ["delta", "delta", "message"])

        roles = [m.role for m in self._messages(conversation_id)]
        # seed user + new user + assistant
        self.assertEqual(roles, ["user", "user", "assistant"])

    def test_add_message_stream_is_404_for_unknown_conversation(self) -> None:
        with patch(
            "app.services.conversations.stream_orchestrator",
            _fake_stream("x"),
        ):
            response = self.client.post(
                "/api/v1/conversations/does-not-exist/messages",
                json={"prompt": "hi"},
            )
        self.assertEqual(response.status_code, 404)

    def test_add_message_stream_is_404_for_other_users_conversation(self) -> None:
        conversation_id = self._seed_conversation("other-user-456")
        with patch(
            "app.services.conversations.stream_orchestrator",
            _fake_stream("x"),
        ):
            response = self.client.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                json={"prompt": "hi"},
            )
        self.assertEqual(response.status_code, 404)

    def test_stream_requires_auth(self) -> None:
        app.dependency_overrides.pop(get_current_authenticated_user, None)
        response = self.client.post(
            "/api/v1/conversations", json={"prompt": "hello"}
        )
        self.assertEqual(response.status_code, 401)


class StreamOrchestratorTestCase(unittest.TestCase):
    def test_capture_intent_yields_single_done_without_deltas(self) -> None:
        with (
            patch(
                "app.services.orchestrator.classify_node",
                return_value={"intent": "finance", "tokens": 1},
            ),
            patch(
                "app.services.orchestrator.retrieve_node",
                return_value={"notes_context": [], "sources": []},
            ),
            patch(
                "app.services.orchestrator.query_node",
                return_value={"tool_calls": [], "tokens": 0},
            ),
            patch(
                "app.services.orchestrator.extract_finance_node",
                return_value={
                    "response": "Log a $4 coffee?",
                    "complete_response": "Logged it.",
                    "cancelled_response": "Skipped.",
                    "data": {"type": "expense", "amount": 4},
                    "tokens": 5,
                    "used_source_ids": [],
                },
            ),
        ):
            events = list(stream_orchestrator("I spent $4 on coffee", user_id="u1"))

        self.assertEqual(len(events), 1)
        done = events[0]
        self.assertIsInstance(done, StreamDone)
        self.assertEqual(done.result.intent, "finance")
        self.assertEqual(done.result.response, "Log a $4 coffee?")
        self.assertEqual(done.result.tokens, 6)

    def test_chat_strips_trailing_used_source_ids_json(self) -> None:
        # The model appends a JSON trailer after the plain-text reply; it must
        # not reach the client deltas or the persisted response, and the ids it
        # cites should populate used_source_ids.
        def _fake_chat_stream(_state):
            for piece in ["Tira", "\n\n", '{"used_source_ids": ', '["n1"]}']:
                yield LLMStreamEvent(delta=piece)
            yield LLMStreamEvent(tokens=7, done=True)

        with (
            patch(
                "app.services.orchestrator.classify_node",
                return_value={"intent": "chat", "tokens": 1},
            ),
            patch(
                "app.services.orchestrator.retrieve_node",
                return_value={
                    "notes_context": [{"id": "n1"}],
                    "sources": [{"id": "n1", "title": "Cat's name is Tira"}],
                },
            ),
            patch(
                "app.services.orchestrator.query_node",
                return_value={"tool_calls": [], "tokens": 0},
            ),
            patch(
                "app.services.orchestrator.stream_chat_reply", _fake_chat_stream
            ),
        ):
            events = list(stream_orchestrator("what's my cat's name", user_id="u1"))

        deltas = [e.text for e in events if isinstance(e, StreamTextDelta)]
        done = events[-1]
        self.assertNotIn("used_source_ids", "".join(deltas))
        self.assertEqual("".join(deltas).strip(), "Tira")
        self.assertEqual(done.result.response, "Tira")
        self.assertEqual([s["id"] for s in done.result.sources], ["n1"])


class StreamLLMTestCase(unittest.TestCase):
    def test_parses_sse_chunks_and_usage(self) -> None:
        lines = [
            'data: {"choices":[{"delta":{"content":"Hel"}}]}',
            'data: {"choices":[{"delta":{"content":"lo"}}]}',
            "",
            'data: {"choices":[{"delta":{}}],"usage":{"total_tokens":42}}',
            "data: [DONE]",
        ]

        class _FakeResponse:
            def raise_for_status(self) -> None:
                pass

            def iter_lines(self) -> Iterator[str]:
                yield from lines

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class _FakeClient:
            def __init__(self, *_args, **_kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def stream(self, *_args, **_kwargs):
                return _FakeResponse()

        with (
            patch("app.graph.nodes._llm_client.httpx.Client", _FakeClient),
            patch("app.graph.nodes._llm_client.settings.llm_api_key", "test-key"),
        ):
            events = list(stream_llm("system", "user"))

        deltas = [e.delta for e in events if e.delta]
        self.assertEqual(deltas, ["Hel", "lo"])
        self.assertTrue(events[-1].done)
        self.assertEqual(events[-1].tokens, 42)

    def test_missing_api_key_yields_only_done(self) -> None:
        with patch("app.graph.nodes._llm_client.settings.llm_api_key", None):
            events = list(stream_llm("system", "user"))
        self.assertEqual(len(events), 1)
        self.assertTrue(events[0].done)
        self.assertEqual(events[0].delta, "")


if __name__ == "__main__":
    unittest.main()
