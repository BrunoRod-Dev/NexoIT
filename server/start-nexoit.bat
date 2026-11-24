@echo off
cd /d %~dp0
call .venv\Scripts\activate
set NEXOIT_ENV=dev
echo NexoIT dev server en http://localhost:8011 - Ctrl+C para detener
uvicorn main:app --port 8011
pause
