using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kutuphane.Infrastructure.Database.Repositories;

public class DatabaseStatsRepository : IStatsRepository
{
    private readonly KutuphaneDbContext _context;

    public DatabaseStatsRepository(KutuphaneDbContext context)
    {
        _context = context;
    }

    public async Task<StatisticsDocument> ReadAsync(CancellationToken cancellationToken = default)
    {
        var bookStats = await _context.BookStats.ToListAsync(cancellationToken);
        var studentStats = await _context.StudentStats.ToListAsync(cancellationToken);

        var bookDict = bookStats.ToDictionary(
            b => b.Id.ToString(),
            b => new BookStatsEntry(
                b.Title,
                b.Author,
                b.Category,
                b.Quantity,
                b.Borrowed,
                b.Returned,
                b.Late
            )
        );

        // Case-insensitive dictionary oluştur ve duplicate key'leri birleştir
        var studentDict = new Dictionary<string, StudentStatsEntry>(StringComparer.OrdinalIgnoreCase);
        foreach (var stat in studentStats)
        {
            var key = $"{stat.Name} {stat.Surname}".Trim();
            if (studentDict.TryGetValue(key, out var existingEntry))
            {
                // Duplicate key varsa, değerleri topla (birleştir)
                studentDict[key] = new StudentStatsEntry(
                    existingEntry.Name,
                    existingEntry.Surname,
                    existingEntry.Borrowed + stat.Borrowed,
                    existingEntry.Returned + stat.Returned,
                    existingEntry.Late + stat.Late
                );
            }
            else
            {
                studentDict[key] = new StudentStatsEntry(
                    stat.Name,
                    stat.Surname,
                    stat.Borrowed,
                    stat.Returned,
                    stat.Late
                );
            }
        }

        return new StatisticsDocument(bookDict, studentDict);
    }

    public async Task SaveAsync(StatisticsDocument document, CancellationToken cancellationToken = default)
    {
        if (document == null)
        {
            throw new ArgumentNullException(nameof(document), "Document cannot be null");
        }

        // Use a transaction to ensure atomicity
        using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            // Get existing stats for efficient lookup
            var existingBookStatsList = await _context.BookStats.ToListAsync(cancellationToken);
            var existingBookStats = existingBookStatsList.ToDictionary(b => b.Id);
            var existingStudentStats = await _context.StudentStats
                .ToListAsync(cancellationToken);
            
            // Group student stats by normalized key to handle duplicates
            var studentStatsByKey = existingStudentStats
                .GroupBy(s => $"{s.Name} {s.Surname}".Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

            // Update or insert book stats
            foreach (var (key, entry) in document.Books)
            {
                if (Guid.TryParse(key, out var id))
                {
                    if (existingBookStats.TryGetValue(id, out var existingBook))
                    {
                        // Update existing book stat
                        existingBook.Title = entry.Title;
                        existingBook.Author = entry.Author;
                        existingBook.Category = entry.Category;
                        existingBook.Quantity = entry.Quantity;
                        existingBook.Borrowed = entry.Borrowed;
                        existingBook.Returned = entry.Returned;
                        existingBook.Late = entry.Late;
                        _context.BookStats.Update(existingBook);
                    }
                    else
                    {
                        // Add new book stat
                        _context.BookStats.Add(new BookStatEntity
                        {
                            Id = id,
                            Title = entry.Title,
                            Author = entry.Author,
                            Category = entry.Category,
                            Quantity = entry.Quantity,
                            Borrowed = entry.Borrowed,
                            Returned = entry.Returned,
                            Late = entry.Late
                        });
                    }
                }
            }

            // Update or insert student stats
            foreach (var (key, entry) in document.Students)
            {
                var normalizedKey = $"{entry.Name} {entry.Surname}".Trim();
                
                if (studentStatsByKey.TryGetValue(normalizedKey, out var duplicateStats) && duplicateStats.Count > 0)
                {
                    // Found existing student stat(s) - handle duplicates
                    var firstStat = duplicateStats[0];
                    
                    // If there are duplicates, remove all except the first one
                    if (duplicateStats.Count > 1)
                    {
                        var duplicatesToRemove = duplicateStats.Skip(1).ToList();
                        _context.StudentStats.RemoveRange(duplicatesToRemove);
                    }
                    
                    // Update the first (or only) stat
                    firstStat.Name = entry.Name;
                    firstStat.Surname = entry.Surname;
                    firstStat.Borrowed = entry.Borrowed;
                    firstStat.Returned = entry.Returned;
                    firstStat.Late = entry.Late;
                    _context.StudentStats.Update(firstStat);
                }
                else
                {
                    // Add new student stat
                    _context.StudentStats.Add(new StudentStatEntity
                    {
                        Name = entry.Name,
                        Surname = entry.Surname,
                        Borrowed = entry.Borrowed,
                        Returned = entry.Returned,
                        Late = entry.Late
                    });
                }
            }

            // Remove book stats that are no longer in the document
            var documentBookIds = document.Books.Keys
                .Where(k => Guid.TryParse(k, out _))
                .Select(k => Guid.Parse(k))
                .ToHashSet();
            var booksToRemove = existingBookStats.Keys
                .Where(id => !documentBookIds.Contains(id))
                .ToList();
            if (booksToRemove.Count > 0)
            {
                var bookEntitiesToRemove = booksToRemove.Select(id => existingBookStats[id]).ToList();
                _context.BookStats.RemoveRange(bookEntitiesToRemove);
            }

            // Remove student stats that are no longer in the document
            var documentStudentKeys = document.Students.Keys
                .Select(k => $"{document.Students[k].Name} {document.Students[k].Surname}".Trim())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var studentsToRemove = studentStatsByKey.Keys
                .Where(k => !documentStudentKeys.Contains(k))
                .SelectMany(k => studentStatsByKey[k])
                .ToList();
            if (studentsToRemove.Count > 0)
            {
                _context.StudentStats.RemoveRange(studentsToRemove);
            }

            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }
}



