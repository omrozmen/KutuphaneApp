namespace Kutuphane.Core.Application.BookCatalog;

public sealed record UpdateBookRequest(
    string? Title,
    string? Author,
    string? Category,
    int TotalQuantity,
    int? HealthyCount = null,
    int? DamagedCount = null,
    int? LostCount = null,
    string? Shelf = null,
    string? Publisher = null,
    string? Summary = null,
    int? BookNumber = null,
    int? Year = null,
    int? PageCount = null);







