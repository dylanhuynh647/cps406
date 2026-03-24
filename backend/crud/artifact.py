from supabase import Client
from uuid import UUID
from typing import Optional
from backend.schemas.artifact import ArtifactCreate, ArtifactUpdate
from datetime import datetime

def create_artifact(db: Client, artifact_data: ArtifactCreate, user_id: UUID):
    """Create a new artifact"""
    result = db.table("artifacts").insert({
        "project_id": str(artifact_data.project_id),
        "name": artifact_data.name,
        "type": artifact_data.type,
        "description": artifact_data.description,
        "reference": artifact_data.reference,
        "created_by": str(user_id)
    }).execute()
    
    if not result.data:
        raise Exception("Failed to create artifact")
    
    return result.data[0]

def get_artifact(db: Client, artifact_id: UUID, project_id: Optional[UUID] = None):
    """Get a single artifact by ID"""
    query = db.table("artifacts").select("*").eq("id", str(artifact_id))
    if project_id:
        query = query.eq("project_id", str(project_id))
    result = query.single().execute()
    
    if not result.data:
        return None
    
    return result.data

def get_artifacts(db: Client, project_id: UUID, skip: int = 0, limit: int = 100):
    """Get all artifacts with pagination"""
    result = (
        db.table("artifacts")
        .select("*")
        .eq("project_id", str(project_id))
        .order("created_at", desc=True)
        .range(skip, skip + limit - 1)
        .execute()
    )
    return result.data

def update_artifact(db: Client, artifact_id: UUID, artifact_data: ArtifactUpdate):
    """Update an artifact"""
    update_data = {}
    if artifact_data.name is not None:
        update_data["name"] = artifact_data.name
    if artifact_data.type is not None:
        update_data["type"] = artifact_data.type
    if artifact_data.description is not None:
        update_data["description"] = artifact_data.description
    if artifact_data.reference is not None:
        update_data["reference"] = artifact_data.reference
    
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    result = db.table("artifacts").update(update_data).eq("id", str(artifact_id)).execute()
    
    if not result.data:
        return None
    
    return result.data[0]

def delete_artifact(db: Client, artifact_id: UUID):
    """Delete an artifact"""
    result = db.table("artifacts").delete().eq("id", str(artifact_id)).execute()
    return result.data
