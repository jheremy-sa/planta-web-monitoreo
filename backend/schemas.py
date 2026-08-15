"""schemas.py — Validación de datos de entrada y salida."""
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List


# ─── Sensores Planta 1 ────────────────────────────────────────────
class LecturaCreate(BaseModel):
    nivel: float; caudal: float; temp_ambiente: float; humedad: float
    temp_agua: float; flotador_bajo: bool; flotador_alto: bool
    bomba_estado: bool; valvula_estado: bool

class LecturaOut(LecturaCreate):
    id: int; timestamp: datetime
    class Config: from_attributes = True

class ComandoUpdate(BaseModel):
    bomba_deseada: bool; valvula_deseada: bool

class ComandoOut(BaseModel):
    bomba_deseada: bool; valvula_deseada: bool; version: int
    class Config: from_attributes = True


# ─── Sensores Planta 2 ────────────────────────────────────────────
class LecturaPlanta2Create(BaseModel):
    nivel: float; caudal: float; bomba_estado: bool; valvula_estado: bool

class LecturaPlanta2Out(LecturaPlanta2Create):
    id: int; timestamp: datetime
    class Config: from_attributes = True

class ComandoPlanta2Update(BaseModel):
    valvula_deseada: bool; pwm_deseado: int

class ComandoPlanta2Out(BaseModel):
    valvula_deseada: bool; pwm_deseado: int; version: int
    class Config: from_attributes = True


# ─── Autenticación ───────────────────────────────────────────────
class LoginInput(BaseModel):
    email: str; password: str

class TokenOut(BaseModel):
    access_token: str; token_type: str = "bearer"; role: str; username: str

class CambiarPasswordInput(BaseModel):
    password_actual: str; password_nueva: str

class SolicitarResetInput(BaseModel):
    email: str


# ─── Usuarios (Admin Pro) ─────────────────────────────────────────
class UsuarioCreate(BaseModel):
    email: str; username: str; password: str; role: str = "admin"

class UsuarioOut(BaseModel):
    id: int; email: str; username: str; role: str
    is_active: bool; created_at: datetime; last_login: Optional[datetime]
    must_change_password: bool
    supervisor_id: Optional[int] = None
    class Config: from_attributes = True

class UsuarioUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    supervisor_id: Optional[int] = None


# ─── HMI Layout ──────────────────────────────────────────────────
class HMILayoutSave(BaseModel):
    layout_json: str

class HMILayoutOut(BaseModel):
    id: int; nombre: str; layout_json: str; updated_at: datetime
    updated_by: Optional[str]
    class Config: from_attributes = True


# ─── Notificaciones ──────────────────────────────────────────────
class NotificacionOut(BaseModel):
    id: int; para: str; de: Optional[str]; tipo: str
    titulo: str; mensaje: str; leida: bool; created_at: datetime
    payload: Optional[str]
    class Config: from_attributes = True


# ─── Comentarios ─────────────────────────────────────────────────
class ComentarioCreate(BaseModel):
    tipo: str = "general"
    asunto: str
    justificacion: str

class ComentarioOut(BaseModel):
    id: int; de_usuario: str; tipo: str; asunto: str; justificacion: str
    estado: str; respuesta: Optional[str]; respondido_por: Optional[str]
    created_at: datetime; respondido_at: Optional[datetime]
    class Config: from_attributes = True

class ResponderComentario(BaseModel):
    respuesta: str; aprobar: bool = True


# ─── Permisos Temporales ─────────────────────────────────────────
class PermisoTemporalCreate(BaseModel):
    para_usuario: str
    plant_id: Optional[int] = None
    duracion_min: int = 60
    puede_editar: bool = False
    puede_configurar: bool = False
    puede_operar: bool = False
    puede_dispositivos: bool = False
    # Compatibilidad con el frontend antiguo.
    comentario_id: Optional[int] = None

class VerificarToken(BaseModel):
    token: str

class PermisoTemporalOut(BaseModel):
    id: int
    token: str
    para_usuario: str
    otorgado_por: str
    plant_id: Optional[int] = None
    puede_editar: bool = False
    puede_configurar: bool = False
    puede_operar: bool = False
    puede_dispositivos: bool = False
    duracion_min: int
    expires_at: datetime
    usado: bool
    created_at: datetime
    class Config: from_attributes = True


# ─── Audit Log ───────────────────────────────────────────────────
class AuditLogOut(BaseModel):
    id: int; timestamp: datetime; usuario: Optional[str]
    accion: str; descripcion: str; detalle: Optional[str]
    class Config: from_attributes = True

