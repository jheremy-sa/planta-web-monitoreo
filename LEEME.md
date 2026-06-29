# Cambios entregados — léeme primero

## 1. Qué archivos reemplazar

Copia estos archivos a tu proyecto, reemplazando los que ya tienes:

```
firmware/Planta_WiFi.ino   -> nuevo firmware, súbelo al ESP32
backend/main.py            -> reemplaza backend/main.py
backend/models.py          -> reemplaza backend/models.py
backend/schemas.py         -> reemplaza backend/schemas.py
frontend/index.html        -> reemplaza frontend/index.html
frontend/login.html        -> reemplaza frontend/login.html
frontend/admin.html        -> reemplaza frontend/admin.html
iniciar_local.bat          -> nuevo, ponlo en la raíz "Pagina web/" (junto a backend/ y frontend/)
```

`auth.py`, `database.py`, `crear_admin.py`, `verificar_admin.py`, `requirements.txt` **no cambian**.

## 2. Arquitectura nueva (qué cambió de fondo)

Antes: `ESP32 --USB--> gateway.py (tu laptop) --HTTP--> Backend`
Ahora: `ESP32 --WiFi directo--> Backend (Render)`

**`gateway.py` ya no es necesario** para que la plataforma funcione — el ESP32 manda los datos solo. Puedes borrarlo o dejarlo, no afecta nada.

**Tu laptop sigue siendo necesaria solo para la cámara** (webcam USB + ngrok). Eso no tiene solución sin cambiar de cámara — es la naturaleza de una webcam conectada por USB.

## 3. Pasos para aplicar el cambio

1. **Backend primero**: copia `main.py`, `models.py`, `schemas.py` a tu carpeta `backend/`, haz `git add . && git commit -m "Agregar control remoto" && git push`. Render se actualiza solo.
2. **Frontend**: copia los 3 `.html`, mismo commit/push (Render lo redespliega solo).
3. **Firmware**: abre `Planta_WiFi.ino` en Arduino IDE.
   - Reemplaza `TU_WIFI` y `TU_PASSWORD` por tu red real (debe ser **2.4GHz**, el ESP32 no soporta 5GHz).
   - Confirma que `URL_LECTURAS` y `URL_COMANDO` apuntan a tu backend de Render (ya están puestas).
   - Sube el firmware (igual que siempre).
   - Abre el Monitor Serial (115200) un momento: debe mostrar `WiFi conectado` y una IP.
4. Confirma en `/docs` de Render que `GET /api/lecturas/ultima` empieza a actualizarse solo, sin que tu laptop esté prendida.

## 4. Velocidad — qué esperar realmente

El ESP32 ahora manda datos cada **1.5 segundos** directo a Internet (antes: 3-4s a través del gateway). Esto es lo realista con hosting gratis + HTTPS + WiFi — pedir "milisegundos" no es alcanzable ni necesario: el nivel de agua de un tanque no cambia a esa velocidad, así que 1.5s ya se percibe instantáneo. Si en el futuro quieres bajar más, la siguiente mejora real sería WebSocket en el ESP32, pero es mucho más frágil de programar y mantener en Arduino — no lo recomiendo para este proyecto.

Efecto secundario bueno: como el ESP32 ahora pega cada 1.5s al backend de Render, eso mantiene el servicio "despierto" — ya no debería dormirse por inactividad.

## 5. Control remoto de bomba/válvula — cómo funciona

- El admin hace clic en "Encender"/"Apagar" en el panel → eso guarda un "comando deseado" en el backend.
- El ESP32 pregunta por WiFi cada 1.5s "¿hay un comando nuevo?" y lo aplica si lo hay.
- El pulsador físico de la planta **sigue funcionando igual que siempre** — pero si alguien lo presiona después de un comando web, el botón manda hasta que el admin haga clic de nuevo. Es el comportamiento esperado de un sistema con control dual (local + remoto).

## 6. Cámara — resumen del diagnóstico

Tu laptop+webcam+ngrok ya funcionaron correctamente desde otra red con Internet (confirmamos que ngrok respondió, solo falló el reenvío puntual — típico de un reinicio de `--reload` o reconexión de ngrok justo en ese instante). **Antes de mostrarle el link a alguien, abre tú primero** `https://distant-blurry-federal.ngrok-free.dev/video` para confirmar que está vivo — el botón "Reintentar" que agregamos en la página pública ayuda si justo en ese momento no respondía.

Usa `iniciar_local.bat` (puesto en la raíz del proyecto) para arrancar los 2 procesos correctos cada vez, sin escribir comandos a mano.

## 7. Un solo link

- **Público**: comparte solo `https://planta-frontend-uj12.onrender.com` — ahí está todo (sensores, gráfica, cámara, mensajes).
- Arriba a la derecha hay un botón **"Admin →"** que lleva al login. Desde el login también hay un link de vuelta a "Ver vista pública".
- Desde el panel admin, el botón **"Ver Planta"** abre la misma vista pública dentro del panel (sin perder la sesión).

## 8. Nota de seguridad (honesta)

El firmware usa `cliente.setInsecure()` para conectarse por HTTPS sin validar el certificado del servidor. Es una simplificación común en proyectos ESP32/Arduino — funciona bien para este caso académico, pero técnicamente no verifica que el servidor sea realmente Render (riesgo bajo en este contexto, pero vale que lo sepas).

## 9. Pendiente opcional (no urgente)

- Base de datos persistente en Render (ahora se reinicia con cada deploy, como ya sabes).
- Borrar `gateway.py` si ya no lo usas para nada.
