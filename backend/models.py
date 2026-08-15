"""
models.py — Modelos de base de datos del sistema HMI.

TABLAS EXISTENTES (acuicultura, NO se tocan su comportamiento):
  plantas          — cada planta con su HMI (layout_json)
  lecturas         — sensores Planta 1 (ESP32)
  comando          — comando deseado Planta 1
  lecturas_planta2 — sensores Planta 2 (Arduino UNO)
  comando_planta2  — comando deseado Planta 2
  usuarios         — Admin y Admin Pro con roles
  hmi_layout       — diseño legacy del editor HMI
  notificaciones   — notificaciones entre usuarios
  comentarios      — solicitudes con justificación del Admin al Admin Pro
  permisos_temporales — tokens temporales para el editor
  audit_log        — historial de todo
  mensajes         — heredada

TABLAS NUEVAS — FASE 1 (modelo multi-tenant genérico):
  Catálogo global (sembrado desde código, no es de nadie):
    microcontrollers — catálogo de MCU
    mcu_pins         — pines reales de cada MCU (GPIO5 = GPIO5 real)
  Inquilino (con dueño directo o heredado por la cadena de FKs):
    devices          — dispositivo físico en una planta, basado en un MCU
    device_tokens    — credencial del dispositivo (hasheada y revocable)
    variables        — el corazón: sensores/actuadores NO son tablas aparte
    readings         — histórico genérico (reemplaza a "lecturas" cableadas)
    commands         — comandos genéricos (reemplaza a "comando" cableado)

Principios:
  - Los "enum" se guardan como String (portátil SQLite/Postgres).
  - owner_id en plants (raíz de la tenencia); desnormalizado en tablas
    calientes (devices/variables/readings/commands) para filtrar directo.
  - Se mantienen las 2 plantas actuales en paralelo (columnas fijas intactas).
"""
from sqlalchemy import (
    Column, Integer, Float, Boolean, DateTime, String, Text, ForeignKey,
    JSON, UniqueConstraint, Index
)
from sqlalchemy.sql import func
from database import Base


