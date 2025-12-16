using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Infrastructure.Files.Models;
using Kutuphane.Infrastructure.Files.Storage;

namespace Kutuphane.Infrastructure.Files.Repositories;

public sealed class FileStatsRepository : IStatsRepository
{
    private readonly JsonFileStorage<StatisticsDocumentModel> _storage;

    public FileStatsRepository(JsonFileStorage<StatisticsDocumentModel> storage)
    {
        _storage = storage;
    }

    public async Task<StatisticsDocument> ReadAsync(CancellationToken cancellationToken = default)
    {
        var document = await _storage.ReadAsync(cancellationToken);
        return new StatisticsDocument(
            document.Books.ToDictionary(
                pair => pair.Key,
                pair => new BookStatsEntry(
                    pair.Value.Title,
                    pair.Value.Author,
                    pair.Value.Category,
                    pair.Value.Quantity,
                    pair.Value.Borrowed,
                    pair.Value.Returned,
                    pair.Value.Late),
                StringComparer.OrdinalIgnoreCase),
            document.Students.ToDictionary(
                pair => pair.Key,
                pair => new StudentStatsEntry(
                    pair.Value.Name,
                    pair.Value.Surname ?? "",
                    pair.Value.Borrowed,
                    pair.Value.Returned,
                    pair.Value.Late),
                StringComparer.OrdinalIgnoreCase));
    }

    public async Task SaveAsync(StatisticsDocument document, CancellationToken cancellationToken = default)
    {
        var serialized = new StatisticsDocumentModel
        {
            Books = document.Books.ToDictionary(
                pair => pair.Key,
                pair => new BookStatsRecordModel
                {
                    Title = pair.Value.Title,
                    Author = pair.Value.Author,
                    Category = pair.Value.Category,
                    Quantity = pair.Value.Quantity,
                    Borrowed = pair.Value.Borrowed,
                    Returned = pair.Value.Returned,
                    Late = pair.Value.Late,
                },
                StringComparer.OrdinalIgnoreCase),
            Students = document.Students.ToDictionary(
                pair => pair.Key,
                pair => new StudentStatsRecordModel
                {
                    Name = pair.Value.Name,
                    Surname = pair.Value.Surname,
                    Borrowed = pair.Value.Borrowed,
                    Returned = pair.Value.Returned,
                    Late = pair.Value.Late,
                },
                StringComparer.OrdinalIgnoreCase),
        };

        await _storage.WriteAsync(serialized, cancellationToken);
    }
}
