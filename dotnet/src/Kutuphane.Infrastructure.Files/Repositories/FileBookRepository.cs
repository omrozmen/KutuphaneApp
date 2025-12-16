using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Files.Models;
using Kutuphane.Infrastructure.Files.Storage;

namespace Kutuphane.Infrastructure.Files.Repositories;

/// <summary>
/// Persists book records as JSON so the app can work locally without a DB.
/// </summary>
public sealed class FileBookRepository : IBookRepository
{
    private readonly JsonFileStorage<LibraryDatabaseModel> _storage;

    public FileBookRepository(JsonFileStorage<LibraryDatabaseModel> storage)
    {
        _storage = storage;
    }

    public async Task<Book> SaveAsync(Book book, CancellationToken cancellationToken = default)
    {
        if (book == null)
        {
            throw new ArgumentNullException(nameof(book), "Book cannot be null");
        }

        var data = await _storage.ReadAsync(cancellationToken);
        
        // Data null ise yeni bir instance oluştur
        if (data == null)
        {
            data = new LibraryDatabaseModel();
        }
        
        // Books listesi null ise yeni bir liste oluştur
        if (data.Books == null)
        {
            data.Books = new List<BookRecordModel>();
        }

        var serialized = ToRecord(book);
        var index = data.Books.FindIndex(item => item.Id == serialized.Id);
        if (index >= 0)
        {
            data.Books[index] = serialized;
        }
        else
        {
            data.Books.Add(serialized);
        }

        await _storage.WriteAsync(data, cancellationToken);
        return book;
    }

    public async Task<IReadOnlyList<Book>> FindAllAsync(CancellationToken cancellationToken = default)
    {
        var data = await _storage.ReadAsync(cancellationToken);
        
        // Data veya Books null ise boş liste döndür
        if (data == null || data.Books == null)
        {
            return Array.Empty<Book>();
        }

        return data.Books.Select(ToDomain).ToArray();
    }

    public async Task<Book?> FindByIdAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        var data = await _storage.ReadAsync(cancellationToken);
        
        // Data veya Books null ise null döndür
        if (data == null || data.Books == null)
        {
            return null;
        }

        var record = data.Books.FirstOrDefault(item => item.Id == bookId);
        return record is null ? null : ToDomain(record);
    }

    public async Task DeleteAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        var data = await _storage.ReadAsync(cancellationToken);
        
        // Data veya Books null ise işlem yapma
        if (data == null || data.Books == null)
        {
            return;
        }

        data.Books.RemoveAll(item => item.Id == bookId);
        await _storage.WriteAsync(data, cancellationToken);
    }

    public async Task<IReadOnlyList<Book>> SearchAsync(string keyword, CancellationToken cancellationToken = default)
    {
        var all = await FindAllAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(keyword))
        {
            return all;
        }

        var lookup = NormalizeTurkishText(keyword.Trim());
        return all
            .Where(book => NormalizeTurkishText(book.Title).Contains(lookup, StringComparison.OrdinalIgnoreCase)
                           || NormalizeTurkishText(book.Author).Contains(lookup, StringComparison.OrdinalIgnoreCase)
                           || NormalizeTurkishText(book.Category ?? "").Contains(lookup, StringComparison.OrdinalIgnoreCase))
            .ToArray();
    }

    private static string NormalizeTurkishText(string text)
    {
        if (string.IsNullOrEmpty(text))
            return string.Empty;

        return text.ToLowerInvariant()
            .Replace("ı", "i")
            .Replace("İ", "i")
            .Replace("ş", "s")
            .Replace("Ş", "s")
            .Replace("ğ", "g")
            .Replace("Ğ", "g")
            .Replace("ü", "u")
            .Replace("Ü", "u")
            .Replace("ö", "o")
            .Replace("Ö", "o")
            .Replace("ç", "c")
            .Replace("Ç", "c");
    }

    private static BookRecordModel ToRecord(Book book)
    {
        return new BookRecordModel
        {
            Id = book.Id,
            Title = book.Title,
            Author = book.Author,
            Category = book.Category,
            Quantity = book.Quantity,
            TotalQuantity = book.TotalQuantity,
            HealthyCount = book.HealthyCount,
            DamagedCount = book.DamagedCount,
            LostCount = book.LostCount,
            Loans = book.Loans.Select(entry => new LoanRecordModel
            {
                Borrower = entry.Borrower,
                DueDate = entry.DueDate,
                personel = entry.personel,
            }).ToList(),
            Lastpersonel = book.Lastpersonel,
        };
    }

    private static Book ToDomain(BookRecordModel record)
    {
        var loans = record.Loans?.Select(entry => new LoanEntry(entry.Borrower, entry.DueDate, entry.personel)).ToArray()
                    ?? Array.Empty<LoanEntry>();

        var healthy = record.HealthyCount;
        var damaged = record.DamagedCount;
        var lost = record.LostCount;
        if (healthy + damaged + lost == 0 && record.TotalQuantity > 0)
        {
            healthy = record.TotalQuantity;
            damaged = 0;
            lost = 0;
        }

        return Book.Restore(
            record.Id,
            record.Title,
            record.Author,
            record.Category,
            record.Quantity,
            record.TotalQuantity,
            healthy,
            damaged,
            lost,
            loans,
            record.Lastpersonel);
    }
}
