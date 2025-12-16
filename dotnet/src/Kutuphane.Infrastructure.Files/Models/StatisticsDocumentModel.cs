using System.Collections.Generic;

namespace Kutuphane.Infrastructure.Files.Models;

public sealed class StatisticsDocumentModel
{
    public Dictionary<string, BookStatsRecordModel> Books { get; set; } = new();

    public Dictionary<string, StudentStatsRecordModel> Students { get; set; } = new();
}

public sealed class BookStatsRecordModel
{
    public string Title { get; set; } = string.Empty;

    public string Author { get; set; } = string.Empty;

    public string Category { get; set; } = string.Empty;

    public int Quantity { get; set; }

    public int Borrowed { get; set; }

    public int Returned { get; set; }

    public int Late { get; set; }
}

public sealed class StudentStatsRecordModel
{
    public string Name { get; set; } = string.Empty;

    public string Surname { get; set; } = string.Empty;

    public int Borrowed { get; set; }

    public int Returned { get; set; }

    public int Late { get; set; }
}
