@echo off
setlocal
cd /d "%~dp0"

echo Copying the completed Books Staatic export into the Git repository...
if not exist ".local" mkdir ".local"
if errorlevel 1 goto failed

where python >nul 2>&1
if errorlevel 1 (
    echo Python was not found. Nothing was copied.
    goto failed
)
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js was not found. Nothing was copied.
    goto failed
)

python "scripts\merge_staatic_export.py" --apply
if errorlevel 1 goto failed

python "scripts\check_site.py" > ".local\books-site-check.log" 2>&1
if errorlevel 1 (
    echo The site check failed. See .local\books-site-check.log
    goto failed
)

node "scripts\check_worker.mjs"
if errorlevel 1 goto failed

echo.
echo Done. The website files are in C:\Repos\books.neilennis.com\site
echo Review the changes, then commit and push them with GitHub Desktop.
echo This command did not commit, push, or change the live website.
if /i not "%~1"=="/nopause" pause
exit /b 0

:failed
echo.
echo Sync stopped. Nothing was pushed. Check the error above.
if /i not "%~1"=="/nopause" pause
exit /b 1
