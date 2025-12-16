using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Kutuphane.Infrastructure.Database.Services;

/// <summary>
/// SQLite veritabanı yedekleme ve geri yükleme servisi
/// </summary>
public class DatabaseBackupService
{
    private readonly string _databasePath;

    public DatabaseBackupService(string databasePath)
    {
        _databasePath = databasePath;
    }

    public string DatabasePath => _databasePath;

    /// <summary>
    /// Dinamik olarak veritabanı klasörünü döndürür
    /// </summary>
    public string GetDatabaseDirectory()
    {
        return Path.GetDirectoryName(_databasePath) ?? 
               Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "KutuphaneApp");
    }

    /// <summary>
    /// Dinamik olarak yedekleme klasörünü döndürür
    /// Yedekleme dizinini döndürür (platforma özel)
    /// </summary>
    public string GetBackupDirectory()
    {
        return GetDatabaseDirectory() + "/backups";
    }

    /// <summary>
    /// Veritabanını yedekler
    /// </summary>
    /// <param name="backupPath">Opsiyonel yedek dosya yolu</param>
    /// <param name="createBeforeRestoreBackup">Before_restore yedeği mi (varsayılan: false)</param>
    /// <param name="cancellationToken">İptal token'ı</param>
    public async Task<string> BackupAsync(
        string? backupPath = null, 
        bool createBeforeRestoreBackup = false, 
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_databasePath))
        {
            throw new FileNotFoundException("Veritabanı dosyası bulunamadı", _databasePath);
        }

        if (string.IsNullOrWhiteSpace(backupPath))
        {
            var backupDir = GetBackupDirectory();
            
            var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var prefix = createBeforeRestoreBackup ? "before_restore_" : "kutuphane_backup_";
            var fileName = $"{prefix}{timestamp}.db";
            backupPath = Path.Combine(backupDir, fileName);
            
            Console.WriteLine($"[BACKUP] Yedek oluşturuluyor: {fileName}");
        }

        // Hedef klasörün var olduğundan emin ol
        var targetDir = Path.GetDirectoryName(backupPath);
        if (!string.IsNullOrEmpty(targetDir))
        {
            Directory.CreateDirectory(targetDir);
        }

        // ÖNEMLI: SQLite WAL modunda çalışıyor. 
        // Tüm değişiklikleri ana dosyaya yazmak için checkpoint yapmalıyız.
        await Task.Run(() =>
        {
            // WAL dosyasını ana dosyaya flush et (checkpoint)
            using (var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={_databasePath}"))
            {
                connection.Open();
                using (var command = connection.CreateCommand())
                {
                    command.CommandText = "PRAGMA wal_checkpoint(FULL);";
                    command.ExecuteNonQuery();
                }
            }
            
            // Şimdi ana veritabanı dosyasını kopyala (tüm veri içinde)
            File.Copy(_databasePath, backupPath, overwrite: true);
        }, cancellationToken);

        Console.WriteLine($"[BACKUP] Başarılı: {backupPath}");
        return backupPath;
    }

    /// <summary>
    /// Yedekten geri yükler
    /// NOT: Bu metot tüm veritabanı bağlantılarını KAPATIR ve dosyayı değiştirir.
    /// Restore sonrası uygulama yeniden başlatılmalıdır!
    /// </summary>
    /// <param name="backupPath">Geri yüklenecek yedek dosya yolu</param>
    /// <param name="createSafetyBackup">Geri yükleme öncesi güvenlik yedeği oluştur (varsayılan: false)</param>
    /// <param name="cancellationToken">İptal token'ı</param>
    public async Task RestoreAsync(
        string backupPath, 
        bool createSafetyBackup = false, 
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(backupPath))
        {
            throw new FileNotFoundException("Yedek dosyası bulunamadı", backupPath);
        }

        // Opsiyonel: Mevcut veritabanını yedekle (güvenlik için)
        if (createSafetyBackup)
        {
            await BackupAsync(
                backupPath: null,
                createBeforeRestoreBackup: true,
                cancellationToken: cancellationToken
            );
        }

        // SQLite dosyasını değiştirmek için tüm aktif bağlantıları kapatmak gerekiyor
        // Bu yüzden sadece dosya seviyesinde restore yapıyoruz
        // NOT: Restore sonrası uygulama yeniden başlatılmalı!
        
        // Yedek dosyasını mevcut veritabanına kopyala
        // SQLite kilidi sorununu aşmak için birkaç deneme yap
        const int maxRetries = 3;
        const int delayMs = 500;
        Exception? lastException = null;

        for (int i = 0; i < maxRetries; i++)
        {
            try
            {
                await Task.Run(() =>
                {
                    // Ana veritabanı dosyasını değiştir
                    File.Copy(backupPath, _databasePath, overwrite: true);
                    
                    // ÖNEMLI: Eski WAL ve SHM dosyalarını sil
                    // Aksi halde eski cache veriler restore edilen veriyle çakışır
                    var walPath = _databasePath + "-wal";
                    var shmPath = _databasePath + "-shm";
                    
                    if (File.Exists(walPath))
                    {
                        File.Delete(walPath);
                    }
                    
                    if (File.Exists(shmPath))
                    {
                        File.Delete(shmPath);
                    }
                }, cancellationToken);
                
                return; // Başarılıysa çık
            }
            catch (IOException ex) when (i < maxRetries - 1)
            {
                // Dosya kilitliyse biraz bekle ve tekrar dene
                lastException = ex;
                await Task.Delay(delayMs, cancellationToken);
            }
        }

        // Tüm denemeler başarısız olduysa hata fırlat
        throw new InvalidOperationException(
            "Veritabanı geri yüklenemedi. Lütfen tüm bağlantıları kapatıp tekrar deneyin. " +
            "Restore işlemi için uygul amayı yeniden başlatmanız gerekebilir.",
            lastException
        );
    }

    /// <summary>
    /// Mevcut yedekleri listeler
    /// </summary>
    public string[] ListBackups()
    {
        var backupDir = GetBackupDirectory();

        if (!Directory.Exists(backupDir))
        {
            return Array.Empty<string>();
        }

        return Directory.GetFiles(backupDir, "*.db")
            .OrderByDescending(f => File.GetCreationTime(f))
            .ToArray();
    }

    /// <summary>
    /// Belirtilen gün sayısından eski yedekleri temizler
    /// Dosya adından tarihi parse eder (daha güvenilir)
    /// </summary>
    /// <param name="daysToKeep">Saklanacak gün sayısı (varsayılan: 30)</param>
    /// <returns>Silinen dosya sayısı</returns>
    public int CleanOldBackups(int daysToKeep = 30)
    {
        var backupDir = GetBackupDirectory();

        if (!Directory.Exists(backupDir))
        {
            return 0;
        }

        var now = DateTime.Now;
        var cutoffDate = now.Date.AddDays(-daysToKeep); // Sadece tarih, saat 00:00:00
        var allBackups = Directory.GetFiles(backupDir, "*.db");
        var deletedCount = 0;

        Console.WriteLine($"[CLEANUP] Başlangıç - Bugünün tarihi: {now:yyyy-MM-dd HH:mm:ss}");
        Console.WriteLine($"[CLEANUP] Saklanacak gün: {daysToKeep}, Cutoff tarihi: {cutoffDate:yyyy-MM-dd}");
        Console.WriteLine($"[CLEANUP] Toplam yedek sayısı: {allBackups.Length}");

        foreach (var backup in allBackups)
        {
            try
            {
                var fileName = Path.GetFileName(backup);
                
                // Dosya adından tarihi parse et
                // Format: kutuphane_backup_yyyyMMdd_HHmmss.db veya before_restore_yyyyMMdd_HHmmss.db
                var match = System.Text.RegularExpressions.Regex.Match(fileName, @"(\d{8})_(\d{6})");
                
                if (match.Success)
                {
                    var dateStr = match.Groups[1].Value; // yyyyMMdd
                    
                    // Tarihi parse et
                    if (DateTime.TryParseExact(
                        dateStr,
                        "yyyyMMdd",
                        System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.None,
                        out var backupDate))
                    {
                        var daysDiff = (now.Date - backupDate.Date).TotalDays;
                        var shouldDelete = backupDate.Date < cutoffDate;
                        
                        Console.WriteLine($"[CLEANUP] Dosya: {fileName}");
                        Console.WriteLine($"[CLEANUP]   Yedek tarihi: {backupDate:yyyy-MM-dd}");
                        Console.WriteLine($"[CLEANUP]   Kaç gün önce: {daysDiff:F1} gün");
                        Console.WriteLine($"[CLEANUP]   Silinecek mi: {shouldDelete}");
                        
                        // Sadece tarihi karşılaştır (saat bilgisini yoksay)
                        if (shouldDelete)
                        {
                            File.Delete(backup);
                            deletedCount++;
                            Console.WriteLine($"[CLEANUP]   ✓ SİLİNDİ");
                        }
                        else
                        {
                            Console.WriteLine($"[CLEANUP]   - Korunuyor");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"[CLEANUP] Dosya: {fileName} - Tarih parse edilemedi, dosya sistemi tarihi kullanılıyor");
                        // Parse edilemezse dosya sistemi tarihini kullan (fallback)
                        var fileInfo = new FileInfo(backup);
                        if (fileInfo.CreationTime.Date < cutoffDate)
                        {
                            File.Delete(backup);
                            deletedCount++;
                            Console.WriteLine($"[CLEANUP]   ✓ SİLİNDİ (fallback)");
                        }
                    }
                }
                else
                {
                    Console.WriteLine($"[CLEANUP] Dosya: {fileName} - Regex eşleşmedi, dosya sistemi tarihi kullanılıyor");
                    // Regex match olmazsa dosya  sistemi tarihini kullan (fallback)
                    var fileInfo = new FileInfo(backup);
                    if (fileInfo.CreationTime.Date < cutoffDate)
                    {
                        File.Delete(backup);
                        deletedCount++;
                        Console.WriteLine($"[CLEANUP]   ✓ SİLİNDİ (fallback)");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CLEANUP] HATA: {ex.Message}");
            }
        }

        Console.WriteLine($"[CLEANUP] Tamamlandı - Toplam {deletedCount} yedek silindi");
        return deletedCount;
    }
}
