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
