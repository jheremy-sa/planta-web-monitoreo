#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ArduinoWebsockets.h>   // Librería: "WebSockets" by Markus Sattler (Library Manager)
using namespace websockets;

// ============================================================
// CONFIGURACION WIFI Y BACKEND -- EDITA ESTOS 4 VALORES
// ============================================================
const char* WIFI_SSID     = "TU_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD";

#define URL_LECTURAS "https://planta-backend-ifsy.onrender.com/api/lecturas"
#define URL_COMANDO  "https://planta-backend-ifsy.onrender.com/api/comando"
#define WS_URL       "wss://planta-backend-ifsy.onrender.com/ws/esp32"

// Telemetria: cada 2s (datos de sensores al backend)
#define INTERVALO_WEB_TELEMETRIA  2000
// Fallback comando HTTP: cada 15s (por si el WebSocket se cae)
#define INTERVALO_WEB_COMANDO_FALLBACK  15000
// Reintento de reconexion WebSocket: cada 10s si se desconecta
#define INTERVALO_RECONECT_WS    10000

#define PIN_DHT22          16
#define PIN_DS18B20         4
#define PIN_HCSR04_TRIG     5
#define PIN_HCSR04_ECHO    18
#define PIN_CAUDALIMETRO   19
#define PIN_POT_PWM        35
#define PIN_FLOTADOR_ALTO  13
#define PIN_FLOTADOR_BAJO  14
#define PIN_SW_BOMBA       32
#define PIN_SW_VALVULA     33
#define PIN_RELE_VALVULA   26
#define PIN_RELE_BOMBA     27
#define LCD_SDA            21
#define LCD_SCL            22
#define TIPO_DHT          DHT22
#define DISTANCIA_SENSOR_FONDO_CM   30.0f
#define DISTANCIA_MIN_CM             2.0f
#define ALTURA_TANQUE_CM            30.0f
#define FACTOR_CAUDAL       7.5f
#define ADC_RESOLUCION   4095.0f
#define LCD_ADDR           0x27
#define INTERVALO_SENSORES 1000
#define INTERVALO_LCD      2500
#define INTERVALO_CAUDAL   1000
#define INTERVALO_EXPERIMENTO_MS   200
#define DEBOUNCE_FLOTADOR_ALTO_MS  250

LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);
DHT dht(PIN_DHT22, TIPO_DHT);
OneWire oneWireBus(PIN_DS18B20);
DallasTemperature sensorDS18B20(&oneWireBus);

float tempDHT22       = 0.0f;
float humedadDHT22    = 0.0f;
float tempDS18B20     = 0.0f;
float distanciaCm     = 0.0f;
float nivelCm         = 0.0f;
float nivelPorcentaje = 0.0f;
float caudalLpm       = 0.0f;
float voltajePWM      = 0.0f;
float porcPWM         = 0.0f;
bool nivelAlto    = false;
bool nivelBajo    = false;
bool estadoValvula = false;
bool estadoBomba   = false;
bool ultimoSwValvula = false;
bool ultimoSwBomba   = false;
bool switchesInicializados = false;
bool     flotAltoSospechoso     = false;
uint32_t tInicioSospechaFlotAlto = 0;
volatile uint32_t contadorPulsos = 0;
uint32_t tUltimoSensor = 0;
uint32_t tUltimoLCD    = 0;
uint32_t tUltimoCaudal = 0;
uint32_t tUltimoEnvioWeb = 0;          // Telemetria HTTP (sensores)
uint32_t tUltimoComandoFallback = 0;   // Fallback comando HTTP
uint32_t tUltimoReconectWS = 0;        // Reintento reconexion WebSocket
uint8_t  pantallaLCD   = 0;

// Cliente WebSocket para recibir comandos en tiempo real
WebsocketsClient clienteWS;
bool wsConectado = false;
bool      experimentoActivo   = false;
uint32_t tInicioExperimento   = 0;
uint32_t tUltimaMuestraExp    = 0;
int       ultimaVersionComandoConocida = -1;

void leerSensores();
void leerSwitches();
void actualizarReles();
float medirDistanciaHCSR04();
void mostrarLCD();
void lcdTemperaturas();
void lcdNivel();
void lcdCaudal();
void lcdPWM();
void lcdEstado();
void IRAM_ATTR isrCaudalimetro();
void procesarComandoSerial();
void iniciarExperimento();
void detenerExperimento(const char* motivo);
void cicloExperimento();
void muestrearCaudalExperimento();
void conectarWiFi();
void enviarTelemetriaWeb();
void consultarComandoWeb();
void conectarWSComandos();
void onWSMensaje(WebsocketsMessage msg);

