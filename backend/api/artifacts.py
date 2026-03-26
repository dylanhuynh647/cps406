from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, UploadFile, File, Form
from fastapi.responses import Response
from uuid import UUID
from typing import Optional
from datetime import datetime
import base64
import mimetypes
from backend.dependencies import get_current_user, ensure_project_role, supabase
from backend.schemas.artifact import ArtifactCreate, ArtifactUpdate, ArtifactResponse
from backend.crud import artifact
from backend.utils.audit_log import log_artifact_created, log_artifact_updated, get_client_ip
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


def _can_preview(mime_type: Optional[str]) -> bool:
    if not mime_type:
        return False
    return mime_type.startswith("image/") or mime_type.startswith("text/") or mime_type == "application/pdf"


def _decode_artifact_file_content(artifact_row: dict) -> bytes:
    encoded = artifact_row.get("file_data_base64")
    if encoded:
        return base64.b64decode(encoded)

    raise HTTPException(status_code=404, detail="File not found")

@router.post("/artifacts", response_model=ArtifactResponse, status_code=status.HTTP_201_CREATED)
async def create_artifact(
    request: Request,
    artifact_data: ArtifactCreate,
    user: dict = Depends(get_current_user)
):
    """Create a new artifact"""
    try:
        ensure_project_role(
            supabase,
            artifact_data.project_id,
            user["user_id"],
            ["owner", "admin", "developer"],
        )
        created = artifact.create_artifact(supabase, artifact_data, UUID(user["user_id"]))
        
        # Audit logging
        log_artifact_created(UUID(created["id"]), user["user_id"], get_client_ip(request))
        
        return ArtifactResponse(**created)
    except ValueError as e:
        logger.warning(f"Validation error creating artifact: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid input data"
        )
    except Exception as e:
        logger.error(f"Error creating artifact: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create artifact"
        )

