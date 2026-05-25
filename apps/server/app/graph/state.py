from operator import add
from typing import Annotated, Any, Literal, TypedDict


IntentType = Literal["finance", "todo", "note", "chat"]

VALID_INTENTS: frozenset[str] = frozenset({"finance", "todo", "note", "chat"})


class OrchestratorState(TypedDict):
    user_id: str | None
    currency: str | None
    user_input: str
    history: list[dict[str, str]]
    intent: IntentType
    response: str
    complete_response: str | None
    cancelled_response: str | None
    data: dict[str, Any] | None
    tokens: Annotated[int, add]
    notes_context: list[dict[str, Any]]
    sources: list[dict[str, Any]]
    used_source_ids: list[str]
    tool_calls: list[dict[str, Any]]
