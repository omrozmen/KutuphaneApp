using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;

namespace Kutuphane.Core.Application.Sync;

/// <summary>
/// Synchronizes CSV/Excel exports into the JSON persistence layer.
/// Mirrors the Python implementation to keep behaviour consistent.
/// </summary>
public sealed class ExcelSyncService
{
    private readonly IUserRepository _userRepository;
    private readonly IBookRepository _bookRepository;

    public ExcelSyncService(IUserRepository userRepository, IBookRepository bookRepository)
    {
        _userRepository = userRepository;
        _bookRepository = bookRepository;
    }

    public async Task<int> ImportStudentsAsync(
        IEnumerable<StudentImportRecord> records,
        CancellationToken cancellationToken = default)
    {
        // Öğrenci kullanıcıları artık oluşturulmuyor - sadece personeller login olabilir
        // Bu metod artık hiçbir şey yapmıyor, geriye uyumluluk için korunuyor
        return 0;
    }

    public async Task<int> ImportpersonelAsync(
        IEnumerable<personelImportRecord> records,
        CancellationToken cancellationToken = default)
    {
        var count = 0;
        foreach (var record in records)
        {
            var user = new User(record.Username, record.Password, UserRole.personel);
            await _userRepository.SaveAsync(user, cancellationToken);
            count++;
        }

        return count;
    }

    public async Task<int> ImportBooksAsync(
        IEnumerable<BookImportRecord> records,
        CancellationToken cancellationToken = default)
    {
        var existing = await _bookRepository.FindAllAsync(cancellationToken);
        foreach (var book in existing)
        {
            await _bookRepository.DeleteAsync(book.Id, cancellationToken);
        }

        var count = 0;
        foreach (var record in records)
        {
            var qty = record.Quantity <= 0 ? 1 : record.Quantity;
            var book = Book.CreateNew(record.Title, record.Author, record.Category, qty);
            await _bookRepository.SaveAsync(book, cancellationToken);
            count++;
        }

        return count;
    }
}