@router.get("/artifacts", response_model=list[ArtifactResponse])
async def list_artifacts(
    project_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    user: dict = Depends(get_current_user)
):
    """List all artifacts"""
    try:
        ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer", "reporter"],
        )
        artifacts = artifact.get_artifacts(supabase, project_id, skip, limit)
        return [ArtifactResponse(**a) for a in artifacts]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/artifacts/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(
    artifact_id: UUID,
    project_id: UUID,
    user: dict = Depends(get_current_user)
):
    """Get a single artifact by ID"""
    try:
        ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer", "reporter"],
        )
        artifact_data = artifact.get_artifact(supabase, artifact_id, project_id)
        if not artifact_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Artifact not found"
            )
        return ArtifactResponse(**artifact_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.patch("/artifacts/{artifact_id}", response_model=ArtifactResponse)
async def update_artifact(
    artifact_id: UUID,
    project_id: UUID,
    artifact_data: ArtifactUpdate,
    user: dict = Depends(get_current_user)
):
    """Update an artifact (owner/admin/developer only)."""
    try:
        ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer"],
        )
        existing = artifact.get_artifact(supabase, artifact_id, project_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Artifact not found"
            )

        updated = artifact.update_artifact(supabase, artifact_id, artifact_data)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Artifact not found"
            )
        return ArtifactResponse(**updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/artifacts/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_artifact(
    artifact_id: UUID,
    project_id: UUID,
    user: dict = Depends(get_current_user)
):
    """Delete an artifact (project owner/admin/developer)"""
    try:
        ensure_project_role(
            supabase,
            project_id,
            user["user_id"],
            ["owner", "admin", "developer"],
        )
        artifact_row = artifact.get_artifact(supabase, artifact_id, project_id)
        if not artifact_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Artifact not found"
            )
        artifact.delete_artifact(supabase, artifact_id)
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/artifact-uploads", response_model=ArtifactResponse, status_code=status.HTTP_201_CREATED)
async def upload_artifact_file(
    request: Request,
    project_id: UUID = Form(...),
    name: str = Form(...),
    type: str = Form(...),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload an artifact file and create artifact metadata."""
    ensure_project_role(
        supabase,
        project_id,
        user["user_id"],
        ["owner", "admin", "developer"],
    )

    validated_input = ArtifactCreate(
        project_id=project_id,
        name=name,
        type=type,
        description=description,
        reference="/uploaded",
    )

    # Generate a dedicated artifact ID in DB first for stable file naming.
    created_stub = (
        supabase.table("artifacts")
        .insert(
            {
                "project_id": str(project_id),
                "name": validated_input.name,
                "type": validated_input.type,
                "description": validated_input.description,
                "reference": "upload://pending",
                "created_by": str(user["user_id"]),
                "is_uploaded_file": True,
            }
        )
        .execute()
    )

    if not created_stub.data:
        raise HTTPException(status_code=500, detail="Failed to create artifact")

    created = created_stub.data[0]
    artifact_id = created["id"]
    extension = Path(file.filename or "").suffix
    file_name = file.filename or f"artifact-{artifact_id}{extension}"
    file_bytes = await file.read()
    file_size = len(file_bytes)
    file_data_base64 = base64.b64encode(file_bytes).decode("ascii")
    mime_type = file.content_type or mimetypes.guess_type(file_name)[0] or "application/octet-stream"

    update_result = (
        supabase.table("artifacts")
        .update(
            {
                "reference": f"upload://{artifact_id}",
                "file_path": None,
                "file_data_base64": file_data_base64,
                "file_name": file_name,
                "file_mime_type": mime_type,
                "file_size_bytes": file_size,
                "is_uploaded_file": True,
            }
        )
        .eq("id", artifact_id)
        .execute()
    )

    log_artifact_created(UUID(artifact_id), user["user_id"], get_client_ip(request))
    return ArtifactResponse(**update_result.data[0])


@router.post("/artifacts/{artifact_id}/file", response_model=ArtifactResponse)
async def replace_artifact_file(
    request: Request,
    artifact_id: UUID,
    project_id: UUID = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Replace or attach an uploaded file for an existing artifact."""
    ensure_project_role(
        supabase,
        project_id,
        user["user_id"],
        ["owner", "admin", "developer"],
    )

    artifact_row = artifact.get_artifact(supabase, artifact_id, project_id)
    if not artifact_row:
        raise HTTPException(status_code=404, detail="Artifact not found")

    extension = Path(file.filename or "").suffix
    file_name = file.filename or f"artifact-{artifact_id}{extension}"
    file_bytes = await file.read()
    file_size = len(file_bytes)
    file_data_base64 = base64.b64encode(file_bytes).decode("ascii")
    mime_type = file.content_type or mimetypes.guess_type(file_name)[0] or "application/octet-stream"

    update_result = (
        supabase.table("artifacts")
        .update(
            {
                "reference": f"upload://{artifact_id}",
                "file_path": None,
                "file_data_base64": file_data_base64,
                "file_name": file_name,
                "file_mime_type": mime_type,
                "file_size_bytes": file_size,
                "is_uploaded_file": True,
                "updated_at": datetime.utcnow().isoformat(),
            }
        )
        .eq("id", str(artifact_id))
        .execute()
    )

    if not update_result.data:
        raise HTTPException(status_code=500, detail="Failed to replace artifact file")

    log_artifact_updated(
        artifact_id,
        user["user_id"],
        {
            "file_name": file_name,
            "file_mime_type": mime_type,
            "file_size_bytes": file_size,
        },
        get_client_ip(request),
    )

    return ArtifactResponse(**update_result.data[0])


@router.get("/artifacts/{artifact_id}/download")
async def download_artifact_file(
    artifact_id: UUID,
    project_id: UUID,
    user: dict = Depends(get_current_user),
):
    ensure_project_role(
        supabase,
        project_id,
        user["user_id"],
        ["owner", "admin", "developer", "reporter"],
    )

    artifact_row = artifact.get_artifact(supabase, artifact_id, project_id)
    if not artifact_row:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if not artifact_row.get("is_uploaded_file"):
        raise HTTPException(status_code=400, detail="Artifact is not an uploaded file")

    file_bytes = _decode_artifact_file_content(artifact_row)
    mime_type = artifact_row.get("file_mime_type") or "application/octet-stream"
    file_name = artifact_row.get("file_name") or f"artifact-{artifact_id}"
    return Response(
        content=file_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.get("/artifacts/{artifact_id}/preview")
async def preview_artifact_file(
    artifact_id: UUID,
    project_id: UUID,
    user: dict = Depends(get_current_user),
):
    ensure_project_role(
        supabase,
        project_id,
        user["user_id"],
        ["owner", "admin", "developer", "reporter"],
    )

    artifact_row = artifact.get_artifact(supabase, artifact_id, project_id)
    if not artifact_row:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if not artifact_row.get("is_uploaded_file"):
        raise HTTPException(status_code=400, detail="Artifact is not an uploaded file")

    mime_type = artifact_row.get("file_mime_type")
    if not _can_preview(mime_type):
        raise HTTPException(status_code=400, detail="Preview is not available for this file type")

    file_bytes = _decode_artifact_file_content(artifact_row)
    file_name = artifact_row.get("file_name") or f"artifact-{artifact_id}"

    return Response(
        content=file_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": f'inline; filename="{file_name}"'},
    )
