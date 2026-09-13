from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DECIMAL,
    Text,
    TIMESTAMP,
    ForeignKey,
    text,
)
from sqlalchemy.orm import relationship

from src.core.database import Base


class PlantingIntent(Base):
    __tablename__ = "planting_intents"

    planting_intent_id = Column(Integer, primary_key=True, index=True)

    farmer_id = Column(
        Integer,
        ForeignKey("farmers.farmer_id"),
        nullable=False,
    )

    commodity = Column(String(50), nullable=False)
    planting_date = Column(Date, nullable=False)
    harvest_date = Column(Date, nullable=False)
    volume = Column(DECIMAL(10, 2), nullable=False)
    remarks = Column(Text, nullable=True)

    notes = Column(Text, nullable=True)  # NEW FIELD
    attachment_path = Column(String(500), nullable=True)  # NEW FIELD

    status = Column(String(20), nullable=True, default="DRAFT")

    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    # Relationships
    farmer = relationship(
        "Farmer",
        back_populates="planting_intents",
    )

    reports = relationship(
        "ReportPlantingIntent",
        back_populates="planting_intent",
    )