# ─── PLANTAS ────────────────────────────────────────────────────
class Planta(Base):
    """
    Cada Planta tiene su propio HMI diseñado visualmente.
    El layout_json guarda el diseño completo del editor.

    FASE 1: se añade owner_id (nullable) como raíz de la tenencia.
    Es nullable para no romper filas existentes; la migración lo
    rellena (backfill) con el AdminPro.
    """
    __tablename__ = "plantas"
    id          = Column(Integer, primary_key=True, index=True)
    nombre      = Column(String, nullable=False)
    descripcion = Column(Text, default="")
    layout_json = Column(Text, default="{}")
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, nullable=True)
    created_by  = Column(String, nullable=True)
    updated_by  = Column(String, nullable=True)
    owner_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)

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
    # Jerarquía: Supervisor (admin_pro) puede tener Operadores; un Operador
    # puede tener Empleados. El campo apunta al responsable directo.
    supervisor_id           = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"),
                                     nullable=True, index=True)


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
    Permiso temporal granular para un Empleado.
    Puede concederlo el Supervisor o el Operador responsable del Empleado.
    Se limita opcionalmente a una planta y a capacidades concretas.
    """
    __tablename__ = "permisos_temporales"
    id               = Column(Integer, primary_key=True, index=True)
    token            = Column(String, unique=True, index=True, nullable=False)
    para_usuario     = Column(String, nullable=False)   # email del receptor
    otorgado_por     = Column(String, nullable=False)   # email del Supervisor/Operador
    permiso          = Column(String, default="editor") # compatibilidad: editor/configurar/operar
    plant_id         = Column(Integer, ForeignKey("plantas.id", ondelete="CASCADE"),
                              nullable=True, index=True)
    puede_editar     = Column(Boolean, default=False)
    puede_configurar = Column(Boolean, default=False)
    puede_operar     = Column(Boolean, default=False)
    puede_dispositivos = Column(Boolean, default=False)
    duracion_min     = Column(Integer, default=60)
    expires_at       = Column(DateTime, nullable=False)
    usado            = Column(Boolean, default=False)
    used_at          = Column(DateTime, nullable=True)
    created_at       = Column(DateTime, server_default=func.now())
    comentario_id    = Column(Integer, nullable=True)

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


# ══════════════════════════════════════════════════════════════════
#  FASE 1 — MODELO MULTI-TENANT GENÉRICO
# ══════════════════════════════════════════════════════════════════

# ─── CATÁLOGO GLOBAL: MICROCONTROLADORES ──────────────────────────
class Microcontroller(Base):
    """
    Catálogo de MCU disponibles para todas las plantas.
    Se siembra desde catalog_seed.py (fuente de verdad en código).
    """
    __tablename__ = "microcontrollers"
    id         = Column(Integer, primary_key=True, index=True)
    code       = Column(String, unique=True, index=True, nullable=False)  # esp32, arduino_uno...
    name       = Column(String, nullable=False)
    vendor     = Column(String, nullable=True)
    family     = Column(String, nullable=True)
    has_wifi   = Column(Boolean, default=False)
    num_gpio   = Column(Integer, default=0)
    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


# ─── CATÁLOGO GLOBAL: PINES DE CADA MCU ───────────────────────────
class McuPin(Base):
    """
    Pines reales de cada MCU. Hace que "GPIO5 = GPIO5 real":
    el pin elegido en la web es el mismo que alimenta el firmware.
    caps: lista JSON de capacidades del pin
          (digital/analog_in/pwm/dac/input_only/i2c/spi/uart/reserved).
    """
    __tablename__ = "mcu_pins"
    id          = Column(Integer, primary_key=True, index=True)
    mcu_id      = Column(Integer, ForeignKey("microcontrollers.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    label       = Column(String, nullable=False)     # GPIO5 / D5 / A0
    gpio_number = Column(Integer, nullable=True)      # nº real (BCM/GPIO)
    caps        = Column(JSON, default=list)          # ["digital","pwm",...]
    note        = Column(String, nullable=True)
    order_idx   = Column(Integer, default=0)
    __table_args__ = (UniqueConstraint("mcu_id", "label", name="uq_mcu_pin_label"),)


# ─── DISPOSITIVOS (inquilino) ─────────────────────────────────────
class Device(Base):
    """
    Dispositivo físico dentro de una planta, basado en un MCU del catálogo.
    owner_id se desnormaliza desde la planta para filtrar directo (anti-IDOR
    + futura Row-Level Security en Postgres).
    """
    __tablename__ = "devices"
    id               = Column(Integer, primary_key=True, index=True)
    plant_id         = Column(Integer, ForeignKey("plantas.id", ondelete="CASCADE"),
                              nullable=False, index=True)
    mcu_id           = Column(Integer, ForeignKey("microcontrollers.id"), nullable=False)
    owner_id         = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    name             = Column(String, nullable=False)
    device_uid       = Column(String, unique=True, index=True, nullable=False)  # público
    status           = Column(String, default="unknown")   # online | offline | unknown
    last_seen_at     = Column(DateTime, nullable=True)
    firmware_version = Column(String, nullable=True)
    created_at       = Column(DateTime, server_default=func.now())


# ─── TOKENS DE DISPOSITIVO (credencial revocable) ─────────────────
class DeviceToken(Base):
    """
    Credencial del dispositivo. NUNCA se guarda en claro:
    solo token_hash (SHA-256) y token_prefix. El token completo se
    muestra UNA sola vez al crear/regenerar el dispositivo.
    """
    __tablename__ = "device_tokens"
    id           = Column(Integer, primary_key=True, index=True)
    device_id    = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    token_hash   = Column(String, unique=True, index=True, nullable=False)
    token_prefix = Column(String, nullable=True)     # primeros chars, para identificar
    token_plain  = Column(String, nullable=True)     # token en claro (visible solo al dueño)
    created_at   = Column(DateTime, server_default=func.now())
    expires_at   = Column(DateTime, nullable=True)
    revoked_at   = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)


# ─── VARIABLES (el corazón del modelo) ────────────────────────────
class Variable(Base):
    """
    Variable de una planta. Sensores y actuadores NO son tablas aparte:
    se distinguen por 'role'. El pin físico se referencia por pin_id (FK a
    mcu_pins) y el dispositivo por device_id.
      role       : sensor | actuator | setpoint | indicator | calculated
      data_type  : float | int | bool | string
      direction  : input | output | virtual
    formula se evaluará (fases posteriores) con un evaluador SEGURO, NO eval().
    Restricciones: UNIQUE(plant_id, name) y UNIQUE(device_id, pin_id)
    (un pin físico = una sola variable).
    """
    __tablename__ = "variables"
    id            = Column(Integer, primary_key=True, index=True)
    plant_id      = Column(Integer, ForeignKey("plantas.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    device_id     = Column(Integer, ForeignKey("devices.id", ondelete="SET NULL"),
                           nullable=True, index=True)
    pin_id        = Column(Integer, ForeignKey("mcu_pins.id", ondelete="SET NULL"),
                           nullable=True)
    owner_id      = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    name          = Column(String, nullable=False)
    role          = Column(String, nullable=False)   # sensor|actuator|setpoint|indicator|calculated
    data_type     = Column(String, nullable=False, default="float")  # float|int|bool|string
    direction     = Column(String, nullable=False, default="input")  # input|output|virtual
    unit          = Column(String, nullable=True)
    min_val       = Column(Float, nullable=True)
    max_val       = Column(Float, nullable=True)
    formula       = Column(Text, nullable=True)
    current_value = Column(Float, nullable=True)
    text_value    = Column(String, nullable=True)
    desired_value = Column(Float, nullable=True)
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, nullable=True)
    __table_args__ = (
        UniqueConstraint("plant_id", "name", name="uq_variable_plant_name"),
        UniqueConstraint("device_id", "pin_id", name="uq_variable_device_pin"),
    )


# ─── HISTÓRICO GENÉRICO ───────────────────────────────────────────
class Reading(Base):
    """
    Histórico genérico de valores por variable. Reemplaza a las tablas
    'lecturas' cableadas a acuicultura para las plantas nuevas.
    """
    __tablename__ = "readings"
    id          = Column(Integer, primary_key=True, index=True)
    variable_id = Column(Integer, ForeignKey("variables.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    owner_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    value       = Column(Float, nullable=True)
    text_value  = Column(String, nullable=True)
    ts          = Column(DateTime, server_default=func.now(), index=True)
    __table_args__ = (Index("ix_readings_variable_ts", "variable_id", "ts"),)


# ─── COMANDOS GENÉRICOS ───────────────────────────────────────────
class Command(Base):
    """
    Comando genérico sobre una variable actuadora. Reemplaza a las tablas
    'comando' cableadas para las plantas nuevas.
      status: pending | sent | acked | failed
      source: hmi | api
    """
    __tablename__ = "commands"
    id           = Column(Integer, primary_key=True, index=True)
    variable_id  = Column(Integer, ForeignKey("variables.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    owner_id     = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    value        = Column(Float, nullable=True)
    status       = Column(String, default="pending")   # pending|sent|acked|failed
    issued_by    = Column(String, nullable=True)        # email
    issued_at    = Column(DateTime, server_default=func.now())
    delivered_at = Column(DateTime, nullable=True)
    acked_at     = Column(DateTime, nullable=True)
    source       = Column(String, default="hmi")        # hmi|api


# ══════════════════════════════════════════════════════════════════
#  FASE 3 — RBAC: asignación granular de plantas por usuario
# ══════════════════════════════════════════════════════════════════
class PlantAccess(Base):
    """
    Acceso explícito de un usuario (Operador o Empleado) a una planta.
    - Sin fila => el usuario NO ve la planta.
    - can_edit => control permanente de edición para el Operador asignado.
      El Empleado usa permisos temporales granulares; la fila por sí sola
      no le concede edición.
    El Supervisor NO necesita filas: ve/gestiona las plantas que posee
    (owner_id). Roles: 'admin_pro'=Supervisor, 'admin'=Operador,
    'empleado'=Empleado.
    """
    __tablename__ = "plant_access"
    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    plant_id   = Column(Integer, ForeignKey("plantas.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    can_edit   = Column(Boolean, default=False)   # solo aplica a Operador
    granted_by = Column(String, nullable=True)    # email de quien asignó
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("user_id", "plant_id", name="uq_user_plant"),)
