# backend/app/db/models.py

from sqlalchemy import Table, Column, Integer, String, ForeignKey, DateTime, MetaData
from sqlalchemy.sql import func

metadata = MetaData()

User = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("username", String, unique=True, index=True),
    Column("hashed_password", String),
)

Translation = Table(
    "translations",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("source_text", String, nullable=False),
    Column("source_lang", String, nullable=False),
    Column("translated_text", String, nullable=False),
    Column("target_lang", String, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)