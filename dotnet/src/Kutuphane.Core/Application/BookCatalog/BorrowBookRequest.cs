using System;

namespace Kutuphane.Core.Application.BookCatalog;

public sealed record BorrowBookRequest(
    Guid BookId,
    string Borrower,
    int Days,
    string personelName);
