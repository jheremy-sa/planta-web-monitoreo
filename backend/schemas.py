from pydantic import BaseModel
from datetime import datetime

class LecturaCreate(BaseModel):
    nivel: float
    caudal: float
    temp_ambiente: float
    humedad: float
    temp_agua: float
    flotador_bajo: bool
    flotador_alto: bool
    bomba_estado: bool
    valvula_estado: bool

class LecturaOut(LecturaCreate):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class AdminLogin(BaseModel):
    email: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class MensajeCreate(BaseModel):
    nombre: str
    correo: str
    contenido: str

class MensajeOut(MensajeCreate):
    id: int
    timestamp: datetime
    respondido: bool
    respuesta: str | None = None
    respuesta_timestamp: datetime | None = None

    class Config:
        from_attributes = True

class RespuestaCreate(BaseModel):
    respuesta: str

class ComandoUpdate(BaseModel):
    bomba_deseada: bool
    valvula_deseada: bool

class ComandoOut(BaseModel):
    bomba_deseada: bool
    valvula_deseada: bool
    version: int

    class Config:
        from_attributes = True

class ConfigCamaraUpdate(BaseModel):
    url_camara: str

class ConfigCamaraOut(BaseModel):
    url_camara: str

    class Config:
        from_attributes = True

class LogCreate(BaseModel):
    tipo: str
    descripcion: str
    datos_extra: str | None = None

class LogOut(LogCreate):
    id: int
    timestamp: datetime
    admin_email: str | None = None

    class Config:
        from_attributes = True
