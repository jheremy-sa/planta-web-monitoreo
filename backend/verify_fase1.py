"""
verify_fase1.py — Verificación automática de la FASE 1 contra SQLite.

Objetivo: comprobar que
  1. La app arranca (create_all + seed usuarios + migración + catálogo).
  2. El catálogo de MCU/pines se sirve por API.
  3. Se crean dispositivos (con token en claro UNA vez; en BD solo el hash).
  4. Se crean variables ligadas a pin + dispositivo, con validación de
     nombre/rol/tipo/dirección y coherencia pin<->MCU y pin único.
  5. La tenencia funciona (anti-IDOR): un usuario no dueño recibe 403.
  6. Las 2 plantas actuales y sus endpoints (P1 y P2) siguen intactos.
  7. La migración y el sembrado son idempotentes.
  8. La migración añade owner_id y hace backfill en una BD "legacy".

Uso:  python verify_fase1.py     (usa una BD SQLite temporal y limpia)
Sale con código != 0 si algo falla.
"""
import os, sys, hashlib, tempfile
from datetime import datetime

# BD limpia y modo local SQLite ANTES de importar la app
os.environ.pop("SUPABASE_URL", None)
os.environ.pop("RENDER", None)
_DB = "./verify_planta.db"
if os.path.exists(_DB):
    os.remove(_DB)
os.environ["SQLITE_PATH"] = _DB          # la app usará esta BD (con FK ON)
os.environ["ADMIN_PRO_EMAIL"] = "adminpro@planta.local"
os.environ["ADMIN_PRO_PASSWORD"] = "AdminPro2026!"
os.environ["ADMIN_EMAIL"] = "admin@planta.local"
os.environ["ADMIN_PASSWORD"] = "Admin2026!"

import main
from fastapi.testclient import TestClient
import database, models, migrations
from sqlalchemy import text, create_engine, inspect as sa_inspect
from sqlalchemy.orm import sessionmaker

client = TestClient(main.app)

_fallos = []
def check(cond, msg):
    estado = "OK " if cond else "FALLO"
    print(f"  [{estado}] {msg}")
    if not cond:
        _fallos.append(msg)

