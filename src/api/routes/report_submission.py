# src/api/routes/report_submission.py
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text                  
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.core.auth import get_current_user

from src.models.raw_plant_reports import RawPlantReport
from src.models.report_submission import ReportSubmission
from src.models.report_validation_history import ReportValidationHistory
from src.models.planting_intents import PlantingIntent
from src.models.report_planting_intents import ReportPlantingIntent
from src.models.users import User


router = APIRouter()


# ============================================================
# STATUS VALUES (using ReportStatus enum as source of truth)
# ============================================================

from src.models.report_status import ReportStatus

DRAFT = ReportStatus.DRAFT.value
SUBMITTED_MUNICIPAL_PENDING = ReportStatus.SUBMITTED_MUNICIPAL_PENDING.value
SUBMITTED_MUNICIPAL_FLAGGED = ReportStatus.SUBMITTED_MUNICIPAL_FLAGGED.value
SUBMITTED_PROVINCIAL_PENDING = ReportStatus.SUBMITTED_PROVINCIAL_PENDING.value
SUBMITTED_PROVINCIAL_FLAGGED = ReportStatus.SUBMITTED_PROVINCIAL_FLAGGED.value
SUBMITTED_REGIONAL_PENDING = ReportStatus.SUBMITTED_REGIONAL_PENDING.value
SUBMITTED_REGIONAL_FLAGGED = ReportStatus.SUBMITTED_REGIONAL_FLAGGED.value
SUBMITTED_REGIONAL_APPROVED = ReportStatus.SUBMITTED_REGIONAL_APPROVED.value

# Backward compatibility aliases (para hindi mag-break ang iba pang references)
FOR_MUNICIPAL_VALIDATION = SUBMITTED_MUNICIPAL_PENDING
FOR_PROVINCIAL_VALIDATION = SUBMITTED_PROVINCIAL_PENDING
FOR_DA_RFO_VALIDATION = SUBMITTED_REGIONAL_PENDING
REVISION_REQUIRED = SUBMITTED_MUNICIPAL_FLAGGED
FINAL_APPROVED = SUBMITTED_REGIONAL_APPROVED



# ============================================================
# SUBMIT REPORT
# ============================================================

@router.post("/{report_id}/submit")
def submit_report(
    report_id: int,
    db: Session = Depends(get_db),
):
    report = (
        db.query(RawPlantReport)
        .filter(RawPlantReport.report_id == report_id)
        .first()
    )

    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    submission = (
        db.query(ReportSubmission)
        .filter(ReportSubmission.report_id == report_id)
        .first()
    )

    if not submission:
        raise HTTPException(status_code=404, detail="Report submission not found.")

    submittable_statuses = (
        DRAFT,
        SUBMITTED_MUNICIPAL_FLAGGED,
        SUBMITTED_PROVINCIAL_FLAGGED,
        SUBMITTED_REGIONAL_FLAGGED,
    )

    if submission.status not in submittable_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Report can only be submitted from DRAFT or FLAGGED status. Current status: {submission.status}"
        )

    submission.status = SUBMITTED_MUNICIPAL_PENDING
    submission.current_validator_id = report.municipal_coordinator_id
    submission.current_validator_role = "municipal_coordinator"
    submission.revision_remarks = None
    submission.revision_count = submission.revision_count or 0
    submission.submitted_at = datetime.utcnow()

    history = ReportValidationHistory(
        submission_id=submission.submission_id,
        action="SUBMITTED",
        performed_by=report.encoded_by,
        role="aew",
        remarks=None,
    )

    db.add(history)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Report submitted successfully.",
        "report_id": report_id,
        "submission_id": submission.submission_id,
        "status": submission.status,
    }


# ============================================================
# APPROVE REPORT
# ============================================================

