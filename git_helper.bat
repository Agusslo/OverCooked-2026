@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

:: Verificar si es un repositorio Git
git rev-parse --is-inside-work-tree >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Este directorio no es un repositorio Git.
    pause
    exit /b
)

:MENU
cls
echo ======================================================
echo              GESTOR DE GIT Y CONFLICTOS              
echo ======================================================
for /f "tokens=*" %%a in ('git branch --show-current') do set RAMA_ACTUAL=%%a
echo Rama actual: %RAMA_ACTUAL%
echo ------------------------------------------------------
echo 1. Cambiar de rama actual (Checkout)
echo 2. Pull de una rama (Traer cambios)
echo 3. Push a una rama (Subir cambios)
echo 4. Salir
echo ------------------------------------------------------
set /p OPCION="Selecciona una opción (1-4): "

if "%OPCION%"=="1" goto CHECKOUT_FLOW
if "%OPCION%"=="2" goto PULL_FLOW
if "%OPCION%"=="3" goto PUSH_FLOW
if "%OPCION%"=="4" goto FIN
goto MENU

:: ======================================================
:: SUBRUTINA: CARGAR LISTA DE RAMAS EN MENU
:: ======================================================
:MOSTRAR_LISTA_RAMAS
git --no-pager fetch --all --prune >nul 2>&1

:: Limpiar lista previa
for /L %%k in (1,1,100) do set "RAMA_LIST_%%k="
if exist "%temp%\git_branches.tmp" del "%temp%\git_branches.tmp"

:: Guardar la lista de ramas limpia usando git branch simple
git --no-pager branch -a > "%temp%\git_branches.tmp" 2>nul

set COUNT=0
for /f "usebackq tokens=*" %%B in ("%temp%\git_branches.tmp") do (
    set "LINEA=%%B"
    :: Quitar asterisco de la rama activa si está presente
    set "LINEA=!LINEA:* =!"
    set "LINEA=!LINEA: =!"
    
    :: Filtrar 'HEAD' y 'remotes/origin/HEAD'
    echo !LINEA! | findstr /v "HEAD remotes/origin/HEAD" >nul
    if !errorlevel! equ 0 (
        set "RAMA_CLEAN=!LINEA!"
        :: Si empieza con remotes/origin/, recortarlo
        if "!RAMA_CLEAN:~0,15!"=="remotes/origin/" set "RAMA_CLEAN=!RAMA_CLEAN:~15!"
        
        :: Evitar duplicados entre ramas locales y remotas
        set "EXISTE=0"
        for /L %%k in (1,1,!COUNT!) do (
            if "!RAMA_LIST_%%k!"=="!RAMA_CLEAN!" set "EXISTE=1"
        )
        if "!EXISTE!"=="0" (
            set /a COUNT+=1
            set "RAMA_LIST_!COUNT!=!RAMA_CLEAN!"
        )
    )
)
if exist "%temp%\git_branches.tmp" del "%temp%\git_branches.tmp"

echo Ramas disponibles:
for /L %%i in (1,1,!COUNT!) do (
    echo  %%i. !RAMA_LIST_%%i!
)
set /a COUNT_NUEVA=!COUNT! + 1
echo  !COUNT_NUEVA!. [Crear una nueva rama]
echo ------------------------------------------------------
exit /b

:: ======================================================
:: FLUJO: CHECKOUT
:: ======================================================
:CHECKOUT_FLOW
cls
echo ------------------------------------------------------
echo CAMBIAR DE RAMA (CHECKOUT)
echo ------------------------------------------------------
call :MOSTRAR_LISTA_RAMAS

set /p ELECCION="Selecciona el número de rama: "

if "%ELECCION%"=="!COUNT_NUEVA!" (
    echo.
    set /p TARGET_BRANCH="Ingresa el nombre de la nueva rama: "
) else (
    if defined RAMA_LIST_%ELECCION% (
        set "TARGET_BRANCH=!RAMA_LIST_%ELECCION%!"
    ) else (
        echo [ERROR] Selección inválida.
        pause
        goto CHECKOUT_FLOW
    )
)

if "%TARGET_BRANCH%"=="" goto MENU

git checkout %TARGET_BRANCH% >nul 2>&1
if %errorlevel% neq 0 (
    echo Creando y cambiando a la nueva rama '%TARGET_BRANCH%'...
    git checkout -b %TARGET_BRANCH%
) else (
    echo Cambiado exitosamente a '%TARGET_BRANCH%'.
)
pause
goto MENU

:: ======================================================
:: FLUJO: PULL
:: ======================================================
:PULL_FLOW
cls
echo ------------------------------------------------------
echo PULL / SINCRO DE RAMA (Seleccionar Origen)
echo ------------------------------------------------------
call :MOSTRAR_LISTA_RAMAS

set /p ELECCION="Selecciona la rama de origen para hacer pull: "

if defined RAMA_LIST_%ELECCION% (
    set "RAMA_ORIGEN=!RAMA_LIST_%ELECCION%!"
) else (
    echo [ERROR] Selección inválida.
    pause
    goto PULL_FLOW
)

echo.
echo Actualizando información del repositorio...
git --no-pager fetch origin

echo Intentando hacer merge de origin/%RAMA_ORIGEN%...
git --no-pager merge origin/%RAMA_ORIGEN%

