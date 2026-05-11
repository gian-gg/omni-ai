from typing import Literal, TypedDict


class OrchestratorState(TypedDict):
    user_id: str | None
    user_input: str
    intent: Literal["llm"]
    response: str
