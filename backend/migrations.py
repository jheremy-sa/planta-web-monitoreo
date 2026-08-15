"""
migrations.py — Migración ligera e idempotente que corre en cada arranque.

Qué hace (sin efectos secundarios si ya está aplicado):
  1. Añade la columna owner_id a 'plantas' si falta (portátil SQLite/Postgres
     vía inspección de columnas + ALTER TABLE).
  2. Backfill: asigna owner_id de las plantas existentes al AdminPro
     (primer usuario admin_pro; si no hay, el primer usuario).
  3. Ejecuta el sembrado idempotente del catálogo de MCU/pines.

No usa Alembic a propósito: es una migración mínima y autocontenida,
segura de ejecutar múltiples veces. Base.metadata.create_all ya crea las
TABLAS nuevas; esta migración cubre lo que create_all no hace (alterar una
tabla existente y rellenar datos).
"""
from sqlalchemy import inspect, text

from catalog_seed import seed_catalog
import models


def _columnas(engine, tabla):
    insp = inspect(engine)
    try:
        return {c["name"] for c in insp.get_columns(tabla)}
    except Exception:
        return set()


def _agregar_columna_si_falta(engine, tabla, columna, definicion):
    cols = _columnas(engine, tabla)
    if not cols or columna in cols:
        return False
    # Cada columna se intenta de forma aislada: si una falla (p. ej. por un
    # tipo de motor distinto), no debe impedir que se agreguen las demás.
    try:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {tabla} ADD COLUMN {columna} {definicion}"))
        return True
    except Exception as e:
        print(f"[migrations] no se pudo agregar {tabla}.{columna}: {e}")
        return False


def _agregar_columnas_rbac(engine):
    """Amplía la jerarquía y los permisos temporales sin romper instalaciones existentes."""
    cambios = {}
    cambios["usuarios.supervisor_id"] = _agregar_columna_si_falta(
        engine, "usuarios", "supervisor_id", "INTEGER")
    cambios["permisos_temporales.plant_id"] = _agregar_columna_si_falta(
        engine, "permisos_temporales", "plant_id", "INTEGER")
    # IMPORTANTE: "BOOLEAN DEFAULT 0" es válido en SQLite pero NO en
    # PostgreSQL (falla con "column is of type boolean but default
    # expression is of type integer"), y como cada ALTER TABLE corre en su
    # propia transacción, un fallo aquí abortaba en producción antes de
    # llegar a las columnas siguientes (incluida comentario_id más abajo),
    # dejando la tabla desincronizada con el modelo y provocando 500 al
    # insertar un permiso temporal. Se usa FALSE, portátil en ambos motores.
    cambios["permisos_temporales.puede_editar"] = _agregar_columna_si_falta(
        engine, "permisos_temporales", "puede_editar", "BOOLEAN DEFAULT FALSE")
    cambios["permisos_temporales.puede_configurar"] = _agregar_columna_si_falta(
        engine, "permisos_temporales", "puede_configurar", "BOOLEAN DEFAULT FALSE")
    cambios["permisos_temporales.puede_operar"] = _agregar_columna_si_falta(
        engine, "permisos_temporales", "puede_operar", "BOOLEAN DEFAULT FALSE")
    cambios["permisos_temporales.puede_dispositivos"] = _agregar_columna_si_falta(
        engine, "permisos_temporales", "puede_dispositivos", "BOOLEAN DEFAULT FALSE")
    # Columna añadida junto con la integración de comentarios/solicitudes.
    # Sin esta migración, las instalaciones existentes no tienen la columna
    # y el INSERT de un permiso temporal falla con un error 500 (columna
    # inexistente), lo que además hace que la respuesta de error pierda
    # las cabeceras CORS (ver nota en main.py).
    cambios["permisos_temporales.comentario_id"] = _agregar_columna_si_falta(
        engine, "permisos_temporales", "comentario_id", "INTEGER")
    return cambios


def _agregar_owner_id_si_falta(engine):
    cols = _columnas(engine, "plantas")
    if not cols:
        # La tabla aún no existe (create_all debería haberla creado antes).
        return False
    if "owner_id" in cols:
        return False
    # Portátil: INTEGER NULL en ambos motores.
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE plantas ADD COLUMN owner_id INTEGER"))
    return True



def _agregar_token_plain_si_falta(engine):
    cols = _columnas(engine, "device_tokens")
    if not cols:
        return False
    if "token_plain" in cols:
        return False
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE device_tokens ADD COLUMN token_plain VARCHAR"))
    return True


def _backfill_jerarquia(SessionLocal):
    """Asigna un responsable inicial a usuarios existentes sin tocar permisos de plantas.
    Operadores quedan bajo el primer Supervisor; Empleados sin responsable quedan bajo
    el primer Supervisor y luego pueden ser reasignados por el Supervisor.
    """
    db = SessionLocal()
    try:
        pro = (db.query(models.Usuario)
               .filter(models.Usuario.role == "admin_pro")
               .order_by(models.Usuario.id.asc()).first())
        if not pro:
            return 0
        cambios = 0
        usuarios = db.query(models.Usuario).filter(
            models.Usuario.id != pro.id,
            models.Usuario.supervisor_id.is_(None)).all()
        for u in usuarios:
            if u.role in {"admin", "empleado"}:
                u.supervisor_id = pro.id
                cambios += 1
        if cambios:
            db.commit()
        return cambios
    finally:
        db.close()

def _backfill_owner(SessionLocal):
    db = SessionLocal()
    try:
        admin = (db.query(models.Usuario)
                   .filter(models.Usuario.role == "admin_pro")
                   .order_by(models.Usuario.id.asc()).first())
        if not admin:
            admin = db.query(models.Usuario).order_by(models.Usuario.id.asc()).first()
        if not admin:
            return 0   # todavía no hay usuarios; se hará en el próximo arranque
        plantas = db.query(models.Planta).filter(models.Planta.owner_id.is_(None)).all()
        for p in plantas:
            p.owner_id = admin.id
        if plantas:
            db.commit()
        return len(plantas)
    finally:
        db.close()


def _seed(SessionLocal):
    db = SessionLocal()
    try:
        return seed_catalog(db)
    finally:
        db.close()


def run_migrations(engine, SessionLocal):
    """Punto de entrada. Se llama una vez al arrancar la app."""
    resultado = {"owner_id_agregado": False, "plantas_backfill": 0, "catalogo": None}
    resultado["owner_id_agregado"] = _agregar_owner_id_si_falta(engine)
    resultado["rbac"] = _agregar_columnas_rbac(engine)
    resultado["plantas_backfill"] = _backfill_owner(SessionLocal)
    resultado["jerarquia_backfill"] = _backfill_jerarquia(SessionLocal)
    resultado["token_plain_agregado"] = _agregar_token_plain_si_falta(engine)
    resultado["catalogo"] = _seed(SessionLocal)
    return resultado
