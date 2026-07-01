import csv
import io
import json
import os
from datetime import datetime, timedelta
from typing import List

from fastapi import FastAPI, Depends, HTTPException, Header, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

import models, schemas, auth
from database import engine, SessionLocal, Base

# 1. Crear la app
app = FastAPI()

# 2. Esquema de seguridad (activa el candado en Swagger)
security_scheme = HTTPBearer()

# 3. Crear tablas
Base.metadata.create_all(bind=engine)

# 4. CORS (orígenes permitidos desde variable de entorno, si no, "*")
origenes_permitidos = os.environ.get("ORIGENES_PERMITIDOS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origenes_permitidos,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. Dependencia de base de datos
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 6. Asegurar que el admin tenga las credenciales correctas en cada
#    arranque (la BD de Render es efimera y se reinicia con cada
#    redeploy, asi que esto evita quedarse sin acceso)
def crear_admin_inicial_si_no_existe():
    db = SessionLocal()
    try:
        email = os.environ.get("ADMIN_EMAIL", "Admin1")
        password = os.environ.get("ADMIN_PASSWORD", "Admin1")
        admin = db.query(models.Admin).first()
        if not admin:
            admin = models.Admin(email=email, password_hash=auth.hash_password(password))
            db.add(admin)
        else:
            admin.email = email
            admin.password_hash = auth.hash_password(password)
        db.commit()
    finally:
        db.close()

crear_admin_inicial_si_no_existe()

# ------------------------------------------------------------
# Endpoints públicos (lecturas)
# ------------------------------------------------------------
@app.post("/api/lecturas", response_model=schemas.LecturaOut)
def crear_lectura(lectura: schemas.LecturaCreate, db: Session = Depends(get_db)):
    db_lectura = models.Lectura(**lectura.model_dump())
    db.add(db_lectura)
    db.commit()
    db.refresh(db_lectura)
    return db_lectura

@app.get("/api/lecturas/ultima", response_model=schemas.LecturaOut | None)
def obtener_ultima(db: Session = Depends(get_db)):
    # Puede no haber NINGUNA lectura todavia (BD recien reiniciada en Render,
    # o el ESP32 aun no ha enviado su primer dato). Devolver None en vez de
    # reventar es lo correcto: el frontend lo interpreta como "esperando datos".
    return db.query(models.Lectura).order_by(desc(models.Lectura.id)).first()

@app.get("/api/lecturas/historial", response_model=List[schemas.LecturaOut])
def obtener_historial(minutos: int = 30, db: Session = Depends(get_db)):
    desde = datetime.utcnow() - timedelta(minutes=minutos)
    return (
        db.query(models.Lectura)
        .filter(models.Lectura.timestamp >= desde)
        .order_by(models.Lectura.timestamp)
        .all()
    )

# ------------------------------------------------------------
# Autenticación
# ------------------------------------------------------------
@app.post("/api/login", response_model=schemas.TokenOut)
def login(datos: schemas.AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(models.Admin).filter(models.Admin.email == datos.email).first()
    if not admin or not auth.verificar_password(datos.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    token = auth.crear_token(admin.email)
    # Registrar login en el historial
    db_log = models.LogActividad(
        tipo="login",
        descripcion="Inicio de sesión en el panel de administrador",
        admin_email=admin.email
    )
    db.add(db_log)
    db.commit()
    return {"access_token": token}

def obtener_admin_actual(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = authorization.split(" ")[1]
    email = auth.verificar_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return email

@app.get("/api/admin/verificar")
def verificar_acceso(
    admin_email: str = Depends(obtener_admin_actual),
    credentials: HTTPBearer = Depends(security_scheme),
):
    return {"email": admin_email, "acceso": "ok"}

# ------------------------------------------------------------
# Exportar CSV (protegido)
# ------------------------------------------------------------
@app.get("/api/admin/exportar")
def exportar_csv(
    admin_email: str = Depends(obtener_admin_actual),
    credentials: HTTPBearer = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    lecturas = db.query(models.Lectura).order_by(models.Lectura.id).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id", "timestamp", "nivel", "caudal", "temp_ambiente", "humedad",
        "temp_agua", "flotador_bajo", "flotador_alto", "bomba_estado", "valvula_estado"
    ])
    for l in lecturas:
        writer.writerow([
            l.id, l.timestamp, l.nivel, l.caudal, l.temp_ambiente, l.humedad,
            l.temp_agua, l.flotador_bajo, l.flotador_alto, l.bomba_estado, l.valvula_estado
        ])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=lecturas_planta.csv"}
    )

# ------------------------------------------------------------
# Mensajería
# ------------------------------------------------------------
@app.post("/api/mensajes", response_model=schemas.MensajeOut)
def enviar_mensaje(mensaje: schemas.MensajeCreate, db: Session = Depends(get_db)):
    db_mensaje = models.Mensaje(**mensaje.model_dump())
    db.add(db_mensaje)
    db.commit()
    db.refresh(db_mensaje)
    # Registrar en historial
    db_log = models.LogActividad(
        tipo="mensaje_publico",
        descripcion=f"Mensaje recibido de {mensaje.nombre} ({mensaje.correo})",
        datos_extra=mensaje.contenido[:200]
    )
    db.add(db_log)
    db.commit()
    return db_mensaje

@app.get("/api/mensajes/buscar", response_model=List[schemas.MensajeOut])
def buscar_mensajes_por_correo(correo: str, db: Session = Depends(get_db)):
    # Publico: permite que cualquier visitante revise si su mensaje
    # ya fue respondido, usando el mismo correo con el que lo envio.
    correo = correo.strip().lower()
    return (
        db.query(models.Mensaje)
        .filter(models.Mensaje.correo.ilike(correo))
        .order_by(desc(models.Mensaje.id))
        .all()
    )

@app.get("/api/admin/mensajes", response_model=List[schemas.MensajeOut])
def listar_mensajes(
    admin_email: str = Depends(obtener_admin_actual),
    credentials: HTTPBearer = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    return db.query(models.Mensaje).order_by(desc(models.Mensaje.id)).all()

@app.post("/api/admin/mensajes/{mensaje_id}/responder", response_model=schemas.MensajeOut)
def responder_mensaje(
    mensaje_id: int,
    datos: schemas.RespuestaCreate,
    admin_email: str = Depends(obtener_admin_actual),
    credentials: HTTPBearer = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    mensaje = db.query(models.Mensaje).filter(models.Mensaje.id == mensaje_id).first()
    if not mensaje:
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    mensaje.respuesta = datos.respuesta
    mensaje.respondido = True
    mensaje.respuesta_timestamp = datetime.utcnow()
    db.commit()
    db.refresh(mensaje)
    # Registrar en historial
    db_log = models.LogActividad(
        tipo="respuesta_mensaje",
        descripcion=f"Respuesta enviada a {mensaje.nombre} ({mensaje.correo}) — Mensaje #{mensaje_id}",
        admin_email=admin_email,
        datos_extra=datos.respuesta[:200]
    )
    db.add(db_log)
    db.commit()
    return mensaje

# ------------------------------------------------------------
# Comando remoto de bomba / electrovalvula
# ------------------------------------------------------------
def obtener_o_crear_comando(db: Session) -> models.Comando:
    comando = db.query(models.Comando).filter(models.Comando.id == 1).first()
    if not comando:
        comando = models.Comando(id=1, bomba_deseada=True, valvula_deseada=False, version=0)
        db.add(comando)
        db.commit()
        db.refresh(comando)
    return comando

@app.get("/api/comando", response_model=schemas.ComandoOut)
def obtener_comando(db: Session = Depends(get_db)):
    # Publico y sin autenticacion: el ESP32 lo consulta por WiFi cada ~1.5s.
    # Solo expone el estado deseado (no es sensible), nunca permite escribir.
    return obtener_o_crear_comando(db)

@app.post("/api/admin/comando", response_model=schemas.ComandoOut)
async def actualizar_comando(
    datos: schemas.ComandoUpdate,
    admin_email: str = Depends(obtener_admin_actual),
    credentials: HTTPBearer = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    comando = obtener_o_crear_comando(db)
    comando.bomba_deseada = datos.bomba_deseada
    comando.valvula_deseada = datos.valvula_deseada
    comando.version += 1
    db.commit()
    db.refresh(comando)
    # Empujar el nuevo comando al ESP32 por WebSocket (< 1s)
    # Si el ESP32 no esta conectado por WS, igual queda guardado
    # en BD para que lo recoja en el siguiente poll HTTP (fallback).
    await gestor_esp32.enviar_comando(json.dumps({
        "bomba_deseada": comando.bomba_deseada,
        "valvula_deseada": comando.valvula_deseada,
        "version": comando.version
    }))
    return comando

# ------------------------------------------------------------
# Historial de actividades (log del panel admin)
# ------------------------------------------------------------
@app.post("/api/admin/log")
def crear_log(
    log: schemas.LogCreate,
    admin_email: str = Depends(obtener_admin_actual),
    credentials: HTTPBearer = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    db_log = models.LogActividad(
        tipo=log.tipo,
        descripcion=log.descripcion,
        admin_email=admin_email,
        datos_extra=log.datos_extra
    )
    db.add(db_log)
    db.commit()
    return {"ok": True}

@app.get("/api/admin/logs", response_model=List[schemas.LogOut])
def obtener_logs(
    admin_email: str = Depends(obtener_admin_actual),
    credentials: HTTPBearer = Depends(security_scheme),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.LogActividad)
        .order_by(desc(models.LogActividad.id))
        .limit(300)
        .all()
    )

# ------------------------------------------------------------
# Streaming de cámara (opcional, solo si opencv está instalado)
# ------------------------------------------------------------
try:
    import cv2
    camara = cv2.VideoCapture(1)
    CAMARA_DISPONIBLE = True
except ImportError:
    CAMARA_DISPONIBLE = False

def generar_frames():
    while True:
        ok, frame = camara.read()
        if not ok:
            continue
        ok, buffer = cv2.imencode(".jpg", frame)
        if not ok:
            continue
        frame_bytes = buffer.tobytes()
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
        )

@app.get("/video")
def video_stream():
    if not CAMARA_DISPONIBLE:
        raise HTTPException(status_code=503, detail="Cámara no disponible en este servidor")
    return StreamingResponse(
        generar_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.get("/foto")
def foto_camara():
    # Una sola foto por peticion (no un stream continuo). Los tuneles
    # gratis (ngrok, Cloudflare Quick Tunnel) cortan las conexiones de
    # streaming largo; una foto cada 1-2s, en cambio, es una peticion
    # corta y normal que ningun tunel tiene motivo para cortar.
    if not CAMARA_DISPONIBLE:
        raise HTTPException(status_code=503, detail="Cámara no disponible en este servidor")
    ok, frame = camara.read()
    if not ok:
        raise HTTPException(status_code=503, detail="No se pudo leer la camara")
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    if not ok:
        raise HTTPException(status_code=503, detail="No se pudo codificar la imagen")
    return Response(content=buffer.tobytes(), media_type="image/jpeg")

# ------------------------------------------------------------
# ------------------------------------------------------------
# Camara via "push": la laptop manda la foto activamente hacia
# Render (saliente, sin necesitar tunel ni puerto abierto), y
# Render guarda la ultima foto recibida en memoria para servirla
# a cualquier visitante. Mismo principio que ya usa el ESP32 para
# los datos de sensores: nadie "entra" a la laptop, la laptop "sale".
# ------------------------------------------------------------
import time as time_lib
import asyncio

ultimo_frame_camara: bytes | None = None
ultimo_frame_ts: float = 0.0
CAMARA_PUSH_SECRET = os.environ.get("CAMARA_PUSH_SECRET", "cambia-este-secreto")
CAMARA_TIMEOUT_SEGUNDOS = 5

@app.post("/api/camara-frame")
async def recibir_frame_camara(request: Request, x_camara_secret: str = Header(None)):
    if x_camara_secret != CAMARA_PUSH_SECRET:
        raise HTTPException(status_code=401, detail="Secreto incorrecto")

    global ultimo_frame_camara, ultimo_frame_ts
    cuerpo = await request.body()
    if not cuerpo:
        raise HTTPException(status_code=400, detail="Cuerpo vacio")

    ultimo_frame_camara = cuerpo
    ultimo_frame_ts = time_lib.time()
    return {"ok": True}

@app.get("/api/camara-remota")
def camara_remota():
    if ultimo_frame_camara is None:
        raise HTTPException(status_code=503, detail="La laptop aun no ha mandado ninguna foto")

    if time_lib.time() - ultimo_frame_ts > CAMARA_TIMEOUT_SEGUNDOS:
        raise HTTPException(status_code=503, detail="La camara dejo de mandar fotos (laptop apagada o sin Internet)")

    return Response(content=ultimo_frame_camara, media_type="image/jpeg")

# ------------------------------------------------------------
# Video continuo real: la laptop mantiene una conexion WebSocket
# abierta hacia Render (saliente, sin tunel) y manda frame tras
# frame. Render los reparte (broadcast) a todos los visitantes
# que estan viendo /video-en-vivo al mismo tiempo.
# ------------------------------------------------------------

# ------------------------------------------------------------
# Control en tiempo real via WebSocket (ESP32 ↔ Render)
# Sin esto: el ESP32 tarda 10-20s porque cada consulta HTTPS
# crea una nueva conexion SSL. Con WebSocket: la conexion SSL
# se establece una sola vez y los comandos llegan en < 1s.
# ------------------------------------------------------------
class GestorESP32:
    def __init__(self):
        self.conexiones: set[WebSocket] = set()

    async def conectar(self, ws: WebSocket):
        await ws.accept()
        self.conexiones.add(ws)

    def desconectar(self, ws: WebSocket):
        self.conexiones.discard(ws)

    async def enviar_comando(self, mensaje_json: str):
        muertas = set()
        for ws in list(self.conexiones):
            try:
                await ws.send_text(mensaje_json)
            except Exception:
                muertas.add(ws)
        self.conexiones -= muertas

gestor_esp32 = GestorESP32()

@app.websocket("/ws/esp32")
async def ws_esp32_control(websocket: WebSocket):
    """
    El ESP32 se conecta aqui una sola vez al arrancar.
    Cuando el admin cambia un comando, el backend lo empuja
    instantaneamente por este canal sin esperar al siguiente ciclo.
    """
    db = SessionLocal()
    await gestor_esp32.conectar(websocket)
    try:
        # Enviar estado actual al conectar
        comando = obtener_o_crear_comando(db)
        await websocket.send_text(json.dumps({
            "bomba_deseada": comando.bomba_deseada,
            "valvula_deseada": comando.valvula_deseada,
            "version": comando.version
        }))
        # Mantener la conexion viva (el servidor empuja cuando hay cambios)
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=25.0)
            except asyncio.TimeoutError:
                await websocket.send_text('{"ping":1}')
    except WebSocketDisconnect:
        pass
    finally:
        gestor_esp32.desconectar(websocket)
        db.close()

class GestorCamaraEnVivo:
    def __init__(self):
        self.visores: set[asyncio.Queue] = set()

    def registrar_visor(self) -> asyncio.Queue:
        cola = asyncio.Queue(maxsize=2)
        self.visores.add(cola)
        return cola

    def quitar_visor(self, cola: asyncio.Queue):
        self.visores.discard(cola)

    async def difundir(self, frame_bytes: bytes):
        for cola in list(self.visores):
            if cola.full():
                try:
                    cola.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            await cola.put(frame_bytes)

gestor_camara_vivo = GestorCamaraEnVivo()

@app.websocket("/ws/camara-push")
async def ws_camara_push(websocket: WebSocket):
    global ultimo_frame_camara, ultimo_frame_ts
    await websocket.accept()

    try:
        secreto_recibido = await websocket.receive_text()
    except WebSocketDisconnect:
        return

    if secreto_recibido != CAMARA_PUSH_SECRET:
        await websocket.close(code=4001)
        return

    try:
        while True:
            frame_bytes = await websocket.receive_bytes()
            ultimo_frame_camara = frame_bytes
            ultimo_frame_ts = time_lib.time()
            await gestor_camara_vivo.difundir(frame_bytes)
    except WebSocketDisconnect:
        pass

@app.get("/video-en-vivo")
async def video_en_vivo():
    cola = gestor_camara_vivo.registrar_visor()

    async def generador():
        try:
            while True:
                frame = await cola.get()
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
                )
        except asyncio.CancelledError:
            pass
        finally:
            gestor_camara_vivo.quitar_visor(cola)

    return StreamingResponse(
        generador(), media_type="multipart/x-mixed-replace; boundary=frame"
    )
