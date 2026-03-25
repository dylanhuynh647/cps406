from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from uuid import UUID
from typing import Optional, List
from datetime import datetime
from backend.dependencies import get_current_user, ensure_project_role, get_project_role, supabase
from backend.schemas.bug import BugCreate, BugUpdate, BugResponse, BugSeverityUpdate
from backend.crud import bug
from backend.utils.audit_log import log_bug_created, log_bug_updated, log_bug_status_changed, log_bug_fixed, get_client_ip
from backend.utils.phases import maybe_auto_advance_project_phase
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


def _enrich_invitation_rows(rows: list[dict]) -> list[dict]:
    if not rows:
        return []

    bug_ids = list({row.get("bug_id") for row in rows if row.get("bug_id")})
    project_ids = list({row.get("project_id") for row in rows if row.get("project_id")})
    inviter_ids = list({row.get("invited_by") for row in rows if row.get("invited_by")})

    bug_map: dict[str, str] = {}
    project_map: dict[str, str] = {}
    inviter_map: dict[str, dict] = {}

    if bug_ids:
        bug_result = (
            supabase.table("bugs")
            .select("id, title")
            .in_("id", bug_ids)
            .execute()
        )
        for row in bug_result.data or []:
            bug_map[str(row["id"])] = row.get("title") or "Bug"

    if project_ids:
        project_result = (
            supabase.table("projects")
            .select("id, name")
            .in_("id", project_ids)
            .execute()
        )
        for row in project_result.data or []:
            project_map[str(row["id"])] = row.get("name") or "Project"

    if inviter_ids:
        inviter_result = (
            supabase.table("users")
            .select("id, email, full_name")
            .in_("id", inviter_ids)
            .execute()
        )
        for row in inviter_result.data or []:
            inviter_map[str(row["id"])] = row

    enriched: list[dict] = []
    for row in rows:
        inviter = inviter_map.get(str(row.get("invited_by")), {})
        enriched.append(
            {
                **row,
                "bug_title": bug_map.get(str(row.get("bug_id"))) or "Bug",
                "project_name": project_map.get(str(row.get("project_id"))) or "Project",
                "inviter_name": inviter.get("full_name"),
                "inviter_email": inviter.get("email"),
            }
        )
    return enriched


def _create_assignment_invitation(
    bug_id: UUID,
    project_id: UUID,
    invited_user_id: UUID,
    invited_by: UUID | str,
):
    # Ensure only one pending invitation per bug.
    supabase.table("bug_assignment_invitations").update({"status": "declined"}).eq(
        "bug_id", str(bug_id)
    ).eq("status", "pending").execute()

    result = (
        supabase.table("bug_assignment_invitations")
        .insert(
            {
                "bug_id": str(bug_id),
                "project_id": str(project_id),
                "invited_user_id": str(invited_user_id),
                "invited_by": str(invited_by),
                "status": "pending",
            }
        )
        .execute()
    )
    return (result.data or [None])[0]

@router.post("/bugs", response_model=BugResponse, status_code=status.HTTP_201_CREATED)
async def create_bug(
    request: Request,
    bug_data: BugCreate,
    user: dict = Depends(get_current_user)
):
    """Create a new bug"""
    try:
        requester_role = ensure_project_role(
            supabase,
            bug_data.project_id,
            user["user_id"],
            ["owner", "admin", "developer", "reporter"],
        )
        if requester_role == "reporter" and not bug_data.assigned_to:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reporter-created bugs must include an assignee invitation",
            )
        if bug_data.assigned_to and not get_project_role(supabase, bug_data.project_id, bug_data.assigned_to):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned user is not a member of this project"
            )
        if bug_data.assigned_to:
            assignee_role = get_project_role(supabase, bug_data.project_id, bug_data.assigned_to)
            if assignee_role not in ["owner", "admin", "developer"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bug assignee must be an owner, admin, or developer",
                )

        project_phase_state = maybe_auto_advance_project_phase(supabase, bug_data.project_id)

        assigned_target = bug_data.assigned_to
        is_self_assignment = bool(assigned_target) and str(assigned_target) == str(user["user_id"])
        create_payload = (
            bug_data
            if (not assigned_target or is_self_assignment)
            else bug_data.model_copy(update={"assigned_to": None})
        )
        created = bug.create_bug(
            supabase,
            create_payload,
            UUID(user["user_id"]),
            phase_number=int(project_phase_state.get("current_phase_number") or 1),
        )

        if assigned_target and not is_self_assignment:
            _create_assignment_invitation(
                UUID(created["id"]),
                bug_data.project_id,
                assigned_target,
                user["user_id"],
            )
        # Fetch with artifacts
        full_bug = bug.get_bug(supabase, UUID(created["id"]), bug_data.project_id)
        
        # Audit logging
        log_bug_created(UUID(created["id"]), user["user_id"], get_client_ip(request))
        
        return BugResponse(**full_bug)
    except HTTPException:
        raise
    except ValueError as e:
        # Validation errors - don't expose internal details
        logger.warning(f"Validation error creating bug: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid input data"
        )
    except Exception as e:
        logger.error(f"Error creating bug: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create bug"
        )

