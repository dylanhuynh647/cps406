from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from backend.dependencies import get_current_user, role_required, ensure_project_role, supabase
from uuid import UUID

router = APIRouter()

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    dark_mode: Optional[bool] = None

class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    full_name: Optional[str]
    avatar_url: Optional[str]
    dark_mode: Optional[bool] = False
    created_at: Optional[str]
    updated_at: Optional[str]


def _get_or_create_user_row(user_id: str, email: str):
    """Return user row; create a minimal row when missing."""
    user_id = str(user_id)

    try:
        result = supabase.table("users").select("*").eq("id", user_id).single().execute()
        if result.data:
            return result.data
    except Exception:
        # Missing row or transient read error; continue with bootstrap path.
        pass

    try:
        supabase.table("users").upsert({
            "id": user_id,
            "email": email,
            "role": "reporter",
        }).execute()
    except Exception:
        # If another request created the row concurrently, read retry below will pick it up.
        pass

    try:
        retry = supabase.table("users").select("*").eq("id", user_id).single().execute()
        return retry.data
    except Exception:
        return None

@router.get("/user/me", response_model=UserResponse)
async def get_current_user_profile(user: dict = Depends(get_current_user)):
    """Get current user's profile"""
    user_id = user["user_id"]
    
    profile_row = _get_or_create_user_row(user_id, user["email"])

    if not profile_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found"
        )

    return UserResponse(**profile_row)

@router.patch("/user/me", response_model=UserResponse)
async def update_current_user_profile(
    user_update: UserUpdate,
    user: dict = Depends(get_current_user)
):
    """Update current user's profile"""
    user_id = user["user_id"]
    
    update_data = {}
    if user_update.full_name is not None:
        update_data["full_name"] = user_update.full_name
    if user_update.avatar_url is not None:
        update_data["avatar_url"] = user_update.avatar_url
    if user_update.dark_mode is not None:
        update_data["dark_mode"] = user_update.dark_mode
    
    profile_row = _get_or_create_user_row(user_id, user["email"])
    if not profile_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found"
        )

    if not update_data:
        return UserResponse(**profile_row)

    result = supabase.table("users").update(update_data).eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found"
        )
    
    return UserResponse(**result.data[0])

@router.get("/users")
async def list_all_users(user: dict = Depends(role_required(["admin"]))):
    """List all users (admin only)"""
    result = supabase.table("users").select("*").execute()
    return result.data

@router.get("/users/developers")
async def list_developers_and_admins(
    project_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """List assignable users within a project (developer/admin/owner)."""
    ensure_project_role(
        supabase,
        project_id,
        current_user["user_id"],
        ["owner", "admin", "developer", "reporter"],
    )

    members_result = (
        supabase.table("project_members")
        .select("user_id,role")
        .eq("project_id", str(project_id))
        .in_("role", ["owner", "admin", "developer"])
        .execute()
    )

    members = members_result.data or []
    if not members:
        return []

    user_ids = [member["user_id"] for member in members]
    users_result = supabase.table("users").select("id,email,full_name,avatar_url").in_("id", user_ids).execute()
    users_by_id = {row["id"]: row for row in (users_result.data or [])}

    response = []
    for member in members:
        profile = users_by_id.get(member["user_id"], {})
        response.append(
            {
                "id": member["user_id"],
                "project_role": member["role"],
                "email": profile.get("email"),
                "full_name": profile.get("full_name"),
                "avatar_url": profile.get("avatar_url"),
            }
        )
    return response

@router.get("/users/profiles")
async def list_user_profiles(
    project_id: UUID,
    current_user: dict = Depends(get_current_user)
):
    """List lightweight user profiles for project members."""
    ensure_project_role(
        supabase,
        project_id,
        current_user["user_id"],
        ["owner", "admin", "developer", "reporter"],
    )

    members_result = (
        supabase.table("project_members")
        .select("user_id")
        .eq("project_id", str(project_id))
        .execute()
    )

    user_ids = [member["user_id"] for member in (members_result.data or [])]
    if not user_ids:
        return []

    result = supabase.table("users").select("id, full_name, email, avatar_url").in_("id", user_ids).execute()
    return result.data

@router.get("/admin-only")
async def admin_only_endpoint(user: dict = Depends(role_required(["admin"]))):
    """Admin-only endpoint example"""
    return {"message": f"Welcome, Admin {user['email']}! This is admin-only data."}

@router.get("/developer-or-admin")
async def developer_or_admin_endpoint(user: dict = Depends(role_required(["developer", "admin"]))):
    """Developer or Admin endpoint example"""
    return {"message": f"Welcome, {user['role']} {user['email']}! This is developer/admin data."}
