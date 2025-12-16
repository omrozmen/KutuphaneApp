namespace Kutuphane.Core.Application.Statistics;

public sealed record BookStat(
    string Title,
    string Author,
    string Category,
    int Quantity,
    int Borrowed,
    int Returned,
    int Late);
