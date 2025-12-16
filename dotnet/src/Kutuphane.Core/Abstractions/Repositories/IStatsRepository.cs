using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Kutuphane.Core.Abstractions.Repositories;

public interface IStatsRepository
{
    Task<StatisticsDocument> ReadAsync(CancellationToken cancellationToken = default);

    Task SaveAsync(StatisticsDocument document, CancellationToken cancellationToken = default);
}

public sealed record StatisticsDocument(
    IDictionary<string, BookStatsEntry> Books,
    IDictionary<string, StudentStatsEntry> Students)
{
    public static StatisticsDocument Empty { get; } =
        new(new Dictionary<string, BookStatsEntry>(), new Dictionary<string, StudentStatsEntry>());
}

public sealed record BookStatsEntry(
    string Title,
    string Author,
    string Category,
    int Quantity,
    int Borrowed,
    int Returned,
    int Late);

public sealed record StudentStatsEntry(
    string Name,
    string Surname,
    int Borrowed,
    int Returned,
    int Late);
