@echo off
cd /d %~dp0
set "EMAIL=%~1"
set "PASSWORD=%~2"
set "NOMBRE=%~3"
if "%EMAIL%"=="" set /p EMAIL=Email: 
if "%PASSWORD%"=="" set /p PASSWORD=Password: 
if "%NOMBRE%"=="" set /p NOMBRE=Nombre (opcional): 
call .venv\Scripts\activate
if "%NOMBRE%"=="" (
    python create_admin.py "%EMAIL%" "%PASSWORD%"
) else (
    python create_admin.py "%EMAIL%" "%PASSWORD%" "%NOMBRE%"
)
pause
