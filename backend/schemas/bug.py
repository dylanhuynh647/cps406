from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID
from backend.utils.security import sanitize_text, validate_enum_value, MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH

# Allowed enum values
BUG_TYPES = ['logic', 'syntax', 'performance', 'documentation', 'ui/ux', 'security', 'data', 'other']
BUG_STATUSES = ['open', 'in_progress', 'resolved']
BUG_SEVERITIES = ['low', 'medium', 'high', 'critical']
LEGACY_STATUS_ALIASES = {
    'fixed': 'resolved',
    'closed': 'resolved',
}


def normalize_status_value(value: str) -> str:
    """Normalize status input to canonical API values."""
    normalized = value.strip().lower().replace(' ', '_')
    return LEGACY_STATUS_ALIASES.get(normalized, normalized)

class BugCreate(BaseModel):
    project_id: UUID
    title: str = Field(..., min_length=1, max_length=MAX_TITLE_LENGTH)
    description: str = Field(..., min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    bug_type: str = Field(..., min_length=1)
    status: Optional[str] = Field(default="open")
    severity: Optional[str] = Field(default="medium")
    assigned_to: Optional[UUID] = None
    artifact_ids: Optional[List[UUID]] = Field(default_factory=list, max_length=100)
    
    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        """Validate and sanitize title"""
        if not v or not v.strip():
            raise ValueError("Title cannot be empty")
        return sanitize_text(v.strip(), MAX_TITLE_LENGTH)
    
    @field_validator('description')
    @classmethod
    def validate_description(cls, v: str) -> str:
        """Validate and sanitize description"""
        if not v or not v.strip():
            raise ValueError("Description cannot be empty")
        return sanitize_text(v.strip(), MAX_DESCRIPTION_LENGTH)
    
    @field_validator('bug_type')
    @classmethod
    def validate_bug_type(cls, v: str) -> str:
        """Validate bug type enum"""
        return validate_enum_value(v, BUG_TYPES, "bug_type")
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> str:
        """Validate status enum"""
        if v is None:
            return "open"
        normalized = normalize_status_value(v)
        return validate_enum_value(normalized, BUG_STATUSES, "status")

    @field_validator('severity')
    @classmethod
    def validate_severity(cls, v: Optional[str]) -> str:
        """Validate severity enum"""
        if v is None:
            return "medium"
        return validate_enum_value(v, BUG_SEVERITIES, "severity")
    
    @field_validator('artifact_ids')
    @classmethod
    def validate_artifact_ids(cls, v: Optional[List[UUID]]) -> List[UUID]:
        """Validate artifact IDs list"""
        if v is None:
            return []
        if len(v) > 100:
            raise ValueError("Maximum 100 artifacts allowed per bug")
        return v

class BugUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=MAX_TITLE_LENGTH)
    description: Optional[str] = Field(None, min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    bug_type: Optional[str] = Field(None, min_length=1)
    status: Optional[str] = None
    severity: Optional[str] = None
    assigned_to: Optional[UUID] = None
    artifact_ids: Optional[List[UUID]] = Field(None, max_length=100)
    
    @field_validator('title')
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        """Validate and sanitize title"""
        if v is None:
            return None
        if not v.strip():
            raise ValueError("Title cannot be empty")
        return sanitize_text(v.strip(), MAX_TITLE_LENGTH)
    
    @field_validator('description')
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        """Validate and sanitize description"""
        if v is None:
            return None
        if not v.strip():
            raise ValueError("Description cannot be empty")
        return sanitize_text(v.strip(), MAX_DESCRIPTION_LENGTH)
    
    @field_validator('bug_type')
    @classmethod
    def validate_bug_type(cls, v: Optional[str]) -> Optional[str]:
        """Validate bug type enum"""
        if v is None:
            return None
        return validate_enum_value(v, BUG_TYPES, "bug_type")
    
    @field_validator('status')
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        """Validate status enum"""
        if v is None:
            return None
        normalized = normalize_status_value(v)
        return validate_enum_value(normalized, BUG_STATUSES, "status")

    @field_validator('severity')
    @classmethod
    def validate_severity(cls, v: Optional[str]) -> Optional[str]:
        """Validate severity enum"""
        if v is None:
            return None
        return validate_enum_value(v, BUG_SEVERITIES, "severity")
    
    @field_validator('artifact_ids')
    @classmethod
    def validate_artifact_ids(cls, v: Optional[List[UUID]]) -> Optional[List[UUID]]:
        """Validate artifact IDs list"""
        if v is None:
            return None
        if len(v) > 100:
            raise ValueError("Maximum 100 artifacts allowed per bug")
        return v

class BugArtifactResponse(BaseModel):
    bug_id: UUID
    artifact_id: UUID
    created_at: datetime

class BugResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    description: str
    bug_type: str
    status: str
    severity: str
    found_at: datetime
    fixed_at: Optional[datetime]
    reporter_id: UUID
    reporter_name: Optional[str] = None
    reporter_avatar_url: Optional[str] = None
    assigned_to: Optional[UUID]
    phase_number: int = 1
    created_at: datetime
    updated_at: datetime
    artifact_count: int = 0
    artifact_ids: Optional[List[UUID]] = []
    artifacts: Optional[List[dict]] = []

    class Config:
        from_attributes = True


class BugSeverityUpdate(BaseModel):
    severity: str

    @field_validator('severity')
    @classmethod
    def validate_severity(cls, v: str) -> str:
        """Validate severity enum"""
        return validate_enum_value(v, BUG_SEVERITIES, "severity")
