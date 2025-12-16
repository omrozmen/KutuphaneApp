# Veritabanı Tabloları Özeti

## ✅ Tüm Tablolar Oluşturuldu

### 1. **Books** Tablosu
- **Id** (Guid, Primary Key)
- **Title** (string, Indexed)
- **Author** (string, Indexed)
- **Category** (string, Indexed)
- **Quantity** (int) - Mevcut Adet
- **TotalQuantity** (int) - Toplam Adet
- **Lastpersonel** (string, nullable) - Son işlem yapan Personel

### 2. **Loans** Tablosu (Ödünç Kayıtları)
- **Id** (int, Primary Key, Auto Increment)
- **BookId** (Guid, Foreign Key → Books, Indexed)
- **Borrower** (string, Indexed) - Öğrenci adı
- **DueDate** (DateTime, Indexed) - Teslim tarihi
- **personel** (string) - İşlem yapan Personel

### 3. **Users** Tablosu (Öğrenci, Personel, Admin)
- **Username** (string, Primary Key, Indexed)
- **Password** (string)
- **Role** (string, Indexed) - "Student", "personel", "ADMIN"
- **Name** (string, nullable) - Ad
- **Class** (int, nullable) - Sınıf (sadece öğrenciler için)
- **Branch** (string, nullable) - Şube (sadece öğrenciler için)
- **StudentNumber** (int, nullable, Indexed) - Öğrenci numarası
- **PenaltyPoints** (int) - Ceza puanı

### 4. **BookStats** Tablosu (Kitap İstatistikleri)
- **Id** (Guid, Primary Key)
- **Title** (string, Indexed)
- **Author** (string)
- **Category** (string)
- **Quantity** (int)
- **Borrowed** (int) - Toplam ödünç sayısı
- **Returned** (int) - Toplam iade sayısı
- **Late** (int) - Geciken ödünç sayısı

### 5. **StudentStats** Tablosu (Öğrenci İstatistikleri)
- **Name** (string, Primary Key, Indexed)
- **Borrowed** (int) - Toplam ödünç sayısı
- **Returned** (int) - Toplam iade sayısı
- **Late** (int) - Geciken ödünç sayısı

## 🔄 Otomatik Kurulum

### İlk Çalıştırmada:
1. ✅ Veritabanı dosyası otomatik oluşturulur: `%LocalAppData%\KutuphaneApp\kutuphane.db`
2. ✅ Tüm tablolar otomatik oluşturulur (`EnsureCreatedAsync()`)
3. ✅ Seed data yüklenir:
   - Admin kullanıcı: `admin/admin`
   - 2 Personel: `personel1/admin`, `personel2/admin`

### Setup Sırasında:
1. ✅ .NET 8 Runtime dahil (SQLite runtime da dahil)
2. ✅ Veritabanı klasörü oluşturulur
3. ✅ İlk çalıştırmada veritabanı hazır olur

## 📦 SQLite Runtime

- ✅ **Ayrı kurulum GEREKMEZ**
- ✅ .NET 8 Runtime ile birlikte gelir
- ✅ Setup'a otomatik dahil edilir
- ✅ Tek dosya veritabanı (portable)

## 🚀 Program Başlatma

1. Setup çalıştırılır
2. Uygulama kurulur
3. Program ilk çalıştırıldığında:
   - Veritabanı otomatik oluşturulur
   - Tablolar oluşturulur
   - Seed data yüklenir
   - Program hazır!

## ✅ Kontrol Listesi

- [x] Books tablosu
- [x] Loans tablosu
- [x] Users tablosu (Öğrenci, Personel, Admin)
- [x] BookStats tablosu
- [x] StudentStats tablosu
- [x] Otomatik veritabanı oluşturma
- [x] Seed data mekanizması
- [x] Setup entegrasyonu
- [x] SQLite runtime dahil (.NET 8 ile)



