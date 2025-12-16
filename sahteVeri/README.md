# Sahte Veri Üreteci

Bu küçük Python betiği çalışma dizininde aşağıdaki dosyaları tamamlar veya oluşturur:

- `kitap listesi.xlsx` — en az 200 satır olacak şekilde tamamlanır.
- `ogrenci_listesi.xlsx` — en az 100 satır olacak şekilde tamamlanır.
- `odunc listesi.xlsx` — oluşturulan öğrenci/kitap verilerinden 100 ödünç kaydı üretilir.

Kurulum ve kullanım:

```bash
python3 -m pip install -r requirements.txt
python3 generate_data.py
```

Notlar:
- Mevcut Excel dosyaları varsa korunur; eksik satırlar üretilip eklenir.
- `odunc listesi.xlsx` varsa, mevcut sütun/durum örüntülerine bakılarak benzer bir yapı oluşturulmaya çalışılır.
