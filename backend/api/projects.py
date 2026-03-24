from typing import List, Optional
from uuid import UUID
from pathlib import Path
from datetime import datetime
import base64
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import FileResponse, Response

from backend.dependencies import get_current_user, ensure_project_role, get_project_role, supabase
from backend.schemas.project import (
    ProjectCreate,
    ProjectMemberAdd,
    ProjectMemberResponse,
    ProjectMemberUpdate,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter()
PROJECT_COVER_UPLOAD_ROOT = Path("backend") / "uploads" / "project_covers"


def _enrich_project_invitation_rows(rows: list[dict]) -> list[dict]:
    if not rows:
        return []

    project_ids = list({row.get("project_id") for row in rows if row.get("project_id")})
    inviter_ids = list({row.get("invited_by") for row in rows if row.get("invited_by")})

    project_map: dict[str, str] = {}
    inviter_map: dict[str, dict] = {}

    if project_ids:
        projects_result = (
            supabase.table("projects")
            .select("id,name")
            .in_("id", project_ids)
            .execute()
        )
        for row in projects_result.data or []:
            project_map[str(row["id"])] = row.get("name") or "Project"

    if inviter_ids:
        inviters_result = (
            supabase.table("users")
            .select("id,email,full_name")
            .in_("id", inviter_ids)
            .execute()
        )
        for row in inviters_result.data or []:
            inviter_map[str(row["id"])] = row

    enriched: list[dict] = []
    for row in rows:
        inviter = inviter_map.get(str(row.get("invited_by")), {})
        enriched.append(
            {
                **row,
                "project_name": project_map.get(str(row.get("project_id"))) or "Project",
                "inviter_name": inviter.get("full_name"),
                "inviter_email": inviter.get("email"),
            }
        )
    return enriched


def _normalize_project_row(row: dict, my_role: str) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row.get("description"),
        "cover_image_url": row.get("cover_image_url"),
        "owner_id": row["owner_id"],
        "my_role": my_role,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.get("/projects", response_model=List[ProjectResponse])
async def list_my_projects(user: dict = Depends(get_current_user)):
    user_id = str(user["user_id"])
    memberships_result = (
        supabase.table("project_members")
        .select("project_id,role")
        .eq("user_id", user_id)
        .execute()
    )

    memberships = memberships_result.data or []
    if not memberships:
        return []

    project_ids = [membership["project_id"] for membership in memberships]
    projects_result = (
        supabase.table("projects")
        .select("id,name,description,cover_image_url,owner_id,created_at,updated_at")
        .in_("id", project_ids)
        .order("created_at", desc=True)
        .execute()
    )

    role_by_project_id = {item["project_id"]: item["role"] for item in memberships}
    return [
        _normalize_project_row(project, role_by_project_id.get(project["id"], "reporter"))
        for project in (projects_result.data or [])
    ]


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, user: dict = Depends(get_current_user)):
    user_id = str(user["user_id"])

    created_result = (
        supabase.table("projects")
        .insert({
            "name": payload.name,
            "description": payload.description,
            "cover_image_url": None,
            "owner_id": user_id,
        })
        .execute()
    )

    if not created_result.data:
        raise HTTPException(status_code=500, detail="Failed to create project")

    project = created_result.data[0]

    supabase.table("project_members").upsert(
        {
            "project_id": project["id"],
            "user_id": user_id,
            "role": "owner",
            "added_by": user_id,
        }
    ).execute()

    return ProjectResponse(**_normalize_project_row(project, "owner"))


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    user: dict = Depends(get_current_user),
):
    role = ensure_project_role(supabase, project_id, user["user_id"], ["owner", "admin"])

    update_data = {}
    if payload.name is not None:
        update_data["name"] = payload.name
    if payload.description is not None:
        update_data["description"] = payload.description

    if update_data:
        update_result = (
            supabase.table("projects")
            .update(update_data)
            .eq("id", str(project_id))
            .execute()
        )
        if not update_result.data:
            raise HTTPException(status_code=404, detail="Project not found")

    project_result = (
        supabase.table("projects")
        .select("id,name,description,cover_image_url,owner_id,created_at,updated_at")
        .eq("id", str(project_id))
        .single()
        .execute()
    )
    if not project_result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    return ProjectResponse(**_normalize_project_row(project_result.data, role))


