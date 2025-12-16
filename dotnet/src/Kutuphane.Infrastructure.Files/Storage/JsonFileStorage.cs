using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Kutuphane.Infrastructure.Files.Storage;

/// <summary>
/// Small helper around JSON files so repositories can store structured data
/// without depending on a database.
/// </summary>
/// <typeparam name="T">Root document type</typeparam>
public sealed class JsonFileStorage<T> where T : class, new()
{
    private readonly string _filePath;
    private readonly JsonSerializerOptions _options;

    public JsonFileStorage(string filePath, JsonSerializerOptions? options = null)
    {
        _filePath = filePath;
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
        _options = options ?? new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
        };
    }

    public async Task<T> ReadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_filePath))
        {
            return new T();
        }

        try
        {
            await using var stream = File.OpenRead(_filePath);
            
            // Dosya boşsa yeni bir instance döndür
            if (stream.Length == 0)
            {
                return new T();
            }

            var document = await JsonSerializer.DeserializeAsync<T>(stream, _options, cancellationToken);
            return document ?? new T();
        }
        catch (JsonException)
        {
            // JSON parse hatası - bozuk dosya, yeni bir instance döndür
            return new T();
        }
        catch (IOException)
        {
            // Dosya okuma hatası - yeni bir instance döndür
            return new T();
        }
    }

    public async Task WriteAsync(T document, CancellationToken cancellationToken = default)
    {
        if (document == null)
        {
            throw new ArgumentNullException(nameof(document), "Document cannot be null");
        }

        var tempPath = _filePath + ".tmp";
        FileStream? stream = null;
        try
        {
            // Klasörün var olduğundan emin ol
            var directory = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            // Eski temp dosyayı temizle (varsa)
            if (File.Exists(tempPath))
            {
                try
                {
                    File.Delete(tempPath);
                }
                catch
                {
                    // Temp dosya silinemezse devam et
                }
            }

            // Dosyayı yaz
            stream = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.None);
            await JsonSerializer.SerializeAsync(stream, document, _options, cancellationToken);
            
            // Stream'i kapat ve flush et
            await stream.FlushAsync(cancellationToken);
            stream.Dispose();
            stream = null;

            // Dosyanın yazıldığını doğrula
            if (!File.Exists(tempPath))
            {
                throw new IOException($"Geçici dosya oluşturulamadı: {tempPath}");
            }

            // Eski dosyayı sil (varsa)
            if (File.Exists(_filePath))
            {
                try
                {
                    File.Delete(_filePath);
                }
                catch (IOException)
                {
                    // Dosya kilitliyse biraz bekle ve tekrar dene
                    await Task.Delay(100, cancellationToken);
                    if (File.Exists(_filePath))
                    {
                        File.Delete(_filePath);
                    }
                }
            }

            // Geçici dosyayı asıl dosyaya taşı
            File.Move(tempPath, _filePath, overwrite: true);

            // Dosyanın başarıyla oluşturulduğunu doğrula
            if (!File.Exists(_filePath))
            {
                throw new IOException($"Dosya kaydedilemedi: {_filePath}");
            }
        }
        catch (Exception ex)
        {
            // Stream'i kapat (eğer açıksa)
            if (stream != null)
            {
                try
                {
                    await stream.FlushAsync(cancellationToken);
                    stream.Dispose();
                }
                catch
                {
                    // Stream kapatılamazsa devam et
                }
            }

            // Hata durumunda temp dosyayı temizle
            if (File.Exists(tempPath))
            {
                try
                {
                    File.Delete(tempPath);
                }
                catch
                {
                    // Temp dosya silinemezse devam et
                }
            }

            throw new IOException($"Dosya yazma hatası: {_filePath}. Detay: {ex.Message}", ex);
        }
    }
}