void setup() {
  Serial.begin(115200);
  pinMode(PIN_RELE_VALVULA, OUTPUT);
  pinMode(PIN_RELE_BOMBA,   OUTPUT);
  estadoBomba = true;   // Inicialmente encendida (se puede cambiar)
  actualizarReles();
  pinMode(PIN_HCSR04_TRIG,   OUTPUT);
  pinMode(PIN_HCSR04_ECHO,   INPUT);
  pinMode(PIN_CAUDALIMETRO,  INPUT_PULLUP);
  pinMode(PIN_FLOTADOR_ALTO, INPUT_PULLUP);
  pinMode(PIN_FLOTADOR_BAJO, INPUT_PULLUP);
  pinMode(PIN_SW_VALVULA, INPUT_PULLUP);
  pinMode(PIN_SW_BOMBA,   INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_CAUDALIMETRO), isrCaudalimetro, FALLING);
  dht.begin();
  sensorDS18B20.begin();
  Wire.begin(LCD_SDA, LCD_SCL);
  Wire.setClock(100000);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0); lcd.print(F("  PLANTA UPSE  "));
  lcd.setCursor(0, 1); lcd.print(F(" Modo FT listo "));
  delay(1500);
  lcd.clear();

  conectarWiFi();
}

void loop() {
  procesarComandoSerial();
  if (experimentoActivo) {
    cicloExperimento();
    return;
  }

  uint32_t ahora = millis();

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
  }

  // ---- WebSocket: recibir comandos en tiempo real (< 1s) ----
  // poll() procesa los mensajes entrantes sin bloquear.
  // Si el backend empuja un comando, se aplica aqui de inmediato.
  if (wsConectado) {
    clienteWS.poll();
    if (!clienteWS.available()) {
      wsConectado = false;
    }
  } else if (ahora - tUltimoReconectWS >= INTERVALO_RECONECT_WS) {
    tUltimoReconectWS = ahora;
    conectarWSComandos();
  }

  // ---- Sensores y actuadores ----
  leerSwitches();
  if (ahora - tUltimoSensor >= INTERVALO_SENSORES) {
    tUltimoSensor = ahora;
    leerSensores();
  }
  if (ahora - tUltimoCaudal >= INTERVALO_CAUDAL) {
    uint32_t dt = ahora - tUltimoCaudal;
    tUltimoCaudal = ahora;
    noInterrupts();
    uint32_t p = contadorPulsos;
    contadorPulsos = 0;
    interrupts();
    float pps = (float)p / ((float)dt / 1000.0f);
    caudalLpm = pps / FACTOR_CAUDAL;
    if (caudalLpm < 0.0f) caudalLpm = 0.0f;
  }
  if (ahora - tUltimoLCD >= INTERVALO_LCD) {
    tUltimoLCD = ahora;
    mostrarLCD();
  }

  // ---- Telemetria HTTP: sube datos de sensores cada 2s ----
  if (ahora - tUltimoEnvioWeb >= INTERVALO_WEB_TELEMETRIA) {
    tUltimoEnvioWeb = ahora;
    enviarTelemetriaWeb();
  }

  // ---- Fallback HTTP: consulta comando cada 15s ----
  // Por si el WebSocket esta caido, los comandos igual llegan (con mas demora).
  if (ahora - tUltimoComandoFallback >= INTERVALO_WEB_COMANDO_FALLBACK) {
    tUltimoComandoFallback = ahora;
    consultarComandoWeb();
  }
}

// ============================================================
// WIFI Y COMUNICACION CON EL BACKEND
// ============================================================
void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("Conectando WiFi"));

  uint32_t inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(300);
  }

  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    lcd.setCursor(0, 0); lcd.print(F("WiFi conectado"));
    lcd.setCursor(0, 1); lcd.print(WiFi.localIP());
    delay(1000);
    // Conectar WebSocket para comandos en tiempo real
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("Conectando WS.."));
    conectarWSComandos();
  } else {
    lcd.setCursor(0, 0); lcd.print(F("WiFi NO conecto"));
    lcd.setCursor(0, 1); lcd.print(F("Reintentando..."));
  }
  delay(1500);
  lcd.clear();
}