@router.get("/projects/{project_id}/members", response_model=List[ProjectMemberResponse])
async def list_project_members(
    project_id: UUID,
    q: Optional[str] = Query(default=None, max_length=255),
    user: dict = Depends(get_current_user),
):
    ensure_project_role(supabase, project_id, user["user_id"], ["owner", "admin", "developer", "reporter"])

    members_result = (
        supabase.table("project_members")
        .select("user_id,role,created_at,updated_at")
        .eq("project_id", str(project_id))
        .execute()
    )
    members = members_result.data or []
    if not members:
        return []

    user_ids = [member["user_id"] for member in members]
    users_result = (
        supabase.table("users")
        .select("id,email,full_name,avatar_url")
        .in_("id", user_ids)
        .execute()
    )

    users_by_id = {row["id"]: row for row in (users_result.data or [])}
    query_text = q.strip().lower() if q else None

    response_rows = []
    for member in members:
        profile = users_by_id.get(member["user_id"], {})
        email = profile.get("email")
        full_name = profile.get("full_name")
        if query_text:
            haystacks = [
                (email or "").lower(),
                (full_name or "").lower(),
            ]
            if not any(query_text in value for value in haystacks):
                continue

        response_rows.append(
            {
                "user_id": member["user_id"],
                "role": member["role"],
                "email": email,
                "full_name": full_name,
                "avatar_url": profile.get("avatar_url"),
                "created_at": member["created_at"],
                "updated_at": member["updated_at"],
            }
        )

    return response_rows


@router.get("/projects/{project_id}/users/search")
async def search_users_for_project(
    project_id: UUID,
    q: str = Query(..., min_length=1, max_length=255),
    user: dict = Depends(get_current_user),
):
    ensure_project_role(supabase, project_id, user["user_id"], ["owner", "admin"])

    query_text = q.strip().lower()
    users_result = supabase.table("users").select("id,email,full_name,avatar_url").execute()
    project_members_result = (
        supabase.table("project_members")
        .select("user_id")
        .eq("project_id", str(project_id))
        .execute()
    )
    pending_invites_result = (
        supabase.table("project_member_invitations")
        .select("invited_user_id")
        .eq("project_id", str(project_id))
        .eq("status", "pending")
        .execute()
    )
    existing_members = {member["user_id"] for member in (project_members_result.data or [])}
    pending_invited_user_ids = {invite["invited_user_id"] for invite in (pending_invites_result.data or [])}

    filtered = []
    for row in (users_result.data or []):
        haystacks = [
            (row.get("email") or "").lower(),
            (row.get("full_name") or "").lower(),
        ]
        if any(query_text in value for value in haystacks):
            filtered.append(
                {
                    "id": row["id"],
                    "email": row.get("email"),
                    "full_name": row.get("full_name"),
                    "avatar_url": row.get("avatar_url"),
                    "is_member": row["id"] in existing_members,
                    "has_pending_invitation": row["id"] in pending_invited_user_ids,
                }
            )

    return filtered[:20]


