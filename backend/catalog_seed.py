"""
catalog_seed.py — Fuente de verdad del catálogo de microcontroladores y pines.

Enfoque (superior al del otro grupo): las definiciones viven en código
versionado y se sirven por API, sin listas duplicadas en el JavaScript.

seed_catalog(db) es IDEMPOTENTE: puede ejecutarse en cada arranque sin
duplicar filas (get-or-create por 'code' y por (mcu_id, label)).

Capacidades de pin admitidas (caps):
  digital, analog_in, pwm, dac, input_only, i2c, spi, uart, reserved
El pin elegido en la web = el GPIO real que alimenta el firmware.
"""
from models import Microcontroller, McuPin


# ─── Helpers para construir listas de pines ───────────────────────
def _pin(label, gpio, caps, note=None):
    return {"label": label, "gpio_number": gpio, "caps": caps, "note": note}


def _arduino_uno_pins():
    pins = []
    uart = {0: "RX", 1: "TX"}
    pwm = {3, 5, 6, 9, 10, 11}
    spi = {10: "SS", 11: "MOSI", 12: "MISO", 13: "SCK"}
    for d in range(0, 14):
        caps = ["digital"]
        note = None
        if d in uart:
            caps.append("uart"); note = uart[d]
        if d in pwm:
            caps.append("pwm")
        if d in spi:
            caps.append("spi"); note = spi[d]
        if d == 13:
            note = (note + " / LED") if note else "LED"
        pins.append(_pin(f"D{d}", d, caps, note))
    # Analógicos A0..A5 (también digitales); A4/A5 = I2C
    for a in range(0, 6):
        caps = ["digital", "analog_in"]
        note = None
        if a == 4:
            caps.append("i2c"); note = "SDA"
        if a == 5:
            caps.append("i2c"); note = "SCL"
        pins.append(_pin(f"A{a}", 14 + a, caps, note))
    return pins


def _arduino_nano_pins():
    pins = _arduino_uno_pins()
    # Nano añade A6/A7 SOLO entrada analógica (no digitalWrite)
    pins.append(_pin("A6", 20, ["analog_in", "input_only"], "solo entrada analógica"))
    pins.append(_pin("A7", 21, ["analog_in", "input_only"], "solo entrada analógica"))
    return pins


def _arduino_r4_pins():
    # UNO R4 WiFi: pinout tipo UNO; A0 con DAC de 12 bits
    pins = _arduino_uno_pins()
    for p in pins:
        if p["label"] == "A0":
            p["caps"] = ["digital", "analog_in", "dac"]
            p["note"] = "DAC 12-bit"
    return pins


def _arduino_mega_pins():
    pins = []
    pwm = set(range(2, 14)) | {44, 45, 46}
    uart = {0: "RX0", 1: "TX0", 19: "RX1", 18: "TX1", 17: "RX2", 16: "TX2", 15: "RX3", 14: "TX3"}
    i2c = {20: "SDA", 21: "SCL"}
    spi = {50: "MISO", 51: "MOSI", 52: "SCK", 53: "SS"}
    for d in range(0, 54):
        caps = ["digital"]
        note = None
        if d in pwm:
            caps.append("pwm")
        if d in uart:
            caps.append("uart"); note = uart[d]
        if d in i2c:
            caps.append("i2c"); note = i2c[d]
        if d in spi:
            caps.append("spi"); note = spi[d]
        if d == 13:
            note = (note + " / LED") if note else "LED"
        pins.append(_pin(f"D{d}", d, caps, note))
    for a in range(0, 16):
        pins.append(_pin(f"A{a}", 54 + a, ["digital", "analog_in"], None))
    return pins


def _esp32_pins():
    # ESP32 DevKit v1 (se omiten GPIO6-11 = flash interno)
    adc2 = "ADC2"
    P = _pin
    return [
        P("GPIO0",  0,  ["digital", "pwm"], "boot/strapping"),
        P("GPIO1",  1,  ["uart", "reserved"], "TX0"),
        P("GPIO2",  2,  ["digital", "pwm", "analog_in"], "LED onboard / " + adc2),
        P("GPIO3",  3,  ["uart", "reserved"], "RX0"),
        P("GPIO4",  4,  ["digital", "pwm", "analog_in"], adc2 + " / touch"),
        P("GPIO5",  5,  ["digital", "pwm"], "strapping"),
        P("GPIO12", 12, ["digital", "pwm", "analog_in"], adc2 + " / strapping"),
        P("GPIO13", 13, ["digital", "pwm", "analog_in"], adc2),
        P("GPIO14", 14, ["digital", "pwm", "analog_in"], adc2),
        P("GPIO15", 15, ["digital", "pwm", "analog_in"], adc2 + " / strapping"),
        P("GPIO16", 16, ["digital", "pwm"], None),
        P("GPIO17", 17, ["digital", "pwm"], None),
        P("GPIO18", 18, ["digital", "pwm", "spi"], "SCK"),
        P("GPIO19", 19, ["digital", "pwm", "spi"], "MISO"),
        P("GPIO21", 21, ["digital", "pwm", "i2c"], "SDA"),
        P("GPIO22", 22, ["digital", "pwm", "i2c"], "SCL"),
        P("GPIO23", 23, ["digital", "pwm", "spi"], "MOSI"),
        P("GPIO25", 25, ["digital", "pwm", "analog_in", "dac"], "DAC1 / " + adc2),
        P("GPIO26", 26, ["digital", "pwm", "analog_in", "dac"], "DAC2 / " + adc2),
        P("GPIO27", 27, ["digital", "pwm", "analog_in"], adc2 + " / touch"),
        P("GPIO32", 32, ["digital", "pwm", "analog_in"], "ADC1"),
        P("GPIO33", 33, ["digital", "pwm", "analog_in"], "ADC1"),
        P("GPIO34", 34, ["analog_in", "input_only"], "ADC1 / solo entrada"),
        P("GPIO35", 35, ["analog_in", "input_only"], "ADC1 / solo entrada"),
        P("GPIO36", 36, ["analog_in", "input_only"], "VP / ADC1 / solo entrada"),
        P("GPIO39", 39, ["analog_in", "input_only"], "VN / ADC1 / solo entrada"),
    ]