@router.get("/bugs", response_model=List[BugResponse])
async def list_bugs(
    project_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    bug_status: Optional[List[str]] = Query(None, alias="status"),
    bug_type: Optional[List[str]] = Query(None),
    reporter_id: Optional[UUID] = Query(None),
    assigned_to: Optional[UUID] = Query(None),
    artifact_type: Optional[List[str]] = Query(None),
    found_at_from: Optional[datetime] = Query(None),
    found_at_to: Optional[datetime] = Query(None),
    include_archived_resolved: bool = Query(False),
    user: dict = Depends(get_current_user)
):
    """List all bugs with filtering"""
    try:
        ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer", "reporter"],
        )
        try:
            project_phase_state = maybe_auto_advance_project_phase(supabase, project_id)
        except Exception:
            # Keep bug list available even if phase metadata is not ready.
            project_phase_state = {"current_phase_number": 1}
        bugs_list = bug.get_bugs(
            supabase,
            project_id=project_id,
            skip=skip,
            limit=limit,
            status=bug_status,
            bug_type=bug_type,
            reporter_id=reporter_id,
            assigned_to=assigned_to,
            artifact_type=artifact_type,
            found_at_from=found_at_from,
            found_at_to=found_at_to,
            current_phase_number=int(project_phase_state.get("current_phase_number") or 1),
            include_archived_resolved=include_archived_resolved,
        )
        return [BugResponse(**b) for b in bugs_list]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list bugs"
        )

@router.get("/bugs/{bug_id}", response_model=BugResponse)
async def get_bug(
    bug_id: UUID,
    project_id: UUID,
    user: dict = Depends(get_current_user)
):
    """Get a single bug by ID"""
    try:
        ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer", "reporter"],
        )
        bug_data = bug.get_bug(supabase, bug_id, project_id)
        if not bug_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bug not found"
            )
        return BugResponse(**bug_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.patch("/bugs/{bug_id}", response_model=BugResponse)
async def update_bug(
    request: Request,
    bug_id: UUID,
    project_id: UUID,
    bug_data: BugUpdate,
    user: dict = Depends(get_current_user)
):
    """Update a bug with project role checks."""
    try:
        requester_role = ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer", "reporter"],
        )
        if bug_data.assigned_to and not get_project_role(supabase, project_id, bug_data.assigned_to):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assigned user is not a member of this project"
            )
        # Get current bug to track status changes
        current_bug = bug.get_bug(supabase, bug_id, project_id)
        if not current_bug:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bug not found"
            )
        if requester_role == "reporter" and str(current_bug.get("reporter_id")) != str(user["user_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reporters can only edit their own bug reports",
            )
        if bug_data.assigned_to:
            assignee_role = get_project_role(supabase, project_id, bug_data.assigned_to)
            if assignee_role not in ["owner", "admin", "developer"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bug assignee must be an owner, admin, or developer",
                )
        
        old_status = current_bug.get("status")
        
        incoming_assignee = bug_data.assigned_to
        is_self_assignment = bool(incoming_assignee) and str(incoming_assignee) == str(user["user_id"])
        update_payload = (
            bug_data
            if (not incoming_assignee or is_self_assignment)
            else bug_data.model_copy(update={"assigned_to": None})
        )

        updated = bug.update_bug(supabase, bug_id, update_payload)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bug not found"
            )

        if incoming_assignee and not is_self_assignment:
            _create_assignment_invitation(
                bug_id,
                project_id,
                incoming_assignee,
                user["user_id"],
            )
        
        # Fetch with artifacts
        full_bug = bug.get_bug(supabase, bug_id, project_id)
        
        # Audit logging
        changes = {}
        if bug_data.title is not None:
            changes["title"] = bug_data.title
        if bug_data.description is not None:
            changes["description"] = bug_data.description
        if bug_data.severity is not None:
            changes["severity"] = bug_data.severity
        if bug_data.status is not None and bug_data.status != old_status:
            log_bug_status_changed(bug_id, user["user_id"], old_status, bug_data.status, get_client_ip(request))
            if bug_data.status == "resolved":
                log_bug_fixed(bug_id, user["user_id"], get_client_ip(request))
        if changes:
            log_bug_updated(bug_id, user["user_id"], changes, get_client_ip(request))
        
        return BugResponse(**full_bug)
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Validation error updating bug: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid input data"
        )
    except Exception as e:
        logger.error(f"Error updating bug: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update bug"
        )


