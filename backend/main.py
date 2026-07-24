"""
main.py — Servidor FastAPI del sistema HMI industrial v2.
"""
import csv, io, json, os, asyncio
import time as time_lib
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import (FastAPI, Depends, HTTPException, Header, Request,
                     WebSocket, WebSocketDisconnect)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

import models, schemas
import auth as auth_module
from database import engine, SessionLocal, Base

app = FastAPI(title="HMI Industrial", version="2.0")
security_scheme = HTTPBearer()
Base.metadata.create_all(bind=engine)

origenes = os.environ.get("ORIGENES_PERMITIDOS", "*").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origenes,
                   allow_methods=["*"], allow_headers=["*"])

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def crear_usuarios_iniciales():
    db = SessionLocal()
    try:
        if not db.query(models.Usuario).first():
            pro = models.Usuario(
                email=os.environ.get("ADMIN_PRO_EMAIL","adminpro@planta.local"),
                username="AdminPro",
                password_hash=auth_module.hash_password(
                    os.environ.get("ADMIN_PRO_PASSWORD","AdminPro2026!")),
                role="admin_pro")
            adm = models.Usuario(
                email=os.environ.get("ADMIN_EMAIL","admin@planta.local"),
                username="Admin",
                password_hash=auth_module.hash_password(
                    os.environ.get("ADMIN_PASSWORD","Admin2026!")),
                role="admin")
            db.add_all([pro, adm]); db.commit()
    finally: db.close()

crear_usuarios_iniciales()

def obtener_usuario_actual(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "No autenticado")
    data = auth_module.verificar_token(authorization.split(" ")[1])
    if not data: raise HTTPException(401, "Token inválido")
    u = db.query(models.Usuario).filter(models.Usuario.email == data["email"],
                                         models.Usuario.is_active == True).first()
    if not u: raise HTTPException(401, "Usuario inactivo")
    return u

def requerir_admin_pro(u=Depends(obtener_usuario_actual)):
    if u.role != "admin_pro": raise HTTPException(403, "Se requiere Admin Pro")
    return u

def log(db, usuario, accion, desc, detalle=None):
    db.add(models.AuditLog(usuario=usuario,accion=accion,descripcion=desc,detalle=detalle))
    db.commit()

def notif(db, para, tipo, titulo, msg, de=None, payload=None):
    db.add(models.Notificacion(para=para,de=de,tipo=tipo,titulo=titulo,mensaje=msg,payload=payload))
    db.commit()

