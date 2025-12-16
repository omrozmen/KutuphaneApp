# Kutuphane Infrastructure.Database

Bu proje SQLite veritabanı altyapısını sağlar. Entity Framework Core kullanarak veritabanı işlemlerini yönetir.

## Özellikler

- SQLite veritabanı desteği (sunucu gerektirmez)
- Entity Framework Core 8.0
- Repository pattern implementasyonu
- Otomatik veritabanı oluşturma ve seed data

## Veritabanı Yapısı

### Tablolar

1. **Books** - Kitap bilgileri
2. **Loans** - Ödünç kayıtları
3. **Users** - Kullanıcı bilgileri
4. **BookStats** - Kitap istatistikleri
5. **StudentStats** - Öğrenci istatistikleri

## Kurulum

Veritabanı otomatik olarak ilk çalıştırmada oluşturulur. Varsayılan konum:
- Windows: `%LocalAppData%\KutuphaneApp\kutuphane.db`
- macOS/Linux: `~/.local/share/KutuphaneApp/kutuphane.db`

## Setup Entegrasyonu

Setup sırasında:
1. SQLite runtime otomatik olarak dahil edilir (.NET 8 ile birlikte gelir)
2. Veritabanı dosyası setup ile birlikte paketlenebilir (isteğe bağlı)
3. İlk çalıştırmada otomatik olarak oluşturulur ve seed data yüklenir

## Migration

Entity Framework Core migrations kullanılarak veritabanı şeması yönetilir. İlk migration otomatik olarak `EnsureCreatedAsync()` ile oluşturulur.



