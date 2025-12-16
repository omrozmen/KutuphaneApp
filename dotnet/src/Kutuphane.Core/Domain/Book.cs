using System;
using System.Collections.Generic;
using System.Linq;

namespace Kutuphane.Core.Domain;

/// <summary>
/// Immutable representation of a book that keeps track of active loans.
/// </summary>
public sealed record Book
{
    public Guid Id { get; init; }

    public string Title { get; init; }

    public string Author { get; init; }

    public string Category { get; init; }

    /// <summary>Available copies.</summary>
    public int Quantity { get; init; }

    public int TotalQuantity { get; init; }

    public int HealthyCount { get; init; }

    public int DamagedCount { get; init; }

    public int LostCount { get; init; }

    public IReadOnlyList<LoanEntry> Loans { get; init; } = Array.Empty<LoanEntry>();

    public string? Shelf { get; init; }
    public string? Publisher { get; init; }
    public string? Summary { get; init; }
    public int? BookNumber { get; init; }
    public int? Year { get; init; }
    public int? PageCount { get; init; }

    public string? Lastpersonel { get; init; }

    private Book(
        Guid id,
        string title,
        string author,
        string category,
        int quantity,
        int totalQuantity,
        int healthyCount,
        int damagedCount,
        int lostCount,
        IReadOnlyList<LoanEntry> loans,
        string? lastpersonel,
        string? shelf,
        string? publisher,
        string? summary,
        int? bookNumber,
        int? year,
        int? pageCount)
    {
        Id = id;
        Title = title;
        Author = author;
        Category = category;
        Quantity = quantity;
        TotalQuantity = totalQuantity;
        HealthyCount = healthyCount;
        DamagedCount = damagedCount;
        LostCount = lostCount;
        Loans = loans;
        Lastpersonel = lastpersonel;
        Shelf = shelf;
        Publisher = publisher;
        Summary = summary;
        BookNumber = bookNumber;
        Year = year;
        PageCount = pageCount;
    }

    public static Book CreateNew(
        string title,
        string author,
        string category,
        int quantity,
        int? healthyCount = null,
        int? damagedCount = null,
        int? lostCount = null,
        string? shelf = null,
        string? publisher = null,
        string? summary = null,
        int? bookNumber = null,
        int? year = null,
        int? pageCount = null)
    {
        var qty = RequirePositive(quantity, nameof(quantity));
        var (healthy, damaged, lost) = NormalizeStatusCounts(qty, healthyCount, damagedCount, lostCount);
        return new Book(
            Guid.NewGuid(),
            RequireNonBlank(title, nameof(title)),
            RequireNonBlank(author, nameof(author)),
            RequireNonBlank(category, nameof(category)),
            qty,
            qty,
            healthy,
            damaged,
            lost,
            Array.Empty<LoanEntry>(),
            null,
            shelf,
            publisher,
            summary,
            bookNumber,
            year,
            pageCount);
    }

    public static Book Restore(
        Guid id,
        string title,
        string author,
        string category,
        int quantity,
        int totalQuantity,
        int healthyCount,
        int damagedCount,
        int lostCount,
        IReadOnlyList<LoanEntry> loans,
        string? lastpersonel,
        string? shelf = null,
        string? publisher = null,
        string? summary = null,
        int? bookNumber = null,
        int? year = null,
        int? pageCount = null)
    {
        return new Book(
            id,
            title,
            author,
            category,
            quantity,
            totalQuantity,
            healthyCount,
            damagedCount,
            lostCount,
            loans ?? Array.Empty<LoanEntry>(),
            lastpersonel,
            shelf,
            publisher,
            summary,
            bookNumber,
            year,
            pageCount);
    }

    public Book Borrow(string borrower, int days, string personel)
    {
        var borrowerName = RequireNonBlank(borrower, nameof(borrower));
        if (HasBorrower(borrowerName))
        {
            throw new InvalidOperationException("Öğrenci bu kitabı zaten ödünç aldı");
        }

        if (HealthyCount <= 0)
        {
            throw new InvalidOperationException("Sağlam kitap adedi mevcut değil");
        }

        if (days <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(days), "days must be positive");
        }

