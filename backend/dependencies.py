from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
import os
from uuid import UUID
from typing import Optional

security = HTTPBearer()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Missing Supabase environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Export supabase for use in other modules
__all__ = [
    "supabase",
    "supabase_auth_secure",
    "role_required",
    "get_current_user",
    "get_project_role",
    "ensure_project_role",
]

async def supabase_auth_secure(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Verify Supabase JWT and return user info"""
    token = credentials.credentials

    import logging
    logger = logging.getLogger(__name__)

    def _resolve_user_role(user_id: str, email: str) -> str:
        """Best-effort role resolution with safe fallback."""
        try:
            user_data = supabase.table("users").select("role").eq("id", user_id).single().execute()
            if user_data and user_data.data:
                return user_data.data.get("role", "reporter")
        except Exception as select_exc:
            logger.warning(f"Initial role lookup failed for user {user_id}: {select_exc}")

        # If user row doesn't exist yet, attempt to create it once.
        try:
            supabase.table("users").upsert({
                "id": user_id,
                "email": email,
                "role": "reporter"
            }).execute()
        except Exception as upsert_exc:
            logger.warning(f"Role bootstrap upsert failed for user {user_id}: {upsert_exc}")

        try:
            user_data = supabase.table("users").select("role").eq("id", user_id).single().execute()
            if user_data and user_data.data:
                return user_data.data.get("role", "reporter")
        except Exception as retry_exc:
            logger.warning(f"Role lookup retry failed for user {user_id}: {retry_exc}")

        return "reporter"

    try:
        # Verify token with Supabase
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )

        user_id = user_response.user.id
        user_role = _resolve_user_role(str(user_id), user_response.user.email)

        return {
            "user_id": user_id,
            "email": user_response.user.email,
            "role": user_role
        }
    except HTTPException:
        raise
    except Exception as e:
        # Don't expose internal error details
        logger.warning(f"Authentication failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )

def role_required(allowed_roles: list[str]):
    """Dependency factory for role-based access control"""
    def _role_checker(user: dict = Depends(supabase_auth_secure)):
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User with role '{user['role']}' does not have permission. Required roles: {', '.join(allowed_roles)}"
            )
        return user
    return _role_checker

def get_current_user(user: dict = Depends(supabase_auth_secure)) -> dict:
    """Get current authenticated user"""
    return user


def get_project_role(db: Client, project_id: UUID, user_id: UUID | str) -> Optional[str]:
    """Return the current member role for a project, if any."""
    try:
        result = (
            db.table("project_members")
            .select("role")
            .eq("project_id", str(project_id))
            .eq("user_id", str(user_id))
            .single()
            .execute()
        )
        if result.data:
            return result.data.get("role")
    except Exception:
        return None
    return None


def ensure_project_role(db: Client, project_id: UUID, user_id: UUID | str, allowed_roles: list[str]) -> str:
    """Ensure user is a member in project with one of allowed roles."""
    role = get_project_role(db, project_id, user_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this project",
        )

    if role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User with role '{role}' does not have permission for this project",
        )

    return role
