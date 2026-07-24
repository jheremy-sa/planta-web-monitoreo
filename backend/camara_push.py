"""
Manda VIDEO CONTINUO de la webcam hacia el backend en Render, por una
conexion WebSocket persistente, sin necesitar ningun tunel ni abrir
ningun puerto.

Funciona con cualquier conexion a Internet que tenga salida normal
(datos moviles, WiFi de universidad, lo que sea) porque solo SALE
hacia Render -- nunca necesita que alguien "entre" a la laptop.

Si se corta la conexion (datos moviles inestables, etc.), se
reconecta solo cada 3 segundos.

Requisitos:
    pip install opencv-python websockets

Uso:
    python camara_push.py
"""

import asyncio
import cv2
import websockets

# ------------------------------------------------------------
# CONFIGURACION
# ------------------------------------------------------------
CAMARA_INDICE = 1  # mismo indice que ya usabas en main.py
URL_WS = "wss://planta-backend-ifsy.onrender.com/ws/camara-push"
SECRETO = "b74efa0307a16dc0920b5f1bcd91cd64"  # debe ser IGUAL al CAMARA_PUSH_SECRET de Render
INTERVALO_SEGUNDOS = 0.05  # ~20 fotogramas por segundo objetivo
CALIDAD_JPEG = 45  # 0-100, mas bajo = mas liviano/rapido


async def transmitir():
    camara = cv2.VideoCapture(CAMARA_INDICE)
    camara.set(cv2.CAP_PROP_FPS, 30)
    if not camara.isOpened():
        print(f"[ERROR] No se pudo abrir la camara en el indice {CAMARA_INDICE}")
        return

    while True:
        try:
            async with websockets.connect(URL_WS, max_size=None) as ws:
                await ws.send(SECRETO)
                print("[OK] Conectado a Render. Transmitiendo video...")

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
        except Exception as e:
            print(f"[ERROR] Conexion perdida ({e}). Reintentando en 3s...")
            await asyncio.sleep(3)

    camara.release()


if __name__ == "__main__":
    asyncio.run(transmitir())
