"""
main.py — Servidor FastAPI del sistema HMI industrial v2.
"""
import csv, io, json, os, asyncio, re, secrets
import time as time_lib
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import (FastAPI, Depends, HTTPException, Header, Request,
                     WebSocket, WebSocketDisconnect)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi.responses import StreamingResponse, Response, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

import models, schemas
import auth as auth_module
from database import engine, SessionLocal, Base
from migrations import run_migrations

app = FastAPI(title="HMI Industrial", version="2.0")
security_scheme = HTTPBearer()
Base.metadata.create_all(bind=engine)

# ─── BOOTSTRAP: crea un admin_pro automáticamente si la base está vacía ──
# Útil tras cambiar de base de datos (ej. Supabase -> SQLite) sin acceso a
# terminal en Render. Se controla por variables de entorno; si no las
# defines, no hace nada. BÓRRALO (o quítale las env vars) una vez que ya
# hayas iniciado sesión, para no dejarlo activo indefinidamente.
_ADMIN_BOOT_EMAIL = os.environ.get("ADMIN_BOOTSTRAP_EMAIL", "")
_ADMIN_BOOT_PASS  = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD", "")
if _ADMIN_BOOT_EMAIL and _ADMIN_BOOT_PASS:
    _db_boot = SessionLocal()
    try:
        if _db_boot.query(models.Usuario).count() == 0:
            _admin = models.Usuario(
                email=_ADMIN_BOOT_EMAIL,
                username=_ADMIN_BOOT_EMAIL.split("@")[0],
                password_hash=auth_module.hash_password(_ADMIN_BOOT_PASS),
                role="admin_pro",
            )
            _db_boot.add(_admin)
            _db_boot.commit()
            print(f"[BOOTSTRAP] Admin creado: {_ADMIN_BOOT_EMAIL}")
    finally:
        _db_boot.close()

# CORS: aceptar explícitamente el frontend de producción y los orígenes
# configurados en Render. Se normalizan espacios y se ignoran entradas vacías.
ORIGEN_FRONTEND = "https://planta-frontend-uj12.onrender.com"
_origenes_env = [x.strip().rstrip("/") for x in
                 os.environ.get("ORIGENES_PERMITIDOS", "").split(",") if x.strip()]
origenes = list(dict.fromkeys([ORIGEN_FRONTEND, *_origenes_env,
                               "http://localhost:5500", "http://127.0.0.1:5500"]))
app.add_middleware(
    CORSMiddleware,
    allow_origins=origenes,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
    expose_headers=["*"]
)

@app.exception_handler(Exception)
async def manejador_excepciones_no_capturadas(request: Request, exc: Exception):
    """Red de seguridad: cualquier excepción no controlada (p. ej. un error
    de base de datos) debe seguir devolviendo un 500 CON las cabeceras CORS
    correspondientes. Sin esto, Starlette genera el 500 fuera del alcance de
    CORSMiddleware y el navegador lo reporta como un bloqueo de CORS en vez
    de mostrar el error real (500), como ocurría en /api/permisos-temp.
    """
    import traceback
    traceback.print_exc()
    origen = request.headers.get("origin")
    headers = {}
    if origen and origen.rstrip("/") in origenes:
        headers["Access-Control-Allow-Origin"] = origen
        headers["Vary"] = "Origin"
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor"},
        headers=headers,
    )

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def crear_usuarios_iniciales():
    # Crea los 2 admin desde las variables de entorno y, si YA existen,
    # RE-SINCRONIZA su contraseña y los reactiva. Así, tras un redeploy,
    # ADMIN_PRO_EMAIL/ADMIN_PRO_PASSWORD (y ADMIN_EMAIL/ADMIN_PASSWORD)
    # SIEMPRE permiten iniciar sesion, sin importar el estado previo de la BD.
    seeds = [
        (os.environ.get("ADMIN_PRO_EMAIL", "adminpro@planta.local"),
         "AdminPro", os.environ.get("ADMIN_PRO_PASSWORD", "AdminPro2026!"), "admin_pro"),
        (os.environ.get("ADMIN_EMAIL", "admin@planta.local"),
         "Admin",    os.environ.get("ADMIN_PASSWORD", "Admin2026!"),       "admin"),
    ]
    db = SessionLocal()
    try:
        for email, username, password, role in seeds:
            u = db.query(models.Usuario).filter(models.Usuario.email == email).first()
            if u:
                u.password_hash = auth_module.hash_password(password)
                u.is_active = True
                u.role = role
            else:
                db.add(models.Usuario(
                    email=email, username=username,
                    password_hash=auth_module.hash_password(password), role=role))
        db.commit()
    finally:
        db.close()

# IMPORTANTE: primero se aplican las migraciones estructurales.
# models.Usuario ya contiene supervisor_id, pero una BD de Postgres existente
# puede no tener todavía esa columna. Si se consulta Usuario antes de ALTER TABLE,
# SQLAlchemy genera SELECT usuarios.supervisor_id y Render detiene el servicio.
try:
    run_migrations(engine, SessionLocal)
except Exception as _e:
    print(f"[migrations] aviso inicial: {_e}")

crear_usuarios_iniciales()

# Segundo pase: ahora que los usuarios iniciales existen, se pueden ejecutar los
# backfills de jerarquía/propietario sin romper instalaciones existentes.
try:
    run_migrations(engine, SessionLocal)
except Exception as _e:
    print(f"[migrations] aviso post-usuarios: {_e}")

# Aviso de persistencia: SQLite en Render (/tmp) NO sobrevive a reinicios.
if not os.environ.get("SUPABASE_URL") and os.environ.get("RENDER"):
    print("[ADVERTENCIA] Usando SQLite en almacenamiento efímero de Render (/tmp): "
          "los datos (usuarios/plantas) se pierden al reiniciar. Configura "
          "SUPABASE_URL (Postgres) para persistencia real en producción.")

# ─── FASE 1: validación y tenencia ───────────────────────────────
VAR_NAME_RE       = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,49}$")
ROLES_VALIDOS     = {"sensor", "actuator", "setpoint", "indicator", "calculated"}
TIPOS_VALIDOS     = {"float", "int", "bool", "string"}
DIRECCIONES_VALIDAS = {"input", "output", "virtual"}
_DIR_POR_ROL      = {"sensor": "input", "actuator": "output", "setpoint": "output",
                     "indicator": "input", "calculated": "virtual"}

def _derivar_direccion(role: str) -> str:
    return _DIR_POR_ROL.get(role, "input")

def _check_owner(owner_id, u):
    """Tenencia por recurso (owner_id desnormalizado). Anti-IDOR."""
    if owner_id is None:
        if u.role != "admin_pro":
            raise HTTPException(403, "No autorizado")
    elif owner_id != u.id:
        raise HTTPException(403, "No autorizado")

def planta_de(db, pid, u):
    """Devuelve la planta activa comprobando propiedad del usuario del JWT."""
    p = db.query(models.Planta).filter(models.Planta.id == pid,
                                        models.Planta.is_active == True).first()
    if not p:
        raise HTTPException(404, "Planta no encontrada")
    _check_owner(p.owner_id, u)
    return p

# ─── FASE 3: RBAC — acceso por asignación ────────────────────────
ROLES_USUARIO = {"admin_pro", "admin", "empleado"}

def _tiene_acceso(db, p, u):
    """True si el usuario puede VER la planta (dueño Supervisor o asignado)."""
    if u.role == "admin_pro":
        return p.owner_id == u.id or p.owner_id is None
    return db.query(models.PlantAccess).filter(
        models.PlantAccess.user_id == u.id,
        models.PlantAccess.plant_id == p.id).first() is not None

def _puede_editar(db, p, u):
    """True si puede editar el HMI.
    Supervisor dueño: siempre. Operador asignado: siempre (asignación = control total).
    Empleado: nunca."""
    if u.role == "admin_pro":
        return p.owner_id == u.id or p.owner_id is None
    if u.role == "admin":
        return db.query(models.PlantAccess).filter(
            models.PlantAccess.user_id == u.id,
            models.PlantAccess.plant_id == p.id).first() is not None
    return False   # Empleado: nunca edita

def _control_total(db, p, u):
    """True si el usuario tiene control total sobre la planta:
    Supervisor dueño, o Operador asignado. Empleado: no."""
    if u.role == "admin_pro":
        return p.owner_id == u.id or p.owner_id is None
    if u.role == "admin":
        return db.query(models.PlantAccess).filter(
            models.PlantAccess.user_id == u.id,
            models.PlantAccess.plant_id == p.id).first() is not None
    return False

def _permiso_temporal_activo(db, u, pid=None, capacidad=None):
    """Busca un permiso temporal vigente del Empleado.
    Si pid se informa, el permiso debe ser de esa planta o global (plant_id NULL).
    """
    if u.role != "empleado":
        return None
    q = db.query(models.PermisoTemporal).filter(
        models.PermisoTemporal.para_usuario == u.email,
        models.PermisoTemporal.usado == True,
        models.PermisoTemporal.expires_at > datetime.utcnow()
    )
    if pid is not None:
        q = q.filter((models.PermisoTemporal.plant_id == pid) |
                     (models.PermisoTemporal.plant_id == None))
    if capacidad:
        campo = {
            "editar": models.PermisoTemporal.puede_editar,
            "configurar": models.PermisoTemporal.puede_configurar,
            "operar": models.PermisoTemporal.puede_operar,
            "dispositivos": models.PermisoTemporal.puede_dispositivos,
        }.get(capacidad)
        if campo is not None:
            q = q.filter(campo == True)
    return q.order_by(desc(models.PermisoTemporal.expires_at)).first()


def _puede_gestionar_planta(db, p, u, capacidad=None):
    """Control permanente del Supervisor/Operador o permiso temporal del Empleado."""
    if _control_total(db, p, u):
        return True
    if u.role == "empleado":
        return _permiso_temporal_activo(db, u, p.id, capacidad) is not None
    return False