@router.post("/projects/{project_id}/member-invitations", status_code=status.HTTP_201_CREATED)
async def invite_project_member(
    project_id: UUID,
    payload: ProjectMemberAdd,
    user: dict = Depends(get_current_user),
):
    ensure_project_role(supabase, project_id, user["user_id"], ["owner", "admin"])

    target_user_result = (
        supabase.table("users")
        .select("id,email,full_name,avatar_url")
        .eq("id", str(payload.user_id))
        .single()
        .execute()
    )
    if not target_user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    existing_member = get_project_role(supabase, project_id, payload.user_id)
    if existing_member:
        raise HTTPException(status_code=400, detail="User is already a member of this project")

    # Ensure one pending invitation per user/project.
    supabase.table("project_member_invitations").update(
        {
            "status": "declined",
            "responded_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
    ).eq("project_id", str(project_id)).eq("invited_user_id", str(payload.user_id)).eq("status", "pending").execute()

    invitation_result = (
        supabase.table("project_member_invitations")
        .insert(
            {
                "project_id": str(project_id),
                "invited_user_id": str(payload.user_id),
                "invited_by": str(user["user_id"]),
                "role": payload.role,
                "status": "pending",
            }
        )
        .execute()
    )

    if not invitation_result.data:
        raise HTTPException(status_code=500, detail="Failed to create invitation")

    invitation = invitation_result.data[0]
    profile = target_user_result.data
    return {
        "id": invitation["id"],
        "project_id": invitation["project_id"],
        "invited_user_id": invitation["invited_user_id"],
        "invited_by": invitation["invited_by"],
        "role": invitation["role"],
        "status": invitation["status"],
        "created_at": invitation["created_at"],
        "updated_at": invitation["updated_at"],
        "email": profile.get("email"),
        "full_name": profile.get("full_name"),
        "avatar_url": profile.get("avatar_url"),
    }


@router.get("/projects/member-invitations/inbox")
async def list_project_member_invitations_inbox(
    status_filter: str = Query("pending", pattern="^(pending|accepted|declined|all)$"),
    user: dict = Depends(get_current_user),
):
    query = (
        supabase.table("project_member_invitations")
        .select("*")
        .eq("invited_user_id", str(user["user_id"]))
        .order("created_at", desc=True)
    )
    if status_filter != "all":
        query = query.eq("status", status_filter)

    result = query.execute()
    return _enrich_project_invitation_rows(result.data or [])


@router.get("/projects/member-invitations/pending-count")
async def project_member_invitation_pending_count(
    user: dict = Depends(get_current_user),
):
    result = (
        supabase.table("project_member_invitations")
        .select("id", count="exact")
        .eq("invited_user_id", str(user["user_id"]))
        .eq("status", "pending")
        .execute()
    )
    return {"count": result.count or 0}


@router.patch("/projects/member-invitations/{invitation_id}")
async def respond_to_project_member_invitation(
    invitation_id: UUID,
    action: str = Query(..., pattern="^(accept|decline)$"),
    user: dict = Depends(get_current_user),
):
    invitation_result = (
        supabase.table("project_member_invitations")
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

    next_status = "accepted" if action == "accept" else "declined"
    updated_result = (
        supabase.table("project_member_invitations")
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
        existing_role = get_project_role(supabase, UUID(invitation["project_id"]), UUID(user["user_id"]))
        if not existing_role:
            supabase.table("project_members").insert(
                {
                    "project_id": invitation["project_id"],
                    "user_id": str(user["user_id"]),
                    "role": invitation["role"],
                    "added_by": invitation["invited_by"],
                }
            ).execute()

    return (updated_result.data or [invitation])[0]


@router.patch("/projects/{project_id}/members/{member_user_id}", response_model=ProjectMemberResponse)
async def update_project_member_role(
    project_id: UUID,
    member_user_id: UUID,
    payload: ProjectMemberUpdate,
    user: dict = Depends(get_current_user),
):
    acting_role = ensure_project_role(supabase, project_id, user["user_id"], ["owner", "admin"])

    current_role = get_project_role(supabase, project_id, member_user_id)
    if not current_role:
        raise HTTPException(status_code=404, detail="Project member not found")
    if current_role == "owner":
        raise HTTPException(status_code=400, detail="Owner role cannot be changed")
    if acting_role == "admin" and current_role == "admin":
        raise HTTPException(status_code=403, detail="Admin cannot change another admin")

    update_result = (
        supabase.table("project_members")
        .update({"role": payload.role})
        .eq("project_id", str(project_id))
        .eq("user_id", str(member_user_id))
        .execute()
    )

    if not update_result.data:
        raise HTTPException(status_code=500, detail="Failed to update member role")

    profile_result = (
        supabase.table("users")
        .select("id,email,full_name,avatar_url")
        .eq("id", str(member_user_id))
        .single()
        .execute()
    )

    updated_member = update_result.data[0]
    profile = profile_result.data or {}
    return {
        "user_id": updated_member["user_id"],
        "role": updated_member["role"],
        "email": profile.get("email"),
        "full_name": profile.get("full_name"),
        "avatar_url": profile.get("avatar_url"),
        "created_at": updated_member["created_at"],
        "updated_at": updated_member["updated_at"],
    }


@router.delete("/projects/{project_id}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    project_id: UUID,
    member_user_id: UUID,
    user: dict = Depends(get_current_user),
):
    acting_role = ensure_project_role(supabase, project_id, user["user_id"], ["owner", "admin"])
    member_role = get_project_role(supabase, project_id, member_user_id)
    if not member_role:
        raise HTTPException(status_code=404, detail="Project member not found")
    if member_role == "owner":
        raise HTTPException(status_code=400, detail="Owner cannot be removed")
    if acting_role == "admin" and member_role == "admin":
        raise HTTPException(status_code=403, detail="Admin cannot remove another admin")

    delete_result = (
        supabase.table("project_members")
        .delete()
        .eq("project_id", str(project_id))
        .eq("user_id", str(member_user_id))
        .execute()
    )
    if delete_result.data is None:
        raise HTTPException(status_code=500, detail="Failed to remove member")
    return None


@router.post("/projects/{project_id}/cover-image", response_model=ProjectResponse)
async def upload_project_cover_image(
    project_id: UUID,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    role = ensure_project_role(supabase, project_id, user["user_id"], ["owner", "admin"])

    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Project cover must be an image file")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Project cover image cannot be empty")
    encoded_cover = base64.b64encode(file_bytes).decode("ascii")

    cover_url = f"/api/projects/{project_id}/cover-image"
    update_result = (
        supabase.table("projects")
        .update(
            {
                "cover_image_url": cover_url,
                "cover_image_data_base64": encoded_cover,
                "cover_image_mime_type": content_type,
            }
        )
        .eq("id", str(project_id))
        .execute()
    )
    if not update_result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    row = update_result.data[0]
    return ProjectResponse(**_normalize_project_row(row, role))


@router.get("/projects/{project_id}/cover-image")
async def get_project_cover_image(
    project_id: UUID,
):
    project_result = (
        supabase.table("projects")
        .select("cover_image_data_base64,cover_image_mime_type")
        .eq("id", str(project_id))
        .single()
        .execute()
    )
    project_row = project_result.data or {}

    encoded_cover = project_row.get("cover_image_data_base64")
    if encoded_cover:
        try:
            file_bytes = base64.b64decode(encoded_cover)
        except Exception:
            raise HTTPException(status_code=500, detail="Stored cover image is invalid")
        return Response(
            content=file_bytes,
            media_type=project_row.get("cover_image_mime_type") or "application/octet-stream",
            headers={"Content-Disposition": f'inline; filename="project-{project_id}-cover"'},
        )

    # Legacy filesystem fallback for older cover uploads.
    files = [item for item in PROJECT_COVER_UPLOAD_ROOT.glob(f"{project_id}.*") if item.is_file()]
    if not files:
        raise HTTPException(status_code=404, detail="Cover image not found")

    disk_path = files[0]
    media_type = mimetypes.guess_type(str(disk_path))[0] or "application/octet-stream"
    return FileResponse(path=str(disk_path), media_type=media_type, filename=disk_path.name)
