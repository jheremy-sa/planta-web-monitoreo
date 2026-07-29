"""
database.py — Conexión a la base de datos.

Soporta dos modos:
  1. PostgreSQL / Supabase  (producción — variable SUPABASE_URL en Render)
  2. SQLite                 (fallback local si no hay URL configurada)

Para configurar Supabase en Render:
  Environment → SUPABASE_URL = postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")

if SUPABASE_URL:
    # PostgreSQL / Supabase  (datos permanentes)
    engine = create_engine(
        SUPABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
    )
else:
    # SQLite local (desarrollo)
    DB_PATH = "/tmp/planta.db" if os.environ.get("RENDER") else "./planta.db"
    engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
