from __future__ import annotations

import logging
from datetime import date as _date
from typing import Any

from app.db.session import get_session_factory
from app.graph.nodes._llm_client import call_llm
from app.graph.state import OrchestratorState
from app.services.tools import TOOL_EXECUTORS, TOOL_SPECS

logger = logging.getLogger(__name__)


QUERY_SYSTEM_PROMPT_TEMPLATE = (
    "You are Omni's data assistant. You can call read-only tools that query the "
    "user's transactions and todos. Call zero or more tools when they would help "
    "ground the response in the user's actual data — for example, when the user "
    "asks about spending, balances, recent purchases, or pending todos, or when "
    "logging a new finance/todo entry that might be a duplicate.\n\n"
    "Today's date is {today}. Use it to resolve relative time phrases like "
    "'this week' or 'last month'.\n\n"
    "Only call tools when they would meaningfully change the answer. For "
    "small-talk or unrelated prompts, call no tools."
)


def _build_system_prompt() -> str:
    return QUERY_SYSTEM_PROMPT_TEMPLATE.format(today=_date.today().isoformat())


def _execute_tool_call(
    db_session, user_id: str, name: str, args: dict[str, Any]
) -> dict[str, Any] | None:
    executor = TOOL_EXECUTORS.get(name)
    if executor is None:
        logger.warning("Unknown tool name from LLM: %r", name)
        return None
    try:
        return executor(db_session, user_id, **args)
    except TypeError:
        logger.exception("Tool %r rejected arguments %r", name, args)
        return None
    except ValueError:
        logger.exception("Tool %r failed validation on args %r", name, args)
        return None
    except Exception:
        logger.exception("Tool %r raised", name)
        return None


def query_node(state: OrchestratorState) -> dict[str, Any]:
    user_id = state.get("user_id")
    if not user_id:
        return {"tool_calls": [], "tokens": 0}

    result = call_llm(
        _build_system_prompt(),
        state["user_input"],
        tools=TOOL_SPECS,
    )

    if not result.tool_calls:
        return {"tool_calls": [], "tokens": result.tokens}

    executed: list[dict[str, Any]] = []
    session = get_session_factory()()
    try:
        for call in result.tool_calls:
            name = call.get("name")
            args = call.get("args") or {}
            if not isinstance(name, str):
                continue
            output = _execute_tool_call(session, user_id, name, args)
            if output is None:
                continue
            executed.append(
                {
                    "id": call.get("id") or "",
                    "name": name,
                    "args": args,
                    "result": output.get("result"),
                    "summary": output.get("summary", ""),
                }
            )
    finally:
        session.close()

    return {"tool_calls": executed, "tokens": result.tokens}
