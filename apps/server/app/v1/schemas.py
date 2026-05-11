from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10_000)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value: str) -> str:
        cleaned_value = value.strip()
        if not cleaned_value:
            raise ValueError("prompt must not be empty")
        return cleaned_value


class ChatResponse(BaseModel):
    response: str


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
