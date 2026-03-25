from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime
from uuid import UUID
import re
from backend.utils.security import sanitize_text, sanitize_url, validate_enum_value, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_REFERENCE_LENGTH

# Allowed artifact types
ARTIFACT_TYPES = ['product_backlog', 'design_document', 'diagram', 'formal_spec', 'source_file', 'test_source_file', 'binary', 'data_file', 'other']

class ArtifactCreate(BaseModel):
    project_id: UUID
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    type: str = Field(..., min_length=1)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    reference: str = Field(..., min_length=1, max_length=MAX_REFERENCE_LENGTH)
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Validate and sanitize name"""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return sanitize_text(v.strip(), MAX_NAME_LENGTH)
    
    @field_validator('type')
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Validate artifact type enum"""
        return validate_enum_value(v, ARTIFACT_TYPES, "type")
    
    @field_validator('description')
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        """Validate and sanitize description"""
        if v is None:
            return None
        return sanitize_text(v.strip(), MAX_DESCRIPTION_LENGTH) if v.strip() else None
    
    @field_validator('reference')
    @classmethod
    def validate_reference(cls, v: str) -> str:
        """Validate and sanitize reference URL/path"""
        if not v or not v.strip():
            raise ValueError("Reference cannot be empty")
        # Allow both URLs and file paths
        v = v.strip()
        lowered = v.lower()
        if lowered.startswith("javascript:") or lowered.startswith("data:"):
            raise ValueError("Reference contains an unsupported URL scheme")
        if v.startswith("http://") or v.startswith("https://"):
            return sanitize_url(v)
        elif v.startswith("/"):
            # Relative path - sanitize
            return sanitize_url(v)
        elif re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", v):
            raise ValueError("Reference contains an unsupported URL scheme")
        else:
            # Try to sanitize as text
            return sanitize_text(v, MAX_REFERENCE_LENGTH)

class ArtifactUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    type: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    reference: Optional[str] = Field(None, min_length=1, max_length=MAX_REFERENCE_LENGTH)
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Validate and sanitize name"""
        if v is None:
            return None
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return sanitize_text(v.strip(), MAX_NAME_LENGTH)
    
    @field_validator('type')
    @classmethod
    def validate_type(cls, v: Optional[str]) -> Optional[str]:
        """Validate artifact type enum"""
        if v is None:
            return None
        return validate_enum_value(v, ARTIFACT_TYPES, "type")
    
    @field_validator('description')
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        """Validate and sanitize description"""
        if v is None:
            return None
        return sanitize_text(v.strip(), MAX_DESCRIPTION_LENGTH) if v.strip() else None
    
    @field_validator('reference')
    @classmethod
    def validate_reference(cls, v: Optional[str]) -> Optional[str]:
        """Validate and sanitize reference URL/path"""
        if v is None:
            return None
        if not v.strip():
            raise ValueError("Reference cannot be empty")
        v = v.strip()
        lowered = v.lower()
        if lowered.startswith("javascript:") or lowered.startswith("data:"):
            raise ValueError("Reference contains an unsupported URL scheme")
        if v.startswith("http://") or v.startswith("https://"):
            return sanitize_url(v)
        elif v.startswith("/"):
            return sanitize_url(v)
        elif re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", v):
            raise ValueError("Reference contains an unsupported URL scheme")
        else:
            return sanitize_text(v, MAX_REFERENCE_LENGTH)

class ArtifactResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    type: str
    description: Optional[str]
    reference: str
    file_name: Optional[str] = None
    file_mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    is_uploaded_file: bool = False
    created_at: datetime
    created_by: UUID
    updated_at: datetime

    class Config:
        from_attributes = True