// Callback: se ejecuta cada vez que el backend empuja un comando
void onWSMensaje(WebsocketsMessage msg) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, msg.data())) return;  // ignorar si no es JSON valido
  if (doc.containsKey("ping")) return;           // ignorar pings de keepalive

  int ver = doc["version"] | -1;
  if (ver < 0 || ver == ultimaVersionComandoConocida) return;  // ya aplicado

  ultimaVersionComandoConocida = ver;
  estadoBomba   = doc["bomba_deseada"]   | estadoBomba;
  estadoValvula = doc["valvula_deseada"] | estadoValvula;
  actualizarReles();
  // Resincronizar switches fisicos para que no reviertan el comando remoto
  ultimoSwBomba   = (digitalRead(PIN_SW_BOMBA)   == LOW);
  ultimoSwValvula = (digitalRead(PIN_SW_VALVULA) == LOW);
}

// Conecta al WebSocket de control en Render (wss://)
void conectarWSComandos() {
  clienteWS.onMessage(onWSMensaje);
  clienteWS.setInsecure();  // No valida certificado TLS (simplificacion para ESP32)
  wsConectado = clienteWS.connect(WS_URL);
  if (wsConectado) {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("WS conectado!"));
  } else {
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print(F("WS fallo"));
    lcd.setCursor(0, 1); lcd.print(F("fallback HTTP"));
  }
  delay(800);
  lcd.clear();
}

void enviarTelemetriaWeb() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure cliente;
  cliente.setInsecure();  // Simplificacion: no valida el certificado TLS
  HTTPClient http;
  http.begin(cliente, URL_LECTURAS);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["nivel"]          = nivelCm;
  doc["caudal"]         = caudalLpm;
  doc["temp_ambiente"]  = tempDHT22;
  doc["humedad"]        = humedadDHT22;
  doc["temp_agua"]      = tempDS18B20;
  doc["flotador_bajo"]  = nivelBajo;
  doc["flotador_alto"]  = nivelAlto;
  doc["bomba_estado"]   = estadoBomba;
  doc["valvula_estado"] = estadoValvula;

  String cuerpo;
  serializeJson(doc, cuerpo);

  http.POST(cuerpo);
  http.end();
}

void consultarComandoWeb() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure cliente;
  cliente.setInsecure();
  HTTPClient http;
  http.begin(cliente, URL_COMANDO);

  int codigo = http.GET();
  if (codigo == 200) {
    String payload = http.getString();
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err) {
      int  version        = doc["version"]         | -1;
      bool bombaDeseada    = doc["bomba_deseada"]   | estadoBomba;
      bool valvulaDeseada  = doc["valvula_deseada"] | estadoValvula;

      // Solo actuar si llego un comando NUEVO (version distinta a la ya aplicada)
      if (version != ultimaVersionComandoConocida) {
        ultimaVersionComandoConocida = version;
        estadoBomba   = bombaDeseada;
        estadoValvula = valvulaDeseada;
        actualizarReles();
        // Resincroniza con el switch fisico actual para que no se revierta
        // el comando remoto en el siguiente ciclo de leerSwitches()
        ultimoSwBomba   = (digitalRead(PIN_SW_BOMBA)   == LOW);
        ultimoSwValvula = (digitalRead(PIN_SW_VALVULA) == LOW);
      }
    }
  }
  http.end();
}

