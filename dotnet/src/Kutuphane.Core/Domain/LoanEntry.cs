using System;

namespace Kutuphane.Core.Domain;

/// <summary>
/// Represents a single borrowing transaction.
/// </summary>
public sealed record LoanEntry(
    string Borrower,
    DateTime DueDate,
    string personel);
