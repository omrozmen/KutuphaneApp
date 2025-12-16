using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kutuphane.Infrastructure.Database.Repositories;

public class DatabaseBookRepository : IBookRepository
{
    private readonly KutuphaneDbContext _context;

    public DatabaseBookRepository(KutuphaneDbContext context)
    {
        _context = context;
    }

    public async Task<Book> SaveAsync(Book book, CancellationToken cancellationToken = default)
    {
        if (book == null)
        {
            throw new ArgumentNullException(nameof(book), "Book cannot be null");
        }

        // Check if entity is already tracked
        var trackedEntity = _context.Books.Local.FirstOrDefault(e => e.Id == book.Id);
        BookEntity entity;
        
        if (trackedEntity != null)
        {
            // Entity is already tracked, use it and reload to get latest state
            entity = trackedEntity;
            await _context.Entry(entity).Collection(b => b.Loans).LoadAsync(cancellationToken);
            // Reload entity to get latest values from database
            await _context.Entry(entity).ReloadAsync(cancellationToken);
        }
        else
        {
            // Entity is not tracked, load it
            entity = await _context.Books
                .Include(b => b.Loans)
                .FirstOrDefaultAsync(b => b.Id == book.Id, cancellationToken);
        }

        if (entity == null)
        {
            entity = new BookEntity
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
                Lastpersonel = book.Lastpersonel,
                Shelf = book.Shelf,
                Publisher = book.Publisher,
                Summary = book.Summary,
                BookNumber = book.BookNumber,
                Year = book.Year,
                PageCount = book.PageCount
            };
            _context.Books.Add(entity);
        }
        else
        {
            // Update entity properties
            entity.Title = book.Title;
            entity.Author = book.Author;
            entity.Category = book.Category;
            entity.Quantity = book.Quantity;
            entity.TotalQuantity = book.TotalQuantity;
            entity.HealthyCount = book.HealthyCount;
            entity.DamagedCount = book.DamagedCount;
            entity.LostCount = book.LostCount;
            entity.Lastpersonel = book.Lastpersonel;
            entity.Shelf = book.Shelf;
            entity.Publisher = book.Publisher;
            entity.Summary = book.Summary;
            entity.BookNumber = book.BookNumber;
            entity.Year = book.Year;
            entity.PageCount = book.PageCount;
        }

        // Update loans - remove existing loans from collection
        entity.Loans.Clear();

        // Add new loans
        foreach (var loan in book.Loans)
        {
            entity.Loans.Add(new LoanEntity
            {
                BookId = book.Id,
                Borrower = loan.Borrower ?? string.Empty,
                DueDate = loan.DueDate,
                personel = string.IsNullOrWhiteSpace(loan.personel) ? "Bilinmiyor" : loan.personel
            });
        }

        await _context.SaveChangesAsync(cancellationToken);
        return book;
    }

    public async Task<IReadOnlyList<Book>> FindAllAsync(CancellationToken cancellationToken = default)
    {
        var entities = await _context.Books
            .Include(b => b.Loans)
            .ToListAsync(cancellationToken);

        return entities.Select(ToDomain).ToArray();
    }

    public async Task<Book?> FindByIdAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        var entity = await _context.Books
            .Include(b => b.Loans)
            .FirstOrDefaultAsync(b => b.Id == bookId, cancellationToken);

        return entity == null ? null : ToDomain(entity);
    }

    public async Task DeleteAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        var entity = await _context.Books.FindAsync(new object[] { bookId }, cancellationToken);
        if (entity != null)
        {
            // Kitap istatistiklerini temizle
            var bookStats = await _context.BookStats
                .Where(bs => bs.Title == entity.Title)
                .ToListAsync(cancellationToken);
            if (bookStats.Any())
            {
                _context.BookStats.RemoveRange(bookStats);
            }

            // LoanHistory temizle (BookId ile)
            var loanHistory = await _context.LoanHistory
                .Where(lh => lh.BookId == bookId)
                .ToListAsync(cancellationToken);
            if (loanHistory.Any())
            {
                _context.LoanHistory.RemoveRange(loanHistory);
            }

            _context.Books.Remove(entity);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<IReadOnlyList<Book>> SearchAsync(string keyword, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(keyword))
        {
            return await FindAllAsync(cancellationToken);
        }

        // ÖNEMLİ: Entity Framework NormalizeTurkishText metodunu SQL'e çeviremez
        // Bu yüzden önce tüm kitapları belleğe alıp sonra client-side filtreleme yapıyoruz
        var allBooks = await _context.Books
            .Include(b => b.Loans)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var normalizedKeyword = NormalizeTurkishText(keyword.Trim());
        
        // Client-side filtreleme (bellekte yapılıyor, SQL değil)
        var filteredBooks = allBooks
            .Where(b => 
                NormalizeTurkishText(b.Title).Contains(normalizedKeyword) ||
                NormalizeTurkishText(b.Author).Contains(normalizedKeyword) ||
                NormalizeTurkishText(b.Category ?? "").Contains(normalizedKeyword))
            .ToList();

        return filteredBooks.Select(ToDomain).ToArray();
    }

    private static Book ToDomain(BookEntity entity)
    {
        var loans = entity.Loans.Select(l => new LoanEntry(
            l.Borrower,
            l.DueDate,
            l.personel
        )).ToArray();

        var healthy = entity.HealthyCount;
        var damaged = entity.DamagedCount;
        var lost = entity.LostCount;
        if (healthy + damaged + lost == 0 && entity.TotalQuantity > 0)
        {
            healthy = entity.TotalQuantity;
            damaged = 0;
            lost = 0;
        }

        return Book.Restore(
            entity.Id,
            entity.Title,
            entity.Author,
            entity.Category,
            entity.Quantity,
            entity.TotalQuantity,
            healthy,
            damaged,
            lost,
            loans,
            entity.Lastpersonel,
            entity.Shelf,
            entity.Publisher,
            entity.Summary,
            entity.BookNumber,
            entity.Year,
            entity.PageCount
        );
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
}



