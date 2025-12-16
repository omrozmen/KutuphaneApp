# Admin Yetki Sistemi

## ✅ Admin Özellikleri

### Tam Yetkiler:
1. **Kullanıcı Yönetimi**
   - Tüm kullanıcıları görüntüleme
   - Kullanıcı rolleri değiştirme (Student ↔ personel ↔ Admin)
   - Kullanıcı şifrelerini değiştirme
   - Kullanıcı silme

2. **Personel Yönetimi**
   - Yeni Personel oluşturma
   - Personel bilgilerini düzenleme
   - Personel silme

3. **Admin Yönetimi**
   - Yeni admin oluşturma
   - Admin bilgilerini düzenleme
   - Admin silme (kendini silemez)

4. **Veri Yönetimi**
   - Tüm kitapları yönetme
   - Tüm ödünç kayıtlarını yönetme
   - İstatistikleri görüntüleme
   - Veri export/import

## 🔐 Yetki Kontrolü

### API Endpoints:
- `/api/admin/management/users` - Tüm kullanıcıları listele (Sadece Admin)
- `/api/admin/management/users/{username}` - Kullanıcı bilgisi (Sadece Admin)
- `/api/admin/management/users/{username}/role` - Rol değiştir (Sadece Admin)
- `/api/admin/management/users/{username}/password` - Şifre değiştir (Sadece Admin)
- `/api/admin/management/personel` - Personel oluştur (Sadece Admin)
- `/api/admin/management/admins` - Admin oluştur (Sadece Admin)
- `/api/admin/management/users/{username}` (DELETE) - Kullanıcı sil (Sadece Admin)

### Yetki Kontrolü Eklenecek:
```csharp
// TODO: Her endpoint'te admin kontrolü ekle
var currentUser = await GetCurrentUserAsync();
if (currentUser?.Role != UserRole.Admin)
{
    return Unauthorized(new { message = "Sadece admin yetkisi gereklidir" });
}
```

## 👥 Rol Hiyerarşisi

1. **Admin** (En yüksek yetki)
   - Tüm işlemleri yapabilir
   - Kullanıcı yönetimi
   - Yetki atama

2. **personel** (Personel)
   - Kitap ekleme/düzenleme
   - Ödünç/iade işlemleri
   - Öğrenci bilgilerini görüntüleme

3. **Student** (Öğrenci)
   - Sadece görüntüleme (login olamaz)
   - Ödünç alma (Personel üzerinden)

## 🚀 Kullanım

### Admin Oluşturma:
```json
POST /api/admin/management/admins
{
  "username": "yeniadmin",
  "password": "güvenlişifre",
  "name": "Yeni Admin"
}
```

### Rol Değiştirme:
```json
POST /api/admin/management/users/ogrenci1/role
{
  "role": "personel"
}
```

### Şifre Değiştirme:
```json
POST /api/admin/management/users/ogrenci1/password
{
  "newPassword": "yenişifre"
}
```

## 📝 Notlar

- Admin kendini silemez (güvenlik için)
- En az bir admin olmalı (son admin silinemez)
- Şifreler plain text saklanıyor (production'da hash'lenmeli)



