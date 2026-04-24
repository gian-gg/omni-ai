from typing import Literal, TypedDict


class OrchestratorState(TypedDict):
    user_input: str
    intent: Literal["llm"]
    response: str
