from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt, JWTError
import os
SECRET_KEY = os.environ.get("SECRET_KEY", "ef7858424432a8148000737fc616412ce1b1b605a3393711065e64b9f7af905a")
ALGORITHM = "HS256"
EXPIRACION_MINUTOS = 120

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verificar_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def crear_token(email: str) -> str:
    expira = datetime.utcnow() + timedelta(minutes=EXPIRACION_MINUTOS)
    payload = {"sub": email, "exp": expira}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verificar_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None