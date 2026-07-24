"""
models.py — Modelos de base de datos del sistema HMI.

Tablas nuevas (además de las ya existentes de sensores):
  usuarios        — Admin y Admin Pro con roles
  hmi_layout      — diseño guardado del editor HMI (JSON serializado)
  notificaciones  — notificaciones en tiempo real entre usuarios
  comentarios     — solicitudes con justificación del Admin al Admin Pro
  permisos_temp   — tokens temporales para acceder al editor de planta
  audit_log       — historial de absolutamente todo
"""
from sqlalchemy import (
    Column, Integer, Float, Boolean, DateTime, String, Text, ForeignKey
)
from sqlalchemy.sql import func
from database import Base


# ─── Sensores Planta 1 (existente, sin cambios) ───────────────────
class Lectura(Base):
    __tablename__ = "lecturas"
    id             = Column(Integer, primary_key=True, index=True)
    timestamp      = Column(DateTime, server_default=func.now())
    nivel          = Column(Float)
    caudal         = Column(Float)
    temp_ambiente  = Column(Float)
    humedad        = Column(Float)
    temp_agua      = Column(Float)
    flotador_bajo  = Column(Boolean)
    flotador_alto  = Column(Boolean)
    bomba_estado   = Column(Boolean)
    valvula_estado = Column(Boolean)


class Comando(Base):
    __tablename__ = "comando"
    id              = Column(Integer, primary_key=True, index=True)
    bomba_deseada   = Column(Boolean, default=True)
    valvula_deseada = Column(Boolean, default=False)
    version         = Column(Integer, default=0)


# ─── Sensores Planta 2 (Arduino UNO) ─────────────────────────────
class LecturaPlanta2(Base):
    __tablename__ = "lecturas_planta2"
    id             = Column(Integer, primary_key=True, index=True)
    timestamp      = Column(DateTime, server_default=func.now())
    nivel          = Column(Float)
    caudal         = Column(Float)
    bomba_estado   = Column(Boolean)
    valvula_estado = Column(Boolean)


class ComandoPlanta2(Base):
    __tablename__ = "comando_planta2"
    id              = Column(Integer, primary_key=True, index=True)
    valvula_deseada = Column(Boolean, default=False)
    pwm_deseado     = Column(Integer, default=0)
    version         = Column(Integer, default=0)


# ─── USUARIOS ─────────────────────────────────────────────────────
class Usuario(Base):
    """
    Tabla de usuarios del sistema HMI.
    Roles:
      admin     — puede ver y controlar, NO puede editar el HMI
      admin_pro — control total, puede editar HMI y gestionar usuarios
    """
    __tablename__ = "usuarios"
    id                     = Column(Integer, primary_key=True, index=True)
    email                  = Column(String, unique=True, index=True, nullable=False)
    username               = Column(String, unique=True, index=True, nullable=False)
    password_hash          = Column(String, nullable=False)
    role                   = Column(String, default="admin")   # "admin" | "admin_pro"
    is_active              = Column(Boolean, default=True)
    created_at             = Column(DateTime, server_default=func.now())
    last_login             = Column(DateTime, nullable=True)
    # Contraseña temporal para recuperación
    temp_password_hash     = Column(String, nullable=True)
    temp_password_expires  = Column(DateTime, nullable=True)
    must_change_password   = Column(Boolean, default=False)


# ─── HMI LAYOUT ──────────────────────────────────────────────────
class HMILayout(Base):
    """
    Guarda el diseño del editor HMI serializado como JSON.
    El editor JS usa HMIState.serialize() para guardar y
    HMIState.deserialize() para restaurar.
    """
    __tablename__ = "hmi_layout"
    id          = Column(Integer, primary_key=True, index=True)
    nombre      = Column(String, default="Principal")
    layout_json = Column(Text, nullable=False, default="{}")
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())
    updated_by  = Column(String, nullable=True)


