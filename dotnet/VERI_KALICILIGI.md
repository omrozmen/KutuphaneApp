# Veri Kalıcılığı ve Yönetimi

## ✅ Veriler Kalıcıdır

### SQLite (Varsayılan)
- **Konum**: `%LocalAppData%\KutuphaneApp\kutuphane.db`
- **Kalıcılık**: ✅ **Sınırsız** - Dosya silinmediği sürece veriler kalır
- **Otomatik Silme**: ❌ **YOK** - Uygulama verileri otomatik silmez
- **Backup**: ✅ Tek dosyayı kopyalamak yeterli
- **Taşınabilirlik**: ✅ Dosyayı başka bilgisayara taşıyabilirsiniz

### SQL Server LocalDB
- **Konum**: `C:\Users\[Kullanıcı]\AppData\Local\Microsoft\Microsoft SQL Server Local DB\Instances\mssqllocaldb\KutuphaneDB.mdf`
- **Kalıcılık**: ✅ **Sınırsız** - Veritabanı dosyaları korunur
- **Otomatik Silme**: ❌ **YOK** - Uygulama verileri otomatik silmez
- **Backup**: ✅ Veritabanı backup/restore ile yedeklenebilir
- **Taşınabilirlik**: ✅ Backup/restore ile taşınabilir

## 🔒 Veri Güvenliği

### Otomatik Silme Durumları:
1. ❌ **Uygulama verileri silmez** - Hiçbir zaman otomatik silme yapılmaz
2. ⚠️ **Kullanıcı silerse** - Manuel silme durumunda veriler kaybolur
3. ⚠️ **Uygulama kaldırılırsa** - Setup'ta "Verileri sil" seçeneği varsa silinebilir
4. ⚠️ **Disk dolduğunda** - İşletim sistemi dosyaları silebilir (çok nadir)

### Veri Koruma Önerileri:
1. ✅ **Düzenli Backup**: Veritabanı dosyasını düzenli yedekleyin
2. ✅ **Farklı Konumda Saklama**: Önemli veriler için farklı disk/konum
3. ✅ **Cloud Backup**: OneDrive, Google Drive gibi servislere yedekleyin

## 📊 Veri Yönetimi

### Admin Yetkileri:
- ✅ Tüm kullanıcıları görüntüleme
- ✅ Kullanıcı rolleri değiştirme (Student → Staff → Admin)
- ✅ Kullanıcı şifrelerini değiştirme
- ✅ Yeni Personel/admin oluşturma
- ✅ Kullanıcı silme
- ✅ Tüm verileri yönetme

### Veri Ekleme/Düzenleme:
- ✅ Kitaplar: Admin ve Staff ekleyebilir
- ✅ Öğrenciler: Admin ekleyebilir
- ✅ Personeller: Sadece Admin ekleyebilir
- ✅ Admin: Sadece Admin ekleyebilir
- ✅ Ödünç kayıtları: Staff ve Admin yönetebilir

## 🗄️ Veritabanı Bakımı

### SQLite:
- **VACUUM**: Veritabanı boyutunu optimize eder
- **REINDEX**: İndeksleri yeniden oluşturur
- **ANALYZE**: İstatistikleri günceller

### SQL Server:
- **Backup**: Düzenli backup alın
- **Maintenance**: Index rebuild, statistics update
- **Log Management**: Transaction log boyutunu kontrol edin

## 📈 Veri Büyümesi

### Tahmini Boyutlar:
- **1000 kitap**: ~500 KB
- **1000 öğrenci**: ~200 KB
- **10,000 ödünç kaydı**: ~2 MB
- **Toplam (küçük kütüphane)**: ~5-10 MB
- **Toplam (orta kütüphane)**: ~50-100 MB
- **Toplam (büyük kütüphane)**: ~500 MB - 1 GB

### Performans:
- SQLite: 100,000+ kayıt için hala hızlı
- SQL Server: Milyonlarca kayıt için uygun

## 🔄 Veri Taşıma

### SQLite → SQL Server:
1. SQLite veritabanını export et
2. SQL Server'a import et
3. Connection string'i güncelle

### SQL Server → SQLite:
1. SQL Server'dan export et
2. SQLite'a import et
3. Connection string'i güncelle

## ⚠️ Önemli Notlar

1. **Veriler kalıcıdır** - Manuel silme olmadığı sürece kaybolmaz
2. **Backup alın** - Önemli veriler için düzenli yedekleme yapın
3. **Disk alanı** - Yeterli disk alanı olduğundan emin olun
4. **Güvenlik** - Veritabanı dosyasını koruyun (şifreleme, erişim kontrolü)