def _rpi4_pins():
    # Raspberry Pi 4 — numeración BCM. Sin ADC nativo.
    P = _pin
    i2c = {2: "SDA1", 3: "SCL1"}
    spi = {7: "CE1", 8: "CE0", 9: "MISO", 10: "MOSI", 11: "SCLK"}
    pwm = {12: "PWM0", 13: "PWM1", 18: "PWM0", 19: "PWM1"}
    uart = {14: "TXD", 15: "RXD"}
    pins = []
    for g in range(2, 28):
        caps = ["digital"]
        note = None
        if g in i2c:
            caps.append("i2c"); note = i2c[g]
        if g in spi:
            caps.append("spi"); note = spi[g]
        if g in pwm:
            caps.append("pwm"); note = pwm[g]
        if g in uart:
            caps.append("uart"); note = uart[g]
        pins.append(P(f"GPIO{g}", g, caps, note))
    return pins


# ─── Catálogo de MCU ──────────────────────────────────────────────
def _catalog():
    return [
        {
            "code": "esp32", "name": "ESP32 DevKit v1", "vendor": "Espressif",
            "family": "ESP32", "has_wifi": True,
            "notes": "WiFi + BLE. ADC1 (GPIO32-39) recomendado con WiFi activo.",
            "pins": _esp32_pins(),
        },
        {
            "code": "arduino_uno", "name": "Arduino UNO R3", "vendor": "Arduino",
            "family": "AVR ATmega328P", "has_wifi": False,
            "notes": "Sin WiFi. Requiere gateway/shield para Internet.",
            "pins": _arduino_uno_pins(),
        },
        {
            "code": "arduino_nano", "name": "Arduino Nano", "vendor": "Arduino",
            "family": "AVR ATmega328P", "has_wifi": False,
            "notes": "A6/A7 solo entrada analógica.",
            "pins": _arduino_nano_pins(),
        },
        {
            "code": "arduino_mega", "name": "Arduino Mega 2560", "vendor": "Arduino",
            "family": "AVR ATmega2560", "has_wifi": False,
            "notes": "54 digitales + 16 analógicos; 4 puertos serie.",
            "pins": _arduino_mega_pins(),
        },
        {
            "code": "arduino_r4_wifi", "name": "Arduino UNO R4 WiFi", "vendor": "Arduino",
            "family": "Renesas RA4M1", "has_wifi": True,
            "notes": "WiFi integrado; DAC 12-bit en A0.",
            "pins": _arduino_r4_pins(),
        },
        {
            "code": "raspberry_pi_4", "name": "Raspberry Pi 4 Model B", "vendor": "Raspberry Pi",
            "family": "Broadcom BCM2711", "has_wifi": True,
            "notes": "Numeración BCM. Sin ADC nativo (usar ADC externo p.ej. ADS1115). Ejecuta Python.",
            "pins": _rpi4_pins(),
        },
    ]


# ─── Sembrado idempotente ─────────────────────────────────────────
def seed_catalog(db):
    """
    Inserta el catálogo de MCU y pines si falta. Idempotente:
    get-or-create por 'code' y por (mcu_id, label). Devuelve un resumen.
    """
    resumen = {"mcus_creados": 0, "pines_creados": 0, "mcus_total": 0, "pines_total": 0}
    for mcu_def in _catalog():
        mcu = db.query(Microcontroller).filter(
            Microcontroller.code == mcu_def["code"]).first()
        pins = mcu_def["pins"]
        if not mcu:
            mcu = Microcontroller(
                code=mcu_def["code"], name=mcu_def["name"], vendor=mcu_def["vendor"],
                family=mcu_def["family"], has_wifi=mcu_def["has_wifi"],
                num_gpio=len(pins), notes=mcu_def.get("notes"),
            )
            db.add(mcu)
            db.flush()   # obtener mcu.id sin cerrar la transacción
            resumen["mcus_creados"] += 1
        else:
            # Mantener metadatos al día (no rompe datos de inquilino)
            mcu.name = mcu_def["name"]
            mcu.vendor = mcu_def["vendor"]
            mcu.family = mcu_def["family"]
            mcu.has_wifi = mcu_def["has_wifi"]
            mcu.num_gpio = len(pins)
            mcu.notes = mcu_def.get("notes")
        resumen["mcus_total"] += 1

        existentes = {
            p.label for p in db.query(McuPin).filter(McuPin.mcu_id == mcu.id).all()
        }
        for idx, p in enumerate(pins):
            resumen["pines_total"] += 1
            if p["label"] in existentes:
                continue
            db.add(McuPin(
                mcu_id=mcu.id, label=p["label"], gpio_number=p.get("gpio_number"),
                caps=p.get("caps") or [], note=p.get("note"), order_idx=idx,
            ))
            resumen["pines_creados"] += 1

    db.commit()
    return resumen
