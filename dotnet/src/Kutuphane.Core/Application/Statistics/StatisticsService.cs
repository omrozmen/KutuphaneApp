using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;

namespace Kutuphane.Core.Application.Statistics;

public sealed class StatisticsService
{
    private readonly IStatsRepository _repository;

    public StatisticsService(IStatsRepository repository)
    {
        _repository = repository;
    }

    public async Task RecordBorrowAsync(Book book, string studentName, CancellationToken cancellationToken = default)
    {
        var doc = await ReadDocumentAsync(cancellationToken);
        var books = new Dictionary<string, BookStatsEntry>(doc.Books, StringComparer.OrdinalIgnoreCase);
        var students = new Dictionary<string, StudentStatsEntry>(doc.Students, StringComparer.OrdinalIgnoreCase);

        var bookKey = book.Id.ToString();
        if (!books.TryGetValue(bookKey, out var entry))
        {
            entry = new BookStatsEntry(
                book.Title,
                book.Author,
                book.Category,
                book.TotalQuantity,
                0,
                0,
                0);
        }

        books[bookKey] = entry with { Borrowed = entry.Borrowed + 1 };

        // Normalize student name for consistency
        var normalizedStudentName = studentName?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedStudentName))
        {
            return; // Invalid student name, skip
        }

        var (name, surname) = ParseStudentName(normalizedStudentName);
        var studentKey = $"{name} {surname}".Trim();
        var studentEntry = students.TryGetValue(studentKey, out var student)
            ? student
            : new StudentStatsEntry(name, surname, 0, 0, 0);
        students[studentKey] = studentEntry with { Borrowed = studentEntry.Borrowed + 1 };

        await _repository.SaveAsync(new StatisticsDocument(books, students), cancellationToken);
    }

    public async Task RecordReturnAsync(
        Book book,
        string studentName,
        bool isLate,
        CancellationToken cancellationToken = default)
    {
        var doc = await ReadDocumentAsync(cancellationToken);
        var books = new Dictionary<string, BookStatsEntry>(doc.Books, StringComparer.OrdinalIgnoreCase);
        var students = new Dictionary<string, StudentStatsEntry>(doc.Students, StringComparer.OrdinalIgnoreCase);

        var bookKey = book.Id.ToString();
        if (!books.TryGetValue(bookKey, out var entry))
        {
            entry = new BookStatsEntry(
                book.Title,
                book.Author,
                book.Category,
                book.TotalQuantity,
                0,
                0,
                0);
        }

        books[bookKey] = entry with
        {
            Returned = entry.Returned + 1,
            Late = entry.Late + (isLate ? 1 : 0),
        };

        // Normalize student name for consistency
        var normalizedStudentName = studentName?.Trim();
        if (string.IsNullOrWhiteSpace(normalizedStudentName))
        {
            return; // Invalid student name, skip
        }

        var (name, surname) = ParseStudentName(normalizedStudentName);
        var studentKey = $"{name} {surname}".Trim();
        
        // Try to get existing student entry (case-insensitive lookup)
        if (!students.TryGetValue(studentKey, out var studentEntry))
        {
            // If not found by key, try multiple matching strategies
            var foundEntry = students.FirstOrDefault(kvp =>
            {
                var existingFullName = $"{kvp.Value.Name} {kvp.Value.Surname}".Trim();
                var existingNameOnly = kvp.Value.Name?.Trim() ?? "";
                
                // Try exact match with normalized name
                if (string.Equals(existingFullName, normalizedStudentName, StringComparison.OrdinalIgnoreCase))
                    return true;
                
                // Try match with parsed name (if borrower was just first name)
                if (string.IsNullOrEmpty(surname) && string.Equals(existingNameOnly, name, StringComparison.OrdinalIgnoreCase))
                    return true;
                
                // Try match with original name (if borrower was full name but stored differently)
                if (string.Equals(existingFullName, normalizedStudentName, StringComparison.OrdinalIgnoreCase))
                    return true;
                
                return false;
            });
            
            if (foundEntry.Key != null)
            {
                // Found by name, use that entry
                studentEntry = foundEntry.Value;
                students.Remove(foundEntry.Key);
                // Use the existing name/surname format for consistency
                name = studentEntry.Name;
                surname = studentEntry.Surname;
                studentKey = $"{name} {surname}".Trim();
                students[studentKey] = studentEntry; // Re-add with normalized key
            }
            else
            {
                // Not found, create new entry (for deleted students or new entries)
                studentEntry = new StudentStatsEntry(name, surname, 0, 0, 0);
            }
        }

        // Update student statistics
        students[studentKey] = studentEntry with
        {
            Returned = studentEntry.Returned + 1,
            Late = studentEntry.Late + (isLate ? 1 : 0),
        };

        await _repository.SaveAsync(new StatisticsDocument(books, students), cancellationToken);
    }

    public async Task<IReadOnlyList<BookStat>> BookStatsAsync(CancellationToken cancellationToken = default)
    {
        var doc = await ReadDocumentAsync(cancellationToken);
        return doc.Books.Values
            .Select(entry => new BookStat(
                entry.Title,
                entry.Author,
                entry.Category,
                entry.Quantity,
                entry.Borrowed,
                entry.Returned,
                entry.Late))
            .OrderByDescending(item => item.Borrowed)
            .ToArray();
    }

    public async Task<IReadOnlyList<StudentStat>> StudentStatsAsync(CancellationToken cancellationToken = default)
    {
        var doc = await ReadDocumentAsync(cancellationToken);
        return doc.Students.Values
            .Select(entry => new StudentStat(
                entry.Name,
                entry.Surname,
                entry.Borrowed,
                entry.Returned,
                entry.Late))
            .OrderByDescending(item => item.Borrowed)
            .ToArray();
    }

    public async Task<IReadOnlyList<BookStat>> TopBooksAsync(int limit = 5, CancellationToken cancellationToken = default)
    {
        var stats = await BookStatsAsync(cancellationToken);
        return stats.Take(limit).ToArray();
    }

    public async Task<IReadOnlyList<StudentStat>> TopStudentsAsync(int limit = 5, CancellationToken cancellationToken = default)
    {
        var stats = await StudentStatsAsync(cancellationToken);
        return stats.Take(limit).ToArray();
    }

    /// <summary>
    /// Removes all loan records for a deleted book from statistics.
    /// This is called when a book is deleted to clean up statistics.
    /// </summary>
    public async Task RemoveBookLoansAsync(Book deletedBook, CancellationToken cancellationToken = default)
    {
        if (deletedBook.Loans.Count == 0)
        {
            return; // No loans to remove
        }

        var doc = await ReadDocumentAsync(cancellationToken);
        var students = new Dictionary<string, StudentStatsEntry>(doc.Students, StringComparer.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;

        // For each loan in the deleted book, update student statistics
        foreach (var loan in deletedBook.Loans)
        {
            var studentName = loan.Borrower?.Trim();
            if (string.IsNullOrWhiteSpace(studentName))
            {
                continue;
            }

            var (name, surname) = ParseStudentName(studentName);
            var studentKey = $"{name} {surname}".Trim();
            
            // Try to get existing student entry (case-insensitive lookup)
            if (!students.TryGetValue(studentKey, out var studentEntry))
            {
                // If not found by key, try to find by name value
                var foundEntry = students.FirstOrDefault(kvp => 
                    string.Equals($"{kvp.Value.Name} {kvp.Value.Surname}".Trim(), studentName, StringComparison.OrdinalIgnoreCase));
                
                if (foundEntry.Key != null)
                {
                    // Found by name, use that key
                    studentEntry = foundEntry.Value;
                    students.Remove(foundEntry.Key);
                    students[studentKey] = studentEntry; // Re-add with normalized key
                }
                else
                {
                    // Not found, create new entry (shouldn't happen normally, but handle gracefully)
                    studentEntry = new StudentStatsEntry(name, surname, 0, 0, 0);
                }
            }

            // Decrease borrowed count (because this active loan is being removed)
            var newBorrowed = Math.Max(0, studentEntry.Borrowed - 1);
            
            // If the loan was late, decrease late count
            var isLate = loan.DueDate < now;
            var newLate = isLate ? Math.Max(0, studentEntry.Late - 1) : studentEntry.Late;

            // Update the student entry
            students[studentKey] = new StudentStatsEntry(
                studentEntry.Name, // Preserve original name format
                studentEntry.Surname,
                newBorrowed,
                studentEntry.Returned,
                newLate);
        }

        // Remove book statistics entry
        var books = new Dictionary<string, BookStatsEntry>(doc.Books, StringComparer.OrdinalIgnoreCase);
        var bookKey = deletedBook.Id.ToString();
        books.Remove(bookKey);

        await _repository.SaveAsync(new StatisticsDocument(books, students), cancellationToken);
    }

    private static (string Name, string Surname) ParseStudentName(string studentName)
    {
        if (string.IsNullOrWhiteSpace(studentName))
        {
            return ("", "");
        }

        var parts = studentName.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            return ("", "");
        }
        if (parts.Length == 1)
        {
            return (parts[0], "");
        }

        // İlk kelime ad, geri kalanı soyad
        return (parts[0], string.Join(" ", parts.Skip(1)));
    }

    private async Task<StatisticsDocument> ReadDocumentAsync(CancellationToken cancellationToken)
    {
        var document = await _repository.ReadAsync(cancellationToken);
        return document ?? StatisticsDocument.Empty;
    }
}
