from __future__ import annotations


def format_currency_context(currency: str | None) -> str:
    """Render the user's preferred display currency as a system-prompt block.

    Returns "" when no currency is set so callers can safely prepend.
    """
    code = (currency or "").strip()
    if not code:
        return ""

    return (
        f"## User currency\n\n"
        f"The user's preferred currency is {code} (ISO 4217). Interpret bare "
        f"amounts the user mentions as {code}, and express every monetary value "
        f"in your reply using {code} and its conventional symbol.\n\n"
    )
