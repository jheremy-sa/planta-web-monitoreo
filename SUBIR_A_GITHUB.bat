@echo off
echo.
echo ================================================
echo   SUBIENDO PROYECTO A GITHUB Y RENDER
echo ================================================
echo.

git init
git add .
git commit -m "HMI v2: sistema completo con dos plantas y roles"
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/jheremy-sa/planta-web-monitoreo.git
git push -u origin main --force

echo.
echo ================================================
echo  LISTO. Render actualizara en 2-3 minutos.
echo  Luego entra a:
echo  https://planta-frontend-uj12.onrender.com
echo ================================================
echo.
pause