# ─── PLANTAS ─────────────────────────────────────────────────────
class PlantaCreate(BaseModel):
    nombre: str
    descripcion: str = ""

class PlantaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    layout_json: Optional[str] = None

class PlantaOut(BaseModel):
    id: int
    nombre: str
    descripcion: str
    layout_json: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]
    created_by: Optional[str]
    updated_by: Optional[str]
    owner_id: Optional[int] = None
    class Config: from_attributes = True


# ══════════════════════════════════════════════════════════════════
#  FASE 1 — SCHEMAS DEL MODELO MULTI-TENANT
# ══════════════════════════════════════════════════════════════════

# ─── Catálogo de MCU / pines ──────────────────────────────────────
class McuOut(BaseModel):
    id: int; code: str; name: str
    vendor: Optional[str]; family: Optional[str]
    has_wifi: bool; num_gpio: int; notes: Optional[str]
    class Config: from_attributes = True

class McuPinOut(BaseModel):
    id: int; mcu_id: int; label: str
    gpio_number: Optional[int]; caps: List[str] = []
    note: Optional[str]; order_idx: int
    class Config: from_attributes = True


# ─── Dispositivos ─────────────────────────────────────────────────
class DeviceCreate(BaseModel):
    mcu_id: int
    name: str
    device_uid: Optional[str] = None       # si no se envía, se genera
    firmware_version: Optional[str] = None

class DeviceOut(BaseModel):
    id: int; plant_id: int; mcu_id: int; owner_id: Optional[int]
    name: str; device_uid: str; status: str
    last_seen_at: Optional[datetime]; firmware_version: Optional[str]
    created_at: datetime
    class Config: from_attributes = True

class DeviceCreatedOut(DeviceOut):
    # El token en claro se entrega UNA sola vez, al crear/regenerar.
    token: str
    token_prefix: str


# ─── Variables ────────────────────────────────────────────────────
class VariableCreate(BaseModel):
    name: str
    role: str                              # sensor|actuator|setpoint|indicator|calculated
    data_type: str = "float"               # float|int|bool|string
    direction: Optional[str] = None        # input|output|virtual (se deriva si falta)
    unit: Optional[str] = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    formula: Optional[str] = None
    device_id: Optional[int] = None
    pin_id: Optional[int] = None

class VariableUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    data_type: Optional[str] = None
    direction: Optional[str] = None
    unit: Optional[str] = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    formula: Optional[str] = None
    device_id: Optional[int] = None
    pin_id: Optional[int] = None
    desired_value: Optional[float] = None

class VariableOut(BaseModel):
    id: int; plant_id: int; device_id: Optional[int]; pin_id: Optional[int]
    owner_id: Optional[int]; name: str; role: str; data_type: str; direction: str
    unit: Optional[str]; min_val: Optional[float]; max_val: Optional[float]
    formula: Optional[str]; current_value: Optional[float]
    text_value: Optional[str]; desired_value: Optional[float]
    created_at: datetime; updated_at: Optional[datetime]
    class Config: from_attributes = True


# ─── Histórico / comandos genéricos ───────────────────────────────
class ReadingOut(BaseModel):
    id: int; variable_id: int; value: Optional[float]
    text_value: Optional[str]; ts: datetime
    class Config: from_attributes = True

class CommandOutGen(BaseModel):
    id: int; variable_id: int; value: Optional[float]; status: str
    issued_by: Optional[str]; issued_at: datetime
    delivered_at: Optional[datetime]; acked_at: Optional[datetime]; source: str
    class Config: from_attributes = True


# ─── FASE 3: RBAC / asignación de plantas ────────────────────────
class PlantAccessOut(BaseModel):
    id: int
    user_id: int
    plant_id: int
    can_edit: bool
    class Config: from_attributes = True

class AssignPlantsInput(BaseModel):
    plant_ids: List[int] = []
    can_edit: bool = False


class CommandCreate(BaseModel):
    value: Optional[float] = None

# ── FIX #5 ── Schema para modificar permisos temporales (PUT /api/permisos-temp/{ptid})
class PermisoTemporalUpdate(BaseModel):
    """Campos opcionales para modificar un permiso temporal existente."""
    puede_editar: Optional[bool] = None
    puede_configurar: Optional[bool] = None
    puede_operar: Optional[bool] = None
    puede_dispositivos: Optional[bool] = None
    duracion_min: Optional[int] = None      # Si se cambia, se recalcula expires_at desde ahora