@router.post("/{report_id}/approve")
def approve_report(
    report_id: int,
    validator_id: int,
    validator_role: str,
    remarks: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    submission = (
        db.query(ReportSubmission)
        .filter(ReportSubmission.report_id == report_id)
        .first()
    )

    if not submission:
        raise HTTPException(status_code=404, detail="Report submission not found.")

    if current_user.user_id != validator_id:
        raise HTTPException(status_code=403, detail="You are not authorized to approve this report.")

    if validator_role == "municipal_coordinator":
        if submission.status != SUBMITTED_MUNICIPAL_PENDING:
            raise HTTPException(...)
        submission.status = SUBMITTED_PROVINCIAL_PENDING
        submission.current_validator_id = None
        submission.current_validator_role = "provincial_coordinator"
        submission.submitted_at = datetime.utcnow()   

    elif validator_role == "provincial_coordinator":
        if submission.status != SUBMITTED_PROVINCIAL_PENDING:
            raise HTTPException(...)
        submission.status = SUBMITTED_REGIONAL_PENDING
        submission.current_validator_id = None
        submission.current_validator_role = "darfo"
        submission.submitted_at = datetime.utcnow()     

    elif validator_role == "darfo":
        if submission.status != SUBMITTED_REGIONAL_PENDING:
            raise HTTPException(...)
        submission.status = SUBMITTED_REGIONAL_APPROVED
        submission.current_validator_id = None
        submission.current_validator_role = None
        submission.approved_at = datetime.utcnow()
        submission.submitted_at = datetime.utcnow()   


    else:
        raise HTTPException(status_code=400, detail="Invalid validator role.")

    history = ReportValidationHistory(
        submission_id=submission.submission_id,
        action="APPROVED",
        performed_by=current_user.user_id,
        role=validator_role,
        remarks=remarks,
    )

    db.add(history)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Report approved successfully.",
        "report_id": report_id,
        "status": submission.status,
    }


# ============================================================
# REQUEST REVISION
# ============================================================

@router.post("/{report_id}/revision")
def request_revision(
    report_id: int,
    validator_id: int,
    validator_role: str,
    remarks: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    if current_user.user_id != validator_id:
        raise HTTPException(status_code=403, detail="You are not authorized to request revision.")

    if not remarks or not remarks.strip():
        raise HTTPException(status_code=400, detail="Revision remarks are required.")

    submission = (
        db.query(ReportSubmission)
        .filter(ReportSubmission.report_id == report_id)
        .first()
    )

    if not submission:
        raise HTTPException(status_code=404, detail="Report submission not found.")

    # ✅ Validate status + set target flagged status
    if validator_role == "municipal_coordinator":
        if submission.status != SUBMITTED_MUNICIPAL_PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Report is not awaiting municipal validation. Current: {submission.status}"
            )
        submission.status = SUBMITTED_MUNICIPAL_FLAGGED

    elif validator_role == "provincial_coordinator":
        if submission.status != SUBMITTED_PROVINCIAL_PENDING:
            raise HTTPException(
                status_code=400,
                detail="Report is not awaiting provincial validation."
            )
        submission.status = SUBMITTED_PROVINCIAL_FLAGGED

    elif validator_role == "darfo":
        if submission.status != SUBMITTED_REGIONAL_PENDING:
            raise HTTPException(
                status_code=400,
                detail="Report is not awaiting DA-RFO validation."
            )
        submission.status = SUBMITTED_REGIONAL_FLAGGED

    else:
        raise HTTPException(status_code=400, detail="Invalid validator role.")

    # ✅ Reset validator + set AEW as current handler
    submission.current_validator_id = None
    submission.current_validator_role = "aew"
    submission.revision_remarks = remarks.strip()
    submission.revision_count = (submission.revision_count or 0) + 1

    # ✅ Sync yung RawPlantReport.status
    report = db.query(RawPlantReport).filter(
        RawPlantReport.report_id == report_id
    ).first()
    if report:
        report.status = submission.status

    # ✅ History
    history = ReportValidationHistory(
        submission_id=submission.submission_id,
        action="REVISION_REQUIRED",
        performed_by=current_user.user_id,
        role=validator_role,
        remarks=remarks,
    )

    db.add(history)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Report flagged for revision.",
        "report_id": report_id,
        "status": submission.status,
        "revision_count": submission.revision_count,
    }


# ============================================================
# PULL SUBMISSION
# ============================================================