def planta_con_control(db, pid, u, capacidad=None):
    """Planta que el usuario puede gestionar.
    Supervisor/Operador: control permanente.
    Empleado: solo si posee un permiso temporal vigente para esa capacidad.
    """
    p = db.query(models.Planta).filter(models.Planta.id == pid,
                                        models.Planta.is_active == True).first()
    if not p:
        raise HTTPException(404, "Planta no encontrada")
    if not _puede_gestionar_planta(db, p, u, capacidad):
        if u.role == "empleado":
            raise HTTPException(403, "No tienes un permiso temporal vigente para esta acción")
        raise HTTPException(403, "No autorizado para gestionar esta planta")
    return p


def _es_superior_de(db, superior, subordinado):
    """Jerarquía directa: Supervisor > Operador > Empleado."""
    if superior.id == subordinado.id:
        return False
    if superior.role == "admin_pro":
        return subordinado.role in {"admin", "empleado"}
    if superior.role == "admin":
        return subordinado.role == "empleado" and subordinado.supervisor_id == superior.id
    return False


def _plantas_operador(db, actor):
    """IDs de las plantas que el Operador tiene asignadas."""
    if actor.role != "admin":
        return set()
    return {a.plant_id for a in db.query(models.PlantAccess).filter(
        models.PlantAccess.user_id == actor.id).all()}


def _empleado_tiene_permiso_en_plantas_del_operador(db, actor, dest):
    """True si el Empleado está VINCULADO a una planta que administra el
    Operador: ya sea porque el Supervisor lo asignó a esa planta
    (PlantAccess) o porque tiene un permiso temporal vigente ahí. Esto
    permite al Operador ver y administrar al Empleado aunque no sea su
    responsable directo (supervisor_id)."""
    if actor.role != "admin" or dest.role != "empleado":
        return False
    plant_ids = _plantas_operador(db, actor)
    if not plant_ids:
        return False
    asignado = db.query(models.PlantAccess).filter(
        models.PlantAccess.user_id == dest.id,
        models.PlantAccess.plant_id.in_(plant_ids)
    ).first() is not None
    if asignado:
        return True
    return db.query(models.PermisoTemporal).filter(
        models.PermisoTemporal.para_usuario == dest.email,
        models.PermisoTemporal.plant_id.in_(plant_ids),
        models.PermisoTemporal.expires_at > datetime.utcnow()
    ).first() is not None


def _puede_administrar_usuario(db, actor, dest):
    """Determina quién puede administrar a quién."""
    if actor.role == "admin_pro":
        return dest.id != actor.id
    if actor.role == "admin":
        return (dest.role == "empleado" and (
            dest.supervisor_id == actor.id or
            _empleado_tiene_permiso_en_plantas_del_operador(db, actor, dest)
        ))
    return False


def _empleados_bajo(db, actor):
    """Empleados propios + Empleados asignados (PlantAccess) o con permiso
    vigente en plantas del Operador."""
    if actor.role != "admin":
        return []
    plant_ids = _plantas_operador(db, actor)
    emails = set()
    if plant_ids:
        asignados = db.query(models.Usuario.email).join(
            models.PlantAccess, models.PlantAccess.user_id == models.Usuario.id
        ).filter(
            models.PlantAccess.plant_id.in_(plant_ids),
            models.Usuario.role == "empleado"
        ).all()
        emails |= {x[0] for x in asignados}
        permisos = db.query(models.PermisoTemporal.para_usuario).filter(
            models.PermisoTemporal.plant_id.in_(plant_ids),
            models.PermisoTemporal.expires_at > datetime.utcnow()
        ).all()
        emails |= {x[0] for x in permisos}
    q = db.query(models.Usuario).filter(
        models.Usuario.role == "empleado",
        (models.Usuario.supervisor_id == actor.id) |
        (models.Usuario.email.in_(emails) if emails else False)
    )
    return q.order_by(models.Usuario.username.asc()).all()



def _validar_duracion(minutos):
    if minutos < 1 or minutos > 7 * 24 * 60:
        raise HTTPException(400, "La duración debe estar entre 1 minuto y 7 días")



def planta_visible(db, pid, u):
    """Planta activa que el usuario puede VER (dueño o asignado). Para lectura."""
    p = db.query(models.Planta).filter(models.Planta.id == pid,
                                        models.Planta.is_active == True).first()
    if not p:
        raise HTTPException(404, "Planta no encontrada")
    if not _tiene_acceso(db, p, u):
        raise HTTPException(403, "No autorizado")
    return p

def plantas_visibles(db, u):
    """Plantas que el usuario puede ver, según su rol."""
    q = db.query(models.Planta).filter(models.Planta.is_active == True)
    if u.role == "admin_pro":
        q = q.filter((models.Planta.owner_id == u.id) | (models.Planta.owner_id == None))
    else:
        ids = [a.plant_id for a in db.query(models.PlantAccess)
               .filter(models.PlantAccess.user_id == u.id).all()]
        q = q.filter(models.Planta.id.in_(ids if ids else [-1]))
    return q.order_by(models.Planta.created_at.desc()).all()

def _puede_operar(db, p, u):
    """True si puede ENVIAR comandos: Supervisor dueño u Operador asignado.
    El Empleado es solo-lectura (nunca opera)."""
    if u.role == "admin_pro":
        return p.owner_id == u.id or p.owner_id is None
    if u.role == "admin":
        return db.query(models.PlantAccess).filter(
            models.PlantAccess.user_id == u.id,
            models.PlantAccess.plant_id == p.id).first() is not None
    return False

def obtener_usuario_actual(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "No autenticado")
    data = auth_module.verificar_token(authorization.split(" ")[1])
    if not data: raise HTTPException(401, "Token inválido")
    u = db.query(models.Usuario).filter(models.Usuario.email == data["email"],
                                         models.Usuario.is_active == True).first()
    if not u: raise HTTPException(401, "Usuario inactivo")
    return u

def requerir_admin_pro(u=Depends(obtener_usuario_actual)):
    if u.role != "admin_pro": raise HTTPException(403, "Se requiere Admin Pro")
    return u

def log(db, usuario, accion, desc, detalle=None):
    db.add(models.AuditLog(usuario=usuario,accion=accion,descripcion=desc,detalle=detalle))
    db.commit()

def notif(db, para, tipo, titulo, msg, de=None, payload=None):
    db.add(models.Notificacion(para=para,de=de,tipo=tipo,titulo=titulo,mensaje=msg,payload=payload))
    db.commit()

