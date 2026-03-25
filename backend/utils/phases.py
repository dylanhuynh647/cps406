from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from supabase import Client

PHASE_AUTO_MODES = ("weekly", "biweekly", "monthly")
PHASE_INTERVAL_DAYS = {
    "weekly": 7,
    "biweekly": 14,
    "monthly": 30,
}


def _parse_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    else:
        parsed = datetime.now(timezone.utc)

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_phase_auto_mode(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized not in PHASE_AUTO_MODES:
        raise ValueError("phase_auto_mode must be one of: weekly, biweekly, monthly")
    return normalized


def get_project_phase_state(db: Client, project_id: UUID) -> dict:
    try:
        project_result = (
            db.table("projects")
            .select("id,current_phase_number,current_phase_started_at,phase_auto_mode,created_at")
            .eq("id", str(project_id))
            .single()
            .execute()
        )
        phase_schema_ready = True
    except Exception as exc:
        error_text = str(exc).lower()
        missing_phase_columns = (
            "current_phase_number" in error_text
            or "current_phase_started_at" in error_text
            or "phase_auto_mode" in error_text
        )
        if not missing_phase_columns:
            raise

        project_result = (
            db.table("projects")
            .select("id,created_at")
            .eq("id", str(project_id))
            .single()
            .execute()
        )
        phase_schema_ready = False

    project = project_result.data
    if not project:
        raise ValueError("Project not found")

    if not phase_schema_ready:
        created_at = project.get("created_at") or datetime.now(timezone.utc).isoformat()
        return {
            **project,
            "current_phase_number": 1,
            "current_phase_started_at": created_at,
            "phase_auto_mode": None,
            "_phase_schema_ready": False,
        }

    current_phase_number = int(project.get("current_phase_number") or 1)
    started_at = project.get("current_phase_started_at") or project.get("created_at")

    if project.get("current_phase_started_at") is None:
        db.table("projects").update(
            {
                "current_phase_number": current_phase_number,
                "current_phase_started_at": started_at,
            }
        ).eq("id", str(project_id)).execute()

    existing_phase = (
        db.table("project_phases")
        .select("id")
        .eq("project_id", str(project_id))
        .eq("phase_number", current_phase_number)
        .is_("ended_at", "null")
        .execute()
    )
    if not (existing_phase.data or []):
        db.table("project_phases").upsert(
            {
                "project_id": str(project_id),
                "phase_number": current_phase_number,
                "started_at": started_at,
                "transition_type": "initial",
            },
            on_conflict="project_id,phase_number",
        ).execute()

    return {
        **project,
        "current_phase_number": current_phase_number,
        "current_phase_started_at": started_at,
        "_phase_schema_ready": True,
    }


def advance_project_phase(
    db: Client,
    project_id: UUID,
    *,
    transition_type: str,
    changed_by: Optional[UUID | str] = None,
) -> dict:
    project = get_project_phase_state(db, project_id)
    now = datetime.now(timezone.utc).isoformat()
    current_phase = int(project.get("current_phase_number") or 1)
    next_phase = current_phase + 1

    db.table("project_phases").update(
        {
            "ended_at": now,
            "transition_type": transition_type,
            "changed_by": str(changed_by) if changed_by else None,
        }
    ).eq("project_id", str(project_id)).eq("phase_number", current_phase).is_("ended_at", "null").execute()

    db.table("project_phases").upsert(
        {
            "project_id": str(project_id),
            "phase_number": next_phase,
            "started_at": now,
            "ended_at": None,
            "transition_type": transition_type,
            "changed_by": str(changed_by) if changed_by else None,
        },
        on_conflict="project_id,phase_number",
    ).execute()

    project_update = (
        db.table("projects")
        .update(
            {
                "current_phase_number": next_phase,
                "current_phase_started_at": now,
            }
        )
        .eq("id", str(project_id))
        .execute()
    )
    if not project_update.data:
        raise ValueError("Project not found")
    return project_update.data[0]


def maybe_auto_advance_project_phase(db: Client, project_id: UUID) -> dict:
    project = get_project_phase_state(db, project_id)
    if project.get("_phase_schema_ready") is False:
        return project

    mode = normalize_phase_auto_mode(project.get("phase_auto_mode"))
    if mode is None:
        return project

    interval_days = PHASE_INTERVAL_DAYS[mode]
    started_at = _parse_datetime(project.get("current_phase_started_at"))
    now = datetime.now(timezone.utc)

    # Handle long inactive periods by rolling forward at most 12 phases per request.
    advances = 0
    while now >= started_at + timedelta(days=interval_days) and advances < 12:
        project = advance_project_phase(db, project_id, transition_type="auto", changed_by=None)
        started_at = _parse_datetime(project.get("current_phase_started_at"))
        advances += 1

    return project