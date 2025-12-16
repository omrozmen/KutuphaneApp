using System;
using System.IO;

namespace Kutuphane.Infrastructure.Files;

public sealed class FileInfrastructureOptions
{
    public string StorageDirectory { get; set; } = Path.Combine(AppContext.BaseDirectory, "storage");

    public string DatabaseFileName { get; set; } = "kutuphane.json";

    public string StatsFileName { get; set; } = "stats.json";

    public string StudentsFileName { get; set; } = "students.csv";

    public string personelFileName { get; set; } = "personel.csv";

    public string BooksFileName { get; set; } = "books.csv";

    public string LogsFileName { get; set; } = "logs.csv";

    public string GetDatabasePath() => EnsurePath(DatabaseFileName);

    public string GetStatsPath() => EnsurePath(StatsFileName);

    public string GetStudentsPath() => EnsurePath(StudentsFileName);

    public string GetpersonelPath() => EnsurePath(personelFileName);

    public string GetBooksPath() => EnsurePath(BooksFileName);

    public string GetLogsPath() => EnsurePath(LogsFileName);

    private string EnsurePath(string fileName)
    {
        Directory.CreateDirectory(StorageDirectory);
        return Path.Combine(StorageDirectory, fileName);
    }
}
