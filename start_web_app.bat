@echo off
setlocal
cd /d "%~dp0"

if exist ".venv311\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0.venv311\Scripts\python.exe"
) else if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
) else (
    echo Python environment not found.
    echo Open PowerShell in this folder and run:
    echo   py -3.11 -m venv .venv311
    echo   .\.venv311\Scripts\python.exe -m pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

"%PYTHON_EXE%" web_app.py
if errorlevel 1 (
    echo.
    echo The website could not start. Check the error above.
    pause
)
