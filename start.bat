@echo off
REM AI Workstation startup wrapper
REM Forwards all arguments to the Python startup script.
python "%~dp0scripts\startup.py" %*
