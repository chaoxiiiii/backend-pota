from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime

from src.core.database import get_db
from src.core.auth import get_current_user

from src.models.raw_plant_reports import RawPlantReport
from src.models.planting_intents import PlantingIntent
from src.models.report_planting_intents import ReportPlantingIntent
from src.models.report_submission import ReportSubmission
from src.models.users import User
from src.models.farmers import Farmer
from src.models.report_status import (
    ReportStatus, VALID_TRANSITIONS, STATUS_REQUIRED_ROLE,
    PENDING_STATUSES, FLAGGED_STATUSES, FINAL_STATUSES,
    VISIBLE_IN_REPORTS, can_transition, is_editable, is_flagged,
)

from src.api.schemas.raw_plant_reports import (
    RawPlantReportCreate,
    RawPlantReportUpdate,
    RawPlantReportResponse,
)

import os
import shutil
import uuid
from fastapi import UploadFile, File
from fastapi.responses import FileResponse


router = APIRouter()

@router.get("/")
def get_raw_plant_reports(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get raw plant reports based on user role:
    - AEW: own reports only
    - Municipal Coordinator: reports from their municipality
    - Provincial/Regional: all reports
    """
    
    # Role-based filtering
    query = db.query(RawPlantReport)
    
    if current_user.role == "Agricultural Extension Worker":
        query = query.filter(
            RawPlantReport.encoded_by == current_user.user_id
        )
    
    elif current_user.role == "Municipal Coordinator":
        if not current_user.municipality:
            return []
        query = query.filter(
            RawPlantReport.municipality == current_user.municipality
        )
    
    elif current_user.role in (
        "DA-RFO Officer",
        "Provincial Coordinator",
        "Regional Coordinator"
    ):
        pass
    
    else:
        raise HTTPException(403, "Unauthorized role.")
    
    reports = query.order_by(
        desc(RawPlantReport.created_at)
    ).all()
    
    result = []
    for report in reports:
        # ✅ GET SUBMISSION STATUS (source of truth)
        submission = db.query(ReportSubmission).filter(
            ReportSubmission.report_id == report.report_id
        ).first()
        
        links = db.query(ReportPlantingIntent).filter(
            ReportPlantingIntent.report_id == report.report_id
        ).all()
        
        intent_ids = [link.planting_intent_id for link in links]
        intents = db.query(PlantingIntent).filter(
            PlantingIntent.planting_intent_id.in_(intent_ids)
        ).all() if intent_ids else []
        
        farmer_names = []
        for intent in intents:
            farmer = db.query(Farmer).filter(Farmer.farmer_id == intent.farmer_id).first()
            if farmer:
                farmer_names.append(f"{farmer.first_name} {farmer.last_name}")
        
        result.append({
            "report_id": report.report_id,
            "title": report.title or f"{report.commodity or 'Crop'} Harvest Report",
            "commodity": report.commodity,
            "municipality": report.municipality,
            "planting_date": report.planting_date,
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "status": submission.status if submission else (report.status or "DRAFT"),   # ✅
            "revision_remarks": submission.revision_remarks if submission else None,     # ✅
            "revision_count": submission.revision_count if submission else 0,            # ✅
            "notes": getattr(report, 'notes', ""),
            "created_at": report.created_at,
            "submitted_at": report.created_at,
            "farmer_names": ", ".join(farmer_names),
            "intent_ids": intent_ids,
            "intent_count": len(intents),
            "planting_intents": [
                {
                    "planting_intent_id": link.planting_intent_id,
                    "finalized_status_at_submission": link.finalized_status_snapshot,
                    "plant_status_at_submission": link.plant_status_snapshot,
                }
                for link in links
            ],
        })
    
    return result



@router.post("/from-intents")
def create_report_from_intents(
    data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    intent_ids = data.get("planting_intent_ids", [])
    notes = data.get("notes", "")
    status = data.get("status", ReportStatus.DRAFT.value)
    title = data.get("title", "").strip()

    # Convert legacy frontend statuses
    STATUS_MAP = {
        "SUBMITTED": ReportStatus.SUBMITTED_MUNICIPAL_PENDING.value,
        "DRAFT": ReportStatus.DRAFT.value,
        "NOT PLANTED": ReportStatus.DRAFT.value,
    }
    status = STATUS_MAP.get(status, status)
    
    # Validate status
    try:
        ReportStatus(status)
    except ValueError:
        raise HTTPException(400, f"Invalid status: {status}")

    if not intent_ids:
        raise HTTPException(status_code=400, detail="No planting intents selected.")

    intents = db.query(PlantingIntent).filter(
        PlantingIntent.planting_intent_id.in_(intent_ids)
    ).all()

    if len(intents) != len(intent_ids):
        raise HTTPException(status_code=404, detail="Some planting intents not found.")

    municipalities = set()
    for intent in intents:
        farmer = db.query(Farmer).filter(
            Farmer.farmer_id == intent.farmer_id
        ).first()
        if not farmer or not farmer.municipality:
            raise HTTPException(
                400,
                f"Farmer for intent #{intent.planting_intent_id} has no municipality."
            )
        municipalities.add(farmer.municipality)

    if len(municipalities) > 1:
        raise HTTPException(
            400,
            f"All planting intents must be from the same municipality. "
            f"Found: {', '.join(sorted(municipalities))}"
        )

    report_municipality = municipalities.pop()

    commodity = intents[0].commodity if intents else "Crop"

    # Create report
    db_report = RawPlantReport(
        title=title or f"{commodity} Harvest Report",
        commodity=commodity,
        planting_date=intents[0].planting_date if intents else datetime.now().date(),
        estimated_yield=sum(i.volume for i in intents),
        encoded_by=current_user.user_id,
        notes=notes,
        status=status,
        municipality=report_municipality,
    )
    

    db.add(db_report)
    db.flush()

    # Link intents to report with SNAPSHOT
    for intent in intents:
        link = ReportPlantingIntent(
            report_id=db_report.report_id,
            planting_intent_id=intent.planting_intent_id,
            finalized_status_snapshot=intent.finalized_status or "NOT PLANTED",
            plant_status_snapshot=intent.status,
        )
        db.add(link)
        intent.is_in_report = True

    # Create ReportSubmission
    submission = ReportSubmission(
        report_id=db_report.report_id,
        status=status,  # DRAFT or SUBMITTED_MUNICIPAL_PENDING
        current_validator_id=None,
        current_validator_role="municipal_coordinator" if status == "SUBMITTED_MUNICIPAL_PENDING" else None,
        revision_count=0,
    )
    db.add(submission)

    db.commit()
    db.refresh(db_report)


    return {
        "report_id": db_report.report_id,
        "status": db_report.status,
        "title": db_report.title,
        "message": "Report created successfully."
    }



# ============================================================
# CREATE REPORT FROM PLANTING INTENT
# ============================================================

@router.post("/from-planting-intent/{planting_intent_id}")
def create_report_from_planting_intent(
    planting_intent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):

    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required."
        )

    # --------------------------------------------------------
    # GET PLANTING INTENT
    # --------------------------------------------------------

    planting_intent = (
        db.query(PlantingIntent)
        .filter(
            PlantingIntent.planting_intent_id == planting_intent_id
        )
        .first()
    )

    if not planting_intent:
        raise HTTPException(
            status_code=404,
            detail="Planting intent not found."
        )

    # --------------------------------------------------------
    # CHECK IF REPORT ALREADY EXISTS
    # --------------------------------------------------------

    existing_link = (
        db.query(ReportPlantingIntent)
        .filter(
            ReportPlantingIntent.planting_intent_id
            == planting_intent_id
        )
        .first()
    )

    if existing_link:
        raise HTTPException(
            status_code=400,
            detail="A report already exists for this planting intent."
        )

    # --------------------------------------------------------
    # CREATE REPORT
    # --------------------------------------------------------

    db_report = RawPlantReport(
        commodity=planting_intent.commodity,
        planting_date=planting_intent.planting_date,
        estimated_yield=planting_intent.volume,
        municipal_coordinator_id=None,
        encoded_by=current_user.user_id,
    )

    db.add(db_report)

    # Generate report_id
    db.flush()

    # --------------------------------------------------------
    # CREATE REPORT SUBMISSION
    # --------------------------------------------------------

    submission = ReportSubmission(
        report_id=db_report.report_id,
        status="DRAFT",
        current_validator_id=None,
        current_validator_role=None,
        revision_remarks=None,
        revision_count=0,
    )

    db.add(submission)

    # --------------------------------------------------------
    # LINK REPORT TO PLANTING INTENT
    # --------------------------------------------------------

    report_link = ReportPlantingIntent(
        report_id=db_report.report_id,
        planting_intent_id=planting_intent.planting_intent_id,
    )

    db.add(report_link)

    # --------------------------------------------------------
    # SAVE
    # --------------------------------------------------------

    db.commit()

    db.refresh(db_report)
    db.refresh(submission)

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return {
        "message": "Report created from planting intent successfully.",
        "report_id": db_report.report_id,
        "submission_id": submission.submission_id,
        "status": submission.status,
        "commodity": db_report.commodity,
        "planting_date": db_report.planting_date,

        # IMPORTANT
        "harvest_date": planting_intent.harvest_date,

        "estimated_yield": db_report.estimated_yield,
        "municipal_coordinator_id": (
            db_report.municipal_coordinator_id
        ),
        "encoded_by": db_report.encoded_by,
    }


# ============================================================
# GET SINGLE RAW PLANT REPORT
# ============================================================

@router.get("/{report_id}")
def get_raw_plant_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(RawPlantReport).filter(
        RawPlantReport.report_id == report_id
    ).first()
    
    if not report:
        raise HTTPException(404, "Report not found.")
    
    if current_user.role == "Agricultural Extension Worker":
        if report.encoded_by != current_user.user_id:
            raise HTTPException(403, "Access denied.")
    
    elif current_user.role == "Municipal Coordinator":
        if report.municipality != current_user.municipality:
            raise HTTPException(403, "Access denied.")

    elif current_user.role in (
        "Provincial Coordinator",
        "DA-RFO Officer",
        "Regional Coordinator",
    ):
        pass  # Full access

    
    # ✅ GET SUBMISSION STATUS (source of truth)
    submission = db.query(ReportSubmission).filter(
        ReportSubmission.report_id == report_id
    ).first()
    
    links = db.query(ReportPlantingIntent).filter(
        ReportPlantingIntent.report_id == report_id
    ).all()
    
    intent_data = []
    for link in links:
        intent = db.query(PlantingIntent).filter(
            PlantingIntent.planting_intent_id == link.planting_intent_id
        ).first()
        
        farmer_name = "Unknown"
        if intent:
            farmer = db.query(Farmer).filter(Farmer.farmer_id == intent.farmer_id).first()
            if farmer:
                farmer_name = f"{farmer.first_name} {farmer.last_name}"
        
        intent_data.append({
            "planting_intent_id": link.planting_intent_id,
            "farmer_name": farmer_name,
            "commodity": intent.commodity if intent else "-",
            "volume": intent.volume if intent else 0,
            "planting_date": intent.planting_date if intent else None,
            "harvest_date": intent.harvest_date if intent else None,
            "finalized_status_at_submission": link.finalized_status_snapshot,
        })
    
    return {
        "report_id": report.report_id,
        "title": report.title or f"{report.commodity or 'Crop'} Harvest Report",
        "commodity": report.commodity,
        "municipality": report.municipality,
        "planting_date": report.planting_date,
        "estimated_yield": report.estimated_yield,
        "encoded_by": report.encoded_by,
        "status": submission.status if submission else report.status,           
        "revision_remarks": submission.revision_remarks if submission else None, 
        "revision_count": submission.revision_count if submission else 0,        
        "notes": getattr(report, 'notes', ""),
        "attachments": report.attachments or [],
        "created_at": report.created_at,
        "submitted_at": report.created_at,
        "planting_intents": intent_data,
    }


# ============================================================
# UPDATE RAW PLANT REPORT
# ============================================================

@router.put("/{report_id}", response_model=RawPlantReportResponse)
def update_raw_plant_report(
    report_id: int,
    raw_plant_report: RawPlantReportUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_report = db.query(RawPlantReport).filter(
        RawPlantReport.report_id == report_id
    ).first()

    if not db_report:
        raise HTTPException(404, "Raw plant report not found")

    update_data = raw_plant_report.model_dump(exclude_unset=True)

    if "status" in update_data:
        try:
            ReportStatus(update_data["status"])
        except ValueError:
            raise HTTPException(400, f"Invalid status: {update_data['status']}")

    for key, value in update_data.items():
        setattr(db_report, key, value)

    db.commit()
    db.refresh(db_report)
    return db_report

# ============================================================
# DELETE RAW PLANT REPORT
# ============================================================

@router.delete("/{report_id}")
def delete_raw_plant_report(
    report_id: int,
    db: Session = Depends(get_db)
):

    db_report = (
        db.query(RawPlantReport)
        .filter(
            RawPlantReport.report_id == report_id
        )
        .first()
    )

    if not db_report:
        raise HTTPException(
            status_code=404,
            detail="Raw plant report not found"
        )

    db.delete(db_report)

    db.commit()

    return {
        "message":
            "Raw plant report deleted successfully."
    }

# ============================================================
# UPDATE REPORT STATUS (with transition validation)
# ============================================================

@router.patch("/{report_id}/status")
def update_report_status(
    report_id: int,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update the status of a report's submission.
    Uses ReportSubmission.status (source of truth) instead of RawPlantReport.status.
    """
    new_status = payload.get("status")
    if not new_status:
        raise HTTPException(400, "Missing 'status' in payload.")

    # Validate status value
    try:
        new_status_enum = ReportStatus(new_status)
    except ValueError:
        raise HTTPException(400, f"Invalid status: {new_status}")

    report = db.query(RawPlantReport).filter(
        RawPlantReport.report_id == report_id
    ).first()

    if not report:
        raise HTTPException(404, "Report not found.")

    submission = db.query(ReportSubmission).filter(
        ReportSubmission.report_id == report_id
    ).first()

    if not submission:
        raise HTTPException(404, "Report submission not found.")

    old_status = submission.status or ReportStatus.DRAFT.value

    if old_status != new_status:
        # Validate transition
        if not can_transition(old_status, new_status):
            raise HTTPException(
                400,
                f"Cannot transition from '{old_status}' to '{new_status}'."
            )

        submission.status = new_status
        report.status = new_status

        if new_status_enum == ReportStatus.SUBMITTED_MUNICIPAL_PENDING:
            submittable = (
                ReportStatus.DRAFT.value,
                ReportStatus.SUBMITTED_MUNICIPAL_FLAGGED.value,
                ReportStatus.SUBMITTED_PROVINCIAL_FLAGGED.value,
                ReportStatus.SUBMITTED_REGIONAL_FLAGGED.value,
            )
            if old_status not in submittable:
                raise HTTPException(
                    400,
                    f"Report can only be submitted from DRAFT or FLAGGED status. "
                    f"Current status: {old_status}"
                )

    submission.status = new_status
    report.status = new_status

    if new_status_enum == ReportStatus.SUBMITTED_MUNICIPAL_PENDING:
        submission.current_validator_id = report.municipal_coordinator_id
        submission.current_validator_role = "municipal_coordinator"
        submission.revision_remarks = None
        submission.submitted_at = datetime.utcnow()

    elif new_status_enum == ReportStatus.SUBMITTED_MUNICIPAL_FLAGGED:
        submission.current_validator_id = None
        submission.current_validator_role = "aew"

    db.commit()
    db.refresh(submission)

    return {
        "report_id": report_id,
        "submission_id": submission.submission_id,
        "status": submission.status,
        "message": f"Report status updated from '{old_status}' to '{new_status}'.",
    }


# ============================================================
# GET REPORTS BY STATUS GROUP
# ============================================================

@router.get("/by-status/{status_group}")
def get_reports_by_status(
    status_group: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get reports by status group: 'pending', 'flagged', 'approved', 'all'
    """
    query = db.query(RawPlantReport).filter(
        RawPlantReport.encoded_by == current_user.user_id
    )
    
    if status_group == "pending":
        query = query.filter(RawPlantReport.status.in_(
            [s.value for s in PENDING_STATUSES]
        ))
    elif status_group == "flagged":
        query = query.filter(RawPlantReport.status.in_(
            [s.value for s in FLAGGED_STATUSES]
        ))
    elif status_group == "approved":
        query = query.filter(RawPlantReport.status.in_(
            [s.value for s in FINAL_STATUSES]
        ))
    elif status_group == "all":
        query = query.filter(RawPlantReport.status.in_(
            [s.value for s in VISIBLE_IN_REPORTS]
        ))
    else:
        raise HTTPException(400, f"Invalid status group: {status_group}")
    
    reports = query.order_by(desc(RawPlantReport.created_at)).all()
    
    return [
        {
            "report_id": r.report_id,
            "title": f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "status": r.status,
            "notes": getattr(r, 'notes', ""),
            "created_at": r.created_at,
        }
        for r in reports
    ]

# ============================================================
# UPLOAD REPORT ATTACHMENT
# ============================================================

UPLOAD_DIR = "uploads/reports"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/{report_id}/attachments")
async def upload_report_attachment(
    report_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = db.query(RawPlantReport).filter(
        RawPlantReport.report_id == report_id
    ).first()
    
    if not report:
        raise HTTPException(404, "Report not found.")
    
    # ✅ Access check
    if current_user.role == "Agricultural Extension Worker":
        if report.encoded_by != current_user.user_id:
            raise HTTPException(403, "Access denied.")
    
    # ✅ Validate extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # ✅ Validate size
    file.file.seek(0, 2)  # Seek to end
    size = file.file.tell()
    file.file.seek(0)  # Reset
    
    if size > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Max: {MAX_FILE_SIZE // (1024*1024)} MB")
    
    # ✅ Generate unique filename
    unique_name = f"{report_id}_{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, unique_name)
    
    # ✅ Save file
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # ✅ Save reference sa report
    attachment_info = {
        "filename": file.filename,      # Original filename
        "stored_name": unique_name,     # Stored filename
        "url": f"/uploads/reports/{unique_name}",
        "size": size,
        "uploaded_at": datetime.now().isoformat(),
        "uploaded_by": current_user.user_id,
    }
    
    # Append sa existing attachments
    current_attachments = list(report.attachments or [])
    current_attachments.append(attachment_info)
    report.attachments = current_attachments
    
    db.commit()
    db.refresh(report)
    
    return {
        "message": "File uploaded successfully.",
        "attachment": attachment_info,
        "total_attachments": len(current_attachments),
    }


# ============================================================
# DOWNLOAD / VIEW ATTACHMENT (public — no auth required)
# ============================================================

import mimetypes

@router.get("/{report_id}/attachments/{stored_name}")
def get_report_attachment(
    report_id: int,
    stored_name: str,
    db: Session = Depends(get_db)
):
    report = db.query(RawPlantReport).filter(
        RawPlantReport.report_id == report_id
    ).first()
    
    if not report:
        raise HTTPException(404, "Report not found.")
    
    attachments = report.attachments or []
    attachment = next(
        (a for a in attachments if a.get("stored_name") == stored_name),
        None
    )
    
    if not attachment:
        raise HTTPException(404, "Attachment not found.")
    
    filepath = os.path.join(UPLOAD_DIR, stored_name)
    if not os.path.exists(filepath):
        raise HTTPException(404, "File not found on disk.")
    
    # ✅ Determine MIME type
    filename = attachment.get("filename", stored_name)
    media_type, _ = mimetypes.guess_type(filename)
    
    # ✅ List of viewable types (browser can display)
    VIEWABLE_TYPES = (
        "image/",
        "application/pdf",
        "text/",
        "video/",
        "audio/",
    )
    
    is_viewable = media_type and any(
        media_type.startswith(t) for t in VIEWABLE_TYPES
    )
    
    if is_viewable:
        # ✅ View sa browser
        return FileResponse(
            filepath,
            media_type=media_type,
            filename=filename,
            content_disposition_type="inline",
        )
    else:
        # ⬇️ Download (docx, xlsx, etc.)
        return FileResponse(
            filepath,
            media_type=media_type or "application/octet-stream",
            filename=filename,
            content_disposition_type="attachment",
        )