// ============================================================
// MODO EXPERIMENTO / IDENTIFICACION FT (sin cambios, via Serial)
// ============================================================
void procesarComandoSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();
  if (cmd == "START") {
    iniciarExperimento();
  } else if (cmd == "STOP") {
    detenerExperimento("manual");
  } else if (cmd == "STATUS") {
    Serial.print(F("#STATUS,experimento="));
    Serial.print(experimentoActivo ? F("ACTIVO") : F("INACTIVO"));
    Serial.print(F(",valvula="));
    Serial.println(estadoValvula ? F("ABIERTA") : F("CERRADA"));
  }
  else if (cmd == "ABRIR_VALVULA") {
    estadoValvula = true;
    actualizarReles();
    ultimoSwValvula = (digitalRead(PIN_SW_VALVULA) == LOW);
  } else if (cmd == "CERRAR_VALVULA") {
    estadoValvula = false;
    actualizarReles();
    ultimoSwValvula = (digitalRead(PIN_SW_VALVULA) == LOW);
  } else if (cmd == "ENCENDER_BOMBA") {
    estadoBomba = true;
    actualizarReles();
    ultimoSwBomba = (digitalRead(PIN_SW_BOMBA) == LOW);
  } else if (cmd == "APAGAR_BOMBA") {
    estadoBomba = false;
    actualizarReles();
    ultimoSwBomba = (digitalRead(PIN_SW_BOMBA) == LOW);
  }
}
void iniciarExperimento() {
  if (experimentoActivo) return;
  noInterrupts();
  contadorPulsos = 0;
  interrupts();
  experimentoActivo  = true;
  tInicioExperimento  = millis();
  tUltimaMuestraExp   = 0;
  tUltimoCaudal       = millis();
  flotAltoSospechoso  = false;
  estadoValvula = true;
  actualizarReles();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F(" EXPERIMENTO FT "));
  lcd.setCursor(0, 1); lcd.print(F("   EN CURSO...  "));
  Serial.println(F("#START"));
  Serial.println(F("t_ms,h_cm,u,caudal_Lpm,flotAlto,flotBajo"));
}
void detenerExperimento(const char* motivo) {
  if (!experimentoActivo) return;
  experimentoActivo = false;
  estadoValvula = false;
  estadoBomba   = false;
  actualizarReles();
  Serial.print(F("#STOP,motivo="));
  Serial.println(motivo);
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(F("Experimento fin "));
  lcd.setCursor(0, 1); lcd.print(motivo);
  delay(1500);
  lcd.clear();
  tUltimoSensor = millis();
  tUltimoLCD    = millis();
  tUltimoCaudal = millis();
  ultimoSwValvula = (digitalRead(PIN_SW_VALVULA) == LOW);
  ultimoSwBomba   = (digitalRead(PIN_SW_BOMBA)   == LOW);
}
void cicloExperimento() {
  uint32_t ahora = millis();
  uint32_t tRel  = ahora - tInicioExperimento;
  bool flotAltoActivo = digitalRead(PIN_FLOTADOR_ALTO);
  if (flotAltoActivo) {
    if (!flotAltoSospechoso) {
      flotAltoSospechoso = true;
      tInicioSospechaFlotAlto = ahora;
    } else if (ahora - tInicioSospechaFlotAlto >= DEBOUNCE_FLOTADOR_ALTO_MS) {
      detenerExperimento("flotador_alto");
      return;
    }
  } else {
    flotAltoSospechoso = false;
  }
  if (ahora - tUltimoCaudal >= INTERVALO_CAUDAL) {
    muestrearCaudalExperimento();
  }
  if (ahora - tUltimaMuestraExp >= INTERVALO_EXPERIMENTO_MS) {
    tUltimaMuestraExp = ahora;
    distanciaCm = medirDistanciaHCSR04();
    nivelCm = DISTANCIA_SENSOR_FONDO_CM - distanciaCm;
    nivelCm = constrain(nivelCm, 0.0f, ALTURA_TANQUE_CM);
    bool flotBajoActivo = digitalRead(PIN_FLOTADOR_BAJO);
    Serial.print(tRel);
    Serial.print(',');
    Serial.print(nivelCm, 3);
    Serial.print(',');
    Serial.print(estadoValvula ? 1 : 0);
    Serial.print(',');
    Serial.print(caudalLpm, 3);
    Serial.print(',');
    Serial.print(flotAltoActivo ? 1 : 0);
    Serial.print(',');
    Serial.println(flotBajoActivo ? 1 : 0);
  }
}
void muestrearCaudalExperimento() {
  uint32_t ahora = millis();
  uint32_t dt = ahora - tUltimoCaudal;
  tUltimoCaudal = ahora;
  noInterrupts();
  uint32_t p = contadorPulsos;
  contadorPulsos = 0;
  interrupts();
  if (dt == 0) return;
  float pps = (float)p / ((float)dt / 1000.0f);
  caudalLpm = pps / FACTOR_CAUDAL;
  if (caudalLpm < 0.0f) caudalLpm = 0.0f;
}

