## LibraryVision .NET Sürümü

Bu klasör, kütüphane görsellerinden kitap bilgilerini ayrıştıran Python çözümünün .NET 8 tabanlı eşdeğeridir. Uygulama yalnızca Windows 10+ cihazlar için hedeflenmiştir ve tamamen Windows ile gelen bileşenleri kullanır:

- `DirectoryImageRepository`: Klasör içerisindeki görselleri (HEIC dahil) okur. HEIC dosyalarını Windows Imaging API ile PNG'ye dönüştürür; ek dönüştürücü gerektirmez (HEIF/HEVC uzantılarının kurulu olması gerekir).
- `GdiPreprocessor`: `System.Drawing` ile gri tonlama, kontrast germe ve keskinleştirme uygular.
- `WindowsOcrService`: Windows.Media.Ocr API'sini kullanarak belirtilen dil paketi üzerinden OCR yapar (örn. `tr-TR`).
- `HeuristicBookParser`: OCR çıktısını kural tabanlı olarak `BookRecord` nesnelerine dönüştürür.
- `SpreadsheetXmlExporter`: Ekstra paket olmadan, Excel tarafından açılabilen SpreadsheetML (XML) dosyaları üretir (her görsel için ayrı `.xml`).

### Kurulum

1. [.NET 8 SDK](https://dotnet.microsoft.com/download) kurulu olmalı.
2. Windows'ta ilgili dil paketlerini (örn. Türkçe OCR desteği için Türkçe dil paketi) ve HEIF/HEVC uzantılarını yükle.
3. `Proje_Net_Version/LibraryVision.Net` dizininde aşağıdaki komutları çalıştır:

```bash
dotnet restore
dotnet build
```

### Çalıştırma

```bash
dotnet run -- --input-dir Goruntuler --output-dir output --lang tr-TR
```

Parametreler:
- `--input-dir`: Görsellerin bulunduğu klasör (varsayılan `./Goruntuler`)
- `--output-dir`: Excel (XML) dosyalarının yazılacağı klasör (varsayılan `./output`)
- `--lang`: Windows OCR dil etiketi (`tr-TR`, `en-US` vb.)

### .NET ile Entegrasyon

Bu proje bir konsol uygulaması olarak tasarlandı. Ana .NET uygulaman:
1. Kullanıcıdan görsel klasörü ve dil ayarlarını alır.
2. Bu konsolu `Process.Start` ile parametreleri geçirerek çalıştırır veya projeyi çözümüne referans gösterip sınıfları doğrudan kullanır.
3. Oluşan SpreadsheetML dosyalarını veritabanına/kullanıcı arayüzüne aktarır ya da tekrar içe alır.

Tüm bağımlılıklar .NET/Windows ile birlikte geldiği için ek NuGet paketi kurulumu gerekmez; ancak çalışmanın sağlıklı olması için Windows OCR dil paketi ve HEIC codec'lerinin kurulmuş olması şarttır.