@router.patch("/bugs/{bug_id}/severity", response_model=BugResponse)
async def update_bug_severity(
    request: Request,
    bug_id: UUID,
    project_id: UUID,
    payload: BugSeverityUpdate,
    user: dict = Depends(get_current_user)
):
    """Update bug severity (all roles)"""
    try:
        ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer", "reporter"],
        )
        current_bug = bug.get_bug(supabase, bug_id, project_id)
        if not current_bug:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bug not found"
            )

        updated = bug.update_bug(supabase, bug_id, BugUpdate(severity=payload.severity))
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bug not found"
            )

        if current_bug.get("severity") != payload.severity:
            log_bug_updated(
                bug_id,
                user["user_id"],
                {"severity": payload.severity},
                get_client_ip(request)
            )

        full_bug = bug.get_bug(supabase, bug_id, project_id)
        return BugResponse(**full_bug)
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Validation error updating bug severity: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid input data"
        )
    except Exception as e:
        logger.error(f"Error updating bug severity: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update bug severity"
        )

@router.delete("/bugs/{bug_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bug(
    bug_id: UUID,
    project_id: UUID,
    user: dict = Depends(get_current_user)
):
    """Delete a bug (project owner/admin/developer)"""
    try:
        ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer"],
        )
        bug_row = bug.get_bug(supabase, bug_id, project_id)
        if not bug_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bug not found"
            )
        bug.delete_bug(supabase, bug_id)
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/bugs/assignment-invitations")
async def list_assignment_invitations(
    project_id: UUID,
    user: dict = Depends(get_current_user),
):
    ensure_project_role(
        supabase,
        project_id,
        user["user_id"],
        ["owner", "admin", "developer", "reporter"],
    )

    result = (
        supabase.table("bug_assignment_invitations")
        .select("*")
        .eq("project_id", str(project_id))
        .eq("invited_user_id", str(user["user_id"]))
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    return _enrich_invitation_rows(result.data or [])


@router.get("/bugs/assignment-invitations/inbox")
async def list_assignment_invitations_inbox(
    status_filter: str = Query("pending", pattern="^(pending|accepted|declined|all)$"),
    user: dict = Depends(get_current_user),
):
    query = (
        supabase.table("bug_assignment_invitations")
        .select("*")
        .eq("invited_user_id", str(user["user_id"]))
        .order("created_at", desc=True)
    )
    if status_filter != "all":
        query = query.eq("status", status_filter)

    result = query.execute()
    return _enrich_invitation_rows(result.data or [])


@router.get("/bugs/assignment-invitations/pending-count")
async def assignment_invitations_pending_count(
    user: dict = Depends(get_current_user),
):
    result = (
        supabase.table("bug_assignment_invitations")
        .select("id", count="exact")
        .eq("invited_user_id", str(user["user_id"]))
        .eq("status", "pending")
        .execute()
    )
    return {"count": result.count or 0}


@router.patch("/bugs/assignment-invitations/{invitation_id}")
async def respond_to_assignment_invitation(
    invitation_id: UUID,
    action: str = Query(..., pattern="^(accept|decline)$"),
    user: dict = Depends(get_current_user),
):
    invitation_result = (
        supabase.table("bug_assignment_invitations")
        .select("*")
        .eq("id", str(invitation_id))
        .single()
        .execute()
    )
    invitation = invitation_result.data
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if str(invitation.get("invited_user_id")) != str(user["user_id"]):
        raise HTTPException(status_code=403, detail="You can only respond to your own invitation")
    if invitation.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Invitation has already been handled")

    ensure_project_role(
        supabase,
        UUID(invitation["project_id"]),
        user["user_id"],
        ["owner", "admin", "developer", "reporter"],
    )

    next_status = "accepted" if action == "accept" else "declined"
    updated_invite = (
        supabase.table("bug_assignment_invitations")
        .update(
            {
                "status": next_status,
                "responded_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", str(invitation_id))
        .execute()
    )

    if action == "accept":
        bug.update_bug(
            supabase,
            UUID(invitation["bug_id"]),
            BugUpdate(assigned_to=UUID(user["user_id"])),
        )

    return (updated_invite.data or [invitation])[0]
