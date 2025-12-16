@echo off
REM Batch script for database setup during installation on Windows

set APPDATA_PATH=%LOCALAPPDATA%\KutuphaneApp
set DB_PATH=%LOCALAPPDATA%\KutuphaneApp\kutuphane.db

echo Kutuphane Veritabanı Kurulumu

REM Create application data directory if it doesn't exist
if not exist "%APPDATA_PATH%" (
    echo Uygulama klasoru olusturuluyor: %APPDATA_PATH%
    mkdir "%APPDATA_PATH%"
)

REM Check if database already exists
if exist "%DB_PATH%" (
    echo Veritabani zaten mevcut: %DB_PATH%
    echo Mevcut veritabani korunacak.
) else (
    echo Veritabani ilk calistirmada otomatik olarak olusturulacak.
)

echo Kurulum tamamlandi!
pause



