import re
import time
import threading
import queue

import serial
import serial.tools.list_ports
import requests

# ------------------------------------------------------------
# CONFIGURACION
# ------------------------------------------------------------
PUERTO = "COM4"          # <-- AJUSTA esto a tu puerto real
BAUDRATE = 115200        # <-- AJUSTA si tu firmware usa otro baudrate
URL_BACKEND = "https://planta-backend-ifsy.onrender.com/api/lecturas"
INTERVALO_ENVIO = 3.0    # segundos entre cada POST

# ------------------------------------------------------------
# PARSEO (copiado de hmi_identificacion_ft.py, sin cambios)
# ------------------------------------------------------------
def parsear_linea_monitor(linea, estado):
    if not linea.startswith("M,"):
        return False

    partes = linea.split(",")
    if len(partes) != 10:
        return False

    try:
        estado["temp_amb"]  = float(partes[1])
        estado["hum_amb"]   = float(partes[2])
        estado["temp_liq"]  = float(partes[3])
        estado["nivel"]     = float(partes[4])
        estado["caudal"]    = float(partes[5])
        estado["flot_alto"] = bool(int(partes[6]))
        estado["flot_bajo"] = bool(int(partes[7]))
        estado["bomba"]     = bool(int(partes[8]))
        estado["valvula"]   = bool(int(partes[9]))
    except ValueError:
        return False

    return True

# ------------------------------------------------------------
# HILO DE LECTURA SERIAL (mismo esquema que tu HMI)
# ------------------------------------------------------------
class LectorSerial(threading.Thread):
    def __init__(self, puerto, baudrate, cola_salida):
        super().__init__(daemon=True)
        self.puerto = puerto
        self.baudrate = baudrate
        self.cola_salida = cola_salida
        self._detener = threading.Event()
        self.ser = None

    def run(self):
        try:
            self.ser = serial.Serial(self.puerto, self.baudrate, timeout=0.05)
        except Exception as e:
            print(f"[ERROR] No se pudo abrir el puerto: {e}")
            return

        time.sleep(2.0)
        self.ser.reset_input_buffer()
        print("[OK] Puerto serial conectado.")

        buf = ""
        while not self._detener.is_set():
            try:
                fragmento = self.ser.read(256).decode("utf-8", errors="ignore")
                if fragmento:
                    buf += fragmento
                    while "\n" in buf:
                        linea, buf = buf.split("\n", 1)
                        linea = linea.strip()
                        if linea:
                            self.cola_salida.put(linea)
            except Exception as e:
                print(f"[ERROR] Lectura serial: {e}")
                break

        if self.ser and self.ser.is_open:
            self.ser.close()

    def detener(self):
        self._detener.set()


# ------------------------------------------------------------
# ENVIO AL BACKEND
# ------------------------------------------------------------
def construir_payload(estado):
    return {
        "nivel": estado.get("nivel", 0.0) or 0.0,
        "caudal": estado.get("caudal", 0.0) or 0.0,
        "temp_ambiente": estado.get("temp_amb", 0.0) or 0.0,
        "humedad": estado.get("hum_amb", 0.0) or 0.0,
        "temp_agua": estado.get("temp_liq", 0.0) or 0.0,
        "flotador_bajo": bool(estado.get("flot_bajo", False)),
        "flotador_alto": bool(estado.get("flot_alto", False)),
        "bomba_estado": bool(estado.get("bomba", False)),
        "valvula_estado": bool(estado.get("valvula", False)),
    }


def enviar_al_backend(payload):
    try:
        r = requests.post(URL_BACKEND, json=payload, timeout=2.0)
        if r.status_code == 200:
            print(f"[ENVIADO] {payload}")
        else:
            print(f"[ERROR BACKEND] {r.status_code}: {r.text}")
    except Exception as e:
        print(f"[ERROR ENVIO] {e}")


# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------
def main():
    cola = queue.Queue()
    estado_sensores = {}

    lector = LectorSerial(PUERTO, BAUDRATE, cola)
    lector.start()

    ultimo_envio = time.time()

    try:
        while True:
            try:
                linea = cola.get(timeout=0.1)
                parsear_linea_monitor(linea, estado_sensores)
            except queue.Empty:
                pass

            ahora = time.time()
            if ahora - ultimo_envio >= INTERVALO_ENVIO:
                payload = construir_payload(estado_sensores)
                enviar_al_backend(payload)
                ultimo_envio = ahora

    except KeyboardInterrupt:
        print("\n[INFO] Deteniendo gateway...")
        lector.detener()


if __name__ == "__main__":
    main()