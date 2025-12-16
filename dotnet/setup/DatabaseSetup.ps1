# PowerShell script for database setup during installation
# This script ensures the database is created and initialized

param(
    [string]$AppDataPath = "$env:LOCALAPPDATA\KutuphaneApp",
    [string]$DatabasePath = "$env:LOCALAPPDATA\KutuphaneApp\kutuphane.db"
)

Write-Host "Kutuphane Veritabanı Kurulumu" -ForegroundColor Green

# Create application data directory if it doesn't exist
if (-not (Test-Path $AppDataPath)) {
    Write-Host "Uygulama klasörü oluşturuluyor: $AppDataPath" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $AppDataPath -Force | Out-Null
}

# Check if database already exists
if (Test-Path $DatabasePath) {
    Write-Host "Veritabanı zaten mevcut: $DatabasePath" -ForegroundColor Yellow
    Write-Host "Mevcut veritabanı korunacak." -ForegroundColor Yellow
} else {
    Write-Host "Veritabanı ilk çalıştırmada otomatik olarak oluşturulacak." -ForegroundColor Cyan
}

Write-Host "Kurulum tamamlandı!" -ForegroundColor Green



