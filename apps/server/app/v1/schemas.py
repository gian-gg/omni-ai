from datetime import date as _date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


IntentType = Literal["finance", "todo", "note", "chat"]


class FinanceData(BaseModel):
    type: Literal["income", "expense"]
    amount: float
    currency: str = "USD"
    category: str | None = None
    description: str | None = None
    date: _date | None = None


class TodoData(BaseModel):
    title: str
    description: str | None = None
    due_date: _date | None = None
    priority: Literal["low", "medium", "high"] = "medium"
    date: _date | None = None


class NoteData(BaseModel):
    title: str | None = None
    content: str
    tags: list[str] = Field(default_factory=list)
    date: _date | None = None


def _validate_prompt(value: str) -> str:
    cleaned_value = value.strip()
    if not cleaned_value:
        raise ValueError("prompt must not be empty")
    return cleaned_value


class ConversationCreateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10_000)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        return _validate_prompt(value)


class MessageCreateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10_000)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        return _validate_prompt(value)


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    details: dict[str, Any] | None = None
    created_at: datetime


class ConversationCreateResponse(BaseModel):
    conversation: ConversationResponse
    message: MessageResponse


class ConversationListResponse(BaseModel):
    items: list[ConversationResponse]
    total: int
    limit: int
    offset: int


class ConversationMessagesResponse(BaseModel):
    items: list[MessageResponse]


class AuthenticatedUserResponse(BaseModel):
    id: str
    supabase_user_id: str
    email: str | None
    created_at: datetime
    updated_at: datetime


class AuthMeResponse(BaseModel):
    user: AuthenticatedUserResponse


class AuthPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    password: str = Field(..., min_length=8, max_length=1024)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        cleaned_value = value.strip().lower()
        if not cleaned_value:
            raise ValueError("email must not be empty")
        return cleaned_value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("password must not be empty")
        return value


class AuthRefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1, max_length=4096)

    @field_validator("refresh_token")
    @classmethod
    def validate_refresh_token(cls, value: str) -> str:
        cleaned_value = value.strip()
        if not cleaned_value:
            raise ValueError("refresh_token must not be empty")
        return cleaned_value


class SupabaseAuthUserResponse(BaseModel):
    id: str
    email: str | None
    role: str | None
    aud: str | None
    created_at: datetime | None


class AuthSessionResponse(BaseModel):
    access_token: str | None
    refresh_token: str | None
    token_type: str | None
    expires_in: int | None
    user: SupabaseAuthUserResponse | None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: Literal["income", "expense"]
    amount: float
    currency: str
    category: str | None
    description: str | None
    date: _date
    created_at: datetime
    updated_at: datetime


class TransactionUpdateRequest(BaseModel):
    type: Literal["income", "expense"] | None = None
    amount: float | None = None
    currency: str | None = None
    category: str | None = None
    description: str | None = None
    date: _date | None = None


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    limit: int
    offset: int


class TodoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str | None
    due_date: _date | None
    priority: Literal["low", "medium", "high"]
    date: _date
    is_done: bool
    created_at: datetime
    updated_at: datetime


class TodoUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: _date | None = None
    priority: Literal["low", "medium", "high"] | None = None
    date: _date | None = None
    is_done: bool | None = None


class TodoListResponse(BaseModel):
    items: list[TodoResponse]
    total: int
    limit: int
    offset: int


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str | None
    content: str
    tags: list[str]
    date: _date
    created_at: datetime
    updated_at: datetime


class NoteUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    date: _date | None = None


class NoteListResponse(BaseModel):
    items: list[NoteResponse]
    total: int
    limit: int
    offset: int


class NoteSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2_000)
    limit: int = Field(default=10, ge=1, le=50)

    @field_validator("query")
    @classmethod
    def validate_query(cls, value: str) -> str:
        cleaned_value = value.strip()
        if not cleaned_value:
            raise ValueError("query must not be empty")
        return cleaned_value


class NoteSearchResult(NoteResponse):
    similarity: float


class NoteSearchResponse(BaseModel):
    items: list[NoteSearchResult]