@router.post("/{report_id}/pull")
def pull_submission(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    if current_user.role != "Agricultural Extension Worker":
        raise HTTPException(status_code=403, detail="Only AEWs can pull submissions.")

    # --------------------------------------------------------
    # GET RAW PLANT REPORT
    # --------------------------------------------------------

    report = (
        db.query(RawPlantReport)
        .filter(RawPlantReport.report_id == report_id)
        .first()
    )

    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    if report.encoded_by != current_user.user_id:
        raise HTTPException(status_code=403, detail="You can only pull submissions you encoded.")

    # --------------------------------------------------------
    # GET OR CREATE SUBMISSION
    # --------------------------------------------------------

    submission = (
        db.query(ReportSubmission)
        .filter(ReportSubmission.report_id == report_id)
        .first()
    )

    # ✅ CREATE SUBMISSION IF NOT EXISTS
    if not submission:
        submission = ReportSubmission(
            report_id=report_id,
            status=DRAFT,
            current_validator_id=None,
            current_validator_role=None,
            revision_count=0,
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)

    # --------------------------------------------------------
    # CHECK IF PULLABLE
    # --------------------------------------------------------

    pullable_statuses = [
        FOR_MUNICIPAL_VALIDATION,
        "SUBMITTED",
        "PENDING",
        FOR_PROVINCIAL_VALIDATION,
    ]

    if submission.status not in pullable_statuses and submission.status != DRAFT:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot pull submission with status: {submission.status}"
        )

    # --------------------------------------------------------
    # UPDATE STATUS TO DRAFT
    # --------------------------------------------------------

    old_status = submission.status
    submission.status = DRAFT
    submission.current_validator_id = None
    submission.current_validator_role = None
    submission.revision_count = (submission.revision_count or 0) + 1

    history = ReportValidationHistory(
        submission_id=submission.submission_id,
        action="PULLED",
        performed_by=current_user.user_id,
        role="aew",
        remarks=f"Pulled from {old_status} for revision.",
    )

    db.add(history)
    db.commit()
    db.refresh(submission)

    return {
        "message": "Submission pulled back to draft successfully.",
        "report_id": report_id,
        "submission_id": submission.submission_id,
        "status": submission.status,
        "revision_count": submission.revision_count,
        "old_status": old_status,
    }


# ============================================================
# GET ALL SUBMITTED REPORTS
# ============================================================

@router.get("/all-reports")
def get_all_submitted_reports(
    db: Session = Depends(get_db),
):
    reports = (
        db.query(
            ReportSubmission,
            RawPlantReport,
            PlantingIntent,
            User
        )
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .join(ReportPlantingIntent, ReportPlantingIntent.report_id == RawPlantReport.report_id)
        .join(PlantingIntent, PlantingIntent.planting_intent_id == ReportPlantingIntent.planting_intent_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": f"{report.commodity or 'Crop'} Harvest Report",
            "commodity": report.commodity,
            "municipality": report.municipality,
            "planting_date": report.planting_date,
            "harvest_date": planting_intent.harvest_date,
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
        }
        for submission, report, planting_intent, user in reports
    ]


# ============================================================
# GET REPORTS FOR MUNICIPAL VALIDATION
# ============================================================