        var deadline = DateTime.UtcNow.AddDays(days);
        var entry = new LoanEntry(
            borrowerName,
            deadline,
            RequireNonBlank(personel, nameof(personel)));
        var loans = Loans.Concat(new[] { entry }).ToArray();
        return this with
        {
            Loans = loans,
            Quantity = Math.Max(0, Quantity - 1),
            HealthyCount = Math.Max(0, HealthyCount - 1),
            Lastpersonel = entry.personel,
            Shelf = Shelf,
            Publisher = Publisher,
            Summary = Summary,
            BookNumber = BookNumber,
            Year = Year,
            PageCount = PageCount,
        };
    }

    public Book ReturnBook(string personel, string? borrower = null)
    {
        if (!Loans.Any())
        {
            throw new InvalidOperationException("Kitap zaten kütüphanede");
        }

        var personelName = RequireNonBlank(personel, nameof(personel));
        int targetIndex;
        if (!string.IsNullOrWhiteSpace(borrower))
        {
            var borrowerName = borrower.Trim();
            // Case-insensitive karşılaştırma yap
            targetIndex = Loans.ToList().FindIndex(entry => 
                string.Equals(entry.Borrower, borrowerName, StringComparison.OrdinalIgnoreCase));
            if (targetIndex < 0)
            {
                throw new InvalidOperationException("Bu öğrenci kitabı almamış");
            }
        }
        else
        {
            if (Loans.Count != 1)
            {
                throw new InvalidOperationException("Birden fazla ödünç var, öğrenci seçin");
            }
            targetIndex = 0;
        }

        var updatedLoans = Loans.Where((entry, index) => index != targetIndex).ToArray();
        var updatedQuantity = Math.Min(TotalQuantity, Quantity + 1);
        return this with
        {
            Loans = updatedLoans,
            Quantity = updatedQuantity,
            Lastpersonel = personelName,
            Shelf = Shelf,
            Publisher = Publisher,
            Summary = Summary,
            BookNumber = BookNumber,
            Year = Year,
            PageCount = PageCount,
        };
    }

    public bool IsBorrowed => Loans.Any();

    public int? RemainingDays()
    {
        if (!Loans.Any())
        {
            return null;
        }

        var soonest = Loans.MinBy(entry => entry.DueDate);
        if (soonest is null)
        {
            return null;
        }

        var delta = soonest.DueDate - DateTime.UtcNow;
        return Math.Max(0, delta.Days);
    }

    public IReadOnlyList<string> Borrowers() => Loans.Select(entry => entry.Borrower).ToArray();

    public LoanEntry? LoanFor(string borrower)
    {
        var borrowerName = borrower?.Trim();
        if (string.IsNullOrEmpty(borrowerName))
        {
            return null;
        }
        // Case-insensitive karşılaştırma yap
        return Loans.FirstOrDefault(entry => 
            string.Equals(entry.Borrower, borrowerName, StringComparison.OrdinalIgnoreCase));
    }

    public bool HasBorrower(string borrower)
    {
        var borrowerName = borrower?.Trim();
        if (string.IsNullOrEmpty(borrowerName))
        {
            return false;
        }
        // Case-insensitive karşılaştırma yap
        return Loans.Any(entry => 
            string.Equals(entry.Borrower, borrowerName, StringComparison.OrdinalIgnoreCase));
    }

    public string? Borrower => Loans.FirstOrDefault()?.Borrower;

    public DateTime? DueDate => Loans.FirstOrDefault()?.DueDate;

    private static string RequireNonBlank(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{field} cannot be blank", field);
        }

        return value.Trim();
    }

    private static int RequirePositive(int value, string field)
    {
        if (value <= 0)
        {
            throw new ArgumentOutOfRangeException(field, $"{field} must be positive");
        }

        return value;
    }

    public static (int Healthy, int Damaged, int Lost) NormalizeStatusCounts(
        int totalQuantity,
        int? healthyCount,
        int? damagedCount,
        int? lostCount)
    {
        var clampedTotal = Math.Max(0, totalQuantity);
        var damaged = Math.Clamp(damagedCount ?? 0, 0, clampedTotal);
        var lost = Math.Clamp(lostCount ?? 0, 0, clampedTotal - damaged);

        var healthy = healthyCount ?? (clampedTotal > 0 ? clampedTotal - damaged - lost : 0);
        healthy = Math.Clamp(healthy, 0, clampedTotal - damaged - lost);

        var remainder = clampedTotal - (healthy + damaged + lost);
        healthy += remainder;

        return (healthy, damaged, lost);
    }
}