# ─── AUTH ───────────────────────────────────────────────────────
@app.post("/api/auth/login", response_model=schemas.TokenOut)
def login(datos: schemas.LoginInput, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    rl = f"login:{datos.email}"
    if auth_module.verificar_rate_limit(rl):
        raise HTTPException(429, "Demasiados intentos fallidos. Espera 5 minutos.")
    u = db.query(models.Usuario).filter(models.Usuario.email==datos.email,
                                         models.Usuario.is_active==True).first()
    valido = u and auth_module.verificar_password(datos.password, u.password_hash)
    if not valido and u and u.temp_password_hash:
        if u.temp_password_expires and u.temp_password_expires > datetime.utcnow():
            valido = auth_module.verificar_password(datos.password, u.temp_password_hash)
            if valido: u.must_change_password = True
    if not valido:
        auth_module.registrar_intento_fallido(rl)
        log(db, datos.email, "login_fallido", f"Intento fallido desde {ip}")
        raise HTTPException(401, "Credenciales incorrectas")
    auth_module.limpiar_intentos(rl)
    u.last_login = datetime.utcnow(); db.commit()
    log(db, u.email, "login", f"Sesion iniciada desde {ip}")
    return {"access_token": auth_module.crear_token(u.email, u.role),
            "role": u.role, "username": u.username}

@app.post("/api/auth/logout")
def logout(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    log(db, u.email, "logout", "Sesion cerrada"); return {"ok": True}

@app.get("/api/auth/me")
def me(u=Depends(obtener_usuario_actual)):
    return {"email":u.email,"username":u.username,"role":u.role,
            "must_change_password":u.must_change_password}

@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    """Diagnóstico de despliegue: qué BD se usa y si es persistente."""
    usa_postgres = bool(os.environ.get("SUPABASE_URL"))
    en_render = bool(os.environ.get("RENDER"))
    backend = "postgres" if usa_postgres else "sqlite"
    aviso = None
    if not usa_postgres and en_render:
        aviso = ("SQLite en /tmp de Render: los datos NO persisten entre reinicios. "
                 "Configura SUPABASE_URL (Postgres) para persistencia real.")
    return {
        "status": "ok",
        "db": backend,
        "persistente": usa_postgres,
        "en_render": en_render,
        "aviso": aviso,
        "usuarios": db.query(models.Usuario).count(),
        "plantas": db.query(models.Planta).filter(models.Planta.is_active == True).count(),
    }

@app.post("/api/auth/cambiar-password")
def cambiar_password(datos: schemas.CambiarPasswordInput,
                     u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    valido = auth_module.verificar_password(datos.password_actual, u.password_hash)
    if not valido and u.temp_password_hash:
        valido = auth_module.verificar_password(datos.password_actual, u.temp_password_hash)
    if not valido: raise HTTPException(400, "Password actual incorrecto")
    if len(datos.password_nueva) < 8: raise HTTPException(400, "Minimo 8 caracteres")
    u.password_hash = auth_module.hash_password(datos.password_nueva)
    u.temp_password_hash = None; u.temp_password_expires = None; u.must_change_password = False
    db.commit(); log(db, u.email, "cambio_password", "Cambio de password"); return {"ok": True}

@app.post("/api/auth/solicitar-reset")
def solicitar_reset(datos: schemas.SolicitarResetInput, db: Session = Depends(get_db)):
    u = db.query(models.Usuario).filter(models.Usuario.email==datos.email).first()
    if u:
        pros = db.query(models.Usuario).filter(models.Usuario.role=="admin_pro").all()
        for pro in pros:
            notif(db, pro.email, "reset_password",
                  "Solicitud de reset de password",
                  f"{u.username} ({u.email}) solicita restablecer su password.",
                  payload=json.dumps({"usuario_id":u.id,"email":u.email}))
        log(db, datos.email, "solicitud_reset", "Solicito reset de password")
    return {"ok": True}

# ─── USUARIOS ────────────────────────────────────────────────────
@app.get("/api/usuarios", response_model=List[schemas.UsuarioOut])
def listar_usuarios(actor=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if actor.role == "admin_pro":
        q = db.query(models.Usuario)
    elif actor.role == "admin":
        plant_ids = _plantas_operador(db, actor)
        emails = set()
        if plant_ids:
            asignados = db.query(models.Usuario.email).join(
                models.PlantAccess, models.PlantAccess.user_id == models.Usuario.id
            ).filter(
                models.PlantAccess.plant_id.in_(plant_ids),
                models.Usuario.role == "empleado"
            ).all()
            emails |= {row[0] for row in asignados}
            rows = db.query(models.PermisoTemporal.para_usuario).filter(
                models.PermisoTemporal.plant_id.in_(plant_ids),
                models.PermisoTemporal.expires_at > datetime.utcnow()
            ).all()
            emails |= {row[0] for row in rows}
        q = db.query(models.Usuario).filter(
            (models.Usuario.id == actor.id) |
            ((models.Usuario.role == "empleado") & (
                (models.Usuario.supervisor_id == actor.id) |
                (models.Usuario.email.in_(emails) if emails else False)
            ))
        )
    else:
        raise HTTPException(403, "No tienes permisos para gestionar usuarios")
    return q.order_by(desc(models.Usuario.created_at)).all()


@app.post("/api/usuarios", response_model=schemas.UsuarioOut)
def crear_usuario(datos: schemas.UsuarioCreate,
                  actor=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if datos.role not in ROLES_USUARIO:
        raise HTTPException(400, "Rol inválido (admin_pro | admin | empleado)")
    if actor.role == "empleado":
        raise HTTPException(403, "Un Empleado no puede crear usuarios")
    if actor.role == "admin" and datos.role != "empleado":
        raise HTTPException(403, "Un Operador solo puede crear Empleados bajo su cargo")
    if db.query(models.Usuario).filter(models.Usuario.email == datos.email).first():
        raise HTTPException(400, "Email ya existe")
    manager_id = actor.id if actor.role in {"admin_pro", "admin"} else None
    u = models.Usuario(email=datos.email, username=datos.username, role=datos.role,
                       password_hash=auth_module.hash_password(datos.password),
                       supervisor_id=manager_id)
    db.add(u); db.commit(); db.refresh(u)
    log(db, actor.email, "crear_usuario",
        f"Creo {datos.email} rol {datos.role}; responsable #{manager_id}")
    return u


# ─── FASE 3: asignación granular de plantas por usuario ──────────
@app.get("/api/usuarios/{uid}/plantas")
def get_asignacion_plantas(uid: int, actor=Depends(obtener_usuario_actual),
                           db: Session = Depends(get_db)):
    dest = db.query(models.Usuario).filter(models.Usuario.id == uid).first()
    if not dest:
        raise HTTPException(404, "Usuario no encontrado")
    if not _puede_administrar_usuario(db, actor, dest) and dest.id != actor.id:
        raise HTTPException(403, "No puedes administrar las plantas de este usuario")
    accesos = db.query(models.PlantAccess).filter(models.PlantAccess.user_id == uid).all()
    return {"plant_ids": [a.plant_id for a in accesos],
            "can_edit": any(a.can_edit for a in accesos)}


@app.put("/api/usuarios/{uid}/plantas")
def set_asignacion_plantas(uid: int, datos: schemas.AssignPlantsInput,
                           actor=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    dest = db.query(models.Usuario).filter(models.Usuario.id == uid).first()
    if not dest:
        raise HTTPException(404, "Usuario no encontrado")
    if not _puede_administrar_usuario(db, actor, dest):
        raise HTTPException(403, "No puedes asignar plantas a este usuario")
    if dest.role == "admin_pro":
        raise HTTPException(400, "Un Supervisor no requiere asignación de plantas")

    if actor.role == "admin_pro":
        propias = {p.id for p in db.query(models.Planta).filter(
            models.Planta.owner_id == actor.id, models.Planta.is_active == True).all()}
    else:
        # El Operador solo puede asignar sus propias plantas a sus Empleados.
        propias = {a.plant_id for a in db.query(models.PlantAccess).filter(
            models.PlantAccess.user_id == actor.id).all()}

    nuevos = [pid for pid in dict.fromkeys(datos.plant_ids) if pid in propias]
    # Un Empleado nunca recibe edición permanente. Solo el Operador conserva
    # control total mediante su asignación.
    can_edit = dest.role == "admin"
    db.query(models.PlantAccess).filter(models.PlantAccess.user_id == uid).delete()
    for pid in nuevos:
        db.add(models.PlantAccess(user_id=uid, plant_id=pid,
                                  can_edit=can_edit, granted_by=actor.email))
    db.commit()
    log(db, actor.email, "asignar_plantas", f"Asignó {len(nuevos)} plantas a #{uid}")
    return {"ok": True, "plant_ids": nuevos, "can_edit": can_edit}


@app.put("/api/usuarios/{uid}")
def actualizar_usuario(uid: int, datos: schemas.UsuarioUpdate,
                       actor=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    u = db.query(models.Usuario).filter(models.Usuario.id == uid).first()
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    if uid == actor.id:
        if datos.is_active is False:
            raise HTTPException(400, "No puedes suspender tu propia cuenta")
        if datos.role is not None and datos.role != actor.role:
            raise HTTPException(400, "No puedes cambiar tu propio rol")
        if datos.supervisor_id is not None:
            raise HTTPException(400, "No puedes cambiar tu propio responsable")
        return {"ok": True}

    if not _puede_administrar_usuario(db, actor, u):
        raise HTTPException(403, "No tienes autoridad sobre este usuario")

    if datos.role is not None:
        if datos.role not in ROLES_USUARIO:
            raise HTTPException(400, "Rol inválido (admin_pro | admin | empleado)")
        if actor.role == "admin" and datos.role not in {"admin", "empleado"}:
            raise HTTPException(403, "El Operador solo puede asignar el rol Operador o Empleado")
        if actor.role == "admin" and u.role == "admin_pro":
            raise HTTPException(403, "No puedes modificar a un Supervisor")
        if actor.role == "admin_pro" and u.id == actor.id:
            raise HTTPException(400, "No puedes modificar tu propia cuenta")
        u.role = datos.role

    if datos.supervisor_id is not None:
        mgr = db.query(models.Usuario).filter(
            models.Usuario.id == datos.supervisor_id,
            models.Usuario.is_active == True).first()
        if not mgr or mgr.role not in {"admin_pro", "admin"}:
            raise HTTPException(400, "Responsable inválido")
        if actor.role == "admin" and mgr.id != actor.id:
            raise HTTPException(403, "El Operador solo puede asignar Empleados a su propio cargo")
        if u.role == "empleado" and mgr.role != "admin":
            # Un Empleado puede depender directamente del Supervisor.
            if actor.role != "admin_pro":
                raise HTTPException(403, "No puedes cambiar esa jerarquía")
        if u.role == "admin" and mgr.role != "admin_pro":
            raise HTTPException(403, "Un Operador debe depender de un Supervisor")
        u.supervisor_id = mgr.id

    if datos.is_active is not None:
        u.is_active = datos.is_active

    # Al convertir a Operador, su responsable debe ser Supervisor.
    if u.role == "admin" and u.supervisor_id is None:
        if actor.role == "admin_pro":
            u.supervisor_id = actor.id
        else:
            raise HTTPException(400, "El Operador debe tener un Supervisor responsable")

    db.commit()
    log(db, actor.email, "actualizar_usuario", f"Actualizo #{uid}")
    return {"ok": True}


@app.post("/api/usuarios/{uid}/reset-password")
def reset_password(uid: int, actor=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    u = db.query(models.Usuario).filter(models.Usuario.id == uid).first()
    if not u: raise HTTPException(404, "No encontrado")
    if not _puede_administrar_usuario(db, actor, u):
        raise HTTPException(403, "No tienes autoridad sobre este usuario")
    tmp = auth_module.generar_password_temporal()
    u.temp_password_hash = auth_module.hash_password(tmp)
    u.temp_password_expires = datetime.utcnow() + timedelta(hours=24)
    u.must_change_password = True
    db.commit()
    notif(db, u.email, "reset_password", "Password restablecido",
          f"Password temporal: {tmp}\nExpira en 24h. Cambialo inmediatamente.", de=actor.email)
    log(db, actor.email, "reset_password", f"Reseteo password de {u.email}")
    return {"ok":True,"temp_password":tmp}


# ─── HMI LAYOUT ──────────────────────────────────────────────────
@app.get("/api/hmi/layout", response_model=schemas.HMILayoutOut)
def obtener_layout(_=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    l = db.query(models.HMILayout).filter(models.HMILayout.id==1).first()
    if not l:
        l = models.HMILayout(id=1, nombre="Principal", layout_json="{}"); db.add(l); db.commit(); db.refresh(l)
    return l

@app.post("/api/hmi/layout")
def guardar_layout(datos: schemas.HMILayoutSave,
                   u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if u.role == "empleado":
        if not _permiso_temporal_activo(db, u, None, "editar"):
            raise HTTPException(403, "Sin permiso temporal para editar el HMI")
    l = db.query(models.HMILayout).filter(models.HMILayout.id==1).first()
    if not l: l = models.HMILayout(id=1, nombre="Principal"); db.add(l)
    l.layout_json = datos.layout_json; l.updated_by = u.email; l.updated_at = datetime.utcnow()
    db.commit(); log(db, u.email, "guardar_layout", "Guardo diseno HMI"); return {"ok":True}

# ─── NOTIFICACIONES ──────────────────────────────────────────────
@app.get("/api/notificaciones", response_model=List[schemas.NotificacionOut])
def mis_notificaciones(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    return (db.query(models.Notificacion)
            .filter(models.Notificacion.para==u.email)
            .order_by(desc(models.Notificacion.created_at)).limit(50).all())

@app.get("/api/notificaciones/no-leidas")
def no_leidas(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    n = db.query(models.Notificacion).filter(
        models.Notificacion.para==u.email, models.Notificacion.leida==False).count()
    return {"count":n}

@app.post("/api/notificaciones/{nid}/leer")
def marcar_leida(nid: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    n = db.query(models.Notificacion).filter(
        models.Notificacion.id==nid, models.Notificacion.para==u.email).first()
    if n: n.leida = True; db.commit()
    return {"ok":True}

@app.post("/api/notificaciones/leer-todas")
def leer_todas(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    db.query(models.Notificacion).filter(
        models.Notificacion.para==u.email, models.Notificacion.leida==False
    ).update({"leida":True}); db.commit(); return {"ok":True}

# ─── COMENTARIOS ─────────────────────────────────────────────────
@app.post("/api/comentarios", response_model=schemas.ComentarioOut)
def crear_comentario(datos: schemas.ComentarioCreate,
                     u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if not datos.justificacion.strip(): raise HTTPException(400, "Justificacion obligatoria")
    c = models.Comentario(de_usuario=u.email, tipo=datos.tipo,
                          asunto=datos.asunto, justificacion=datos.justificacion)
    db.add(c); db.commit(); db.refresh(c)
    for pro in db.query(models.Usuario).filter(models.Usuario.role=="admin_pro").all():
        notif(db, pro.email, "comentario_nuevo", f"Solicitud de {u.username}",
              f"Asunto: {datos.asunto}\n{datos.justificacion[:100]}",
              de=u.email, payload=json.dumps({"comentario_id":c.id}))
    log(db, u.email, "comentario", f"Envio solicitud: {datos.asunto}"); return c

@app.get("/api/comentarios", response_model=List[schemas.ComentarioOut])
def listar_comentarios(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    q = db.query(models.Comentario)
    if u.role != "admin_pro": q = q.filter(models.Comentario.de_usuario==u.email)
    return q.order_by(desc(models.Comentario.created_at)).limit(100).all()

@app.post("/api/comentarios/{cid}/responder")
def responder(cid: int, datos: schemas.ResponderComentario,
              pro=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    c = db.query(models.Comentario).filter(models.Comentario.id==cid).first()
    if not c: raise HTTPException(404, "No encontrado")
    c.respuesta=datos.respuesta; c.respondido_por=pro.email
    c.estado="respondido" if datos.aprobar else "rechazado"
    c.respondido_at=datetime.utcnow(); db.commit()
    notif(db, c.de_usuario, "comentario_respondido",
          f"Tu solicitud fue {'aprobada' if datos.aprobar else 'rechazada'}",
          f"Asunto: {c.asunto}\nRespuesta: {datos.respuesta}", de=pro.email,
          payload=json.dumps({"comentario_id":cid,"aprobado":datos.aprobar}))
    log(db, pro.email, "responder_comentario",
        f"{'Aprobo' if datos.aprobar else 'Rechazo'} #{cid}"); return {"ok":True}

# ─── PERMISOS TEMPORALES ─────────────────────────────────────────
@app.post("/api/permisos-temp")
def crear_permiso(datos: schemas.PermisoTemporalCreate,
                  actor=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    """Supervisor y Operador pueden conceder permisos temporales a Empleados.
    El Operador solo puede hacerlo con sus propios subordinados y sobre sus plantas.
    """
    if actor.role not in {"admin_pro", "admin"}:
        raise HTTPException(403, "Solo Supervisor u Operador pueden conceder permisos")

    dest = db.query(models.Usuario).filter(
        models.Usuario.email == datos.para_usuario,
        models.Usuario.is_active == True).first()
    if not dest:
        raise HTTPException(404, "Empleado no encontrado")
    if dest.role != "empleado":
        raise HTTPException(400, "Los permisos temporales están destinados a Empleados")
    if actor.role == "admin" and not _puede_administrar_usuario(db, actor, dest):
        raise HTTPException(403, "Ese Empleado no está bajo tu cargo ni tiene un permiso en tus plantas")

    _validar_duracion(datos.duracion_min)
    if not any([datos.puede_editar, datos.puede_configurar,
                datos.puede_operar, datos.puede_dispositivos]):
        raise HTTPException(400, "Selecciona al menos una capacidad")

    if datos.plant_id is not None:
        p = db.query(models.Planta).filter(
            models.Planta.id == datos.plant_id,
            models.Planta.is_active == True).first()
        if not p:
            raise HTTPException(404, "Planta no encontrada")
        if actor.role == "admin_pro":
            if p.owner_id != actor.id:
                raise HTTPException(403, "No puedes conceder permisos sobre una planta que no administras")
        else:
            if not db.query(models.PlantAccess).filter(
                models.PlantAccess.user_id == actor.id,
                models.PlantAccess.plant_id == p.id).first():
                raise HTTPException(403, "El Operador solo puede usar sus plantas asignadas")
    elif actor.role == "admin":
        raise HTTPException(400, "El Operador debe indicar una planta concreta")

    token = auth_module.generar_token_editor()
    expires = datetime.utcnow() + timedelta(minutes=datos.duracion_min)
    pt = models.PermisoTemporal(
        token=token, para_usuario=dest.email, otorgado_por=actor.email,
        permiso="editor", plant_id=datos.plant_id,
        puede_editar=datos.puede_editar,
        puede_configurar=datos.puede_configurar,
        puede_operar=datos.puede_operar,
        puede_dispositivos=datos.puede_dispositivos,
        duracion_min=datos.duracion_min, expires_at=expires,
        comentario_id=datos.comentario_id)
    try:
        db.add(pt); db.commit(); db.refresh(pt)
    except Exception as e:
        db.rollback()
        print(f"[permisos-temp] error al insertar: {e}")
        raise HTTPException(
            500,
            "No se pudo guardar el permiso temporal. Verifica que la base de "
            "datos tenga las columnas más recientes de permisos_temporales "
            "(revisa los logs de arranque del servidor).")

    if datos.comentario_id:
        c = db.query(models.Comentario).filter(
            models.Comentario.id == datos.comentario_id).first()
        if c:
            c.estado = "respondido"; c.respondido_por = actor.email
            c.respondido_at = datetime.utcnow()
            c.respuesta = f"Permiso concedido por {datos.duracion_min} min. Token: {token}"
            db.commit()

    capacidades = ", ".join(
        x for x, ok in [
            ("editar HMI", datos.puede_editar),
            ("configurar", datos.puede_configurar),
            ("operar", datos.puede_operar),
            ("dispositivos", datos.puede_dispositivos)] if ok)
    # Nota: 'expires' es UTC (naive). No se formatea en hora de servidor
    # aquí para evitar el desfase; el frontend la muestra en hora LOCAL
    # con formatLocal()/utcDate() a partir de expires_at (payload, con 'Z').
    notif(db, dest.email, "permiso_editor", "Permiso temporal concedido",
          f"Token: {token}\nCapacidades: {capacidades}\n"
          f"Valido por {datos.duracion_min} min.",
          de=actor.email,
          payload=json.dumps({"token": token, "plant_id": datos.plant_id,
                              "expires_at": expires.isoformat() + "Z"}))
    log(db, actor.email, "permiso_temporal",
        f"Concedio a {dest.email}: {capacidades}, {datos.duracion_min}min, planta={datos.plant_id}")
    return {
        "id": pt.id, "token": pt.token, "para_usuario": pt.para_usuario,
        "otorgado_por": pt.otorgado_por, "plant_id": pt.plant_id,
        "puede_editar": pt.puede_editar, "puede_configurar": pt.puede_configurar,
        "puede_operar": pt.puede_operar, "puede_dispositivos": pt.puede_dispositivos,
        "duracion_min": pt.duracion_min,
        "expires_at": pt.expires_at.isoformat() + "Z",
        "usado": pt.usado,
        "created_at": pt.created_at.isoformat() + "Z" if pt.created_at else None,
    }


@app.post("/api/permisos-temp/verificar")
def verificar_token_editor(datos: schemas.VerificarToken,
                           plant_id: Optional[int] = None,
                           u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    pt = db.query(models.PermisoTemporal).filter(
        models.PermisoTemporal.token == datos.token,
        models.PermisoTemporal.para_usuario == u.email).first()
    if not pt: raise HTTPException(404, "Token no valido")
    if pt.expires_at < datetime.utcnow(): raise HTTPException(400, "Token expirado")
    if plant_id is not None and pt.plant_id not in (None, plant_id):
        raise HTTPException(403, "Este token no corresponde a esta planta")
    if not pt.usado:
        pt.usado = True; pt.used_at = datetime.utcnow(); db.commit()
    log(db, u.email, "usar_token_editor", f"Uso token editor #{pt.id}")
    return {"ok": True, "expires_at": pt.expires_at.isoformat() + "Z",
            "plant_id": pt.plant_id,
            "puede_editar": pt.puede_editar,
            "puede_configurar": pt.puede_configurar,
            "puede_operar": pt.puede_operar,
            "puede_dispositivos": pt.puede_dispositivos,
            "minutos_restantes": max(0, int((pt.expires_at-datetime.utcnow()).total_seconds()/60))}


@app.get("/api/permisos-temp/activo")
def permiso_activo(plant_id: Optional[int] = None,
                   u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if u.role in {"admin_pro", "admin"}:
        return {"activo": True, "permanente": True, "plant_id": plant_id}
    q = db.query(models.PermisoTemporal).filter(
        models.PermisoTemporal.para_usuario == u.email,
        models.PermisoTemporal.usado == True,
        models.PermisoTemporal.expires_at > datetime.utcnow()
    )
    if plant_id is not None:
        q = q.filter((models.PermisoTemporal.plant_id == plant_id) |
                     (models.PermisoTemporal.plant_id == None))
    pt = q.order_by(desc(models.PermisoTemporal.expires_at)).first()
    if pt:
        return {"activo": True, "permanente": False,
                "plant_id": pt.plant_id,
                "puede_editar": pt.puede_editar,
                "puede_configurar": pt.puede_configurar,
                "puede_operar": pt.puede_operar,
                "puede_dispositivos": pt.puede_dispositivos,
                "expires_at": pt.expires_at.isoformat() + "Z",
                "minutos_restantes": max(0, int((pt.expires_at-datetime.utcnow()).total_seconds()/60))}
    return {"activo": False, "plant_id": plant_id}


@app.get("/api/permisos-temp/pendiente")
def permisos_pendientes(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    """Permisos temporales recién concedidos a un Empleado que aún NO ha
    activado (usado=False) y que siguen vigentes. Usado por la vista del
    Empleado (hmi.html) para mostrar en tiempo real el botón
    '[ Desbloquear Acceso ]' apenas el Supervisor/Operador le otorga acceso.
    """
    if u.role != "empleado":
        return {"pendientes": []}
    q = db.query(models.PermisoTemporal).filter(
        models.PermisoTemporal.para_usuario == u.email,
        models.PermisoTemporal.usado == False,
        models.PermisoTemporal.expires_at > datetime.utcnow()
    ).order_by(desc(models.PermisoTemporal.created_at))
    out = []
    for pt in q.all():
        out.append({
            "id": pt.id, "plant_id": pt.plant_id,
            "puede_editar": pt.puede_editar,
            "puede_configurar": pt.puede_configurar,
            "puede_operar": pt.puede_operar,
            "puede_dispositivos": pt.puede_dispositivos,
            "duracion_min": pt.duracion_min,
            "expires_at": pt.expires_at.isoformat() + "Z",
        })
    return {"pendientes": out}


# ─── AUDIT LOG ───────────────────────────────────────────────────
@app.get("/api/audit", response_model=List[schemas.AuditLogOut])
def obtener_audit(
    limit: int = 200, offset: int = 0,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    usuario_filtro: Optional[str] = None,
    accion_filtro: Optional[str] = None,
    u=Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    q = db.query(models.AuditLog)
    if desde:
        try: q = q.filter(models.AuditLog.timestamp >= datetime.fromisoformat(desde))
        except: pass
    if hasta:
        try: q = q.filter(models.AuditLog.timestamp <= datetime.fromisoformat(hasta))
        except: pass
    # Visibilidad por rol:
    #  - Operador (admin): SOLO sus propias acciones.
    #  - Supervisor (admin_pro): todo; puede filtrar por un usuario concreto.
    if u.role != "admin_pro":
        q = q.filter(models.AuditLog.usuario == u.email)
    elif usuario_filtro:
        q = q.filter(models.AuditLog.usuario == usuario_filtro)
    if accion_filtro:
        q = q.filter(models.AuditLog.accion == accion_filtro)
    return q.order_by(desc(models.AuditLog.timestamp)).offset(offset).limit(limit).all()

# ─── EXPORT ──────────────────────────────────────────────────────
@app.get("/api/export/lecturas")
def export_lecturas(desde: Optional[str]=None, hasta: Optional[str]=None,
                    _=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    q = db.query(models.Lectura)
    if desde: q=q.filter(models.Lectura.timestamp>=datetime.fromisoformat(desde))
    if hasta: q=q.filter(models.Lectura.timestamp<=datetime.fromisoformat(hasta))
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["timestamp","nivel","caudal","temp_ambiente","humedad","temp_agua",
                "flotador_bajo","flotador_alto","bomba","valvula"])
    for l in q.order_by(models.Lectura.timestamp).all():
        w.writerow([l.timestamp,l.nivel,l.caudal,l.temp_ambiente,l.humedad,
                    l.temp_agua,l.flotador_bajo,l.flotador_alto,l.bomba_estado,l.valvula_estado])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]),media_type="text/csv",
                             headers={"Content-Disposition":"attachment;filename=lecturas.csv"})

@app.get("/api/export/audit")
def export_audit(desde: Optional[str]=None, hasta: Optional[str]=None,
                 _=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    q = db.query(models.AuditLog)
    if desde: q=q.filter(models.AuditLog.timestamp>=datetime.fromisoformat(desde))
    if hasta: q=q.filter(models.AuditLog.timestamp<=datetime.fromisoformat(hasta))
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["timestamp","usuario","accion","descripcion","detalle"])
    for r in q.order_by(models.AuditLog.timestamp).all():
        w.writerow([r.timestamp,r.usuario,r.accion,r.descripcion,r.detalle])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]),media_type="text/csv",
                             headers={"Content-Disposition":"attachment;filename=audit.csv"})


# ============================================================
# PLANTAS — CRUD completo
# ============================================================
@app.get("/api/plantas", response_model=List[schemas.PlantaOut])
def listar_plantas(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    return plantas_visibles(db, u)

@app.post("/api/plantas", response_model=schemas.PlantaOut)
def crear_planta(datos: schemas.PlantaCreate,
                 u=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    nombre = (datos.nombre or "").strip()
    if not nombre:
        raise HTTPException(400, "El nombre de la planta es obligatorio")
    # No permitir nombres duplicados (del mismo Supervisor, sin distinguir mayúsculas)
    dup = any(pl.nombre.strip().lower() == nombre.lower()
              for pl in db.query(models.Planta).filter(
                  models.Planta.owner_id == u.id,
                  models.Planta.is_active == True).all())
    if dup:
        raise HTTPException(400, f"Ya existe una planta llamada «{nombre}». Usa otro nombre.")
    p = models.Planta(nombre=nombre, descripcion=datos.descripcion,
                      created_by=u.email, owner_id=u.id)
    db.add(p); db.commit(); db.refresh(p)
    log(db, u.email, "crear_planta", f"Creó planta: {nombre}")
    return p

@app.get("/api/plantas/{pid}", response_model=schemas.PlantaOut)
def obtener_planta(pid: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    return planta_visible(db, pid, u)

@app.put("/api/plantas/{pid}", response_model=schemas.PlantaOut)
def actualizar_planta(pid: int, datos: schemas.PlantaUpdate,
                      u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    p = planta_con_control(db, pid, u, "configurar")
    if datos.nombre is not None: p.nombre = datos.nombre
    if datos.descripcion is not None: p.descripcion = datos.descripcion
    if datos.layout_json is not None:
        p.layout_json = datos.layout_json
        p.updated_by = u.email
        p.updated_at = datetime.utcnow()
    db.commit(); db.refresh(p)
    return p

@app.delete("/api/plantas/{pid}")
def eliminar_planta(pid: int, u=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    p = db.query(models.Planta).filter(models.Planta.id == pid).first()
    if not p: raise HTTPException(404, "Planta no encontrada")
    p.is_active = False; db.commit()
    log(db, u.email, "eliminar_planta", f"Eliminó planta #{pid}: {p.nombre}")
    return {"ok": True}

@app.post("/api/plantas/{pid}/layout")
def guardar_layout_planta(pid: int, datos: schemas.PlantaUpdate,
                          u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    p = planta_con_control(db, pid, u, "editar")
    if datos.layout_json is not None:
        p.layout_json = datos.layout_json
    if datos.nombre is not None:
        p.nombre = datos.nombre
    if datos.descripcion is not None:
        p.descripcion = datos.descripcion
    p.updated_by = u.email
    p.updated_at = datetime.utcnow()
    db.commit(); db.refresh(p)
    log(db, u.email, "guardar_layout", f"Guardo HMI planta #{pid} ({p.nombre})")
    return {"ok": True, "updated_at": p.updated_at.isoformat() if p.updated_at else None}

@app.post("/api/plantas/{pid}/actividad")
def registrar_actividad_editor(pid: int, datos: dict,
                               u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    """Registra aperturas/cierres del editor para auditoría."""
    accion  = datos.get("accion", "accion_editor")
    detalle = datos.get("detalle", "")
    p = db.query(models.Planta).filter(models.Planta.id == pid).first()
    nombre = p.nombre if p else f"#{pid}"
    log(db, u.email, accion, f"{detalle} — Planta: {nombre}")
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════
#  FASE 1 — ENDPOINTS DEL MODELO MULTI-TENANT
#  (todos derivan el usuario del JWT y comprueban propiedad)
# ══════════════════════════════════════════════════════════════════

# ─── Catálogo de MCU / pines (lectura para cualquier usuario) ─────
@app.get("/api/microcontrollers", response_model=List[schemas.McuOut])
def listar_mcus(_=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    return db.query(models.Microcontroller).order_by(models.Microcontroller.name.asc()).all()

@app.get("/api/microcontrollers/{mcu_id}/pines", response_model=List[schemas.McuPinOut])
def listar_pines(mcu_id: int, _=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    mcu = db.query(models.Microcontroller).filter(models.Microcontroller.id == mcu_id).first()
    if not mcu:
        raise HTTPException(404, "MCU no encontrado")
    return (db.query(models.McuPin)
              .filter(models.McuPin.mcu_id == mcu_id)
              .order_by(models.McuPin.order_idx.asc()).all())

# ─── Dispositivos ─────────────────────────────────────────────────
@app.get("/api/plantas/{pid}/devices", response_model=List[schemas.DeviceOut])
def listar_devices(pid: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    planta_visible(db, pid, u)
    return (db.query(models.Device)
              .filter(models.Device.plant_id == pid)
              .order_by(models.Device.created_at.desc()).all())

@app.post("/api/plantas/{pid}/devices", response_model=schemas.DeviceCreatedOut)
def crear_device(pid: int, datos: schemas.DeviceCreate,
                 u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    p = planta_con_control(db, pid, u, "dispositivos")
    mcu = db.query(models.Microcontroller).filter(models.Microcontroller.id == datos.mcu_id).first()
    if not mcu:
        raise HTTPException(400, "MCU inválido")
    device_uid = (datos.device_uid or "").strip() or f"dev_{secrets.token_hex(5)}"
    if db.query(models.Device).filter(models.Device.device_uid == device_uid).first():
        raise HTTPException(400, "device_uid ya existe")
    dev = models.Device(plant_id=p.id, mcu_id=mcu.id, owner_id=(p.owner_id or u.id),
                        name=datos.name, device_uid=device_uid, status="unknown",
                        firmware_version=datos.firmware_version)
    db.add(dev); db.commit(); db.refresh(dev)
    # Token: se guarda solo el hash; el claro se devuelve UNA vez.
    token = auth_module.generar_device_token()
    tok = models.DeviceToken(device_id=dev.id,
                             token_hash=auth_module.hash_device_token(token),
                             token_prefix=auth_module.prefijo_device_token(token),
                             token_plain=token)
    db.add(tok); db.commit()
    log(db, u.email, "crear_device", f"Dispositivo '{dev.name}' en planta #{pid}")
    base = schemas.DeviceOut.model_validate(dev)
    return schemas.DeviceCreatedOut(**base.model_dump(), token=token,
                                    token_prefix=tok.token_prefix)

@app.post("/api/devices/{did}/regenerar-token", response_model=schemas.DeviceCreatedOut)
def regenerar_token(did: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    dev = db.query(models.Device).filter(models.Device.id == did).first()
    if not dev:
        raise HTTPException(404, "Dispositivo no encontrado")
    planta_con_control(db, dev.plant_id, u, "dispositivos")
    ahora = datetime.utcnow()
    activos = (db.query(models.DeviceToken)
                 .filter(models.DeviceToken.device_id == did,
                         models.DeviceToken.revoked_at.is_(None)).all())
    for t in activos:
        t.revoked_at = ahora
    token = auth_module.generar_device_token()
    tok = models.DeviceToken(device_id=did,
                             token_hash=auth_module.hash_device_token(token),
                             token_prefix=auth_module.prefijo_device_token(token),
                             token_plain=token)
    db.add(tok); db.commit(); db.refresh(dev)
    log(db, u.email, "regenerar_token", f"Regeneró token del dispositivo #{did}")
    base = schemas.DeviceOut.model_validate(dev)
    return schemas.DeviceCreatedOut(**base.model_dump(), token=token,
                                    token_prefix=tok.token_prefix)

@app.get("/api/devices/{did}/token")
def ver_token_device(did: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    """Devuelve la clave (token) vigente del dispositivo. Supervisor dueño u Operador asignado."""
    dev = db.query(models.Device).filter(models.Device.id == did).first()
    if not dev:
        raise HTTPException(404, "Dispositivo no encontrado")
    planta_con_control(db, dev.plant_id, u, "dispositivos")
    tok = (db.query(models.DeviceToken)
             .filter(models.DeviceToken.device_id == did,
                     models.DeviceToken.revoked_at.is_(None))
             .order_by(models.DeviceToken.created_at.desc()).first())
    if not tok or not tok.token_plain:
        raise HTTPException(404, "Sin clave visible. Pulsa «Regenerar» para obtener una nueva.")
    return {"token": tok.token_plain, "token_prefix": tok.token_prefix}

@app.delete("/api/devices/{did}")
def eliminar_device(did: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    dev = db.query(models.Device).filter(models.Device.id == did).first()
    if not dev:
        raise HTTPException(404, "Dispositivo no encontrado")
    planta_con_control(db, dev.plant_id, u, "dispositivos")
    nombre = dev.name
    # ON DELETE: tokens en CASCADE; variables device_id -> SET NULL (FK activas).
    db.delete(dev); db.commit()
    log(db, u.email, "eliminar_device", f"Eliminó dispositivo #{did} ({nombre})")
    return {"ok": True}

# ═══════════════════════════════════════════════════════════════════
#  ENDPOINTS PARA EL DISPOSITIVO (ESP32) — auth por TOKEN de dispositivo
# ═══════════════════════════════════════════════════════════════════
def dispositivo_por_token(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Falta el token del dispositivo")
    token = authorization.split(" ", 1)[1].strip()
    th = auth_module.hash_device_token(token)
    tok = (db.query(models.DeviceToken)
             .filter(models.DeviceToken.token_hash == th,
                     models.DeviceToken.revoked_at.is_(None)).first())
    if not tok:
        raise HTTPException(401, "Token de dispositivo inválido o revocado")
    dev = db.query(models.Device).filter(models.Device.id == tok.device_id).first()
    if not dev:
        raise HTTPException(401, "Dispositivo no encontrado")
    return dev

def _gpio_de_label(label):
    d = ''.join(ch for ch in (label or '') if ch.isdigit())
    return int(d) if d else None

@app.get("/api/device/state")
def device_state(dev=Depends(dispositivo_por_token), db: Session = Depends(get_db)):
    """El ESP32 llama aquí con su token y recibe el estado deseado de sus SALIDAS.
    Respuesta: {device, outputs:[{variable, pin, gpio, value}]}"""
    dev.status = "online"; dev.last_seen_at = datetime.utcnow()
    outs = []
    for v in db.query(models.Variable).filter(models.Variable.device_id == dev.id).all():
        es_salida = (v.role in ("actuator", "setpoint")) or (v.direction == "output")
        if not es_salida:
            continue
        cmd = (db.query(models.Command)
                 .filter(models.Command.variable_id == v.id)
                 .order_by(models.Command.issued_at.desc()).first())
        val = cmd.value if (cmd and cmd.value is not None) else 0
        pin_label = None
        if v.pin_id:
            pin = db.query(models.McuPin).filter(models.McuPin.id == v.pin_id).first()
            pin_label = pin.label if pin else None
        outs.append({"variable": v.name, "pin": pin_label,
                     "gpio": _gpio_de_label(pin_label), "value": val,
                     "cmd_id": (cmd.id if cmd else 0)})
    db.commit()
    return {"device": dev.name, "outputs": outs}

@app.post("/api/device/readings")
def device_readings(payload: dict, dev=Depends(dispositivo_por_token), db: Session = Depends(get_db)):
    """El ESP32 reporta lecturas de sus variables de ENTRADA (sensores) o de
    cualquier tag que quiera mostrar en el HMI, tenga o no un pin físico
    asignado. Solo debe coincidir el NOMBRE de la variable (tag).
    payload = {"readings": {"nombre_variable": valor, ...}}
    'valor' puede ser numérico (se guarda en Reading.value, para gráficas,
    barras, 7 segmentos, etc.) o texto (se guarda en Reading.text_value,
    para widgets como 'Pantalla LCD (Texto)')."""
    dev.status = "online"; dev.last_seen_at = datetime.utcnow()
    n = 0
    for nombre, valor in (payload or {}).get("readings", {}).items():
        v = (db.query(models.Variable)
               .filter(models.Variable.device_id == dev.id,
                       models.Variable.name == nombre).first())
        if not v:
            continue
        try:
            db.add(models.Reading(variable_id=v.id, value=float(valor), ts=datetime.utcnow())); n += 1
        except (TypeError, ValueError):
            # No es numérico: se guarda como texto (p.ej. widget LCD Texto).
            db.add(models.Reading(variable_id=v.id, text_value=str(valor), ts=datetime.utcnow())); n += 1
    db.commit()
    return {"ok": True, "guardadas": n}

# ─── Variables ────────────────────────────────────────────────────
def _valores_de_planta(db, plant_id):
    """Valor actual de cada variable (el evento MÁS RECIENTE: comando web o
    lectura del dispositivo). Usado por el endpoint HTTP y por el WebSocket."""
    out = {}
    for v in db.query(models.Variable).filter(models.Variable.plant_id == plant_id).all():
        r = (db.query(models.Reading).filter(models.Reading.variable_id == v.id)
               .order_by(models.Reading.ts.desc()).first())
        es_salida = (v.role in ("actuator", "setpoint")) or (v.direction == "output")
        if es_salida:
            cmd = (db.query(models.Command).filter(models.Command.variable_id == v.id)
                     .order_by(models.Command.issued_at.desc()).first())
            usar_cmd = cmd is not None and (
                r is None or (cmd.issued_at is not None and r.ts is not None
                              and cmd.issued_at >= r.ts))
            if usar_cmd:
                val = cmd.value if cmd.value is not None else 0
            elif r is not None and r.value is not None:
                val = r.value
            elif cmd is not None:
                val = cmd.value if cmd.value is not None else 0
            else:
                val = 0
        else:
            val = (r.value if (r and r.value is not None)
                   else (r.text_value if (r and r.text_value is not None) else 0))
        out[v.name] = val
    return out

@app.get("/api/plantas/{pid}/valores")
def plant_valores(pid: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    """Valor actual de CADA variable de la planta (sincronización HTTP genérica)."""
    p = planta_visible(db, pid, u)
    return _valores_de_planta(db, p.id)

@app.websocket("/ws/planta/{pid}")
async def ws_planta(ws: WebSocket, pid: int):
    """Canal en vivo para la Vista/HMI. El cliente envía su token JWT como primer
    mensaje; el servidor empuja SOLO los cambios de valor (~200 ms) sin polling HTTP."""
    await ws.accept()
    try:
        token = await asyncio.wait_for(ws.receive_text(), timeout=10)
    except Exception:
        await ws.close(code=4001); return
    data = auth_module.verificar_token(token)
    if not data:
        try: await ws.send_text('{"__error__":"token"}')
        except Exception: pass
        await ws.close(code=4001); return
    db = SessionLocal()
    try:
        u = db.query(models.Usuario).filter(models.Usuario.email == data["email"],
                                            models.Usuario.is_active == True).first()
        if not u:
            await ws.close(code=4001); return
        try:
            p = planta_visible(db, pid, u)
        except HTTPException:
            await ws.close(code=4003); return
        plant_id = p.id
        await ws.send_text("OK")
        ultimo = {}
        while True:
            db.rollback()   # nueva transacción → lee datos frescos de otras escrituras
            vals = _valores_de_planta(db, plant_id)
            cambios = {k: v for k, v in vals.items() if ultimo.get(k) != v}
            if cambios:
                await ws.send_text(json.dumps(cambios))
                ultimo.update(cambios)
            await asyncio.sleep(0.2)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        db.close()

@app.get("/api/plantas/{pid}/variables", response_model=List[schemas.VariableOut])
def listar_variables(pid: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    p = planta_visible(db, pid, u)
    return (db.query(models.Variable)
              .filter(models.Variable.plant_id == p.id)
              .order_by(models.Variable.created_at.asc()).all())

@app.post("/api/plantas/{pid}/variables", response_model=schemas.VariableOut)
def crear_variable(pid: int, datos: schemas.VariableCreate,
                   u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    p = planta_con_control(db, pid, u, "configurar")
    if not VAR_NAME_RE.match(datos.name or ""):
        raise HTTPException(400, "Nombre inválido: letra inicial + letras/dígitos/_ (máx 50)")
    if datos.role not in ROLES_VALIDOS:
        raise HTTPException(400, "role inválido")
    if datos.data_type not in TIPOS_VALIDOS:
        raise HTTPException(400, "data_type inválido")
    direction = datos.direction or _derivar_direccion(datos.role)
    if direction not in DIRECCIONES_VALIDAS:
        raise HTTPException(400, "direction inválida")
    if db.query(models.Variable).filter(models.Variable.plant_id == p.id,
                                        models.Variable.name == datos.name).first():
        raise HTTPException(400, "Ya existe una variable con ese nombre en la planta")
    dev = None
    if datos.device_id is not None:
        dev = db.query(models.Device).filter(models.Device.id == datos.device_id).first()
        if not dev or dev.plant_id != p.id:
            raise HTTPException(400, "device_id no pertenece a esta planta")
    if datos.pin_id is not None:
        if dev is None:
            raise HTTPException(400, "pin_id requiere device_id")
        pin = db.query(models.McuPin).filter(models.McuPin.id == datos.pin_id).first()
        if not pin or pin.mcu_id != dev.mcu_id:
            raise HTTPException(400, "pin_id no corresponde al MCU del dispositivo")
        if db.query(models.Variable).filter(models.Variable.device_id == dev.id,
                                            models.Variable.pin_id == pin.id).first():
            raise HTTPException(400, "Ese pin ya está asignado a otra variable")
    v = models.Variable(plant_id=p.id, device_id=datos.device_id, pin_id=datos.pin_id,
                        owner_id=(p.owner_id or u.id), name=datos.name, role=datos.role,
                        data_type=datos.data_type, direction=direction, unit=datos.unit,
                        min_val=datos.min_val, max_val=datos.max_val, formula=datos.formula)
    db.add(v); db.commit(); db.refresh(v)
    log(db, u.email, "crear_variable", f"Variable '{v.name}' en planta #{pid}")
    return v

@app.put("/api/variables/{vid}", response_model=schemas.VariableOut)
def actualizar_variable(vid: int, datos: schemas.VariableUpdate,
                        u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    v = db.query(models.Variable).filter(models.Variable.id == vid).first()
    if not v:
        raise HTTPException(404, "Variable no encontrada")
    planta_con_control(db, v.plant_id, u, "configurar")
    if datos.name is not None:
        if not VAR_NAME_RE.match(datos.name):
            raise HTTPException(400, "Nombre inválido")
        dup = db.query(models.Variable).filter(models.Variable.plant_id == v.plant_id,
                                               models.Variable.name == datos.name,
                                               models.Variable.id != v.id).first()
        if dup:
            raise HTTPException(400, "Ya existe una variable con ese nombre en la planta")
        v.name = datos.name
    if datos.role is not None:
        if datos.role not in ROLES_VALIDOS:
            raise HTTPException(400, "role inválido")
        v.role = datos.role
    if datos.data_type is not None:
        if datos.data_type not in TIPOS_VALIDOS:
            raise HTTPException(400, "data_type inválido")
        v.data_type = datos.data_type
    if datos.direction is not None:
        if datos.direction not in DIRECCIONES_VALIDAS:
            raise HTTPException(400, "direction inválida")
        v.direction = datos.direction
    for campo in ("unit", "min_val", "max_val", "formula", "desired_value"):
        val = getattr(datos, campo)
        if val is not None:
            setattr(v, campo, val)
    if datos.device_id is not None:
        dev = db.query(models.Device).filter(models.Device.id == datos.device_id).first()
        if not dev or dev.plant_id != v.plant_id:
            raise HTTPException(400, "device_id no pertenece a la planta")
        v.device_id = datos.device_id
    if datos.pin_id is not None:
        dev = (db.query(models.Device).filter(models.Device.id == v.device_id).first()
               if v.device_id else None)
        if dev is None:
            raise HTTPException(400, "pin_id requiere device_id")
        pin = db.query(models.McuPin).filter(models.McuPin.id == datos.pin_id).first()
        if not pin or pin.mcu_id != dev.mcu_id:
            raise HTTPException(400, "pin_id no corresponde al MCU del dispositivo")
        dup = db.query(models.Variable).filter(models.Variable.device_id == dev.id,
                                               models.Variable.pin_id == datos.pin_id,
                                               models.Variable.id != v.id).first()
        if dup:
            raise HTTPException(400, "Ese pin ya está asignado a otra variable")
        v.pin_id = datos.pin_id
    v.updated_at = datetime.utcnow()
    db.commit(); db.refresh(v)
    log(db, u.email, "editar_variable", f"Editó variable #{vid} ({v.name})")
    return v

@app.delete("/api/variables/{vid}")
def eliminar_variable(vid: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    v = db.query(models.Variable).filter(models.Variable.id == vid).first()
    if not v:
        raise HTTPException(404, "Variable no encontrada")
    planta_con_control(db, v.plant_id, u, "configurar")
    nombre = v.name
    db.delete(v); db.commit()
    log(db, u.email, "eliminar_variable", f"Eliminó variable #{vid} ({nombre})")
    return {"ok": True}

# ─── Histórico / comandos genéricos por variable ──────────────────
@app.get("/api/variables/{vid}/readings", response_model=List[schemas.ReadingOut])
def variable_readings(vid: int, limite: int = 500,
                      desde: Optional[str] = None, hasta: Optional[str] = None,
                      u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    v = db.query(models.Variable).filter(models.Variable.id == vid).first()
    if not v:
        raise HTTPException(404, "Variable no encontrada")
    p = db.query(models.Planta).filter(models.Planta.id == v.plant_id).first()
    if not p or not _tiene_acceso(db, p, u):
        raise HTTPException(403, "No autorizado")
    q = db.query(models.Reading).filter(models.Reading.variable_id == vid)
    if desde:
        try: q = q.filter(models.Reading.ts >= datetime.fromisoformat(desde))
        except: pass
    if hasta:
        try: q = q.filter(models.Reading.ts <= datetime.fromisoformat(hasta))
        except: pass
    return q.order_by(models.Reading.ts.desc()).limit(min(max(limite, 1), 5000)).all()

@app.get("/api/variables/{vid}/commands", response_model=List[schemas.CommandOutGen])
def variable_commands(vid: int, limite: int = 100,
                      u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    v = db.query(models.Variable).filter(models.Variable.id == vid).first()
    if not v:
        raise HTTPException(404, "Variable no encontrada")
    _check_owner(v.owner_id, u)
    return (db.query(models.Command)
              .filter(models.Command.variable_id == vid)
              .order_by(models.Command.issued_at.desc())
              .limit(min(max(limite, 1), 1000)).all())

@app.post("/api/variables/{vid}/command", response_model=schemas.CommandOutGen)
def crear_comando_variable(vid: int, datos: schemas.CommandCreate,
                           u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    """Envía un comando a una variable actuador/salida (operar la planta)."""
    v = db.query(models.Variable).filter(models.Variable.id == vid).first()
    if not v:
        raise HTTPException(404, "Variable no encontrada")
    if v.role not in ("actuator", "setpoint") and v.direction != "output":
        raise HTTPException(400, "La variable no admite comandos (no es actuador/salida)")
    p = db.query(models.Planta).filter(models.Planta.id == v.plant_id).first()
    if not p or not _puede_gestionar_planta(db, p, u, "operar"):
        raise HTTPException(403, "No autorizado para operar esta planta")
    cmd = models.Command(variable_id=vid, owner_id=v.owner_id, value=datos.value,
                         issued_at=datetime.utcnow(),
                         status="pending", issued_by=u.email, source="hmi")
    db.add(cmd); db.commit(); db.refresh(cmd)
    log(db, u.email, "comando", f"Var #{vid} = {datos.value}")
    return cmd


# ─── SENSORES PLANTA 1 ───────────────────────────────────────────
@app.post("/api/lecturas",response_model=schemas.LecturaOut)
def crear_lectura(l:schemas.LecturaCreate,db:Session=Depends(get_db)):
    db_l=models.Lectura(**l.model_dump());db.add(db_l);db.commit();db.refresh(db_l);return db_l

@app.get("/api/lecturas/ultima",response_model=schemas.LecturaOut|None)
def ultima(db:Session=Depends(get_db)):
    return db.query(models.Lectura).order_by(desc(models.Lectura.id)).first()

@app.get("/api/lecturas/historial",response_model=List[schemas.LecturaOut])
def historial(minutos:int=30,db:Session=Depends(get_db)):
    d=datetime.utcnow()-timedelta(minutes=minutos)
    return db.query(models.Lectura).filter(models.Lectura.timestamp>=d).order_by(models.Lectura.timestamp).all()

@app.get("/api/comando",response_model=schemas.ComandoOut)
def get_cmd(db:Session=Depends(get_db)):
    c=db.query(models.Comando).filter(models.Comando.id==1).first()
    if not c:c=models.Comando(id=1,bomba_deseada=True,valvula_deseada=False,version=0);db.add(c);db.commit();db.refresh(c)
    return c

@app.post("/api/admin/comando",response_model=schemas.ComandoOut)
async def set_cmd(datos:schemas.ComandoUpdate,u=Depends(obtener_usuario_actual),db:Session=Depends(get_db)):
    c=db.query(models.Comando).filter(models.Comando.id==1).first()
    if not c:c=models.Comando(id=1);db.add(c)
    c.bomba_deseada=datos.bomba_deseada;c.valvula_deseada=datos.valvula_deseada;c.version+=1
    db.commit();db.refresh(c)
    await gestor_esp32.enviar_comando(json.dumps({"bomba_deseada":c.bomba_deseada,"valvula_deseada":c.valvula_deseada,"version":c.version}))
    log(db,u.email,"control_p1",f"Bomba:{'ON' if datos.bomba_deseada else 'OFF'} Valvula:{'ON' if datos.valvula_deseada else 'OFF'}")
    return c

# ─── SENSORES PLANTA 2 ───────────────────────────────────────────
@app.post("/api/lecturas/planta2",response_model=schemas.LecturaPlanta2Out)
def lect_p2(l:schemas.LecturaPlanta2Create,db:Session=Depends(get_db)):
    x=models.LecturaPlanta2(**l.model_dump());db.add(x);db.commit();db.refresh(x);return x

@app.get("/api/lecturas/planta2/ultima",response_model=schemas.LecturaPlanta2Out|None)
def ultima_p2(db:Session=Depends(get_db)):
    return db.query(models.LecturaPlanta2).order_by(desc(models.LecturaPlanta2.id)).first()

@app.get("/api/lecturas/planta2/historial",response_model=List[schemas.LecturaPlanta2Out])
def hist_p2(minutos:int=30,db:Session=Depends(get_db)):
    d=datetime.utcnow()-timedelta(minutes=minutos)
    return db.query(models.LecturaPlanta2).filter(models.LecturaPlanta2.timestamp>=d).order_by(models.LecturaPlanta2.timestamp).all()

@app.get("/api/comando/planta2",response_model=schemas.ComandoPlanta2Out)
def get_cmd_p2(db:Session=Depends(get_db)):
    c=db.query(models.ComandoPlanta2).filter(models.ComandoPlanta2.id==1).first()
    if not c:c=models.ComandoPlanta2(id=1);db.add(c);db.commit();db.refresh(c)
    return c

@app.post("/api/admin/comando/planta2",response_model=schemas.ComandoPlanta2Out)
async def set_cmd_p2(datos:schemas.ComandoPlanta2Update,u=Depends(obtener_usuario_actual),db:Session=Depends(get_db)):
    c=db.query(models.ComandoPlanta2).filter(models.ComandoPlanta2.id==1).first()
    if not c:c=models.ComandoPlanta2(id=1);db.add(c)
    c.valvula_deseada=datos.valvula_deseada;c.pwm_deseado=max(0,min(255,datos.pwm_deseado));c.version+=1
    db.commit();db.refresh(c)
    log(db,u.email,"control_p2",f"Valvula:{'ON' if datos.valvula_deseada else 'OFF'} PWM:{datos.pwm_deseado}")
    return c

# ─── WEBSOCKET ESP32 ─────────────────────────────────────────────
class GestorESP32:
    def __init__(self): self.conexiones: set[WebSocket] = set()
    async def conectar(self,ws): await ws.accept(); self.conexiones.add(ws)
    def desconectar(self,ws): self.conexiones.discard(ws)
    async def enviar_comando(self,msg):
        muertas=set()
        for ws in list(self.conexiones):
            try: await ws.send_text(msg)
            except: muertas.add(ws)
        self.conexiones-=muertas

gestor_esp32=GestorESP32()

@app.websocket("/ws/esp32")
async def ws_esp32(ws:WebSocket):
    db=SessionLocal();await gestor_esp32.conectar(ws)
    try:
        c=db.query(models.Comando).filter(models.Comando.id==1).first()
        if c:await ws.send_text(json.dumps({"bomba_deseada":c.bomba_deseada,"valvula_deseada":c.valvula_deseada,"version":c.version}))
        while True:
            try:await asyncio.wait_for(ws.receive_text(),timeout=25.0)
            except asyncio.TimeoutError:await ws.send_text('{"ping":1}')
    except WebSocketDisconnect:pass
    finally:gestor_esp32.desconectar(ws);db.close()

# ─── CÁMARA (MULTI-CANAL: una cámara por planta/ubicación) ───────
# Cada cámara tiene un NOMBRE DE CANAL. La laptop empuja a ese canal y el
# widget lo ve por una URL propia:  /video-en-vivo/<canal>
class CanalCamara:
    def __init__(self):
        self.visores: set[asyncio.Queue] = set()
        self.ultimo_frame: bytes|None = None
        self.ultimo_ts: float = 0.0
    def registrar_visor(self):
        q=asyncio.Queue(maxsize=2); self.visores.add(q); return q
    def quitar_visor(self,q):
        self.visores.discard(q)
    async def difundir(self,frame):
        self.ultimo_frame=frame; self.ultimo_ts=time_lib.time()
        for q in list(self.visores):
            if q.full():
                try:q.get_nowait()
                except:pass
            try:q.put_nowait(frame)
            except:pass

_canales: dict[str,CanalCamara] = {}
def _get_canal(nombre:str)->CanalCamara:
    nombre=(nombre or "default").strip() or "default"
    ch=_canales.get(nombre)
    if ch is None:
        ch=CanalCamara(); _canales[nombre]=ch
    return ch

CAMARA_SECRET=os.environ.get("CAMARA_PUSH_SECRET","cambia-este-secreto")

# ── Multi-canal ─────────────────────────────────────────────────
@app.websocket("/ws/camara-push/{canal}")
async def ws_camara_push_canal(ws:WebSocket, canal:str):
    await ws.accept()
    try:secreto=await ws.receive_text()
    except WebSocketDisconnect:return
    if secreto!=CAMARA_SECRET:
        try:await ws.send_text("SECRETO_INVALIDO")
        except:pass
        await ws.close(code=4001);return
    try:await ws.send_text("OK")
    except:pass
    ch=_get_canal(canal)
    try:
        while True:
            frame=await ws.receive_bytes()
            await ch.difundir(frame)
    except WebSocketDisconnect:pass

@app.get("/video-en-vivo/{canal}")
async def video_vivo_canal(canal:str):
    ch=_get_canal(canal)
    cola=ch.registrar_visor()
    async def gen():
        try:
            while True:
                f=await cola.get()
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"+f+b"\r\n"
        except asyncio.CancelledError:pass
        finally:ch.quitar_visor(cola)
    return StreamingResponse(gen(),media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/api/camara-remota/{canal}")
def camara_snapshot_canal(canal:str):
    ch=_canales.get((canal or "default").strip() or "default")
    if not ch or not ch.ultimo_frame:raise HTTPException(503,"No disponible")
    if time_lib.time()-ch.ultimo_ts>5:raise HTTPException(503,"Sin senal")
    return Response(content=ch.ultimo_frame,media_type="image/jpeg")

@app.get("/api/camaras")
def listar_camaras():
    ahora=time_lib.time()
    return [{"canal":n,"activa":bool(c.ultimo_frame) and (ahora-c.ultimo_ts)<5}
            for n,c in _canales.items()]

# ── Compatibilidad: canal "default" (lo que ya usabas) ───────────
@app.post("/api/camara-frame")
async def recv_frame(request:Request,x_camara_secret:str=Header(None)):
    if x_camara_secret!=CAMARA_SECRET:raise HTTPException(401,"Secreto incorrecto")
    cuerpo=await request.body()
    if not cuerpo:raise HTTPException(400,"Vacio")
    await _get_canal("default").difundir(cuerpo)
    return {"ok":True}

@app.get("/api/camara-remota")
def camara_remota():
    return camara_snapshot_canal("default")

@app.websocket("/ws/camara-push")
async def ws_camara(ws:WebSocket):
    await ws.accept()
    try:secreto=await ws.receive_text()
    except WebSocketDisconnect:return
    if secreto!=CAMARA_SECRET:
        try:await ws.send_text("SECRETO_INVALIDO")
        except:pass
        await ws.close(code=4001);return
    try:await ws.send_text("OK")
    except:pass
    ch=_get_canal("default")
    try:
        while True:
            frame=await ws.receive_bytes()
            await ch.difundir(frame)
    except WebSocketDisconnect:pass

@app.get("/video-en-vivo")
async def video_vivo():
    return await video_vivo_canal("default")