"""schemas.py — Validación de datos de entrada y salida."""
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


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
    class Config: from_attributes = True

class UsuarioUpdate(BaseModel):
    role: Optional[str] = None; is_active: Optional[bool] = None


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
    para_usuario: str       # email del Admin
    duracion_min: int = 60  # 30 | 60 | 120 | 240 | personalizado
    comentario_id: Optional[int] = None

class VerificarToken(BaseModel):
    token: str

class PermisoTemporalOut(BaseModel):
    id: int; token: str; para_usuario: str; otorgado_por: str
    duracion_min: int; expires_at: datetime; usado: bool; created_at: datetime
    class Config: from_attributes = True


# ─── Audit Log ───────────────────────────────────────────────────
class AuditLogOut(BaseModel):
    id: int; timestamp: datetime; usuario: Optional[str]
    accion: str; descripcion: str; detalle: Optional[str]
    class Config: from_attributes = True
