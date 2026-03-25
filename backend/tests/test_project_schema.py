from uuid import uuid4

import pytest
from pydantic import ValidationError

from backend.schemas.project import (
    ProjectCreate,
    ProjectMemberAdd,
    ProjectPhaseSettingsUpdate,
    ProjectUpdate,
)


def test_project_create_trims_name():
    payload = ProjectCreate(name='  My Project  ', description='desc')
    assert payload.name == 'My Project'


def test_project_update_rejects_blank_name():
    with pytest.raises(ValidationError):
        ProjectUpdate(name='   ')


@pytest.mark.parametrize('role', ['admin', 'developer', 'reporter'])
def test_project_member_add_accepts_supported_roles(role):
    payload = ProjectMemberAdd(user_id=uuid4(), role=role)
    assert payload.role == role


def test_project_member_add_rejects_owner_role():
    with pytest.raises(ValidationError):
        ProjectMemberAdd(user_id=uuid4(), role='owner')


@pytest.mark.parametrize('mode', ['weekly', 'biweekly', 'monthly'])
def test_project_phase_settings_accept_supported_modes(mode):
    payload = ProjectPhaseSettingsUpdate(phase_auto_mode=mode)
    assert payload.phase_auto_mode == mode


def test_project_phase_settings_allow_null_mode():
    payload = ProjectPhaseSettingsUpdate(phase_auto_mode=None)
    assert payload.phase_auto_mode is None


def test_project_phase_settings_reject_invalid_mode():
    with pytest.raises(ValidationError):
        ProjectPhaseSettingsUpdate(phase_auto_mode='daily')
