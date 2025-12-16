# Kutuphane Setup Dosyaları

Bu klasör Windows installer için gerekli dosyaları içerir.

## Dosyalar

- **InnoSetup.iss** - Inno Setup installer script dosyası
- **DatabaseSetup.bat** - Windows için veritabanı kurulum scripti
- **DatabaseSetup.ps1** - PowerShell versiyonu (alternatif)

## Kurulum Adımları

### 1. Inno Setup Kurulumu

1. [Inno Setup](https://jrsoftware.org/isdl.php) indirin ve kurun
2. Türkçe dil dosyasını [buradan](https://jrsoftware.org/files/istrans/) indirin
3. Türkçe dil dosyasını Inno Setup'ın `Languages` klasörüne kopyalayın

### 2. Setup Oluşturma

1. Projeyi Release modunda derleyin:
   ```bash
   cd dotnet
   dotnet build -c Release
   ```

2. Inno Setup Compiler'ı açın
3. `setup/InnoSetup.iss` dosyasını açın
4. Build > Compile ile setup dosyasını oluşturun
5. Setup dosyası `setup/dist/KutuphaneSetup.exe` olarak oluşturulacak

## Setup Özellikleri

- ✅ .NET 8 Runtime kontrolü (yoksa uyarı verir)
- ✅ Veritabanı klasörü oluşturma
- ✅ Otomatik veritabanı oluşturma (ilk çalıştırmada)
- ✅ Masaüstü kısayolu
- ✅ Başlangıç menüsüne ekleme
- ✅ Türkçe dil desteği

## Veritabanı Yönetimi

Veritabanı dosyası (`kutuphane.db`) şu konumda oluşturulur:
- **Windows**: `%LocalAppData%\KutuphaneApp\kutuphane.db`
- **macOS**: `~/.local/share/KutuphaneApp/kutuphane.db`
- **Linux**: `~/.local/share/KutuphaneApp/kutuphane.db`

### İlk Kurulum

Setup sırasında veritabanı dosyası oluşturulmaz. İlk çalıştırmada uygulama otomatik olarak:
1. Veritabanı dosyasını oluşturur
2. Tabloları oluşturur
3. Seed data (admin kullanıcı) ekler

### Mevcut Veritabanı

Eğer setup sırasında mevcut bir veritabanı dosyası paketlenirse, bu dosya korunur ve mevcut veriler kaybolmaz.

## Özelleştirme

### Veritabanı Yolu Değiştirme

`appsettings.json` dosyasında `Database:Path` ayarını değiştirebilirsiniz:

```json
{
  "Database": {
    "Path": "C:\\Kutuphane\\kutuphane.db"
  }
}
```

### Seed Data Ekleme

`DatabaseSeeder.cs` dosyasını düzenleyerek ilk kurulumda yüklenecek verileri özelleştirebilirsiniz.



