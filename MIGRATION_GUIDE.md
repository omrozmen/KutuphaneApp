# JSON/CSV'den SQLite Veritabanına Geçiş Rehberi

Bu doküman, projenin dosya tabanlı sistemden (JSON/CSV) SQLite veritabanı sistemine geçişini açıklar.

## ✅ Yapılan Değişiklikler

### 1. Yeni Proje: Kutuphane.Infrastructure.Database

- **Konum**: `dotnet/src/Kutuphane.Infrastructure.Database/`
- **Amaç**: SQLite veritabanı altyapısı
- **Teknoloji**: Entity Framework Core 8.0 + SQLite

### 2. Veritabanı Tasarımı

#### Tablolar:
- **Books**: Kitap bilgileri (Id, Title, Author, Category, Quantity, TotalQuantity, Lastpersonel)
- **Loans**: Ödünç kayıtları (Id, BookId, Borrower, DueDate, personel)
- **Users**: Kullanıcı bilgileri (Username, Password, Role)
- **BookStats**: Kitap istatistikleri
- **StudentStats**: Öğrenci istatistikleri

### 3. Repository'ler

Eski `FileBookRepository`, `FileUserRepository`, `FileStatsRepository` yerine:
- `DatabaseBookRepository`
- `DatabaseUserRepository`
- `DatabaseStatsRepository`

### 4. Program.cs Güncellemeleri

- `AddFileInfrastructure()` → `AddDatabaseInfrastructure()`
- Otomatik veritabanı oluşturma ve seed data
- Varsayılan veritabanı yolu: `%LocalAppData%\KutuphaneApp\kutuphane.db`

### 5. Setup Dosyaları

- **InnoSetup.iss**: Windows installer script
- **DatabaseSetup.bat**: Veritabanı kurulum scripti
- **DatabaseSetup.ps1**: PowerShell alternatifi

## 🔄 Eski Dosyalar

Artık kullanılmayan dosyalar (isteğe bağlı olarak kaldırılabilir):
- `dotnet/storage/*.json` (kutuphane.json, stats.json, user-settings.json)
- `dotnet/storage/*.csv` (books.csv, students.csv, personel.csv, loans.csv, logs.csv)
- `dotnet/src/Kutuphane.Infrastructure.Files/` (artık kullanılmıyor)

## 🚀 Kullanım

### Geliştirme Ortamı

1. Projeyi derleyin:
   ```bash
   cd dotnet
   dotnet build
   ```

2. Uygulamayı çalıştırın:
   ```bash
   cd src/Kutuphane.Api
   dotnet run
   ```

3. İlk çalıştırmada veritabanı otomatik olarak oluşturulur ve seed data yüklenir.

### Production/Setup

1. Release modunda derleyin:
   ```bash
   dotnet build -c Release
   ```

2. Inno Setup ile installer oluşturun (detaylar için `dotnet/setup/README.md`)

3. Setup sırasında:
   - Veritabanı klasörü oluşturulur
   - İlk çalıştırmada veritabanı otomatik oluşturulur
   - Seed data (admin kullanıcı) yüklenir

## 📊 Veri Migrasyonu

Mevcut JSON/CSV verilerini veritabanına aktarmak için:

1. JSON/CSV dosyalarını okuyun
2. Verileri Entity modellerine dönüştürün
3. `DatabaseSeeder` veya özel bir migration script kullanın

Örnek migration script'i eklenebilir (isteğe bağlı).

## ⚙️ Yapılandırma

### Veritabanı Yolu

`appsettings.json`:
```json
{
  "Database": {
    "Path": ""  // Boş bırakılırsa varsayılan yol kullanılır
  }
}
```

Varsayılan yol:
- Windows: `%LocalAppData%\KutuphaneApp\kutuphane.db`
- macOS/Linux: `~/.local/share/KutuphaneApp/kutuphane.db`

### Seed Data

`DatabaseSeeder.cs` dosyasını düzenleyerek ilk kurulumda yüklenecek verileri özelleştirebilirsiniz.

## 🔍 Kontrol Listesi

- [x] SQLite veritabanı tasarımı
- [x] Entity Framework Core entegrasyonu
- [x] Repository implementasyonları
- [x] Program.cs güncellemeleri
- [x] Seed data mekanizması
- [x] Setup dosyaları
- [ ] Eski dosya tabanlı kodların kaldırılması (isteğe bağlı)
- [ ] JSON/CSV'den DB'ye migration script (isteğe bağlı)

## 📝 Notlar

- SQLite sunucu gerektirmez, tek dosya veritabanıdır
- .NET 8 Runtime ile birlikte SQLite runtime dahildir
- Veritabanı dosyası taşınabilir (backup/restore kolay)
- Setup sırasında veritabanı otomatik oluşturulur



