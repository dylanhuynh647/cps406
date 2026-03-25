from uuid import uuid4

import pytest
from pydantic import ValidationError

from backend.schemas.artifact import ArtifactCreate
from backend.utils.security import sanitize_url


def test_artifact_create_rejects_invalid_type_value():
    with pytest.raises(ValidationError):
        ArtifactCreate(
            project_id=uuid4(),
            name='Report',
            type='weird-type',
            description='x',
            reference='https://example.com',
        )


def test_artifact_create_sanitizes_description_html():
    payload = ArtifactCreate(
        project_id=uuid4(),
        name='Quarterly Report',
        type='design_document',
        description='<img src=x onerror=alert(1)>',
        reference='https://example.com/docs',
    )

    assert payload.description is not None
    assert '<img' not in payload.description
    assert '&lt;img' in payload.description


def test_artifact_create_rejects_unsafe_reference_scheme():
    with pytest.raises(ValidationError):
        ArtifactCreate(
            project_id=uuid4(),
            name='Quarterly Report',
            type='design_document',
            description='desc',
            reference='javascript:alert(1)',
        )


def test_sanitize_url_rejects_data_scheme():
    with pytest.raises(ValueError):
        sanitize_url('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')
