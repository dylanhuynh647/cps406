from supabase import Client
from uuid import UUID
from typing import Optional, List
from datetime import datetime, date
from backend.schemas.bug import BugCreate, BugUpdate


def _normalize_status_for_response(status: Optional[str]) -> Optional[str]:
    if status in ("fixed", "closed"):
        return "resolved"
    return status


def _write_bug_status(db: Client, bug_id: UUID, status_value: str):
    """Write bug status with fallback for legacy enum values."""
    try:
        return db.table("bugs").update({"status": status_value}).eq("id", str(bug_id)).execute()
    except Exception as e:
        error_text = str(e).lower()
        if status_value == "resolved" and "enum" in error_text and "bug_status" in error_text:
            return db.table("bugs").update({"status": "fixed"}).eq("id", str(bug_id)).execute()
        raise


def _get_user_profile_map(db: Client, user_ids: List[str]) -> dict:
    """Return a map of user_id -> profile fields used by bug views."""
    unique_ids = list({uid for uid in user_ids if uid})
    if not unique_ids:
        return {}

    users_result = db.table("users").select("id, full_name, email, avatar_url").in_("id", unique_ids).execute()
    profile_map = {}
    for user in users_result.data or []:
        profile_map[user["id"]] = {
            "display_name": user.get("full_name") or user.get("email"),
            "avatar_url": user.get("avatar_url"),
        }
    return profile_map

def create_bug(db: Client, bug_data: BugCreate, reporter_id: UUID):
    """Create a new bug and its artifact relationships"""
    status_value = bug_data.status or "open"

    create_payload = {
        "project_id": str(bug_data.project_id),
        "title": bug_data.title,
        "description": bug_data.description,
        "bug_type": bug_data.bug_type,
        "status": status_value,
        "severity": bug_data.severity or "medium",
        "reporter_id": str(reporter_id),
        "assigned_to": str(bug_data.assigned_to) if bug_data.assigned_to else None
    }

    # Create bug
    try:
        bug_result = db.table("bugs").insert(create_payload).execute()
    except Exception as e:
        error_text = str(e).lower()
        if status_value == "resolved" and "enum" in error_text and "bug_status" in error_text:
            create_payload["status"] = "fixed"
            bug_result = db.table("bugs").insert(create_payload).execute()
        else:
            raise
    
    if not bug_result.data:
        raise Exception("Failed to create bug")
    
    bug = bug_result.data[0]
    bug_id = bug["id"]
    
    # Create artifact relationships
    if bug_data.artifact_ids:
        artifact_relations = [
            {"bug_id": bug_id, "artifact_id": str(artifact_id)}
            for artifact_id in bug_data.artifact_ids
        ]
        db.table("bug_artifacts").insert(artifact_relations).execute()
    
    bug["status"] = _normalize_status_for_response(bug.get("status"))
    return bug

def get_bug(db: Client, bug_id: UUID, project_id: Optional[UUID] = None):
    """Get a single bug with associated artifacts"""
    query = db.table("bugs").select("*").eq("id", str(bug_id))
    if project_id:
        query = query.eq("project_id", str(project_id))
    bug_result = query.single().execute()
    
    if not bug_result.data:
        return None
    
    bug = bug_result.data
    bug["status"] = _normalize_status_for_response(bug.get("status"))

    user_profile_map = _get_user_profile_map(db, [bug.get("reporter_id")])
    reporter_profile = user_profile_map.get(bug.get("reporter_id"), {})
    bug["reporter_name"] = reporter_profile.get("display_name")
    bug["reporter_avatar_url"] = reporter_profile.get("avatar_url")
    
    # Get associated artifacts
    artifacts_result = db.table("bug_artifacts").select("artifact_id, artifacts(*)").eq("bug_id", str(bug_id)).execute()
    bug["artifacts"] = [item["artifacts"] for item in artifacts_result.data if item.get("artifacts")]
    bug["artifact_ids"] = [item["artifact_id"] for item in artifacts_result.data if item.get("artifact_id")]
    bug["artifact_count"] = len(artifacts_result.data or [])
    
    return bug

