# SQL Server vs SQLite Karşılaştırması

## SQLite (Mevcut - Önerilen)

### ✅ Avantajlar:
- **Hiçbir kurulum gerektirmez** - .NET 8 ile birlikte gelir
- **Tek dosya veritabanı** - Taşınabilir, backup kolay
- **Sunucu gerektirmez** - Yerel çalışır
- **Setup'a dahil** - Ekstra kurulum yok
- **Hafif** - Çok küçük dosya boyutu
- **Hızlı** - Küçük-orta ölçekli uygulamalar için ideal

### ❌ Dezavantajlar:
- Eşzamanlı yazma işlemleri sınırlı (küçük uygulamalar için sorun değil)
- Büyük ölçekli uygulamalar için uygun değil

### Veri Kalıcılığı:
- ✅ **Kalıcı** - Dosya silinmediği sürece veriler kalır
- ✅ **Otomatik silinmez** - Manuel silme gerekir
- ✅ **Backup kolay** - Tek dosyayı kopyalamak yeterli

## SQL Server LocalDB (Alternatif)

### ✅ Avantajlar:
- SQL Server özelliklerini kullanır
- Daha güçlü eşzamanlı işlem desteği
- Büyük veri setleri için uygun

### ❌ Dezavantajlar:
- **Kurulum gerektirir** - Setup'a dahil edilmesi gerekir (~50MB)
- **Sunucu başlatma** - İlk çalıştırmada başlatılması gerekir
- **Daha karmaşık** - Yapılandırma gerektirir
- **Daha büyük** - Daha fazla disk alanı

### Veri Kalıcılığı:
- ✅ **Kalıcı** - Veritabanı dosyaları korunur
- ✅ **Otomatik silinmez** - Manuel silme gerekir

## SQL Server Express (Alternatif)

### ✅ Avantajlar:
- Tam SQL Server özellikleri
- Ücretsiz (belirli limitlerle)

### ❌ Dezavantajlar:
- **Büyük kurulum** (~200MB+)
- **Sunucu servisi** - Windows servisi olarak çalışır
- **Kurulum karmaşıklığı** - Setup'a dahil etmek zor

## Öneri: SQLite Kullanmaya Devam

Kütüphane uygulaması için SQLite ideal çünkü:
1. ✅ Hiçbir ek kurulum gerektirmez
2. ✅ Setup sırasında sorun çıkarmaz
3. ✅ Veriler kalıcıdır (dosya silinmediği sürece)
4. ✅ Tek dosya = kolay backup
5. ✅ Küçük-orta ölçekli uygulamalar için yeterli

## SQL Server'a Geçiş İsterseniz

Eğer SQL Server LocalDB kullanmak isterseniz:
1. `Microsoft.EntityFrameworkCore.SqlServer` paketi eklenir
2. Connection string değiştirilir
3. Setup'a LocalDB kurulumu eklenir (~50MB)
4. İlk çalıştırmada LocalDB başlatılır

**Not:** SQL Server LocalDB için setup'a ekstra kurulum dosyası eklenmesi gerekir.

## Veri Kalıcılığı (Her İki Seçenek İçin)

- ✅ **Veriler kalıcıdır** - Manuel silme olmadığı sürece
- ✅ **Otomatik silinmez** - Uygulama verileri silmez
- ✅ **Backup kolay** - Veritabanı dosyasını kopyalamak yeterli
- ✅ **Taşınabilir** - Veritabanı dosyası başka bilgisayara taşınabilir



