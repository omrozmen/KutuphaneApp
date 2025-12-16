using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Domain;

namespace Kutuphane.Core.Abstractions.Repositories;

public interface IBookRepository
{
    Task<Book> SaveAsync(Book book, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Book>> FindAllAsync(CancellationToken cancellationToken = default);

    Task<Book?> FindByIdAsync(Guid bookId, CancellationToken cancellationToken = default);

    Task DeleteAsync(Guid bookId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Book>> SearchAsync(string keyword, CancellationToken cancellationToken = default);
}
