@echo off
REM 构建 menote-pc（Windows）
REM
REM   build.bat              构建当前平台      -> dist\menote-<os>-<arch>[.exe]
REM   build.bat all          交叉编译全平台    -> dist\
REM   build.bat linux        只构建指定平台    -> dist\（windows|linux|darwin）
REM
REM 产物命名统一为 menote-<os>-<arch>（Windows 加 .exe），当前平台构建与交叉
REM 编译只差一个参数，文件名规则完全一致。
REM
REM 纯 Go 实现（依赖 go-iroh，不涉及 cgo），交叉编译不需要额外工具链。
setlocal
cd /d "%~dp0"

if "%~1"==""             goto :current
if /i "%~1"=="all"       goto :all
if /i "%~1"=="windows"   goto :oneplat
if /i "%~1"=="linux"     goto :oneplat
if /i "%~1"=="darwin"    goto :oneplat
echo 用法：build.bat [all^|windows^|linux^|darwin]
exit /b 2

:current
REM 用 go env 问当前平台，不靠 %PROCESSOR_ARCHITECTURE% 猜（它在 32 位 shell 里会撒谎）
set "H_OS="
set "H_ARCH="
for /f "delims=" %%i in ('go env GOHOSTOS')   do set "H_OS=%%i"
for /f "delims=" %%i in ('go env GOHOSTARCH') do set "H_ARCH=%%i"
if "%H_OS%"==""   set "H_OS=windows"
if "%H_ARCH%"=="" set "H_ARCH=amd64"
if not exist dist mkdir dist
echo 构建当前平台（%H_OS%/%H_ARCH%）...
call :build %H_OS% %H_ARCH% "%H_OS%-%H_ARCH%"
if errorlevel 1 exit /b 1
echo 完成：dist\menote-%H_OS%-%H_ARCH%
exit /b 0

:all
if not exist dist mkdir dist
echo 交叉编译全平台...
call :build windows amd64 "windows-amd64"
if errorlevel 1 exit /b 1
call :build windows arm64 "windows-arm64"
if errorlevel 1 exit /b 1
call :build linux   amd64 "linux-amd64"
if errorlevel 1 exit /b 1
call :build linux   arm64 "linux-arm64"
if errorlevel 1 exit /b 1
call :build darwin  amd64 "darwin-amd64"
if errorlevel 1 exit /b 1
call :build darwin  arm64 "darwin-arm64"
if errorlevel 1 exit /b 1
echo 完成：dist\
dir /b dist
exit /b 0

:oneplat
if not exist dist mkdir dist
call :build %~1 amd64 "%~1-amd64"
if errorlevel 1 exit /b 1
call :build %~1 arm64 "%~1-arm64"
if errorlevel 1 exit /b 1
echo 完成：dist\
exit /b 0

REM :build <goos> <goarch> <文件名后缀，不含 menote- 前缀>
:build
set "B_OS=%1"
set "B_ARCH=%2"
set "B_TAIL=%~3"
set "B_NAME=menote-%B_TAIL%"
if /i "%B_OS%"=="windows" set "B_NAME=%B_NAME%.exe"
echo   -^> %B_OS%/%B_ARCH%
set CGO_ENABLED=0
set GOOS=%B_OS%
set GOARCH=%B_ARCH%
go build -trimpath -ldflags "-s -w" -o "dist\%B_NAME%" .
exit /b %errorlevel%
