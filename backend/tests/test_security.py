"""Security-oriented unit tests that avoid network/testclient dependencies."""

from uuid import uuid4
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from backend.schemas.bug import BugCreate
from backend.middleware.rate_limit import get_rate_limit_rule, get_client_identifier
from backend.utils.security import sanitize_text, sanitize_url


def test_sanitize_text_escapes_html():
    payload = "<script>alert('xss')</script>"
    sanitized = sanitize_text(payload)
    assert '<script>' not in sanitized
    assert '&lt;script&gt;' in sanitized


def test_bug_create_rejects_invalid_enum_values():
    with pytest.raises(ValidationError):
        BugCreate(
            project_id=uuid4(),
            title='Test bug',
            description='description',
            bug_type='invalid_type',
            status='open',
            severity='medium',
            artifact_ids=[],
        )


@pytest.mark.parametrize('legacy_status,canonical', [('fixed', 'resolved'), ('closed', 'resolved')])
def test_bug_create_normalizes_legacy_status_aliases(legacy_status, canonical):
    bug = BugCreate(
        project_id=uuid4(),
        title='Test bug',
        description='description',
        bug_type='other',
        status=legacy_status,
        severity='medium',
        artifact_ids=[],
    )

    assert bug.status == canonical


def test_bug_create_enforces_title_max_length():
    with pytest.raises(ValidationError):
        BugCreate(
            project_id=uuid4(),
            title='x' * 300,
            description='description',
            bug_type='other',
            status='open',
            severity='medium',
            artifact_ids=[],
        )


def test_sanitize_url_rejects_javascript_scheme():
    with pytest.raises(ValueError):
        sanitize_url("javascript:alert('xss')")


def test_sanitize_url_rejects_path_traversal_segments():
    with pytest.raises(ValueError):
        sanitize_url('/uploads/../../etc/passwd')


def test_sanitize_url_keeps_safe_relative_path():
    assert sanitize_url('/uploads/project-cover.png') == '/uploads/project-cover.png'


def test_sanitize_text_escapes_sql_like_payload_markup():
    payload = "<img src=x onerror=alert(1)> OR 1=1; DROP TABLE users;"
    sanitized = sanitize_text(payload)
    assert '<img' not in sanitized
    assert '&lt;img' in sanitized
    assert 'DROP TABLE users' in sanitized


@pytest.mark.parametrize(
    'path,method,expected_rule',
    [
        ('/api/projects', 'POST', 'projects-create'),
        ('/api/projects/11111111-1111-1111-1111-111111111111/phases/advance', 'POST', 'phase-advance'),
        ('/api/projects/11111111-1111-1111-1111-111111111111/phases/2/rollback', 'POST', 'phase-transition'),
        ('/api/projects/11111111-1111-1111-1111-111111111111/phases/4/rollforward', 'POST', 'phase-transition'),
        ('/api/projects/11111111-1111-1111-1111-111111111111/member-invitations', 'POST', 'project-members-add'),
        ('/api/bugs', 'POST', 'bugs-create'),
        ('/api/bugs/11111111-1111-1111-1111-111111111111', 'DELETE', 'bugs-delete'),
        ('/api/artifact-uploads', 'POST', 'artifacts-create'),
    ],
)
def test_rate_limit_rule_selection(path, method, expected_rule):
    rule = get_rate_limit_rule(path, method)
    assert rule['id'] == expected_rule


def test_client_identifier_uses_direct_host_when_proxy_untrusted():
    request = SimpleNamespace(
        headers={"X-Forwarded-For": "203.0.113.10", "Authorization": "Bearer token-a"},
        client=SimpleNamespace(host="198.51.100.1"),
    )

    identifier = get_client_identifier(request)
    assert identifier.startswith("198.51.100.1:")


def test_client_identifier_uses_forwarded_ip_for_trusted_proxy():
    request = SimpleNamespace(
        headers={"X-Forwarded-For": "203.0.113.10", "Authorization": "Bearer token-a"},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    identifier = get_client_identifier(request)
    assert identifier.startswith("203.0.113.10:")


def test_client_identifier_distinguishes_authenticated_tokens():
    request_a = SimpleNamespace(
        headers={"Authorization": "Bearer token-a"},
        client=SimpleNamespace(host="127.0.0.1"),
    )
    request_b = SimpleNamespace(
        headers={"Authorization": "Bearer token-b"},
        client=SimpleNamespace(host="127.0.0.1"),
    )

    assert get_client_identifier(request_a) != get_client_identifier(request_b)
