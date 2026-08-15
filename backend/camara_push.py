"""
Manda VIDEO de una webcam al backend en Render por WebSocket (solo salida).
MULTI-CAMARA: cada camara usa un CANAL con nombre propio.

Esta version DIAGNOSTICA: tras enviar el secreto, espera la confirmacion del
servidor ("OK") y, si algo falla, imprime el motivo exacto (secreto incorrecto,
backend viejo, red, etc.).

Requisitos:  pip install opencv-python websockets
Uso:         python camara_push.py
"""

import asyncio
import cv2
import websockets

# ------------------------------------------------------------
# CONFIGURACION
# ------------------------------------------------------------
CANAL = "planta1"          # nombre unico de ESTA camara
CAMARA_INDICE = 0          # indice de la webcam (prueba 0 si 1 no abre)
HOST = "planta-backend-ifsy.onrender.com"

# >>> PON AQUI TU SECRETO REAL (igual a CAMARA_PUSH_SECRET en Render) <<<
SECRETO = "b74efa0307a16dc0920b5f1bcd91cd64"

INTERVALO_SEGUNDOS = 0.05  # ~20 fps
CALIDAD_JPEG = 45

URL_WS = f"wss://{HOST}/ws/camara-push/{CANAL}"
# URL para el widget de camara del HMI:  https://{HOST}/video-en-vivo/{CANAL}


async def transmitir():
    if SECRETO == "CAMBIA_ESTE_SECRETO":
        print("[AVISO] No cambiaste SECRETO. Debe ser IGUAL a CAMARA_PUSH_SECRET de Render.")

    camara = cv2.VideoCapture(CAMARA_INDICE, cv2.CAP_DSHOW)  # DirectShow: evita el error MSMF -1072875772 en Windows
    camara.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M','J','P','G'))  # evita el tinte morado
    camara.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camara.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    camara.set(cv2.CAP_PROP_FPS, 30)
    if not camara.isOpened():
        print(f"[ERROR] No se pudo abrir la camara en el indice {CAMARA_INDICE}")
        return

    print(f"[INFO] Canal: {CANAL}")
    print(f"[INFO] URL para el widget:  https://{HOST}/video-en-vivo/{CANAL}")

    while True:
        try:
            async with websockets.connect(URL_WS, max_size=None,
                                          ping_interval=20, ping_timeout=20) as ws:
                await ws.send(SECRETO)
                try:
                    resp = await asyncio.wait_for(ws.recv(), timeout=4)
                    if isinstance(resp, str) and resp.startswith("SECRETO"):
                        print("[ERROR] El servidor RECHAZO el secreto. "
                              "SECRETO debe ser igual a CAMARA_PUSH_SECRET en Render.")
                        await asyncio.sleep(5)
                        continue
                except asyncio.TimeoutError:
                    pass  # backend viejo que no confirma: seguimos igual

                print("[OK] Autenticado. Transmitiendo video...")

                while True:
                    ok, frame = camara.read()
                    if not ok:
                        await asyncio.sleep(0.3)
                        continue
                    ok, buffer = cv2.imencode(
                        ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), CALIDAD_JPEG]
                    )
                    if not ok:
                        continue
                    await ws.send(buffer.tobytes())
                    await asyncio.sleep(INTERVALO_SEGUNDOS)

        except KeyboardInterrupt:
            print("\n[INFO] Detenido por el usuario.")
            break
        except websockets.ConnectionClosed as e:
            print(f"[ERROR] Cerrado por el servidor. code={e.code} reason={e.reason!r}")
            if e.code == 4001:
                print("   -> Secreto incorrecto (revisa SECRETO / CAMARA_PUSH_SECRET).")
            elif e.code in (1005, 1006):
                print("   -> Cierre abrupto. Verifica que el backend NUEVO este desplegado:")
                print(f"      abre  https://{HOST}/api/camaras  en el navegador (no debe dar 404).")
            print("   Reintentando en 3s...")
            await asyncio.sleep(3)
        except Exception as e:
            print(f"[ERROR] {e}. Reintentando en 3s...")
            await asyncio.sleep(3)

    camara.release()


if __name__ == "__main__":
    asyncio.run(transmitir())
