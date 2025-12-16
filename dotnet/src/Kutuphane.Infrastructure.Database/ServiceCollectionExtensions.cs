using System;
using System.IO;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Infrastructure.Database.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Kutuphane.Infrastructure.Database;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddDatabaseInfrastructure(
        this IServiceCollection services,
        Action<DatabaseOptions>? configure = null)
    {
        var options = new DatabaseOptions();
        configure?.Invoke(options);

        // Ensure database directory exists
        var dbDirectory = Path.GetDirectoryName(options.DatabasePath);
        if (!string.IsNullOrEmpty(dbDirectory) && !Directory.Exists(dbDirectory))
        {
            Directory.CreateDirectory(dbDirectory);
        }

        // Configure DbContext - SQLite only
        services.AddDbContext<KutuphaneDbContext>(opt =>
        {
            opt.UseSqlite($"Data Source={options.DatabasePath}");
        });

        // Register repositories
        services.AddScoped<IBookRepository, DatabaseBookRepository>();
        services.AddScoped<IUserRepository, DatabaseUserRepository>();
        services.AddScoped<IStatsRepository, DatabaseStatsRepository>();

        // Register backup service
        services.AddSingleton(sp => new Services.DatabaseBackupService(options.DatabasePath));

        // Register auto backup service as hosted service
        // Hosted service will automatically start with the application
        services.AddSingleton<Services.AutoBackupService>(sp =>
        {
            var backupService = sp.GetRequiredService<Services.DatabaseBackupService>();
            var loggerFactory = sp.GetRequiredService<Microsoft.Extensions.Logging.ILoggerFactory>();
            var logger = loggerFactory.CreateLogger<Services.AutoBackupService>();
            
            var autoBackupService = new Services.AutoBackupService(backupService, logger);
            
            // Configure before starting
            autoBackupService.SetBackupInterval(options.AutoBackupIntervalDays);
            autoBackupService.SetEnabled(options.AutoBackupEnabled);
            
            return autoBackupService;
        });
        
        // Register the same instance as HostedService
        services.AddHostedService<Services.AutoBackupService>(sp => 
            sp.GetRequiredService<Services.AutoBackupService>());
        
        // Recovery code service
        services.AddScoped<Services.RecoveryCodeService>();

        return services;
    }
}

public class DatabaseOptions
{
    /// <summary>
    /// SQLite veritabanı dosya yolu
    /// </summary>
    public string DatabasePath { get; set; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KutuphaneApp",
        "kutuphane.db"
    );

    /// <summary>
    /// Otomatik yedekleme etkin mi (varsayılan: true)
    /// </summary>
    public bool AutoBackupEnabled { get; set; } = true;

    /// <summary>
    /// Otomatik yedekleme aralığı (gün olarak, varsayılan: 30)
    /// </summary>
    public int AutoBackupIntervalDays { get; set; } = 30;
}