def login(email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["access_token"]

def H(tok):
    return {"Authorization": f"Bearer {tok}"}

print("\n== 1. Arranque + login ==")
tok_pro = login("adminpro@planta.local", "AdminPro2026!")
tok_adm = login("admin@planta.local", "Admin2026!")
check(bool(tok_pro) and bool(tok_adm), "login AdminPro y Admin")

print("\n== 2. Catálogo de MCU / pines ==")
r = client.get("/api/microcontrollers", headers=H(tok_pro))
check(r.status_code == 200, "GET /api/microcontrollers 200")
mcus = r.json()
codes = {m["code"] for m in mcus}
check({"esp32","arduino_uno","arduino_mega","arduino_nano","arduino_r4_wifi","raspberry_pi_4"} <= codes,
      f"catálogo contiene los 6 MCU esperados (got {sorted(codes)})")
esp32 = next(m for m in mcus if m["code"] == "esp32")
uno   = next(m for m in mcus if m["code"] == "arduino_uno")
r = client.get(f"/api/microcontrollers/{esp32['id']}/pines", headers=H(tok_pro))
check(r.status_code == 200, "GET pines ESP32 200")
pines = r.json()
check(len(pines) > 10, f"ESP32 tiene varios pines ({len(pines)})")
check(all(isinstance(p["caps"], list) for p in pines), "cada pin trae caps como lista")
gpio5 = next((p for p in pines if p["label"] == "GPIO5"), None)
check(gpio5 is not None and "pwm" in gpio5["caps"], "GPIO5 existe y soporta pwm")
r = client.get("/api/microcontrollers/999999/pines", headers=H(tok_pro))
check(r.status_code == 404, "MCU inexistente -> 404")
# pin analógico ESP32 para sensor; pin uno para prueba de coherencia
pin_adc  = next(p for p in pines if p["label"] == "GPIO32")   # analog_in
pin_dac  = next(p for p in pines if p["label"] == "GPIO26")   # digital/pwm/dac
r_uno = client.get(f"/api/microcontrollers/{uno['id']}/pines", headers=H(tok_pro))
pin_uno_d2 = next(p for p in r_uno.json() if p["label"] == "D2")

print("\n== 3. Endpoints EXISTENTES intactos (2 plantas acuicultura) ==")
r = client.post("/api/plantas", headers=H(tok_pro),
                json={"nombre": "Planta Acuicultura X", "descripcion": "prueba"})
check(r.status_code == 200, "POST /api/plantas (AdminPro) 200")
planta = r.json()
check(planta.get("owner_id") is not None, "la planta creada tiene owner_id (tenencia)")
pid = planta["id"]
r = client.get("/api/plantas", headers=H(tok_pro))
check(r.status_code == 200 and any(p["id"] == pid for p in r.json()), "GET /api/plantas incluye la nueva")
# P1: ingesta de sensores sin sesión (firmware)
lect = {"nivel":50.0,"caudal":2.5,"temp_ambiente":25.0,"humedad":60.0,"temp_agua":22.0,
        "flotador_bajo":False,"flotador_alto":True,"bomba_estado":True,"valvula_estado":False}
r = client.post("/api/lecturas", json=lect)
check(r.status_code == 200, "POST /api/lecturas (P1) 200")
r = client.get("/api/lecturas/ultima")
check(r.status_code == 200 and r.json() and r.json()["nivel"] == 50.0, "GET /api/lecturas/ultima 200")
r = client.get("/api/comando")
check(r.status_code == 200, "GET /api/comando (P1) 200")
# P2: Arduino
r = client.post("/api/lecturas/planta2", json={"nivel":40.0,"caudal":1.1,"bomba_estado":False,"valvula_estado":True})
check(r.status_code == 200, "POST /api/lecturas/planta2 200")
r = client.get("/api/comando/planta2")
check(r.status_code == 200, "GET /api/comando/planta2 200")

print("\n== 4. Dispositivos (token en claro una vez; en BD solo hash) ==")
r = client.post(f"/api/plantas/{pid}/devices", headers=H(tok_pro),
                json={"mcu_id": esp32["id"], "name": "ESP32 estanque", "firmware_version": "1.0.0"})
check(r.status_code == 200, "POST device 200")
dev = r.json()
token_claro = dev.get("token")
check(bool(token_claro) and bool(dev.get("token_prefix")), "respuesta trae token en claro + prefijo")
did = dev["id"]
r = client.get(f"/api/plantas/{pid}/devices", headers=H(tok_pro))
listado = r.json()
check(r.status_code == 200 and any(d["id"] == did for d in listado), "GET devices lista el nuevo")
check(all("token" not in d for d in listado), "el listado de devices NO expone token")
# En BD: solo hash, y coincide con sha256(token)
db = database.SessionLocal()
tokrow = db.query(models.DeviceToken).filter(models.DeviceToken.device_id == did,
                                             models.DeviceToken.revoked_at.is_(None)).first()
esperado = hashlib.sha256(token_claro.encode()).hexdigest()
check(tokrow is not None and tokrow.token_hash == esperado, "en BD se guarda token_hash = sha256(token)")
check(tokrow.token_hash != token_claro, "el token NO se guarda en claro")
db.close()

print("\n== 5. Variables (validación + coherencia pin<->MCU) ==")
# sensor válido
r = client.post(f"/api/plantas/{pid}/variables", headers=H(tok_pro),
                json={"name":"temp_agua","role":"sensor","data_type":"float","unit":"C",
                      "min_val":0,"max_val":100,"device_id":did,"pin_id":pin_adc["id"]})
check(r.status_code == 200, "POST variable sensor 200")
vsensor = r.json()
check(vsensor["direction"] == "input", "dirección derivada 'input' para sensor")
vid_sensor = vsensor["id"]
# actuador válido
r = client.post(f"/api/plantas/{pid}/variables", headers=H(tok_pro),
                json={"name":"bomba","role":"actuator","data_type":"bool",
                      "device_id":did,"pin_id":pin_dac["id"]})
check(r.status_code == 200 and r.json()["direction"] == "output", "POST variable actuador 200 (dir 'output')")
vid_act = r.json()["id"]
# nombre inválido
r = client.post(f"/api/plantas/{pid}/variables", headers=H(tok_pro),
                json={"name":"1malo","role":"sensor"})
check(r.status_code == 400, "nombre inválido -> 400")
# nombre duplicado
r = client.post(f"/api/plantas/{pid}/variables", headers=H(tok_pro),
                json={"name":"temp_agua","role":"sensor"})
check(r.status_code == 400, "nombre duplicado -> 400")
# pin de OTRO mcu (incoherente)
r = client.post(f"/api/plantas/{pid}/variables", headers=H(tok_pro),
                json={"name":"malpin","role":"sensor","device_id":did,"pin_id":pin_uno_d2["id"]})
check(r.status_code == 400, "pin de otro MCU -> 400 (coherencia)")
# pin ya usado (pin_adc ya lo tiene temp_agua)
r = client.post(f"/api/plantas/{pid}/variables", headers=H(tok_pro),
                json={"name":"otra","role":"sensor","device_id":did,"pin_id":pin_adc["id"]})
check(r.status_code == 400, "pin ya asignado -> 400 (un pin = una variable)")
# rol inválido
r = client.post(f"/api/plantas/{pid}/variables", headers=H(tok_pro),
                json={"name":"buena","role":"noexiste"})
check(r.status_code == 400, "role inválido -> 400")
# listar
r = client.get(f"/api/plantas/{pid}/variables", headers=H(tok_pro))
check(r.status_code == 200 and {v["name"] for v in r.json()} >= {"temp_agua","bomba"}, "GET variables lista las creadas")
# editar
r = client.put(f"/api/variables/{vid_sensor}", headers=H(tok_pro), json={"unit":"°C","max_val":80})
check(r.status_code == 200 and r.json()["unit"] == "°C" and r.json()["max_val"] == 80, "PUT variable actualiza")
# borrar actuador
r = client.delete(f"/api/variables/{vid_act}", headers=H(tok_pro))
check(r.status_code == 200, "DELETE variable 200")
r = client.get(f"/api/plantas/{pid}/variables", headers=H(tok_pro))
check(all(v["id"] != vid_act for v in r.json()), "la variable borrada ya no aparece")

print("\n== 6. Histórico/comandos genéricos por variable ==")
r = client.get(f"/api/variables/{vid_sensor}/readings", headers=H(tok_pro))
check(r.status_code == 200 and r.json() == [], "GET readings 200 (vacío)")
r = client.get(f"/api/variables/{vid_sensor}/commands", headers=H(tok_pro))
check(r.status_code == 200 and r.json() == [], "GET commands 200 (vacío)")

print("\n== 7. Tenencia / anti-IDOR (Admin no dueño) ==")
r = client.get(f"/api/plantas/{pid}/devices", headers=H(tok_adm))
check(r.status_code == 403, "Admin (no dueño) GET devices -> 403")
r = client.post(f"/api/plantas/{pid}/devices", headers=H(tok_adm), json={"mcu_id":esp32["id"],"name":"x"})
check(r.status_code == 403, "Admin (no dueño) POST device -> 403")
r = client.get(f"/api/variables/{vid_sensor}/readings", headers=H(tok_adm))
check(r.status_code == 403, "Admin (no dueño) GET readings -> 403")

print("\n== 8. Regenerar token (revoca el anterior) ==")
r = client.post(f"/api/devices/{did}/regenerar-token", headers=H(tok_pro))
check(r.status_code == 200, "POST regenerar-token 200")
nuevo = r.json().get("token")
check(bool(nuevo) and nuevo != token_claro, "token nuevo != token anterior")
db = database.SessionLocal()
activos = db.query(models.DeviceToken).filter(models.DeviceToken.device_id == did,
                                              models.DeviceToken.revoked_at.is_(None)).count()
total   = db.query(models.DeviceToken).filter(models.DeviceToken.device_id == did).count()
check(activos == 1 and total == 2, f"queda 1 token activo de 2 (activos={activos}, total={total})")
db.close()

# Borrado de dispositivo: 403 a quien no es dueño, y cascade de tokens
r = client.delete(f"/api/devices/{did}", headers=H(tok_adm))
check(r.status_code == 403, "Admin (no dueño) DELETE device -> 403")
r = client.delete(f"/api/devices/{did}", headers=H(tok_pro))
check(r.status_code == 200, "DELETE device (dueño) 200")
r = client.get(f"/api/plantas/{pid}/devices", headers=H(tok_pro))
check(all(d["id"] != did for d in r.json()), "el dispositivo borrado ya no aparece")
db = database.SessionLocal()
restantes = db.query(models.DeviceToken).filter(models.DeviceToken.device_id == did).count()
db.close()
check(restantes == 0, "al borrar el dispositivo, sus tokens se eliminan (cascade FK)")

print("\n== 9. Idempotencia de migración + catálogo ==")
res = migrations.run_migrations(database.engine, database.SessionLocal)
db = database.SessionLocal()
n_mcus = db.query(models.Microcontroller).count()
db.close()
check(res["catalogo"]["mcus_creados"] == 0 and res["catalogo"]["pines_creados"] == 0,
      "re-ejecutar seed no crea duplicados")
check(n_mcus == 6, f"siguen 6 MCU (no duplicados) — got {n_mcus}")

print("\n== 10. Migración sobre BD 'legacy' (añade owner_id + backfill) ==")
_LEG = "./verify_legacy.db"
if os.path.exists(_LEG):
    os.remove(_LEG)
eng2 = create_engine(f"sqlite:///{_LEG}", connect_args={"check_same_thread": False})
Sess2 = sessionmaker(autocommit=False, autoflush=False, bind=eng2)
# Crear a mano usuarios + plantas SIN owner_id (esquema previo a la Fase 1)
with eng2.begin() as c:
    c.execute(text("""CREATE TABLE usuarios (id INTEGER PRIMARY KEY, email TEXT, username TEXT,
                      password_hash TEXT, role TEXT, is_active BOOLEAN, created_at DATETIME,
                      last_login DATETIME, temp_password_hash TEXT, temp_password_expires DATETIME,
                      must_change_password BOOLEAN)"""))
    c.execute(text("""INSERT INTO usuarios (id,email,username,password_hash,role,is_active)
                      VALUES (1,'jefe@x.com','Jefe','h','admin_pro',1)"""))
    c.execute(text("""CREATE TABLE plantas (id INTEGER PRIMARY KEY, nombre TEXT, descripcion TEXT,
                      layout_json TEXT, is_active BOOLEAN, created_at DATETIME, updated_at DATETIME,
                      created_by TEXT, updated_by TEXT)"""))
    c.execute(text("""INSERT INTO plantas (id,nombre,descripcion,layout_json,is_active)
                      VALUES (1,'Vieja','legacy','{}',1)"""))
cols_antes = {col["name"] for col in sa_inspect(eng2).get_columns("plantas")}
check("owner_id" not in cols_antes, "BD legacy NO tiene owner_id al inicio")
agregado = migrations._agregar_owner_id_si_falta(eng2)
n_backfill = migrations._backfill_owner(Sess2)
cols_desp = {col["name"] for col in sa_inspect(eng2).get_columns("plantas")}
check(agregado and "owner_id" in cols_desp, "migración añade owner_id a BD legacy")
db2 = Sess2()
owner = db2.execute(text("SELECT owner_id FROM plantas WHERE id=1")).scalar()
db2.close()
check(n_backfill == 1 and owner == 1, "backfill asigna la planta vieja al admin_pro (id=1)")
# idempotente: segunda pasada no vuelve a alterar
agregado2 = migrations._agregar_owner_id_si_falta(eng2)
check(agregado2 is False, "segunda pasada de ALTER es no-op (idempotente)")
eng2.dispose()
os.remove(_LEG)

# == 11. Registro + login inmediato de un usuario nuevo (bug de cuentas) ==
print("\n== 11. Crear usuario y login inmediato ==")
r = client.post("/api/usuarios", headers=H(tok_pro),
                json={"email":"op2@planta.local","username":"Operador2","password":"Operador123","role":"admin"})
check(r.status_code == 200, "crear usuario (Supervisor) 200")
op2_id = r.json().get("id") if r.status_code == 200 else None
lr = client.post("/api/auth/login", json={"email":"op2@planta.local","password":"Operador123"})
tok_op2 = lr.json().get("access_token") if lr.status_code == 200 else None
check(lr.status_code == 200 and bool(tok_op2), "login inmediato del usuario nuevo 200")
br = client.post("/api/auth/login", json={"email":"op2@planta.local","password":"mala"})
check(br.status_code == 401, "login con clave incorrecta -> 401")

# == 12. Protección de la cuenta del Supervisor (auto-bloqueo) ==
print("\n== 12. Supervisor no puede auto-suspenderse/degradarse ==")
db = database.SessionLocal()
pro_id = db.query(models.Usuario).filter_by(email="adminpro@planta.local").first().id
db.close()
r = client.put(f"/api/usuarios/{pro_id}", headers=H(tok_pro), json={"is_active": False})
check(r.status_code == 400, "auto-suspender Supervisor -> 400")
r = client.put(f"/api/usuarios/{pro_id}", headers=H(tok_pro), json={"role": "admin"})
check(r.status_code == 400, "auto-degradar Supervisor -> 400")
# Sí puede suspender a OTRO usuario
r = client.put(f"/api/usuarios/{op2_id}", headers=H(tok_pro), json={"is_active": False})
check(r.status_code == 200, "suspender a otro usuario -> 200")
r = client.put(f"/api/usuarios/{op2_id}", headers=H(tok_pro), json={"is_active": True})
check(r.status_code == 200, "reactivar a otro usuario -> 200")

# == 13. Auditoría por rol (Operador solo ve lo suyo) ==
print("\n== 13. Visibilidad de auditoría por rol ==")
r = client.get("/api/audit?limit=500", headers=H(tok_op2))
filas_op = r.json() if r.status_code == 200 else []
check(r.status_code == 200, "Operador GET /api/audit 200")
check(len(filas_op) >= 1 and all(f["usuario"] == "op2@planta.local" for f in filas_op),
      "Operador solo ve SUS propias acciones")
check(not any(f["usuario"] == "adminpro@planta.local" for f in filas_op),
      "Operador NO ve acciones del Supervisor")
r = client.get("/api/audit?limit=500", headers=H(tok_pro))
usuarios_vistos = {f["usuario"] for f in r.json()} if r.status_code == 200 else set()
check(r.status_code == 200 and {"adminpro@planta.local", "op2@planta.local"} <= usuarios_vistos,
      "Supervisor ve acciones de varios usuarios")

# == 14. Readings con rango de tiempo + /api/health ==
print("\n== 14. Readings con rango + health ==")
desde = "2000-01-01T00:00:00"; hasta = datetime.utcnow().isoformat()
r = client.get(f"/api/variables/{vid_sensor}/readings?desde={desde}&hasta={hasta}", headers=H(tok_pro))
check(r.status_code == 200 and isinstance(r.json(), list), "readings con desde/hasta -> 200 (lista)")
r = client.get("/api/health")
hj = r.json() if r.status_code == 200 else {}
check(r.status_code == 200 and hj.get("db") == "sqlite" and hj.get("persistente") is False,
      "GET /api/health 200 (db=sqlite, persistente=false)")
check(hj.get("en_render") is False and hj.get("aviso") is None,
      "health sin aviso fuera de Render")

# == 15. RBAC: rol EMPLEADO + asignación granular de plantas ==
print("\n== 15. RBAC: EMPLEADO + asignación de plantas ==")
pidx = client.post("/api/plantas", headers=H(tok_pro), json={"nombre":"RBAC-X","descripcion":"d"}).json()["id"]
r = client.post("/api/usuarios", headers=H(tok_pro),
                json={"email":"emp@rbac.local","username":"EmpRBAC","password":"Empleado123","role":"empleado"})
check(r.status_code == 200, "crear usuario rol EMPLEADO 200")
r = client.post("/api/usuarios", headers=H(tok_pro),
                json={"email":"bad@rbac.local","username":"BadRBAC","password":"xxxxxxxx","role":"hacker"})
check(r.status_code == 400, "rol inválido -> 400")
emp_id = [u["id"] for u in client.get("/api/usuarios", headers=H(tok_pro)).json()
          if u["email"] == "emp@rbac.local"][0]
r = client.put(f"/api/usuarios/{emp_id}/plantas", headers=H(tok_pro),
               json={"plant_ids": [pidx], "can_edit": True})
check(r.status_code == 200 and r.json()["can_edit"] is False,
      "asignar planta a EMPLEADO (can_edit forzado a False)")
tok_emp = client.post("/api/auth/login",
                      json={"email":"emp@rbac.local","password":"Empleado123"}).json()["access_token"]
vis = [p["id"] for p in client.get("/api/plantas", headers=H(tok_emp)).json()]
check(vis == [pidx], "EMPLEADO solo ve la planta asignada")
check(client.get(f"/api/plantas/{pidx}/variables", headers=H(tok_emp)).status_code == 200,
      "EMPLEADO lee variables de planta asignada")
pidy = client.post("/api/plantas", headers=H(tok_pro), json={"nombre":"RBAC-Y","descripcion":"d"}).json()["id"]
check(client.get(f"/api/plantas/{pidy}", headers=H(tok_emp)).status_code == 403,
      "EMPLEADO no ve planta NO asignada -> 403")

# == 16. Comando genérico por variable (operar) + RBAC ==
print("\n== 16. Comando por variable + RBAC de operación ==")
vid_act = client.post(f"/api/plantas/{pidx}/variables", headers=H(tok_pro),
                      json={"name":"bomba_op","role":"actuator","data_type":"bool"}).json()["id"]
vid_sen = client.post(f"/api/plantas/{pidx}/variables", headers=H(tok_pro),
                      json={"name":"temp_op","role":"sensor","data_type":"float"}).json()["id"]
check(client.post(f"/api/variables/{vid_act}/command", headers=H(tok_pro), json={"value":1}).status_code == 200,
      "Supervisor comanda actuador -> 200")
check(client.post(f"/api/variables/{vid_sen}/command", headers=H(tok_pro), json={"value":1}).status_code == 400,
      "comando a sensor -> 400")
# EMPLEADO (emp@rbac.local, asignado a pidx en secc. 15) no puede operar
check(client.post(f"/api/variables/{vid_act}/command", headers=H(tok_emp), json={"value":1}).status_code == 403,
      "EMPLEADO no puede operar -> 403")
check(len(client.get(f"/api/variables/{vid_act}/commands", headers=H(tok_pro)).json()) == 1,
      "el comando quedó registrado")

# == 17. Nombre de planta duplicado + ver clave del dispositivo ==
print("\n== 17. Nombre duplicado + ver clave ==")
client.post("/api/plantas", headers=H(tok_pro), json={"nombre":"Dup-1","descripcion":""})
rdup = client.post("/api/plantas", headers=H(tok_pro), json={"nombre":"  dup-1 ","descripcion":""})
check(rdup.status_code == 400, "nombre duplicado (mayús/espacios) -> 400")
pdup = client.get("/api/plantas", headers=H(tok_pro)).json()
pid_d = [p["id"] for p in pdup if p["nombre"] == "Dup-1"][0]
mcu0 = client.get("/api/microcontrollers", headers=H(tok_pro)).json()[0]["id"]
devc = client.post(f"/api/plantas/{pid_d}/devices", headers=H(tok_pro),
                   json={"mcu_id":mcu0,"name":"ESP-T"}).json()
did_t = devc["id"]
rtok = client.get(f"/api/devices/{did_t}/token", headers=H(tok_pro))
check(rtok.status_code == 200 and rtok.json()["token"] == devc["token"],
      "ver clave (dueño) coincide con la creada")
nuevo = client.post(f"/api/devices/{did_t}/regenerar-token", headers=H(tok_pro)).json()["token"]
check(client.get(f"/api/devices/{did_t}/token", headers=H(tok_pro)).json()["token"] == nuevo,
      "tras regenerar, ver clave = nueva")
check(client.get(f"/api/devices/{did_t}/token", headers=H(tok_emp)).status_code == 403,
      "EMPLEADO no puede ver la clave -> 403")

print("\n" + "="*60)
if _fallos:
    print(f"RESULTADO: {len(_fallos)} FALLO(S):")
    for f in _fallos:
        print("   -", f)
    sys.exit(1)
else:
    print("RESULTADO: TODAS LAS COMPROBACIONES PASARON ✔")
    sys.exit(0)
