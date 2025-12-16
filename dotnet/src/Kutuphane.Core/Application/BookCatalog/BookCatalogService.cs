using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;

namespace Kutuphane.Core.Application.BookCatalog;

public sealed class BookCatalogService
{
    private readonly IBookRepository _repository;

    public BookCatalogService(IBookRepository repository)
    {
        _repository = repository;
    }

    public async Task<Book> RegisterAsync(RegisterBookRequest request, CancellationToken cancellationToken = default)
    {
        var book = Book.CreateNew(
            request.Title,
            request.Author,
            request.Category,
            request.Quantity,
            request.HealthyCount,
            request.DamagedCount,
            request.LostCount,
            request.Shelf,
            request.Publisher,
            request.Summary,
            request.BookNumber,
            request.Year,
            request.PageCount);
        return await _repository.SaveAsync(book, cancellationToken);
    }

    public async Task<Book> UpdateAsync(
        Guid bookId,
        UpdateBookRequest request,
        CancellationToken cancellationToken = default)
    {
        var existing = await RequireBookAsync(bookId, cancellationToken);
        
        // Yeni totalQuantity hesapla
        var newTotalQuantity = request.TotalQuantity > 0 ? request.TotalQuantity : existing.TotalQuantity;
        
        // Mevcut ödünç sayısını koru
        var activeLoansCount = existing.Loans.Count;
        
        // Eğer yeni totalQuantity, mevcut ödünç sayısından azsa, totalQuantity'i artır
        if (newTotalQuantity < activeLoansCount)
        {
            newTotalQuantity = activeLoansCount;
        }
        
        var (healthyCount, damagedCount, lostCount) = Book.NormalizeStatusCounts(
            newTotalQuantity,
            request.HealthyCount ?? existing.HealthyCount,
            request.DamagedCount ?? existing.DamagedCount,
            request.LostCount ?? existing.LostCount);
        
        // Yeni quantity hesapla: SAĞLAM - aktif ödünç sayısı (hasarlı ve kayıplar hariç!)
        var newQuantity = Math.Max(0, healthyCount - activeLoansCount);

        
        var updated = Book.Restore(
            existing.Id,
            request.Title ?? existing.Title,
            request.Author ?? existing.Author,
            request.Category ?? existing.Category,
            newQuantity,
            newTotalQuantity,
            healthyCount,
            damagedCount,
            lostCount,
            existing.Loans,
            existing.Lastpersonel,
            request.Shelf != null ? (string.IsNullOrEmpty(request.Shelf) ? null : request.Shelf) : existing.Shelf,
            request.Publisher != null ? (string.IsNullOrEmpty(request.Publisher) ? null : request.Publisher) : existing.Publisher,
            request.Summary != null ? (string.IsNullOrEmpty(request.Summary) ? null : request.Summary) : existing.Summary,
            request.BookNumber ?? existing.BookNumber,
            request.Year ?? existing.Year,
            request.PageCount ?? existing.PageCount);
        
        return await _repository.SaveAsync(updated, cancellationToken);
    }

    public Task DeleteAsync(Guid bookId, CancellationToken cancellationToken = default) =>
        _repository.DeleteAsync(bookId, cancellationToken);

    public Task<IReadOnlyList<Book>> ListAllAsync(CancellationToken cancellationToken = default) =>
        _repository.FindAllAsync(cancellationToken);

    public Task<Book?> FindByIdAsync(Guid bookId, CancellationToken cancellationToken = default) =>
        _repository.FindByIdAsync(bookId, cancellationToken);

    public async Task<IReadOnlyList<Book>> SearchAsync(
        string? keyword,
        string? category,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<Book> source;
        if (string.IsNullOrWhiteSpace(keyword))
        {
            source = await _repository.FindAllAsync(cancellationToken);
        }
        else
        {
            source = await _repository.SearchAsync(keyword.Trim(), cancellationToken);
        }

        var normalizedCategory = string.IsNullOrWhiteSpace(category) ? null : category.Trim();
        if (normalizedCategory is null)
        {
            return source;
        }

        return source
            .Where(book => string.Equals(book.Category, normalizedCategory, StringComparison.OrdinalIgnoreCase))
            .ToArray();
    }

    public async Task<Book> BorrowAsync(BorrowBookRequest request, CancellationToken cancellationToken = default)
    {
        var book = await RequireBookAsync(request.BookId, cancellationToken);
        var updated = book.Borrow(request.Borrower, request.Days, request.personelName);
        return await _repository.SaveAsync(updated, cancellationToken);
    }

    public async Task<Book> MarkReturnedAsync(
        Guid bookId,
        string personelName,
        string? borrower = null,
        CancellationToken cancellationToken = default)
    {
        var book = await RequireBookAsync(bookId, cancellationToken);
        var updated = book.ReturnBook(personelName, borrower);
        return await _repository.SaveAsync(updated, cancellationToken);
    }

    public async Task<IReadOnlyList<LoanInfo>> LoanOverviewAsync(CancellationToken cancellationToken = default)
    {
        var books = await _repository.FindAllAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var loans = new List<LoanInfo>();
        foreach (var book in books)
        {
            foreach (var entry in book.Loans)
            {
                var remaining = Math.Max(0, (entry.DueDate - now).Days);
                loans.Add(
                    new LoanInfo(
                        book.Id,
                        book.Title,
                        book.Author,
                        book.Category,
                        entry.Borrower,
                        entry.DueDate,
                        remaining,
                        entry.personel ?? book.Lastpersonel));
            }
        }

        return loans;
    }

    /// <summary>
    /// Removes all loan records for a specific borrower from all books.
    /// This is used when a student is deleted to clean up orphaned loan records.
    /// </summary>
    public async Task<int> RemoveLoansByBorrowerAsync(string borrowerName, CancellationToken cancellationToken = default)
    {
        var allBooks = await _repository.FindAllAsync(cancellationToken);
        var borrowerNameNormalized = borrowerName?.Trim();
        if (string.IsNullOrWhiteSpace(borrowerNameNormalized))
        {
            return 0;
        }

        int removedCount = 0;
        foreach (var book in allBooks)
        {
            // Check if this book has loans for this borrower
            var hasLoan = book.Loans.Any(loan => 
                string.Equals(loan.Borrower, borrowerNameNormalized, StringComparison.OrdinalIgnoreCase));
            
            if (hasLoan)
            {
                // Remove all loans for this borrower
                var updatedLoans = book.Loans
                    .Where(loan => !string.Equals(loan.Borrower, borrowerNameNormalized, StringComparison.OrdinalIgnoreCase))
                    .ToArray();
                
                // Calculate new quantity: add back the returned books
                var returnedCount = book.Loans.Count - updatedLoans.Length;
                var newQuantity = Math.Min(book.TotalQuantity, book.Quantity + returnedCount);
                
                var updated = Book.Restore(
                    book.Id,
                    book.Title,
                    book.Author,
                    book.Category,
                    newQuantity,
                    book.TotalQuantity,
                    book.HealthyCount,
                    book.DamagedCount,
                    book.LostCount,
                    updatedLoans,
                    book.Lastpersonel);
                
                await _repository.SaveAsync(updated, cancellationToken);
                removedCount += returnedCount;
            }
        }

        return removedCount;
    }

    private async Task<Book> RequireBookAsync(Guid bookId, CancellationToken cancellationToken)
    {
        var book = await _repository.FindByIdAsync(bookId, cancellationToken);
        if (book is null)
        {
            throw new InvalidOperationException("Book not found");
        }

        return book;
    }
}
