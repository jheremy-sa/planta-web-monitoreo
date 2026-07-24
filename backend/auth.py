"""
auth.py — Autenticación, roles y seguridad del sistema HMI.

Mejoras sobre la versión anterior:
  - Roles: admin / admin_pro
  - Rate limiting en memoria (anti-fuerza bruta)
  - Generación de tokens temporales seguros para el editor de planta
  - Soporte para contraseñas temporales con expiración
"""
import os
import secrets
import string
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt, JWTError

SECRET_KEY      = os.environ.get("SECRET_KEY", "cambiar-en-produccion-256bits")
ALGORITHM       = "HS256"
TOKEN_MINUTOS   = 480   # 8 horas de sesión

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─── Rate limiting simple en memoria ─────────────────────────────
_intentos_fallidos: dict[str, list] = {}   # ip/email → [timestamps]
MAX_INTENTOS = 5
VENTANA_SEGUNDOS = 300   # 5 minutos


def verificar_rate_limit(clave: str) -> bool:
    """True si la clave está bloqueada por demasiados intentos."""
    ahora = datetime.utcnow()
    corte = ahora - timedelta(seconds=VENTANA_SEGUNDOS)
    hist  = [t for t in _intentos_fallidos.get(clave, []) if t > corte]
    _intentos_fallidos[clave] = hist
    return len(hist) >= MAX_INTENTOS


def registrar_intento_fallido(clave: str):
    ahora = datetime.utcnow()
    _intentos_fallidos.setdefault(clave, []).append(ahora)


def limpiar_intentos(clave: str):
    _intentos_fallidos.pop(clave, None)


# ─── Contraseñas ─────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verificar_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def generar_password_temporal(longitud: int = 12) -> str:
    """Genera una contraseña temporal segura y legible."""
    alfabeto = string.ascii_letters + string.digits
    # Al menos una mayúscula, una minúscula y un dígito
    while True:
        pwd = "".join(secrets.choice(alfabeto) for _ in range(longitud))
        if (any(c.isupper() for c in pwd)
                and any(c.islower() for c in pwd)
                and any(c.isdigit() for c in pwd)):
            return pwd


# ─── JWT ─────────────────────────────────────────────────────────
def crear_token(email: str, role: str) -> str:
    expira = datetime.utcnow() + timedelta(minutes=TOKEN_MINUTOS)
    payload = {"sub": email, "role": role, "exp": expira}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verificar_token(token: str) -> dict | None:
    """Devuelve {email, role} si el token es válido, None si no."""
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"email": data.get("sub"), "role": data.get("role")}
    except JWTError:
        return None


# ─── Token de editor temporal ─────────────────────────────────────
def generar_token_editor() -> str:
    """Genera un token único de 32 caracteres para permisos temporales."""
    return secrets.token_urlsafe(24)   # ~32 chars URL-safe