# ─── NOTIFICACIONES ──────────────────────────────────────────────
class Notificacion(Base):
    """
    Notificaciones en tiempo real entre usuarios.
    El sistema usa polling (GET cada 3s) porque WebSocket ya
    está ocupado por la cámara y el ESP32.
    """
    __tablename__ = "notificaciones"
    id         = Column(Integer, primary_key=True, index=True)
    para       = Column(String, nullable=False)    # email del destinatario
    de         = Column(String, nullable=True)     # email del remitente (null=sistema)
    tipo       = Column(String, nullable=False)    # solicitud_editor | respuesta | alarma | sistema
    titulo     = Column(String, nullable=False)
    mensaje    = Column(Text, nullable=False)
    leida      = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    payload    = Column(Text, nullable=True)       # JSON extra (id de solicitud, etc.)


# ─── COMENTARIOS / SOLICITUDES ───────────────────────────────────
class Comentario(Base):
    """
    Solicitudes y comentarios del Admin al Admin Pro.
    Cada comentario requiere justificación obligatoria.
    """
    __tablename__ = "comentarios"
    id             = Column(Integer, primary_key=True, index=True)
    de_usuario     = Column(String, nullable=False)      # email del que envía
    tipo           = Column(String, default="general")   # general | solicitud_accion | solicitud_editor
    asunto         = Column(String, nullable=False)
    justificacion  = Column(Text, nullable=False)        # obligatorio
    estado         = Column(String, default="pendiente") # pendiente | respondido | rechazado
    respuesta      = Column(Text, nullable=True)
    respondido_por = Column(String, nullable=True)
    created_at     = Column(DateTime, server_default=func.now())
    respondido_at  = Column(DateTime, nullable=True)


# ─── PERMISOS TEMPORALES (editor de planta) ──────────────────────
class PermisoTemporal(Base):
    """
    Token de acceso temporal al Editor de Planta.
    El Admin Pro genera un token único con tiempo de expiración.
    El Admin lo ingresa para desbloquear el editor temporalmente.
    Cada token es de un solo uso efectivo (se marca como usado al ingresar).
    """
    __tablename__ = "permisos_temporales"
    id             = Column(Integer, primary_key=True, index=True)
    token          = Column(String, unique=True, index=True, nullable=False)
    para_usuario   = Column(String, nullable=False)   # email del Admin que lo recibe
    otorgado_por   = Column(String, nullable=False)   # email del Admin Pro
    permiso        = Column(String, default="editor") # tipo de permiso
    duracion_min   = Column(Integer, default=60)      # duración en minutos
    expires_at     = Column(DateTime, nullable=False)
    usado          = Column(Boolean, default=False)
    used_at        = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, server_default=func.now())
    comentario_id  = Column(Integer, nullable=True)   # solicitud asociada


# ─── AUDIT LOG ───────────────────────────────────────────────────
class AuditLog(Base):
    """
    Historial de ABSOLUTAMENTE todo lo que ocurre en el sistema.
    Nunca se borra. Cada acción queda registrada con quién, qué, cuándo.
    """
    __tablename__ = "audit_log"
    id         = Column(Integer, primary_key=True, index=True)
    timestamp  = Column(DateTime, server_default=func.now())
    usuario    = Column(String, nullable=True)      # email (null = sistema/ESP32)
    accion     = Column(String, nullable=False)     # login | logout | bomba_on | etc.
    descripcion = Column(Text, nullable=False)
    detalle    = Column(Text, nullable=True)        # JSON extra
    ip         = Column(String, nullable=True)


# ─── Mensajes (existente, conservado) ────────────────────────────
class Mensaje(Base):
    __tablename__ = "mensajes"
    id                  = Column(Integer, primary_key=True, index=True)
    timestamp           = Column(DateTime, server_default=func.now())
    nombre              = Column(String, nullable=False)
    correo              = Column(String, nullable=False)
    contenido           = Column(String, nullable=False)
    respondido          = Column(Boolean, default=False)
    respuesta           = Column(String, nullable=True)
    respuesta_timestamp = Column(DateTime, nullable=True)
