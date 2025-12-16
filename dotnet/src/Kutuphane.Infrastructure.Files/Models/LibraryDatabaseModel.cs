using System;
using System.Collections.Generic;

namespace Kutuphane.Infrastructure.Files.Models;

public sealed class LibraryDatabaseModel
{
    public List<BookRecordModel> Books { get; set; } = new();

    public List<UserRecordModel> Users { get; set; } = new();
}

public sealed class BookRecordModel
{
    public Guid Id { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Author { get; set; } = string.Empty;

    public string Category { get; set; } = "Genel";

    public int Quantity { get; set; }

    public int TotalQuantity { get; set; }

    public int HealthyCount { get; set; }

    public int DamagedCount { get; set; }

    public int LostCount { get; set; }

    public List<LoanRecordModel>? Loans { get; set; }

    public string? Lastpersonel { get; set; }
}

public sealed class LoanRecordModel
{
    public string Borrower { get; set; } = string.Empty;

    public DateTime DueDate { get; set; }

    public string personel { get; set; } = string.Empty;
}

public sealed class UserRecordModel
{
    public string Username { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;

    public string Role { get; set; } = string.Empty;
}
