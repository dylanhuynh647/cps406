"""
Security utilities for input sanitization and validation
"""
import re
import html
from typing import Optional

# Maximum field lengths to prevent DoS
MAX_TITLE_LENGTH = 255
MAX_DESCRIPTION_LENGTH = 10000
MAX_REFERENCE_LENGTH = 2048
MAX_NAME_LENGTH = 255

def sanitize_text(text: str, max_length: Optional[int] = None) -> str:
    """
    Sanitize text input by:
    1. Stripping whitespace
    2. Escaping HTML entities
    3. Truncating to max_length if provided
    """
    if not text:
        return ""
    
    # Strip leading/trailing whitespace
    text = text.strip()
    
    # Escape HTML entities to prevent XSS
    text = html.escape(text)
    
    # Truncate if max_length provided
    if max_length and len(text) > max_length:
        text = text[:max_length]
    
    return text

def sanitize_url(url: str) -> str:
    """
    Sanitize URL input
    """
    if not url:
        return ""
    
    url = url.strip()
    
    lowered = url.lower()

    # Explicitly reject dangerous URI schemes.
    if lowered.startswith("javascript:") or lowered.startswith("data:"):
        raise ValueError("Invalid URL format")

    # Basic URL validation - must start with http:// or https://
    if not (url.startswith("http://") or url.startswith("https://")):
        # If it's a relative path, allow it but sanitize
        if url.startswith("/"):
            # Relative path - sanitize path components
            url = re.sub(r'[^a-zA-Z0-9/._-]', '', url)
            # Block traversal attempts in path-like references.
            if '..' in url.split('/'):
                raise ValueError("Invalid URL format")
        else:
            # Invalid URL format
            raise ValueError("Invalid URL format")
    
    # Escape HTML entities
    url = html.escape(url)
    
    if len(url) > MAX_REFERENCE_LENGTH:
        url = url[:MAX_REFERENCE_LENGTH]
    
    return url

def validate_enum_value(value: str, allowed_values: list[str], field_name: str) -> str:
    """
    Validate that a value is in the allowed enum values
    """
    if value not in allowed_values:
        raise ValueError(f"Invalid {field_name}: must be one of {', '.join(allowed_values)}")
    return value

def sanitize_email(email: str) -> str:
    """
    Basic email sanitization (Pydantic will do full validation)
    """
    if not email:
        return ""
    
    return email.strip().lower()
