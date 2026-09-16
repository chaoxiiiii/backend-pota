# src/models/users.py

from sqlalchemy import Column, Integer, String, DateTime, Boolean, func
from sqlalchemy.orm import relationship

from src.core.database import Base


class User(Base):
    __tablename__ = "users"

    # ============================================================
    # PRIMARY KEY
    # ============================================================

    user_id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    # ============================================================
    # USER INFORMATION
    # ============================================================

    first_name = Column(
        String(50),
        nullable=False
    )

    last_name = Column(
        String(50),
        nullable=False
    )

    username = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True
    )

    email_address = Column(
        String(100),
        unique=True,
        nullable=False
    )

    phone_number = Column(
        String(15),
        nullable=False
    )

    # ============================================================
    # AUTHENTICATION
    # ============================================================

    password = Column(
        String(255),
        nullable=False
    )
    # ============================================================
    # PASSWORD RESET
    # ============================================================

    reset_token = Column(
        String(255),
        unique=True,
        nullable=True,
        index=True
    )

    reset_token_expires = Column(
        DateTime,
        nullable=True
    )
    # ============================================================
    # ROLE
    # ============================================================

    role = Column(
        String(30),
        nullable=False
    )

    # ============================================================
    # ACCOUNT STATUS
    # True  = Active
    # False = Deactivated
    # ============================================================

    is_active = Column(
        Boolean,
        nullable=False,
        server_default="true"
    )

    municipality = Column(String(100), nullable=True)

    # ============================================================
    # TIMESTAMPS
    # ============================================================

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False
    )

    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # ============================================================
    # RELATIONSHIPS
    # ============================================================

    audit_logs = relationship(
        "AuditLog",
        back_populates="user"
    )

    raw_plant_reports = relationship(
        "RawPlantReport",
        back_populates="user"
    )

    farmers = relationship("Farmer", back_populates="aew")