if %errorlevel% equ 0 (
    echo.
    echo [EXITO] Pull completado sin conflictos.
    pause
    goto MENU
)

:CONFLICTO_MENU
cls
echo ======================================================
echo ! ALERTA: SE DETECTARON CONFLICTOS AL HACER EL PULL !
echo ======================================================
echo ¿Cómo deseas resolver los conflictos?
echo.
echo 1. Ignorar mis cambios locales (Sobrescribir con la rama remota)
echo 2. Guardar mis cambios en Stash (Limpiar local, pullear y aplicar stash)
echo 3. Pushear mis cambios locales a una rama seleccionada de la lista
echo 4. Cancelar la operación de pull (git merge --abort)
echo ------------------------------------------------------
set /p OPCION_CONFLICTO="Selecciona una estrategia (1-4): "

if "%OPCION_CONFLICTO%"=="1" goto RESOLVER_FORZAR
if "%OPCION_CONFLICTO%"=="2" goto RESOLVER_STASH
if "%OPCION_CONFLICTO%"=="3" goto RESOLVER_RESPALDO_MENU
if "%OPCION_CONFLICTO%"=="4" goto CANCELAR_MERGE
goto CONFLICTO_MENU

:RESOLVER_FORZAR
echo.
echo [1/2] Cancelando el merge actual...
git merge --abort >nul 2>&1
echo [2/2] Reemplazando el estado local por origin/%RAMA_ORIGEN%...
git reset --hard origin/%RAMA_ORIGEN%
echo [EXITO] Tu rama local ahora es idéntica a origin/%RAMA_ORIGEN%.
pause
goto MENU

:RESOLVER_STASH
echo.
echo [1/3] Cancelando el merge con conflictos...
git merge --abort >nul 2>&1
echo [2/3] Guardando cambios locales en el Stash...
git stash
echo [3/3] Actualizando con la rama remota...
git pull origin %RAMA_ORIGEN%
echo.
echo Aplicando tus cambios guardados del stash...
git stash pop
echo.
echo [AVISO] Se trajeron los cambios y se re-aplicaron los tuyos. Si persisten conflictos, resuélvelos en tu editor.
pause
goto MENU

:RESOLVER_RESPALDO_MENU
cls
echo ------------------------------------------------------
echo SELECCION DE RAMA PARA RESPALDO DE CONFLICTOS
echo ------------------------------------------------------
call :MOSTRAR_LISTA_RAMAS

set /p ELECCION="Selecciona el número de rama destino: "

if "%ELECCION%"=="!COUNT_NUEVA!" (
    echo.
    set /p RAMA_RESPALDO="Ingresa el nombre de la nueva rama: "
) else (
    if defined RAMA_LIST_%ELECCION% (
        set "RAMA_RESPALDO=!RAMA_LIST_%ELECCION%!"
    ) else (
        echo [ERROR] Selección inválida.
        pause
        goto RESOLVER_RESPALDO_MENU
    )
)

echo.
echo [1/4] Cancelando el merge con conflictos...
git merge --abort >nul 2>&1

echo [2/4] Preparando rama de respaldo '%RAMA_RESPALDO%'...
git checkout -b %RAMA_RESPALDO% >nul 2>&1
if %errorlevel% neq 0 (
    git checkout %RAMA_RESPALDO%
)

echo [3/4] Pusheando tus cambios a origin/%RAMA_RESPALDO%...
git add .
git commit -m "Respaldo local previo a resolver conflictos" >nul 2>&1
git push -u origin %RAMA_RESPALDO%

echo [4/4] Restaurando %RAMA_ACTUAL% e igualando con origin/%RAMA_ORIGEN%...
git checkout %RAMA_ACTUAL%
git reset --hard origin/%RAMA_ORIGEN%

echo.
echo [EXITO] Cambios a salvo en '%RAMA_RESPALDO%' y la rama %RAMA_ACTUAL% quedó actualizada.
pause
goto MENU

:CANCELAR_MERGE
git merge --abort >nul 2>&1
echo [INFO] Pull cancelado. El repositorio volvió al estado anterior.
pause
goto MENU

:: ======================================================
:: FLUJO: PUSH
:: ======================================================
:PUSH_FLOW
cls
echo ------------------------------------------------------
echo PUSH DE RAMA (Seleccionar Destino)
echo ------------------------------------------------------
call :MOSTRAR_LISTA_RAMAS

set /p ELECCION="Selecciona el número de rama a la cual pushear: "

if "%ELECCION%"=="!COUNT_NUEVA!" (
    echo.
    set /p RAMA_DESTINO="Ingresa el nombre de la nueva rama: "
) else (
    if defined RAMA_LIST_%ELECCION% (
        set "RAMA_DESTINO=!RAMA_LIST_%ELECCION%!"
    ) else (
        echo [ERROR] Selección inválida.
        pause
        goto PUSH_FLOW
    )
)

set /p COMMIT_MSG="Mensaje del commit (Dejá en blanco si ya hiciste commit): "
if not "%COMMIT_MSG%"=="" (
    git add .
    git commit -m "%COMMIT_MSG%"
)

echo.
echo Enviando cambios a origin/%RAMA_DESTINO%...
git push origin %RAMA_DESTINO%

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] No se pudo hacer push. Es posible que el servidor tenga cambios que no tenés localmente.
) else (
    echo.
    echo [EXITO] Push realizado correctamente.
)
pause
goto MENU

:FIN
exit /b