// ============================================================
// LECTURA DE SENSORES Y ACTUADORES (sin cambios)
// ============================================================
void leerSensores() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (!isnan(h)) humedadDHT22 = h;
  if (!isnan(t)) tempDHT22    = t;
  sensorDS18B20.requestTemperatures();
  float tDs = sensorDS18B20.getTempCByIndex(0);
  if (tDs != DEVICE_DISCONNECTED_C) tempDS18B20 = tDs;
  distanciaCm = medirDistanciaHCSR04();
  nivelCm = DISTANCIA_SENSOR_FONDO_CM - distanciaCm;
  nivelCm = constrain(nivelCm, 0.0f, ALTURA_TANQUE_CM);
  nivelPorcentaje = (nivelCm / ALTURA_TANQUE_CM) * 100.0f;
  nivelPorcentaje = constrain(nivelPorcentaje, 0.0f, 100.0f);
  nivelAlto = digitalRead(PIN_FLOTADOR_ALTO);
  nivelBajo = digitalRead(PIN_FLOTADOR_BAJO);
  int rawADC = analogRead(PIN_POT_PWM);
  voltajePWM = ((float)rawADC / ADC_RESOLUCION) * 5.0f;
  porcPWM    = ((float)rawADC / ADC_RESOLUCION) * 100.0f;
}
float medirDistanciaHCSR04() {
  digitalWrite(PIN_HCSR04_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(PIN_HCSR04_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_HCSR04_TRIG, LOW);
  long dur = pulseIn(PIN_HCSR04_ECHO, HIGH, 30000UL);
  if (dur == 0) return DISTANCIA_SENSOR_FONDO_CM;
  float d = (dur * 0.0343f) / 2.0f;
  if (d < DISTANCIA_MIN_CM) d = DISTANCIA_MIN_CM;
  return d;
}
void leerSwitches() {
  bool swValvula = (digitalRead(PIN_SW_VALVULA) == LOW);
  bool swBomba   = (digitalRead(PIN_SW_BOMBA)   == LOW);
  if (!switchesInicializados) {
    ultimoSwValvula = swValvula;
    ultimoSwBomba   = swBomba;
    switchesInicializados = true;
    return;
  }
  if (swValvula != ultimoSwValvula) {
    ultimoSwValvula = swValvula;
    estadoValvula = swValvula;
    actualizarReles();
  }
  if (swBomba != ultimoSwBomba) {
    ultimoSwBomba = swBomba;
    estadoBomba = swBomba;
    actualizarReles();
  }
}
void actualizarReles() {
  // Rele activo en LOW (logica inversa)
  digitalWrite(PIN_RELE_VALVULA, estadoValvula ? LOW : HIGH);
  digitalWrite(PIN_RELE_BOMBA,   estadoBomba   ? LOW : HIGH);
}
void mostrarLCD() {
  lcd.clear();
  switch (pantallaLCD) {
    case 0: lcdTemperaturas(); break;
    case 1: lcdNivel();        break;
    case 2: lcdCaudal();       break;
    case 3: lcdPWM();          break;
    case 4: lcdEstado();       break;
  }
  pantallaLCD = (pantallaLCD + 1) % 5;
}
void lcdTemperaturas() {
  lcd.setCursor(0, 0);
  lcd.print(F("T.AMB:"));
  lcd.print(tempDHT22, 1);
  lcd.print(F("C H:"));
  lcd.print((int)humedadDHT22);
  lcd.print(F("%"));
  lcd.setCursor(0, 1);
  lcd.print(F("T.LIQ:"));
  lcd.print(tempDS18B20, 1);
  lcd.print(F(" C"));
}
void lcdNivel() {
  lcd.setCursor(0, 0);
  lcd.print(F("NIVEL: "));
  lcd.print(nivelCm, 1);
  lcd.print(F(" cm"));
  lcd.setCursor(0, 1);
  lcd.print(F("ALT:"));
  lcd.print(nivelAlto ? F("SI") : F("NO"));
  lcd.print(F("   BAJ:"));
  lcd.print(nivelBajo ? F("SI") : F("NO"));
}
void lcdCaudal() {
  lcd.setCursor(0, 0);
  lcd.print(F("CAUDAL (L/min)  "));
  lcd.setCursor(0, 1);
  lcd.print(F("  "));
  lcd.print(caudalLpm, 2);
  lcd.print(F(" L/min"));
}
void lcdPWM() {
  lcd.setCursor(0, 0);
  lcd.print(F("CTRL MOTOR PWM  "));
  lcd.setCursor(0, 1);
  lcd.print(voltajePWM, 2);
  lcd.print(F("V  "));
  lcd.print(porcPWM, 1);
  lcd.print(F(" %"));
}
void lcdEstado() {
  lcd.setCursor(0, 0);
  lcd.print(F("VALV:"));
  lcd.print(estadoValvula ? F("ABIERTA ") : F("CERRADA "));
  lcd.setCursor(0, 1);
  lcd.print(F("BOMBA:"));
  lcd.print(estadoBomba ? F("ON ") : F("OFF"));
  lcd.print(F(" A:"));
  lcd.print(nivelAlto ? F("1") : F("0"));
  lcd.print(F(" B:"));
  lcd.print(nivelBajo ? F("1") : F("0"));
}
void IRAM_ATTR isrCaudalimetro() {
  contadorPulsos++;
}