def get_bugs(
    db: Client,
    project_id: UUID,
    skip: int = 0,
    limit: int = 100,
    status: Optional[List[str]] = None,
    bug_type: Optional[List[str]] = None,
    reporter_id: Optional[UUID] = None,
    assigned_to: Optional[UUID] = None,
    artifact_type: Optional[List[str]] = None,
    found_at_from: Optional[datetime] = None,
    found_at_to: Optional[datetime] = None
):
    """Get bugs with filtering"""
    query = db.table("bugs").select("*").eq("project_id", str(project_id))
    
    if status:
        query = query.in_("status", status)
    if bug_type:
        query = query.in_("bug_type", bug_type)
    if reporter_id:
        query = query.eq("reporter_id", str(reporter_id))
    if assigned_to:
        query = query.eq("assigned_to", str(assigned_to))
    if found_at_from:
        query = query.gte("found_at", found_at_from.isoformat())
    if found_at_to:
        query = query.lte("found_at", found_at_to.isoformat())
    
    # Handle artifact_type filtering (requires join)
    if artifact_type:
        # Get bug IDs that have artifacts of the specified types
        artifacts_result = db.table("artifacts").select("id").in_("type", artifact_type).execute()
        artifact_ids = [a["id"] for a in artifacts_result.data]
        
        if artifact_ids:
            bug_artifacts_result = db.table("bug_artifacts").select("bug_id").in_("artifact_id", artifact_ids).execute()
            bug_ids = list(set([ba["bug_id"] for ba in bug_artifacts_result.data]))
            if bug_ids:
                query = query.in_("id", bug_ids)
            else:
                # No bugs match, return empty
                return []
        else:
            return []
    
    result = query.order("created_at", desc=True).range(skip, skip + limit - 1).execute()
    bugs = result.data or []

    bug_ids = [str(item.get("id")) for item in bugs if item.get("id")]
    artifact_count_map = {}
    artifact_ids_map = {}
    if bug_ids:
        bug_artifacts_result = db.table("bug_artifacts").select("bug_id,artifact_id").in_("bug_id", bug_ids).execute()
        for relation in bug_artifacts_result.data or []:
            relation_bug_id = str(relation.get("bug_id")) if relation.get("bug_id") else None
            if relation_bug_id:
                artifact_count_map[relation_bug_id] = artifact_count_map.get(relation_bug_id, 0) + 1
                artifact_ids_map.setdefault(relation_bug_id, []).append(relation.get("artifact_id"))

    user_profile_map = _get_user_profile_map(db, [item.get("reporter_id") for item in bugs])
    for item in bugs:
        item["status"] = _normalize_status_for_response(item.get("status"))
        reporter_profile = user_profile_map.get(item.get("reporter_id"), {})
        item["reporter_name"] = reporter_profile.get("display_name")
        item["reporter_avatar_url"] = reporter_profile.get("avatar_url")
        item_id = str(item.get("id")) if item.get("id") else ""
        item["artifact_count"] = artifact_count_map.get(item_id, 0)
        item["artifact_ids"] = artifact_ids_map.get(item_id, [])
        item["artifacts"] = []
    return bugs

def update_bug(db: Client, bug_id: UUID, bug_data: BugUpdate):
    """Update a bug and handle fixed_at based on resolved status"""
    update_data = {}
    
    if bug_data.title is not None:
        update_data["title"] = bug_data.title
    if bug_data.description is not None:
        update_data["description"] = bug_data.description
    if bug_data.bug_type is not None:
        update_data["bug_type"] = bug_data.bug_type
    if bug_data.severity is not None:
        update_data["severity"] = bug_data.severity
    if bug_data.assigned_to is not None:
        update_data["assigned_to"] = str(bug_data.assigned_to) if bug_data.assigned_to else None
    
    # Handle status change and fixed_at
    if bug_data.status is not None:
        update_data["status"] = bug_data.status
        
        # Get current bug to check previous status
        current_bug = db.table("bugs").select("status").eq("id", str(bug_id)).single().execute()
        previous_status = current_bug.data.get("status") if current_bug.data else None
        
        normalized_previous_status = _normalize_status_for_response(previous_status)

        if bug_data.status == "resolved" and normalized_previous_status != "resolved":
            update_data["fixed_at"] = datetime.utcnow().isoformat()
        elif bug_data.status != "resolved" and normalized_previous_status == "resolved":
            update_data["fixed_at"] = None
    
    update_data["updated_at"] = datetime.utcnow().isoformat()

    status_value = update_data.pop("status", None)
    result = None

    if update_data:
        result = db.table("bugs").update(update_data).eq("id", str(bug_id)).execute()
        if not result.data:
            return None

    if status_value is not None:
        result = _write_bug_status(db, bug_id, status_value)
    
    if not result.data:
        return None
    
    # Update artifact relationships if provided
    if bug_data.artifact_ids is not None:
        # Delete existing relationships
        db.table("bug_artifacts").delete().eq("bug_id", str(bug_id)).execute()
        
        # Create new relationships
        if bug_data.artifact_ids:
            artifact_relations = [
                {"bug_id": str(bug_id), "artifact_id": str(artifact_id)}
                for artifact_id in bug_data.artifact_ids
            ]
            db.table("bug_artifacts").insert(artifact_relations).execute()
    
    updated_bug = result.data[0]
    updated_bug["status"] = _normalize_status_for_response(updated_bug.get("status"))
    return updated_bug

def delete_bug(db: Client, bug_id: UUID):
    """Delete a bug and its relationships"""
    # Delete relationships first
    db.table("bug_artifacts").delete().eq("bug_id", str(bug_id)).execute()
    
    # Delete bug
    result = db.table("bugs").delete().eq("id", str(bug_id)).execute()
    return result.data
