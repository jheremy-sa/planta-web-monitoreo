from database import SessionLocal, engine, Base
import models
import auth

Base.metadata.create_all(bind=engine)

db = SessionLocal()

email = input("Correo del admin: ").strip()
password = input("Contraseña: ").strip()

existente = db.query(models.Admin).filter(models.Admin.email == email).first()
if existente:
    print("Ya existe un admin con ese correo.")
else:
    nuevo = models.Admin(email=email, password_hash=auth.hash_password(password))
    db.add(nuevo)
    db.commit()
    print(f"Admin creado: {email}")

db.close()