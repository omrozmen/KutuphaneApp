using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Kutuphane.Infrastructure.Database.Services;

/// <summary>
/// Arka planda çalışan otomatik veritabanı yedekleme servisi
/// </summary>
public class AutoBackupService : BackgroundService
{
    private readonly DatabaseBackupService _backupService;
    private readonly ILogger<AutoBackupService> _logger;
    private Timer? _timer;
    private int _backupIntervalDays = 30; // Varsayılan: 30 gün
    private bool _isEnabled = true;
    private DateTime? _lastBackupDate;

    public AutoBackupService(
        DatabaseBackupService backupService,
        ILogger<AutoBackupService> logger)
    {
        _backupService = backupService;
        _logger = logger;
    }

    public int BackupIntervalDays => _backupIntervalDays;
    public bool IsEnabled => _isEnabled;
    public DateTime? LastBackupDate => _lastBackupDate;

    /// <summary>
    /// Otomatik yedekleme aralığını ayarlar (gün olarak)
    /// </summary>
    public void SetBackupInterval(int days)
    {
        if (days < 1)
        {
            throw new ArgumentException("Yedekleme aralığı en az 1 gün olmalıdır", nameof(days));
        }

        _backupIntervalDays = days;
        _logger.LogInformation("Otomatik yedekleme aralığı {Days} gün olarak ayarlandı", days);
        
        // Timer'ı yeniden başlat
        RestartTimer();
    }

    /// <summary>
    /// Otomatik yedeklemeyi aktif/pasif yapar
    /// </summary>
    public void SetEnabled(bool enabled)
    {
        _isEnabled = enabled;
        _logger.LogInformation("Otomatik yedekleme {Status}", enabled ? "aktif" : "pasif");
        
        if (enabled)
        {
            RestartTimer();
        }
        else
        {
            _timer?.Dispose();
            _timer = null;
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_isEnabled)
        {
            _logger.LogInformation("Otomatik yedekleme pasif durumda");
            return;
        }

        _logger.LogInformation("Otomatik yedekleme servisi başlatıldı. Aralık: {Days} gün", _backupIntervalDays);

        // İlk başlatmada son yedek tarihini kontrol et
        UpdateLastBackupDate();

        // Hemen kontrol yap ve gerekirse yedek al
        await CheckAndBackupAsync(stoppingToken);

        // Sonraki yedekleme zamanını hesapla
        ScheduleNextBackup();
    }

    private void UpdateLastBackupDate()
    {
        try
        {
            var backups = _backupService.ListBackups();
            if (backups.Length > 0)
            {
                // En son yedeğin tarihini al
                var latestBackup = backups[0]; // ListBackups zaten sıralı döndürüyor (en yeni başta)
                _lastBackupDate = System.IO.File.GetCreationTime(latestBackup);
                _logger.LogInformation("Son yedek tarihi: {Date}", _lastBackupDate);
            }
            else
            {
                _logger.LogInformation("Hiç yedek bulunamadı, ilk yedek alınacak");
                _lastBackupDate = null;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Son yedek tarihi alınırken hata oluştu");
            _lastBackupDate = null;
        }
    }

    private async Task CheckAndBackupAsync(CancellationToken cancellationToken)
    {
        if (!_isEnabled)
        {
            return;
        }

        try
        {
            var now = DateTime.Now;
            var shouldBackup = false;

            if (_lastBackupDate == null)
            {
                // Hiç yedek yoksa hemen al
                shouldBackup = true;
                _logger.LogInformation("İlk otomatik yedek oluşturuluyor...");
            }
            else
            {
                var daysSinceLastBackup = (now - _lastBackupDate.Value).TotalDays;
                if (daysSinceLastBackup >= _backupIntervalDays)
                {
                    shouldBackup = true;
                    _logger.LogInformation("Son yedekten {Days:F1} gün geçti, yeni yedek oluşturuluyor...", daysSinceLastBackup);
                }
                else
                {
                    _logger.LogInformation("Son yedek {Days:F1} gün önce alındı, henüz yedekleme zamanı değil", daysSinceLastBackup);
                }
            }

            if (shouldBackup)
            {
                await PerformBackupAsync(cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Yedekleme kontrolü sırasında hata oluştu");
        }
    }

    private async Task PerformBackupAsync(CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Otomatik yedekleme başlatılıyor...");
            
            var backupPath = await _backupService.BackupAsync(
                backupPath: null,
                createBeforeRestoreBackup: false,
                cancellationToken: cancellationToken
            );

            _lastBackupDate = DateTime.Now;
            _logger.LogInformation("Otomatik yedekleme başarılı: {BackupPath}", backupPath);

            // Eski yedekleri temizle (90 günden eski olanları)
            var deletedCount = _backupService.CleanOldBackups(90);
            if (deletedCount > 0)
            {
                _logger.LogInformation("{Count} eski yedek dosyası temizlendi", deletedCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Otomatik yedekleme sırasında hata oluştu");
        }
    }

    private void ScheduleNextBackup()
    {
        if (!_isEnabled)
        {
            return;
        }

        var now = DateTime.Now;
        
        _logger.LogInformation("Sonraki otomatik yedekleme kontrolü planlanıyor...");
        _logger.LogInformation("Şu anki tarih: {Now:yyyy-MM-dd HH:mm:ss}", now);
        
        if (_lastBackupDate != null)
        {
            var daysSinceLastBackup = (now.Date - _lastBackupDate.Value.Date).TotalDays;
            var nextBackupDate = _lastBackupDate.Value.Date.AddDays(_backupIntervalDays);
            _logger.LogInformation("Son yedek: {LastBackup:yyyy-MM-dd}, {Days:F1} gün önce", _lastBackupDate.Value, daysSinceLastBackup);
            _logger.LogInformation("Sonraki yedek zamanı: {NextBackup:yyyy-MM-dd}", nextBackupDate);
        }

        // ÖNEMLI: Timer'ı her saat kontrol edecek şekilde ayarla
        // Böylece sistem tarihi değişiklikleri hızlıca algılanır
        // CheckAndBackupAsync zaten tarihi kontrol edip gerekiyorsa yedek alıyor
        var interval = TimeSpan.FromHours(1);
        
        _logger.LogInformation("Timer ayarlandı: Her saat kontrol edilecek");
        
        _timer = new Timer(
            async state => await CheckAndBackupAsync(CancellationToken.None),
            null,
            interval,  // İlk kontrol 1 saat sonra
            interval   // Sonra her saat
        );
    }

    private void RestartTimer()
    {
        _timer?.Dispose();
        
        if (_isEnabled)
        {
            UpdateLastBackupDate();
            ScheduleNextBackup();
        }
    }

    public override void Dispose()
    {
        _timer?.Dispose();
        base.Dispose();
    }
}
