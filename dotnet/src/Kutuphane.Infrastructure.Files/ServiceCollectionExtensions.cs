using System;
using System.IO;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Infrastructure.Files.Directories;
using Kutuphane.Infrastructure.Files.Models;
using Kutuphane.Infrastructure.Files.Repositories;
using Kutuphane.Infrastructure.Files.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace Kutuphane.Infrastructure.Files;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddFileInfrastructure(
        this IServiceCollection services,
        Action<FileInfrastructureOptions>? configure = null)
    {
        var options = new FileInfrastructureOptions();
        configure?.Invoke(options);

        services.AddSingleton(options);

        services.AddSingleton(sp => new JsonFileStorage<LibraryDatabaseModel>(options.GetDatabasePath()));
        services.AddSingleton(sp => new JsonFileStorage<StatisticsDocumentModel>(options.GetStatsPath()));

        services.AddScoped<IBookRepository>(sp =>
            new FileBookRepository(sp.GetRequiredService<JsonFileStorage<LibraryDatabaseModel>>()));
        services.AddScoped<IUserRepository>(sp =>
            new FileUserRepository(sp.GetRequiredService<JsonFileStorage<LibraryDatabaseModel>>()));
        services.AddScoped<IStatsRepository>(sp =>
            new FileStatsRepository(sp.GetRequiredService<JsonFileStorage<StatisticsDocumentModel>>()));

        services.AddSingleton(sp => new StudentDirectory(options.GetStudentsPath()));
        services.AddSingleton(sp => new personelDirectory(options.GetpersonelPath()));
        services.AddSingleton(sp => new BookSheet(options.GetBooksPath()));
        services.AddSingleton(sp => new LogDirectory(options.GetLogsPath()));
        services.AddSingleton<Services.ExcelReaderService>();

        return services;
    }
}