# ─── AUTH ───────────────────────────────────────────────────────
@app.post("/api/auth/login", response_model=schemas.TokenOut)
def login(datos: schemas.LoginInput, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    rl = f"login:{datos.email}"
    if auth_module.verificar_rate_limit(rl):
        raise HTTPException(429, "Demasiados intentos fallidos. Espera 5 minutos.")
    u = db.query(models.Usuario).filter(models.Usuario.email==datos.email,
                                         models.Usuario.is_active==True).first()
    valido = u and auth_module.verificar_password(datos.password, u.password_hash)
    if not valido and u and u.temp_password_hash:
        if u.temp_password_expires and u.temp_password_expires > datetime.utcnow():
            valido = auth_module.verificar_password(datos.password, u.temp_password_hash)
            if valido: u.must_change_password = True
    if not valido:
        auth_module.registrar_intento_fallido(rl)
        log(db, datos.email, "login_fallido", f"Intento fallido desde {ip}")
        raise HTTPException(401, "Credenciales incorrectas")
    auth_module.limpiar_intentos(rl)
    u.last_login = datetime.utcnow(); db.commit()
    log(db, u.email, "login", f"Sesion iniciada desde {ip}")
    return {"access_token": auth_module.crear_token(u.email, u.role),
            "role": u.role, "username": u.username}

@app.post("/api/auth/logout")
def logout(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    log(db, u.email, "logout", "Sesion cerrada"); return {"ok": True}

@app.get("/api/auth/me")
def me(u=Depends(obtener_usuario_actual)):
    return {"email":u.email,"username":u.username,"role":u.role,
            "must_change_password":u.must_change_password}

@app.post("/api/auth/cambiar-password")
def cambiar_password(datos: schemas.CambiarPasswordInput,
                     u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    valido = auth_module.verificar_password(datos.password_actual, u.password_hash)
    if not valido and u.temp_password_hash:
        valido = auth_module.verificar_password(datos.password_actual, u.temp_password_hash)
    if not valido: raise HTTPException(400, "Password actual incorrecto")
    if len(datos.password_nueva) < 8: raise HTTPException(400, "Minimo 8 caracteres")
    u.password_hash = auth_module.hash_password(datos.password_nueva)
    u.temp_password_hash = None; u.temp_password_expires = None; u.must_change_password = False
    db.commit(); log(db, u.email, "cambio_password", "Cambio de password"); return {"ok": True}

@app.post("/api/auth/solicitar-reset")
def solicitar_reset(datos: schemas.SolicitarResetInput, db: Session = Depends(get_db)):
    u = db.query(models.Usuario).filter(models.Usuario.email==datos.email).first()
    if u:
        pros = db.query(models.Usuario).filter(models.Usuario.role=="admin_pro").all()
        for pro in pros:
            notif(db, pro.email, "reset_password",
                  "Solicitud de reset de password",
                  f"{u.username} ({u.email}) solicita restablecer su password.",
                  payload=json.dumps({"usuario_id":u.id,"email":u.email}))
        log(db, datos.email, "solicitud_reset", "Solicito reset de password")
    return {"ok": True}

# ─── USUARIOS ────────────────────────────────────────────────────
@app.get("/api/usuarios", response_model=List[schemas.UsuarioOut])
def listar_usuarios(pro=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    return db.query(models.Usuario).order_by(desc(models.Usuario.created_at)).all()

@app.post("/api/usuarios", response_model=schemas.UsuarioOut)
def crear_usuario(datos: schemas.UsuarioCreate,
                  pro=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    if db.query(models.Usuario).filter(models.Usuario.email==datos.email).first():
        raise HTTPException(400, "Email ya existe")
    u = models.Usuario(email=datos.email, username=datos.username, role=datos.role,
                       password_hash=auth_module.hash_password(datos.password))
    db.add(u); db.commit(); db.refresh(u)
    log(db, pro.email, "crear_usuario", f"Creo {datos.email} rol {datos.role}"); return u

@app.put("/api/usuarios/{uid}")
def actualizar_usuario(uid: int, datos: schemas.UsuarioUpdate,
                       pro=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    u = db.query(models.Usuario).filter(models.Usuario.id==uid).first()
    if not u: raise HTTPException(404, "Usuario no encontrado")
    if datos.role is not None: u.role = datos.role
    if datos.is_active is not None: u.is_active = datos.is_active
    db.commit(); log(db, pro.email, "actualizar_usuario", f"Actualizo #{uid}"); return {"ok":True}

@app.post("/api/usuarios/{uid}/reset-password")
def reset_password(uid: int, pro=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    u = db.query(models.Usuario).filter(models.Usuario.id==uid).first()
    if not u: raise HTTPException(404, "No encontrado")
    tmp = auth_module.generar_password_temporal()
    u.temp_password_hash = auth_module.hash_password(tmp)
    u.temp_password_expires = datetime.utcnow() + timedelta(hours=24)
    u.must_change_password = True; db.commit()
    notif(db, u.email, "reset_password", "Password restablecido",
          f"Password temporal: {tmp}\nExpira en 24h. Cambialo inmediatamente.", de=pro.email)
    log(db, pro.email, "reset_password", f"Reseteo password de {u.email}")
    return {"ok":True,"temp_password":tmp}

# ─── HMI LAYOUT ──────────────────────────────────────────────────
@app.get("/api/hmi/layout", response_model=schemas.HMILayoutOut)
def obtener_layout(_=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    l = db.query(models.HMILayout).filter(models.HMILayout.id==1).first()
    if not l:
        l = models.HMILayout(id=1, nombre="Principal", layout_json="{}"); db.add(l); db.commit(); db.refresh(l)
    return l

@app.post("/api/hmi/layout")
def guardar_layout(datos: schemas.HMILayoutSave,
                   u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if u.role != "admin_pro":
        pt = db.query(models.PermisoTemporal).filter(
            models.PermisoTemporal.para_usuario==u.email,
            models.PermisoTemporal.permiso=="editor",
            models.PermisoTemporal.usado==True,
            models.PermisoTemporal.expires_at>datetime.utcnow()).first()
        if not pt: raise HTTPException(403, "Sin permisos para editar el HMI")
    l = db.query(models.HMILayout).filter(models.HMILayout.id==1).first()
    if not l: l = models.HMILayout(id=1, nombre="Principal"); db.add(l)
    l.layout_json = datos.layout_json; l.updated_by = u.email; l.updated_at = datetime.utcnow()
    db.commit(); log(db, u.email, "guardar_layout", "Guardo diseno HMI"); return {"ok":True}

# ─── NOTIFICACIONES ──────────────────────────────────────────────
@app.get("/api/notificaciones", response_model=List[schemas.NotificacionOut])
def mis_notificaciones(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    return (db.query(models.Notificacion)
            .filter(models.Notificacion.para==u.email)
            .order_by(desc(models.Notificacion.created_at)).limit(50).all())

@app.get("/api/notificaciones/no-leidas")
def no_leidas(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    n = db.query(models.Notificacion).filter(
        models.Notificacion.para==u.email, models.Notificacion.leida==False).count()
    return {"count":n}

@app.post("/api/notificaciones/{nid}/leer")
def marcar_leida(nid: int, u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    n = db.query(models.Notificacion).filter(
        models.Notificacion.id==nid, models.Notificacion.para==u.email).first()
    if n: n.leida = True; db.commit()
    return {"ok":True}

@app.post("/api/notificaciones/leer-todas")
def leer_todas(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    db.query(models.Notificacion).filter(
        models.Notificacion.para==u.email, models.Notificacion.leida==False
    ).update({"leida":True}); db.commit(); return {"ok":True}

# ─── COMENTARIOS ─────────────────────────────────────────────────
@app.post("/api/comentarios", response_model=schemas.ComentarioOut)
def crear_comentario(datos: schemas.ComentarioCreate,
                     u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if not datos.justificacion.strip(): raise HTTPException(400, "Justificacion obligatoria")
    c = models.Comentario(de_usuario=u.email, tipo=datos.tipo,
                          asunto=datos.asunto, justificacion=datos.justificacion)
    db.add(c); db.commit(); db.refresh(c)
    for pro in db.query(models.Usuario).filter(models.Usuario.role=="admin_pro").all():
        notif(db, pro.email, "comentario_nuevo", f"Solicitud de {u.username}",
              f"Asunto: {datos.asunto}\n{datos.justificacion[:100]}",
              de=u.email, payload=json.dumps({"comentario_id":c.id}))
    log(db, u.email, "comentario", f"Envio solicitud: {datos.asunto}"); return c

@app.get("/api/comentarios", response_model=List[schemas.ComentarioOut])
def listar_comentarios(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    q = db.query(models.Comentario)
    if u.role != "admin_pro": q = q.filter(models.Comentario.de_usuario==u.email)
    return q.order_by(desc(models.Comentario.created_at)).limit(100).all()

@app.post("/api/comentarios/{cid}/responder")
def responder(cid: int, datos: schemas.ResponderComentario,
              pro=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    c = db.query(models.Comentario).filter(models.Comentario.id==cid).first()
    if not c: raise HTTPException(404, "No encontrado")
    c.respuesta=datos.respuesta; c.respondido_por=pro.email
    c.estado="respondido" if datos.aprobar else "rechazado"
    c.respondido_at=datetime.utcnow(); db.commit()
    notif(db, c.de_usuario, "comentario_respondido",
          f"Tu solicitud fue {'aprobada' if datos.aprobar else 'rechazada'}",
          f"Asunto: {c.asunto}\nRespuesta: {datos.respuesta}", de=pro.email,
          payload=json.dumps({"comentario_id":cid,"aprobado":datos.aprobar}))
    log(db, pro.email, "responder_comentario",
        f"{'Aprobo' if datos.aprobar else 'Rechazo'} #{cid}"); return {"ok":True}

# ─── PERMISOS TEMPORALES ─────────────────────────────────────────
@app.post("/api/permisos-temp", response_model=schemas.PermisoTemporalOut)
def crear_permiso(datos: schemas.PermisoTemporalCreate,
                  pro=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    dest = db.query(models.Usuario).filter(models.Usuario.email==datos.para_usuario).first()
    if not dest: raise HTTPException(404, "Usuario no encontrado")
    token = auth_module.generar_token_editor()
    expires = datetime.utcnow() + timedelta(minutes=datos.duracion_min)
    pt = models.PermisoTemporal(token=token, para_usuario=datos.para_usuario,
                                 otorgado_por=pro.email, duracion_min=datos.duracion_min,
                                 expires_at=expires, comentario_id=datos.comentario_id)
    db.add(pt); db.commit(); db.refresh(pt)
    if datos.comentario_id:
        c = db.query(models.Comentario).filter(models.Comentario.id==datos.comentario_id).first()
        if c:
            c.estado="respondido"; c.respondido_por=pro.email; c.respondido_at=datetime.utcnow()
            c.respuesta=f"Acceso concedido por {datos.duracion_min} min. Token: {token}"; db.commit()
    notif(db, datos.para_usuario, "permiso_editor", "Acceso al Editor aprobado",
          f"Token: {token}\nValido por {datos.duracion_min} min. Expira: {expires.strftime('%H:%M %d/%m/%Y')}",
          de=pro.email, payload=json.dumps({"token":token,"expires_at":expires.isoformat()}))
    log(db, pro.email, "permiso_editor", f"Concedio acceso a {datos.para_usuario} por {datos.duracion_min}min")
    return pt

@app.post("/api/permisos-temp/verificar")
def verificar_token_editor(datos: schemas.VerificarToken,
                           u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    pt = db.query(models.PermisoTemporal).filter(
        models.PermisoTemporal.token==datos.token,
        models.PermisoTemporal.para_usuario==u.email).first()
    if not pt: raise HTTPException(404, "Token no valido")
    if pt.expires_at < datetime.utcnow(): raise HTTPException(400, "Token expirado")
    if not pt.usado: pt.usado=True; pt.used_at=datetime.utcnow(); db.commit()
    log(db, u.email, "usar_token_editor", f"Uso token editor")
    return {"ok":True,"expires_at":pt.expires_at.isoformat(),
            "minutos_restantes":max(0,int((pt.expires_at-datetime.utcnow()).total_seconds()/60))}

@app.get("/api/permisos-temp/activo")
def permiso_activo(u=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    if u.role=="admin_pro": return {"activo":True,"permanente":True}
    pt = db.query(models.PermisoTemporal).filter(
        models.PermisoTemporal.para_usuario==u.email,
        models.PermisoTemporal.usado==True,
        models.PermisoTemporal.expires_at>datetime.utcnow()
    ).order_by(desc(models.PermisoTemporal.expires_at)).first()
    if pt: return {"activo":True,"permanente":False,"expires_at":pt.expires_at.isoformat(),
                   "minutos_restantes":max(0,int((pt.expires_at-datetime.utcnow()).total_seconds()/60))}
    return {"activo":False}

# ─── AUDIT LOG ───────────────────────────────────────────────────
@app.get("/api/audit", response_model=List[schemas.AuditLogOut])
def obtener_audit(
    limit: int = 200, offset: int = 0,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    usuario_filtro: Optional[str] = None,
    accion_filtro: Optional[str] = None,
    _=Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    q = db.query(models.AuditLog)
    if desde:
        try: q = q.filter(models.AuditLog.timestamp >= datetime.fromisoformat(desde))
        except: pass
    if hasta:
        try: q = q.filter(models.AuditLog.timestamp <= datetime.fromisoformat(hasta))
        except: pass
    if usuario_filtro:
        q = q.filter(models.AuditLog.usuario == usuario_filtro)
    if accion_filtro:
        q = q.filter(models.AuditLog.accion == accion_filtro)
    return q.order_by(desc(models.AuditLog.timestamp)).offset(offset).limit(limit).all()

# ─── EXPORT ──────────────────────────────────────────────────────
@app.get("/api/export/lecturas")
def export_lecturas(desde: Optional[str]=None, hasta: Optional[str]=None,
                    _=Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    q = db.query(models.Lectura)
    if desde: q=q.filter(models.Lectura.timestamp>=datetime.fromisoformat(desde))
    if hasta: q=q.filter(models.Lectura.timestamp<=datetime.fromisoformat(hasta))
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["timestamp","nivel","caudal","temp_ambiente","humedad","temp_agua",
                "flotador_bajo","flotador_alto","bomba","valvula"])
    for l in q.order_by(models.Lectura.timestamp).all():
        w.writerow([l.timestamp,l.nivel,l.caudal,l.temp_ambiente,l.humedad,
                    l.temp_agua,l.flotador_bajo,l.flotador_alto,l.bomba_estado,l.valvula_estado])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]),media_type="text/csv",
                             headers={"Content-Disposition":"attachment;filename=lecturas.csv"})

@app.get("/api/export/audit")
def export_audit(desde: Optional[str]=None, hasta: Optional[str]=None,
                 _=Depends(requerir_admin_pro), db: Session = Depends(get_db)):
    q = db.query(models.AuditLog)
    if desde: q=q.filter(models.AuditLog.timestamp>=datetime.fromisoformat(desde))
    if hasta: q=q.filter(models.AuditLog.timestamp<=datetime.fromisoformat(hasta))
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["timestamp","usuario","accion","descripcion","detalle"])
    for r in q.order_by(models.AuditLog.timestamp).all():
        w.writerow([r.timestamp,r.usuario,r.accion,r.descripcion,r.detalle])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]),media_type="text/csv",
                             headers={"Content-Disposition":"attachment;filename=audit.csv"})

# ─── SENSORES PLANTA 1 ───────────────────────────────────────────
@app.post("/api/lecturas",response_model=schemas.LecturaOut)
def crear_lectura(l:schemas.LecturaCreate,db:Session=Depends(get_db)):
    db_l=models.Lectura(**l.model_dump());db.add(db_l);db.commit();db.refresh(db_l);return db_l

@app.get("/api/lecturas/ultima",response_model=schemas.LecturaOut|None)
def ultima(db:Session=Depends(get_db)):
    return db.query(models.Lectura).order_by(desc(models.Lectura.id)).first()

@app.get("/api/lecturas/historial",response_model=List[schemas.LecturaOut])
def historial(minutos:int=30,db:Session=Depends(get_db)):
    d=datetime.utcnow()-timedelta(minutes=minutos)
    return db.query(models.Lectura).filter(models.Lectura.timestamp>=d).order_by(models.Lectura.timestamp).all()

@app.get("/api/comando",response_model=schemas.ComandoOut)
def get_cmd(db:Session=Depends(get_db)):
    c=db.query(models.Comando).filter(models.Comando.id==1).first()
    if not c:c=models.Comando(id=1,bomba_deseada=True,valvula_deseada=False,version=0);db.add(c);db.commit();db.refresh(c)
    return c

@app.post("/api/admin/comando",response_model=schemas.ComandoOut)
async def set_cmd(datos:schemas.ComandoUpdate,u=Depends(obtener_usuario_actual),db:Session=Depends(get_db)):
    c=db.query(models.Comando).filter(models.Comando.id==1).first()
    if not c:c=models.Comando(id=1);db.add(c)
    c.bomba_deseada=datos.bomba_deseada;c.valvula_deseada=datos.valvula_deseada;c.version+=1
    db.commit();db.refresh(c)
    await gestor_esp32.enviar_comando(json.dumps({"bomba_deseada":c.bomba_deseada,"valvula_deseada":c.valvula_deseada,"version":c.version}))
    log(db,u.email,"control_p1",f"Bomba:{'ON' if datos.bomba_deseada else 'OFF'} Valvula:{'ON' if datos.valvula_deseada else 'OFF'}")
    return c

# ─── SENSORES PLANTA 2 ───────────────────────────────────────────
@app.post("/api/lecturas/planta2",response_model=schemas.LecturaPlanta2Out)
def lect_p2(l:schemas.LecturaPlanta2Create,db:Session=Depends(get_db)):
    x=models.LecturaPlanta2(**l.model_dump());db.add(x);db.commit();db.refresh(x);return x

@app.get("/api/lecturas/planta2/ultima",response_model=schemas.LecturaPlanta2Out|None)
def ultima_p2(db:Session=Depends(get_db)):
    return db.query(models.LecturaPlanta2).order_by(desc(models.LecturaPlanta2.id)).first()

@app.get("/api/lecturas/planta2/historial",response_model=List[schemas.LecturaPlanta2Out])
def hist_p2(minutos:int=30,db:Session=Depends(get_db)):
    d=datetime.utcnow()-timedelta(minutes=minutos)
    return db.query(models.LecturaPlanta2).filter(models.LecturaPlanta2.timestamp>=d).order_by(models.LecturaPlanta2.timestamp).all()

@app.get("/api/comando/planta2",response_model=schemas.ComandoPlanta2Out)
def get_cmd_p2(db:Session=Depends(get_db)):
    c=db.query(models.ComandoPlanta2).filter(models.ComandoPlanta2.id==1).first()
    if not c:c=models.ComandoPlanta2(id=1);db.add(c);db.commit();db.refresh(c)
    return c

@app.post("/api/admin/comando/planta2",response_model=schemas.ComandoPlanta2Out)
async def set_cmd_p2(datos:schemas.ComandoPlanta2Update,u=Depends(obtener_usuario_actual),db:Session=Depends(get_db)):
    c=db.query(models.ComandoPlanta2).filter(models.ComandoPlanta2.id==1).first()
    if not c:c=models.ComandoPlanta2(id=1);db.add(c)
    c.valvula_deseada=datos.valvula_deseada;c.pwm_deseado=max(0,min(255,datos.pwm_deseado));c.version+=1
    db.commit();db.refresh(c)
    log(db,u.email,"control_p2",f"Valvula:{'ON' if datos.valvula_deseada else 'OFF'} PWM:{datos.pwm_deseado}")
    return c

# ─── WEBSOCKET ESP32 ─────────────────────────────────────────────
class GestorESP32:
    def __init__(self): self.conexiones: set[WebSocket] = set()
    async def conectar(self,ws): await ws.accept(); self.conexiones.add(ws)
    def desconectar(self,ws): self.conexiones.discard(ws)
    async def enviar_comando(self,msg):
        muertas=set()
        for ws in list(self.conexiones):
            try: await ws.send_text(msg)
            except: muertas.add(ws)
        self.conexiones-=muertas

gestor_esp32=GestorESP32()

@app.websocket("/ws/esp32")
async def ws_esp32(ws:WebSocket):
    db=SessionLocal();await gestor_esp32.conectar(ws)
    try:
        c=db.query(models.Comando).filter(models.Comando.id==1).first()
        if c:await ws.send_text(json.dumps({"bomba_deseada":c.bomba_deseada,"valvula_deseada":c.valvula_deseada,"version":c.version}))
        while True:
            try:await asyncio.wait_for(ws.receive_text(),timeout=25.0)
            except asyncio.TimeoutError:await ws.send_text('{"ping":1}')
    except WebSocketDisconnect:pass
    finally:gestor_esp32.desconectar(ws);db.close()

# ─── CÁMARA ──────────────────────────────────────────────────────
class GestorCamara:
    def __init__(self): self.visores: set[asyncio.Queue] = set()
    def registrar_visor(self): q=asyncio.Queue(maxsize=2);self.visores.add(q);return q
    def quitar_visor(self,q): self.visores.discard(q)
    async def difundir(self,frame):
        for q in list(self.visores):
            if q.full():
                try:q.get_nowait()
                except:pass
            await q.put(frame)

gestor_camara=GestorCamara()
ultimo_frame:bytes|None=None
ultimo_frame_ts:float=0.0
CAMARA_SECRET=os.environ.get("CAMARA_PUSH_SECRET","cambia-este-secreto")

@app.post("/api/camara-frame")
async def recv_frame(request:Request,x_camara_secret:str=Header(None)):
    if x_camara_secret!=CAMARA_SECRET:raise HTTPException(401,"Secreto incorrecto")
    global ultimo_frame,ultimo_frame_ts
    cuerpo=await request.body()
    if not cuerpo:raise HTTPException(400,"Vacio")
    ultimo_frame=cuerpo;ultimo_frame_ts=time_lib.time()
    await gestor_camara.difundir(cuerpo)
    return {"ok":True}

@app.get("/api/camara-remota")
def camara_remota():
    if not ultimo_frame:raise HTTPException(503,"No disponible")
    if time_lib.time()-ultimo_frame_ts>5:raise HTTPException(503,"Sin senal")
    return Response(content=ultimo_frame,media_type="image/jpeg")

@app.websocket("/ws/camara-push")
async def ws_camara(ws:WebSocket):
    global ultimo_frame,ultimo_frame_ts
    await ws.accept()
    try:secreto=await ws.receive_text()
    except WebSocketDisconnect:return
    if secreto!=CAMARA_SECRET:await ws.close(code=4001);return
    try:
        while True:
            frame=await ws.receive_bytes()
            ultimo_frame=frame;ultimo_frame_ts=time_lib.time()
            await gestor_camara.difundir(frame)
    except WebSocketDisconnect:pass

@app.get("/video-en-vivo")
async def video_vivo():
    cola=gestor_camara.registrar_visor()
    async def gen():
        try:
            while True:
                f=await cola.get()
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"+f+b"\r\n"
        except asyncio.CancelledError:pass
        finally:gestor_camara.quitar_visor(cola)
    return StreamingResponse(gen(),media_type="multipart/x-mixed-replace; boundary=frame")
