"""
database.py — Conexión a la base de datos.

Solo SQLite (ya no se usa Supabase/Postgres).

En SQLite se activa PRAGMA foreign_keys=ON para que las reglas ON DELETE
(CASCADE / SET NULL) se comporten igual que en Postgres (dev == prod).
La ruta de SQLite puede fijarse con SQLITE_PATH (útil en pruebas).

NOTA: en Render (plan free) el disco es efímero — /tmp se borra en cada
reinicio/redeploy del servicio, así que el historial NO es permanente.
"""
import os
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DB_PATH = os.environ.get("SQLITE_PATH") or (
    "/tmp/planta.db" if os.environ.get("RENDER") else "./planta.db"
)
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)

# Activar integridad referencial en SQLite (igual que Postgres)
@event.listens_for(engine, "connect")
def _sqlite_fk_pragma(dbapi_conn, conn_record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()