using System;

namespace Kutuphane.Core.Application.BookCatalog;

public sealed record LoanInfo(
    Guid BookId,
    string Title,
    string Author,
    string Category,
    string Borrower,
    DateTime DueDate,
    int RemainingDays,
    string? personel);
