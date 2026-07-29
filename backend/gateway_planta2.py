"""
gateway_planta2.py
==================
Script bidireccional para la Planta 2 (Arduino UNO).

  Dirección 1 — Arduino → Web:
    Lee los datos que imprime el Arduino por serial y los sube
    al backend cada 2 segundos.

  Dirección 2 — Web → Arduino:
    Consulta el backend cada 2 segundos para ver si el admin
    cambió la válvula o el PWM de la bomba, y si hubo un cambio
    nuevo lo envía al Arduino por serial con el formato:
        V1  → abrir válvula
        V0  → cerrar válvula
        P120 → poner PWM de la bomba a 120

El Arduino ya sabe interpretar esos comandos (sección "COMANDOS MATLAB").

INSTALACION (una sola vez):
    pip install pyserial requests

USO:
    python gateway_planta2.py

CONFIGURAR:
    1. Cambiar PUERTO al COM del Arduino (ver Administrador de Dispositivos)
    2. BAUDRATE ya es 115200, no cambiar
"""

import time
import serial
import requests

# ================================================================
#  CAMBIAR SOLO ESTE VALOR
# ================================================================
PUERTO   = "COM4"    # <-- cambiar al puerto real (COM3, COM5, etc.)
BAUDRATE = 115200    # <-- no cambiar (Serial.begin(115200) en el Arduino)
# ================================================================

URL_BASE     = "https://planta-backend-ifsy.onrender.com"
URL_DATOS    = f"{URL_BASE}/api/lecturas/planta2"
URL_COMANDO  = f"{URL_BASE}/api/comando/planta2"

INTERVALO_DATOS   = 2.0   # segundos entre cada POST de datos
INTERVALO_COMANDO = 2.0   # segundos entre cada GET de comandos


def parsear_linea(linea: str) -> dict | None:
    """
    El Arduino imprime cada 500 ms (formato fijo):
        valvula,pwm,nivel_cm,caudal_m3min
        Ejemplo: 1,120,15.3,0.0025
    """
    try:
        partes = linea.split(",")
        if len(partes) != 4:
            return None
        valvula       = int(partes[0])
        pwm           = int(partes[1])
        nivel_cm      = float(partes[2])
        caudal_m3_min = float(partes[3])
        if not (0 <= nivel_cm <= 50):
            return None
        return {
            "nivel":          round(nivel_cm, 2),
            "caudal":         round(caudal_m3_min * 1000.0, 4),  # m3/min → L/min
            "valvula_estado": valvula == 1,
            "bomba_estado":   pwm > 0,
        }
    except (ValueError, IndexError):
        return None


def main():
    print("=" * 60)
    print("  Gateway Planta 2 — Arduino UNO ↔ Plataforma Web")
    print("=" * 60)
    print(f"  Puerto  : {PUERTO}   Baudrate: {BAUDRATE}")
    print(f"  Subida  : {URL_DATOS}")
    print(f"  Comandos: {URL_COMANDO}")
    print("  Ctrl+C para detener.")
    print("=" * 60 + "\n")

    try:
        ser = serial.Serial(PUERTO, BAUDRATE, timeout=1)
    except serial.SerialException as e:
        print(f"[ERROR] No se pudo abrir {PUERTO}: {e}")
        print("  Verificar el puerto en Administrador de Dispositivos → Puertos COM.")
        input("\nPresionar ENTER para salir...")
        return

    time.sleep(2)
    ser.reset_input_buffer()
    print(f"[OK] Puerto {PUERTO} abierto.\n")

    buffer              = ""
    ultimo_dato         = None
    ultimo_envio_datos  = 0
    ultimo_chequeo_cmd  = 0
    ultima_version_cmd  = -1
    total_enviados      = 0

    try:
        while True:
            ahora = time.time()

            # ── 1. Leer bytes del serial ──────────────────────────
            try:
                fragmento = ser.read(256).decode("utf-8", errors="ignore")
                if fragmento:
                    buffer += fragmento
                    while "\n" in buffer:
                        linea, buffer = buffer.split("\n", 1)
                        datos = parsear_linea(linea.strip())
                        if datos:
                            ultimo_dato = datos
            except serial.SerialException as e:
                print(f"[ERROR] Puerto desconectado: {e}")
                break

            # ── 2. Subir datos al backend ─────────────────────────
            if ultimo_dato and (ahora - ultimo_envio_datos) >= INTERVALO_DATOS:
                try:
                    r = requests.post(URL_DATOS, json=ultimo_dato, timeout=4)
                    if r.status_code == 200:
                        total_enviados    += 1
                        ultimo_envio_datos = ahora
                        print(
                            f"[↑] #{total_enviados:04d}  "
                            f"Nivel:{ultimo_dato['nivel']:.1f}cm  "
                            f"Caudal:{ultimo_dato['caudal']:.3f}L/m  "
                            f"V:{'ON' if ultimo_dato['valvula_estado'] else 'OFF'}  "
                            f"B:{'ON' if ultimo_dato['bomba_estado'] else 'OFF'}"
                        )
                    else:
                        print(f"[WARN] Datos: servidor respondió {r.status_code}")
                except Exception as e:
                    print(f"[WARN] No se pudo subir datos: {e}")
                    ultimo_envio_datos = ahora

            # ── 3. Consultar comandos del admin ───────────────────
            if (ahora - ultimo_chequeo_cmd) >= INTERVALO_COMANDO:
                ultimo_chequeo_cmd = ahora
                try:
                    r = requests.get(URL_COMANDO, timeout=3)
                    if r.status_code == 200:
                        cmd     = r.json()
                        version = cmd.get("version", 0)

                        if version != ultima_version_cmd:
                            ultima_version_cmd = version

                            # Enviar válvula al Arduino: V1 o V0
                            cmd_valvula = f"V{1 if cmd['valvula_deseada'] else 0}"
                            ser.write((cmd_valvula + "\n").encode())
                            time.sleep(0.05)

                            # Enviar PWM de bomba: P<valor>
                            cmd_pwm = f"P{cmd['pwm_deseado']}"
                            ser.write((cmd_pwm + "\n").encode())

                            print(
                                f"[↓] Comando del admin → "
                                f"Valvula:{'ABRIR' if cmd['valvula_deseada'] else 'CERRAR'}  "
                                f"PWM:{cmd['pwm_deseado']}"
                            )
                except Exception as e:
                    pass   # silencioso: si falla el internet, la planta sigue en el ultimo estado

    except KeyboardInterrupt:
        print(f"\n[INFO] Detenido. Datos enviados: {total_enviados}")

    ser.close()
    print("[INFO] Puerto cerrado.")


if __name__ == "__main__":
    main()
