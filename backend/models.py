from sqlalchemy import Column, Integer, Float, Boolean, DateTime, String
from sqlalchemy.sql import func
from database import Base

class Lectura(Base):
    __tablename__ = "lecturas"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, server_default=func.now())

    nivel = Column(Float)
    caudal = Column(Float)
    temp_ambiente = Column(Float)
    humedad = Column(Float)
    temp_agua = Column(Float)
    flotador_bajo = Column(Boolean)
    flotador_alto = Column(Boolean)
    bomba_estado = Column(Boolean)
    valvula_estado = Column(Boolean)

class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

class Mensaje(Base):
    __tablename__ = "mensajes"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, server_default=func.now())

    nombre = Column(String, nullable=False)
    correo = Column(String, nullable=False)
    contenido = Column(String, nullable=False)

    respondido = Column(Boolean, default=False)
    respuesta = Column(String, nullable=True)
    respuesta_timestamp = Column(DateTime, nullable=True)

class Comando(Base):
    """
    Tabla de un solo registro (id=1) que funciona como 'estado deseado'
    para la bomba y la electrovalvula. El ESP32 consulta este registro
    por WiFi cada ~1.5s; el panel admin lo actualiza cuando el
    administrador hace clic en encender/apagar.
    """
    __tablename__ = "comando"

    id = Column(Integer, primary_key=True, index=True)
    bomba_deseada = Column(Boolean, default=True)
    valvula_deseada = Column(Boolean, default=False)
    version = Column(Integer, default=0)

class ConfiguracionCamara(Base):
    """
    Guarda la URL actual del tunel (Cloudflare Tunnel) que expone la
    camara de la laptop. Se actualiza desde el panel admin, sin
    necesidad de editar codigo ni redesplegar, porque la URL gratuita
    de Cloudflare cambia cada vez que se reinicia el tunel.
    """
    __tablename__ = "config_camara"

    id = Column(Integer, primary_key=True, index=True)
    url_camara = Column(String, nullable=False, default="")

class LogActividad(Base):
    """
    Registra toda la actividad del panel de administrador:
    logins, logouts, control de bomba/valvula, mensajes y respuestas.
    """
    __tablename__ = "log_actividad"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, server_default=func.now())
    tipo = Column(String, nullable=False)
    descripcion = Column(String, nullable=False)
    admin_email = Column(String, nullable=True)
    datos_extra = Column(String, nullable=True)
