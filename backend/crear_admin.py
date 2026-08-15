"""
crear_admin.py — Crea un usuario administrador de forma interactiva.

Corrección: la tabla de usuarios es 'Usuario' (no 'Admin'). Se pide el rol
(admin | admin_pro) y se crean las tablas si faltan.
"""
from database import SessionLocal, engine, Base
import models
import auth

Base.metadata.create_all(bind=engine)

db = SessionLocal()

try:
    email = input("Correo del admin: ").strip()
    username = input("Usuario (nombre visible): ").strip() or email.split("@")[0]
    password = input("Contraseña: ").strip()
    rol = input("Rol [admin_pro/admin] (Enter = admin_pro): ").strip() or "admin_pro"
    if rol not in ("admin", "admin_pro"):
        rol = "admin_pro"

    existente = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if existente:
        print("Ya existe un usuario con ese correo.")
    else:
        nuevo = models.Usuario(
            email=email,
            username=username,
            password_hash=auth.hash_password(password),
            role=rol,
        )
        db.add(nuevo)
        db.commit()
        print(f"Usuario creado: {email} (rol: {rol})")
finally:
    db.close()
