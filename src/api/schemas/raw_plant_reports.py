from pydantic import BaseModel
from datetime import date
from decimal import Decimal


class RawPlantReportBase(BaseModel):
    planting_date: date
    estimated_yield: Decimal
    municipal_coordinator_id: int | None = None
    encoded_by: int


class RawPlantReportCreate(RawPlantReportBase):
    pass


class RawPlantReportUpdate(BaseModel):
    title: str | None = None    
    notes: str | None = None    
    status: str | None = None    
    planting_date: date | None = None
    estimated_yield: Decimal | None = None
    municipal_coordinator_id: int | None = None
    encoded_by: int | None = None


class RawPlantReportResponse(RawPlantReportBase):
    report_id: int

    class Config:
        from_attributes = True