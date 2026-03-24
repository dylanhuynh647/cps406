from pydantic import BaseModel, Field, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime

PROJECT_ROLES = ["owner", "admin", "developer", "reporter"]


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Project name cannot be empty")
        return trimmed


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    cover_image_url: Optional[str] = None
    owner_id: UUID
    my_role: str
    created_at: datetime
    updated_at: datetime


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Project name cannot be empty")
        return trimmed


class ProjectMemberAdd(BaseModel):
    user_id: UUID
    role: str = Field(default="developer")

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in PROJECT_ROLES or normalized == "owner":
            raise ValueError("role must be one of: admin, developer, reporter")
        return normalized


class ProjectMemberUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in PROJECT_ROLES or normalized == "owner":
            raise ValueError("role must be one of: admin, developer, reporter")
        return normalized


class ProjectMemberResponse(BaseModel):
    user_id: UUID
    role: str
    email: Optional[str]
    full_name: Optional[str]
    avatar_url: Optional[str]
    created_at: datetime
    updated_at: datetime
