@echo off
echo ============================================
echo  Iniciando servicios locales (solo camara)
echo ============================================
echo.
echo NOTA: Los datos de sensores ya NO pasan por
echo aqui (el ESP32 los manda directo por WiFi a
echo Render). Esto solo sirve para la camara web.
echo.

start "Backend local (camara)" cmd /k "cd /d %~dp0backend && uvicorn main:app --reload"

timeout /t 4 /nobreak >nul

start "Cloudflare Tunnel" cmd /k "C:\cloudflared\cloudflared.exe tunnel --url http://localhost:8000"

echo.
echo Se abrieron 2 ventanas: "Backend local" y "Cloudflare Tunnel".
echo.
echo IMPORTANTE: en la ventana "Cloudflare Tunnel" va a aparecer una
echo URL nueva (https://algo-aleatorio.trycloudflare.com). Copia esa
echo URL, agregale /video al final, y pegala en el panel admin,
echo seccion "Configurar Camara" -^> Guardar URL.
echo.
echo Si "cloudflared.exe" no se encuentra, edita este archivo y
echo corrige la ruta donde lo descargaste.
echo.
pause
