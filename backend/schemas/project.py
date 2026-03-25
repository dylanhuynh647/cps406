from pydantic import BaseModel, Field, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime

PROJECT_ROLES = ["owner", "admin", "developer", "reporter"]
PHASE_AUTO_MODES = ["weekly", "biweekly", "monthly"]


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
    current_phase_number: int = 1
    current_phase_started_at: datetime
    phase_auto_mode: Optional[str] = None
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


class ProjectPhaseSettingsUpdate(BaseModel):
    phase_auto_mode: Optional[str] = None

    @field_validator("phase_auto_mode")
    @classmethod
    def validate_phase_auto_mode(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized:
            return None
        if normalized not in PHASE_AUTO_MODES:
            raise ValueError("phase_auto_mode must be one of: weekly, biweekly, monthly")
        return normalized


class ProjectPhaseResponse(BaseModel):
    id: UUID
    project_id: UUID
    phase_number: int
    started_at: datetime
    ended_at: Optional[datetime] = None
    transition_type: str
    changed_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime


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