@router.get("/for-municipal-validation")
def get_reports_for_municipal_validation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get reports for municipal validation.
    - Filtered by the Municipal Coordinator's municipality.
    - Includes both FOR_MUNICIPAL_VALIDATION and SUBMITTED_MUNICIPAL_PENDING
      (for backward compatibility with older status naming).
    """
    if current_user.role != "Municipal Coordinator":
        raise HTTPException(status_code=403, detail="Unauthorized.")

    valid_statuses = [
        FOR_MUNICIPAL_VALIDATION,
        "SUBMITTED_MUNICIPAL_PENDING",
    ]

    mcoor_municipality = db.execute(
        text("SELECT municipality FROM users WHERE user_id = :uid"),
        {"uid": current_user.user_id}
    ).scalar()

    if not mcoor_municipality:
        return []

    reports = (
        db.query(
            ReportSubmission,
            RawPlantReport,
            User,
        )
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(
            ReportSubmission.status.in_(valid_statuses),
            RawPlantReport.municipality == mcoor_municipality,
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .distinct()
        .all()
    )

    report_ids = [s.report_id for s, r, u in reports]
    
    intents_map = {}
    if report_ids:
        links = (
            db.query(ReportPlantingIntent)
            .filter(ReportPlantingIntent.report_id.in_(report_ids))
            .all()
        )
        
        link_by_report = {}
        for link in links:
            link_by_report.setdefault(link.report_id, []).append(link)
        
        intent_ids = [l.planting_intent_id for l in links]
        intents = {}
        if intent_ids:
            for pi in db.query(PlantingIntent).filter(
                PlantingIntent.planting_intent_id.in_(intent_ids)
            ).all():
                intents[pi.planting_intent_id] = pi
        
        for rid, links_for_report in link_by_report.items():
            intent_list = []
            for link in links_for_report:
                pi = intents.get(link.planting_intent_id)
                if pi:
                    intent_list.append({
                        "planting_intent_id": pi.planting_intent_id,
                        "volume": pi.volume,
                        "harvest_date": pi.harvest_date,
                    })
            intents_map[rid] = intent_list

    result = []
    for submission, report, user in reports:
        # Get harvest_date from first intent (for backward compatibility)
        intents_for_report = intents_map.get(report.report_id, [])
        harvest_date = (
            intents_for_report[0].get("harvest_date")
            if intents_for_report else None
        )

        result.append({
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": report.title or f"{report.commodity or 'Crop'} Harvest Report",
            "commodity": report.commodity,
            "planting_date": report.planting_date,
            "harvest_date": harvest_date,
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "municipality": report.municipality,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
        })

    return result
    

# ============================================================
# GET REPORTS FOR PROVINCIAL VALIDATION
# ============================================================

@router.get("/for-provincial-validation")
def get_reports_for_provincial_validation(
    db: Session = Depends(get_db),
):
    reports = (
        db.query(
            ReportSubmission,
            RawPlantReport,
            PlantingIntent,
            User,
        )
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .join(ReportPlantingIntent, ReportPlantingIntent.report_id == RawPlantReport.report_id)
        .join(PlantingIntent, PlantingIntent.planting_intent_id == ReportPlantingIntent.planting_intent_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(ReportSubmission.status == FOR_PROVINCIAL_VALIDATION)
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": f"{report.commodity or 'Crop'} Harvest Report",
            "commodity": report.commodity,
            "planting_date": report.planting_date,
            "harvest_date": planting_intent.harvest_date,
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
        }
        for submission, report, planting_intent, user in reports
    ]


# ============================================================
# GET REPORTS FOR DA-RFO VALIDATION
# ============================================================

@router.get("/for-da-rfo-validation")
def get_reports_for_da_rfo_validation(
    db: Session = Depends(get_db),
):
    reports = (
        db.query(
            ReportSubmission,
            RawPlantReport,
            PlantingIntent,
            User,
        )
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .join(ReportPlantingIntent, ReportPlantingIntent.report_id == RawPlantReport.report_id)
        .join(PlantingIntent, PlantingIntent.planting_intent_id == ReportPlantingIntent.planting_intent_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(ReportSubmission.status == FOR_DA_RFO_VALIDATION)
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": submission.submission_id,
            "report_id": submission.report_id,
            "title": f"{report.commodity or 'Crop'} Harvest Report",
            "commodity": report.commodity,
            "planting_date": report.planting_date,
            "harvest_date": planting_intent.harvest_date,
            "estimated_yield": report.estimated_yield,
            "encoded_by": report.encoded_by,
            "encoded_by_name": f"{user.first_name} {user.last_name}" if user else None,
            "status": submission.status,
            "submitted_at": submission.submitted_at,
            "revision_remarks": submission.revision_remarks,
            "revision_count": submission.revision_count,
        }
        for submission, report, planting_intent, user in reports
    ]

# ============================================================
# BULK APPROVE REPORTS (Municipal → Provincial)
# ============================================================

@router.post("/bulk-approve")
def bulk_approve_reports(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "Municipal Coordinator":
        raise HTTPException(status_code=403, detail="Only Municipal Coordinators can bulk approve.")

    report_ids = payload.get("report_ids", [])
    if not report_ids:
        raise HTTPException(status_code=400, detail="No report IDs provided.")

    approved = []
    failed = []

    for report_id in report_ids:
        submission = (
            db.query(ReportSubmission)
            .filter(ReportSubmission.report_id == report_id)
            .first()
        )

        if not submission:
            failed.append({"report_id": report_id, "reason": "Submission not found."})
            continue

        if submission.status != SUBMITTED_MUNICIPAL_PENDING:
            failed.append({
                "report_id": report_id,
                "reason": f"Status is '{submission.status}', expected 'SUBMITTED_MUNICIPAL_PENDING'."
            })
            continue

        report = (
            db.query(RawPlantReport)
            .filter(RawPlantReport.report_id == report_id)
            .first()
        )

        if not report:
            failed.append({"report_id": report_id, "reason": "Report not found."})
            continue

        if report.municipality != current_user.municipality:
            failed.append({
                "report_id": report_id,
                "reason": f"Report belongs to '{report.municipality}', not your municipality."
            })
            continue

        submission.status = SUBMITTED_PROVINCIAL_PENDING
        submission.current_validator_id = None
        submission.current_validator_role = "provincial_coordinator"

        history = ReportValidationHistory(
            submission_id=submission.submission_id,
            action="APPROVED",
            performed_by=current_user.user_id,
            role="municipal_coordinator",
            remarks="Bulk approved and forwarded to Provincial.",
        )
        db.add(history)
        approved.append(report_id)

    db.commit()

    return {
        "message": f"{len(approved)} report(s) approved and forwarded to Provincial.",
        "approved": approved,
        "failed": failed,
        "approved_count": len(approved),
        "failed_count": len(failed),
    }



# ============================================================
# GET REPORTS SENT TO PROVINCIAL (by this Municipal)
# ============================================================

@router.get("/sent-to-provincial")
def get_sent_to_provincial(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "Municipal Coordinator":
        raise HTTPException(status_code=403, detail="Unauthorized.")

    reports = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(
            RawPlantReport.municipality == current_user.municipality,
            ReportSubmission.status.in_([
                SUBMITTED_PROVINCIAL_PENDING,    
                SUBMITTED_PROVINCIAL_FLAGGED, 
                SUBMITTED_REGIONAL_PENDING,    
                SUBMITTED_REGIONAL_FLAGGED,  
                SUBMITTED_REGIONAL_APPROVED,   
            ]),
        )
        .order_by(ReportSubmission.submitted_at.desc())
        .all()
    )

    return [
        {
            "submission_id": s.submission_id,
            "report_id": s.report_id,
            "title": r.title or f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "municipality": r.municipality,
            "planting_date": r.planting_date,
            "estimated_yield": r.estimated_yield,
            "encoded_by": r.encoded_by,
            "encoded_by_name": f"{u.first_name} {u.last_name}" if u else None,
            "status": s.status,
            "submitted_at": s.submitted_at,
            "revision_remarks": s.revision_remarks,
            "revision_count": s.revision_count,
        }
        for s, r, u in reports
    ]


# ============================================================
# GET AWAITING AEW REVISION (filtered by user's level)
# ============================================================

@router.get("/awaiting-aew-revision")
def get_awaiting_aew_revision(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get reports awaiting AEW revision — filtered by the user's level.
    
    - Municipal Coordinator → sees SUBMITTED_MUNICIPAL_FLAGGED only
    - Provincial Coordinator → sees SUBMITTED_PROVINCIAL_FLAGGED only
    - DA-RFO Officer → sees SUBMITTED_REGIONAL_FLAGGED only
    """
    # ✅ Map role → allowed flagged status
    role_status_map = {
        "Municipal Coordinator": SUBMITTED_MUNICIPAL_FLAGGED,
        "Provincial Coordinator": SUBMITTED_PROVINCIAL_FLAGGED,
        "DA-RFO Officer": SUBMITTED_REGIONAL_FLAGGED,
        "Regional Coordinator": SUBMITTED_REGIONAL_FLAGGED,
    }

    allowed_status = role_status_map.get(current_user.role)

    if not allowed_status:
        raise HTTPException(status_code=403, detail="Unauthorized role.")

    # ✅ Build query
    query = (
        db.query(ReportSubmission, RawPlantReport, User)
        .join(RawPlantReport, RawPlantReport.report_id == ReportSubmission.report_id)
        .outerjoin(User, User.user_id == RawPlantReport.encoded_by)
        .filter(ReportSubmission.status == allowed_status)
    )

    # ✅ Municipal scope: sariling municipality lang
    if current_user.role == "Municipal Coordinator":
        query = query.filter(RawPlantReport.municipality == current_user.municipality)

    reports = query.order_by(ReportSubmission.submitted_at.desc()).all()

    return [
        {
            "submission_id": s.submission_id,
            "report_id": s.report_id,
            "title": r.title or f"{r.commodity or 'Crop'} Harvest Report",
            "commodity": r.commodity,
            "municipality": r.municipality,
            "planting_date": r.planting_date,
            "estimated_yield": r.estimated_yield,
            "encoded_by": r.encoded_by,
            "encoded_by_name": f"{u.first_name} {u.last_name}" if u else None,
            "status": s.status,
            "submitted_at": s.submitted_at,
            "revision_remarks": s.revision_remarks,
            "revision_count": s.revision_count,
        }
        for s, r, u in reports
    ]

# ============================================================
# GET REPORT SUBMISSION
# ============================================================

@router.get("/{report_id}")
def get_report_submission(
    report_id: int,
    db: Session = Depends(get_db),
):
    submission = (
        db.query(ReportSubmission)
        .filter(ReportSubmission.report_id == report_id)
        .first()
    )

    if not submission:
        raise HTTPException(status_code=404, detail="Report submission not found.")

    return {
        "submission_id": submission.submission_id,
        "report_id": submission.report_id,
        "status": submission.status,
        "current_validator_id": submission.current_validator_id,
        "current_validator_role": submission.current_validator_role,
        "revision_remarks": submission.revision_remarks,
        "revision_count": submission.revision_count,
        "submitted_at": submission.submitted_at,
        "approved_at": submission.approved_at,
    }