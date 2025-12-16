# Kutuphane .NET Yeniden Yapılandırması

Bu dizin Python uygulamasındaki domain ve uygulama mantığının .NET 8 tabanlı yeniden yazımı için kullanılır. Şu an yalnızca `Kutuphane.Core` kitaplığı eklenmiştir; ilerleyen adımlarda dosya tabanlı altyapı, ASP.NET Core API ve React arayüz projeleri bu çözüm altına eklenecek.

## Geliştirme Ortamı

- .NET SDK 8.0+
- macOS / Linux / Windows fark etmeksizin VS Code veya Rider kullanılabilir.

## Proje Hiyerarşisi

```
dotnet/
 ├─ Kutuphane.sln
 └─ src/
    └─ Kutuphane.Core/
        ├─ Domain/        # Book, User vb. domain modelleri
        ├─ Application/   # Servisler ve DTO'lar
        └─ Abstractions/  # Repository arayüzleri (JSON/CSV veya ileride EF Core)
```

## Komutlar

Henüz .NET SDK kurulmadığı için CLI komutları çalıştırılmadı. SDK yüklendiğinde aşağıdaki komutlarla devam edebilirsiniz:

```bash
cd dotnet
dotnet restore
dotnet build
```

Sonraki adımlarda `Kutuphane.Infrastructure.Files` ve `Kutuphane.Api` projeleri aynı çözüm altında oluşturulacak.
