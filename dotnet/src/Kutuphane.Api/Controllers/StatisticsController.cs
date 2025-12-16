using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Application.BookCatalog;
using Kutuphane.Core.Application.Statistics;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class StatisticsController : ControllerBase
{
    private readonly StatisticsService _statistics;
    private readonly BookCatalogService _bookCatalog;
    private readonly KutuphaneDbContext _context;

    public StatisticsController(StatisticsService statistics, BookCatalogService bookCatalog, KutuphaneDbContext context)
    {
        _statistics = statistics;
        _bookCatalog = bookCatalog;
        _context = context;
    }

    [HttpGet("top-books")]
    public async Task<ActionResult<IEnumerable<BookStat>>> TopBooks([FromQuery] int limit = 5, CancellationToken cancellationToken = default)
    {
        // Limit kısıtlamasını kaldır (veya çok yüksek yap) ki tüm liste alınabilsin
        var books = await _statistics.TopBooksAsync(limit > 0 ? limit : 10000, cancellationToken);
        return Ok(books);
    }

    [HttpGet("top-students")]
    public async Task<ActionResult<IEnumerable<StudentStat>>> TopStudents([FromQuery] int limit = 5, CancellationToken cancellationToken = default)
    {
        var students = await _statistics.TopStudentsAsync(Math.Clamp(limit, 1, 20), cancellationToken);
        return Ok(students);
    }

    [HttpGet("all-students")]
    public async Task<ActionResult<IEnumerable<StudentStat>>> AllStudents(CancellationToken cancellationToken = default)
    {
        try
        {
            // DB'den tüm öğrencileri al - Role string olarak saklanıyor, enum değerleri "Student", "personel", "Admin" olarak
            var students = await _context.Users
                .Where(u => u.Role == "Student" || u.Role == "STUDENT")
                .ToListAsync(cancellationToken);
            
            // Statistics servisinden istatistikleri al (hata olursa boş liste döndür)
            Dictionary<string, StudentStat> statsDict = new(StringComparer.OrdinalIgnoreCase);
            try
            {
                var stats = await _statistics.StudentStatsAsync(cancellationToken);
                statsDict = stats.ToDictionary(s => $"{s.Name} {s.Surname}".Trim(), s => s, StringComparer.OrdinalIgnoreCase);
            }
            catch (Exception statsEx)
            {
                // Statistics okuma hatası - devam et, sadece DB'deki verileri kullan
                System.Diagnostics.Debug.WriteLine($"Statistics okuma hatası: {statsEx.Message}");
            }
            
            // Tüm aktif ödünçleri al ve ceza puanlarını hesapla
            IReadOnlyList<LoanInfo> allLoans = Array.Empty<LoanInfo>();
            try
            {
                allLoans = await _bookCatalog.LoanOverviewAsync(cancellationToken);
            }
            catch (Exception loansEx)
            {
                // Loan overview hatası - devam et, sadece mevcut ceza puanlarını kullan
                System.Diagnostics.Debug.WriteLine($"Loan overview hatası: {loansEx.Message}");
            }
            
            var now = DateTime.UtcNow;
            
            // Her öğrenci için gecikme gün sayısını hesapla ve maksimum değeri kaydet
            foreach (var student in students)
            {
                if (string.IsNullOrEmpty(student.Name) || string.IsNullOrEmpty(student.Surname))
                    continue;
                    
                var studentFullName = $"{student.Name} {student.Surname}".Trim();
                var totalLateDays = 0;
                
                foreach (var loan in allLoans)
                {
                    // Borrower Name+Surname kombinasyonu veya sadece Name olabilir
                    if (loan.Borrower.Equals(studentFullName, StringComparison.OrdinalIgnoreCase) ||
                        loan.Borrower.Equals(student.Name, StringComparison.OrdinalIgnoreCase))
                    {
                        var dueDate = loan.DueDate;
                        if (dueDate < now)
                        {
                            var daysLate = (int)Math.Ceiling((now - dueDate).TotalDays);
                            totalLateDays += daysLate;
                        }
                    }
                }
                
                // Maksimum değeri kaydet (sadece yeni değer mevcut değerden büyükse güncelle)
                if (totalLateDays > student.PenaltyPoints)
                {
                    student.PenaltyPoints = totalLateDays;
                }
            }
            
            // Değişiklikleri kaydet (hata olursa devam et)
            try
            {
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch (Exception saveEx)
            {
                // Save hatası - logla ama devam et
                System.Diagnostics.Debug.WriteLine($"Save hatası: {saveEx.Message}");
            }
            
            // Sistem ayarlarından ceza puanı sınırını al
            var maxPenaltyPoints = await GetMaxPenaltyPointsAsync(cancellationToken);
            
            // DB'deki tüm öğrencileri al, stats'tan bilgileri ekle
            var allStudents = students.Where(s => !string.IsNullOrEmpty(s.Name) && !string.IsNullOrEmpty(s.Surname)).Select(student =>
            {
                var penaltyPoints = student.PenaltyPoints;
                var isBanned = penaltyPoints >= maxPenaltyPoints;
                var studentFullName = $"{student.Name} {student.Surname}".Trim();
                
                if (statsDict.TryGetValue(studentFullName, out var stat))
                {
                    // Stats'ta var, mevcut bilgileri kullan
                    return stat with
                    {
                        Class = student.Class,
                        Branch = student.Branch,
                        StudentNumber = student.StudentNumber,
                        PenaltyPoints = penaltyPoints,
                        IsBanned = isBanned
                    };
                }
                else
                {
                    // Stats'ta yok, sıfır değerlerle oluştur
                    return new StudentStat(
                        student.Name!,
                        student.Surname!,
                        0, // Borrowed
                        0, // Returned
                        0, // Late
                        student.Class,
                        student.Branch,
                        student.StudentNumber,
                        penaltyPoints,
                        isBanned
                    );
                }
            });
            
            return Ok(allStudents);
        }
        catch (Exception ex)
        {
            var errorMessage = $"Öğrenci listesi yüklenemedi: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return StatusCode(500, new { message = errorMessage });
        }
    }

    [HttpGet("student-history")]
    public async Task<ActionResult<StudentHistoryResponse>> StudentHistory(
        [FromQuery] string? borrower,
        [FromQuery] int? studentNumber,
        CancellationToken cancellationToken = default)
    {
        if (!studentNumber.HasValue && string.IsNullOrWhiteSpace(borrower))
        {
            return BadRequest(new { message = "Öğrenci adı veya numarası gereklidir." });
        }

        try
        {
            var normalizedBorrower = NormalizeBorrowerName(borrower);
            var entries = new List<LoanHistoryEntity>();
            var seenEntryIds = new HashSet<long>();

            if (studentNumber.HasValue)
            {
                var byStudentNumber = await _context.LoanHistory
                    .AsNoTracking()
                    .Where(entry => entry.StudentNumber == studentNumber.Value)
                    .OrderByDescending(entry => entry.BorrowedAt)
                    .ToListAsync(cancellationToken);

                foreach (var entry in byStudentNumber)
                {
                    if (seenEntryIds.Add(entry.Id))
                    {
                        entries.Add(entry);
                    }
                }

                if (string.IsNullOrEmpty(normalizedBorrower))
                {
                    normalizedBorrower = byStudentNumber
                        .Select(entry => entry.NormalizedBorrower)
                        .FirstOrDefault(value => !string.IsNullOrEmpty(value)) ?? normalizedBorrower;
                }
            }

            if (!string.IsNullOrEmpty(normalizedBorrower))
            {
                var byBorrower = await _context.LoanHistory
                    .AsNoTracking()
                    .Where(entry => entry.NormalizedBorrower == normalizedBorrower)
                    .OrderByDescending(entry => entry.BorrowedAt)
                    .ToListAsync(cancellationToken);

                foreach (var entry in byBorrower)
                {
                    if (seenEntryIds.Add(entry.Id))
                    {
                        entries.Add(entry);
                    }
                }
            }

            if (entries.Count > 1)
            {
                entries = entries
                    .OrderByDescending(entry => entry.BorrowedAt)
                    .ToList();
            }

            if (string.IsNullOrEmpty(normalizedBorrower))
            {
                normalizedBorrower = entries
                    .Select(entry => entry.NormalizedBorrower)
                    .FirstOrDefault(value => !string.IsNullOrEmpty(value));
            }

            var student = await FindStudentAsync(studentNumber, normalizedBorrower, cancellationToken);
            var (name, surname) = ResolveStudentNames(student, entries, borrower);

            var response = BuildStudentHistoryResponse(name, surname, entries);
            return Ok(response);
        }
        catch (Exception ex)
        {
            var errorMessage = $"Öğrenci geçmişi getirilirken hata oluştu: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return StatusCode(500, new { message = errorMessage });
        }
    }

    [HttpGet("book-history")]
    public async Task<ActionResult<BookHistoryResponse>> BookHistory(
        [FromQuery] Guid bookId,
        CancellationToken cancellationToken = default)
    {
        if (bookId == Guid.Empty)
        {
            return BadRequest(new { message = "Geçerli bir kitap kimliği gereklidir." });
        }

        try
        {
            var entries = await _context.LoanHistory
                .AsNoTracking()
                .Where(entry => entry.BookId == bookId)
                .OrderByDescending(entry => entry.BorrowedAt)
                .ToListAsync(cancellationToken);

            var book = await _context.Books
                .AsNoTracking()
                .FirstOrDefaultAsync(b => b.Id == bookId, cancellationToken);

            var response = BuildBookHistoryResponse(book, entries);
            return Ok(response);
        }
        catch (Exception ex)
        {
            var errorMessage = $"Kitap geçmişi getirilirken hata oluştu: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return StatusCode(500, new { message = errorMessage });
        }
    }

    private async Task<int> GetMaxPenaltyPointsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var settingsPath = Path.Combine(Directory.GetCurrentDirectory(), "storage", "system-settings.json");
            if (System.IO.File.Exists(settingsPath))
            {
                var json = await System.IO.File.ReadAllTextAsync(settingsPath, cancellationToken);
                var settings = JsonSerializer.Deserialize<SystemSettings>(json);
                if (settings != null)
                {
                    return settings.MaxPenaltyPoints;
                }
            }
        }
        catch
        {
            // Hata durumunda default değeri döndür
        }
        return 100; // Default değer
    }

    private class SystemSettings
    {
        public int MaxBorrowLimit { get; set; } = 5;
        public int MaxPenaltyPoints { get; set; } = 100;
    }

    private async Task<UserEntity?> FindStudentAsync(int? studentNumber, string? normalizedBorrower, CancellationToken cancellationToken)
    {
        if (studentNumber.HasValue)
        {
            var byNumber = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(user => user.StudentNumber == studentNumber.Value, cancellationToken);

            if (byNumber is not null)
            {
                return byNumber;
            }
        }

        if (string.IsNullOrEmpty(normalizedBorrower))
        {
            return null;
        }

        var parts = normalizedBorrower.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            return null;
        }

        var normalizedName = parts[0];
        var normalizedSurname = parts.Length > 1 ? string.Join(" ", parts.Skip(1)) : null;

        var studentsQuery = _context.Users
            .AsNoTracking()
            .Where(user => user.Role == "Student");

        if (!string.IsNullOrEmpty(normalizedSurname))
        {
            return await studentsQuery.FirstOrDefaultAsync(
                user =>
                    user.Name != null &&
                    user.Surname != null &&
                    user.Name.ToLower() == normalizedName &&
                    user.Surname.ToLower() == normalizedSurname,
                cancellationToken);
        }

        return await studentsQuery.FirstOrDefaultAsync(
            user =>
                user.Name != null &&
                user.Name.ToLower() == normalizedName,
            cancellationToken);
    }

    private static (string Name, string Surname) ResolveStudentNames(
        UserEntity? student,
        IReadOnlyList<LoanHistoryEntity> entries,
        string? fallbackBorrower)
    {
        if (student is not null)
        {
            return (
                (student.Name ?? string.Empty).Trim(),
                (student.Surname ?? string.Empty).Trim());
        }

        var source = entries.FirstOrDefault()?.Borrower ?? fallbackBorrower ?? string.Empty;
        return ParseStudentName(source);
    }

    private static StudentHistoryResponse BuildStudentHistoryResponse(
        string name,
        string surname,
        IReadOnlyList<LoanHistoryEntity> entries)
    {
        if (entries.Count == 0)
        {
            return new StudentHistoryResponse(
                Name: name,
                Surname: surname,
                TotalBorrowed: 0,
                TotalReturned: 0,
                ActiveLoans: 0,
                LateReturns: 0,
                Books: Array.Empty<StudentBookSummary>(),
                Entries: Array.Empty<StudentHistoryEntry>());
        }

        var totalBorrowed = entries.Count;
        var totalReturned = entries.Count(IsReturned);
        var activeLoans = entries.Count(entry => !IsReturned(entry));
        var lateReturns = entries.Count(entry => IsReturned(entry) && entry.WasLate);

        var books = entries
            .GroupBy(entry => entry.BookId)
            .Select(group =>
            {
                var completedDurations = group
                    .Where(entry => entry.ReturnedAt.HasValue)
                    .Select(entry => entry.DurationDays ?? CalculateDurationDays(entry.BorrowedAt, entry.ReturnedAt!.Value))
                    .ToList();

                int? averageReturnDays = completedDurations.Count > 0
                    ? (int)Math.Round(completedDurations.Average())
                    : null;

                return new StudentBookSummary(
                    BookId: group.Key,
                    BookTitle: group.First().BookTitle,
                    BookAuthor: group.First().BookAuthor,
                    BookCategory: group.First().BookCategory,
                    BorrowCount: group.Count(),
                    ReturnCount: group.Count(IsReturned),
                    LateCount: group.Count(entry => entry.WasLate),
                    AverageReturnDays: averageReturnDays,
                    TotalLateDays: group.Sum(entry => entry.LateDays),
                    LastBorrowedAt: group.Max(entry => (DateTime?)entry.BorrowedAt));
            })
            .OrderByDescending(summary => summary.LastBorrowedAt)
            .ToArray();

        var historyEntries = entries
            .OrderByDescending(entry => entry.BorrowedAt)
            .Select(entry =>
            {
                var durationDays = entry.DurationDays;
                if (!durationDays.HasValue && entry.ReturnedAt.HasValue)
                {
                    durationDays = CalculateDurationDays(entry.BorrowedAt, entry.ReturnedAt.Value);
                }

                return new StudentHistoryEntry(
                    BookId: entry.BookId,
                    BookTitle: entry.BookTitle,
                    BookAuthor: entry.BookAuthor,
                    BookCategory: entry.BookCategory,
                    BorrowedAt: entry.BorrowedAt,
                    DueDate: entry.DueDate,
                    ReturnedAt: entry.ReturnedAt,
                    WasLate: entry.WasLate,
                    LateDays: entry.LateDays,
                    BorrowPersonel: entry.BorrowPersonel,
                    ReturnPersonel: entry.ReturnPersonel,
                    DurationDays: durationDays,
                    Status: entry.Status,
                    LoanDays: entry.LoanDays,
                    StudentNumber: entry.StudentNumber);
            })
            .ToArray();

        return new StudentHistoryResponse(
            Name: name,
            Surname: surname,
            TotalBorrowed: totalBorrowed,
            TotalReturned: totalReturned,
            ActiveLoans: activeLoans,
            LateReturns: lateReturns,
            Books: books,
            Entries: historyEntries);
    }

    private static int CalculateDurationDays(DateTime borrowedAt, DateTime returnedAt)
    {
        return Math.Max(1, (int)Math.Round((returnedAt - borrowedAt).TotalDays));
    }

    private static bool IsReturned(LoanHistoryEntity entry)
    {
        return string.Equals(entry.Status, "RETURNED", StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeBorrowerName(string? borrower)
    {
        if (string.IsNullOrWhiteSpace(borrower))
        {
            return string.Empty;
        }

        var parts = borrower.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return string.Join(" ", parts).ToLowerInvariant();
    }

    private static (string Name, string Surname) ParseStudentName(string? rawName)
    {
        if (string.IsNullOrWhiteSpace(rawName))
        {
            return (string.Empty, string.Empty);
        }

        var parts = rawName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            return (string.Empty, string.Empty);
        }

        if (parts.Length == 1)
        {
            return (parts[0], string.Empty);
        }

        return (parts[0], string.Join(" ", parts.Skip(1)));
    }

    public sealed record StudentHistoryResponse(
        string Name,
        string Surname,
        int TotalBorrowed,
        int TotalReturned,
        int ActiveLoans,
        int LateReturns,
        IReadOnlyList<StudentBookSummary> Books,
        IReadOnlyList<StudentHistoryEntry> Entries);

    public sealed record StudentBookSummary(
        Guid BookId,
        string BookTitle,
        string BookAuthor,
        string? BookCategory,
        int BorrowCount,
        int ReturnCount,
        int LateCount,
        int? AverageReturnDays,
        int TotalLateDays,
        DateTime? LastBorrowedAt);

    public sealed record StudentHistoryEntry(
        Guid BookId,
        string BookTitle,
        string BookAuthor,
        string? BookCategory,
        DateTime BorrowedAt,
        DateTime DueDate,
        DateTime? ReturnedAt,
        bool WasLate,
        int LateDays,
        string BorrowPersonel,
        string? ReturnPersonel,
        int? DurationDays,
        string Status,
        int LoanDays,
        int? StudentNumber);

    private static BookHistoryResponse BuildBookHistoryResponse(
        BookEntity? book,
        IReadOnlyList<LoanHistoryEntity> entries)
    {
        var referenceEntry = entries.FirstOrDefault();
        var bookId = book?.Id ?? referenceEntry?.BookId ?? Guid.Empty;
        var title = book?.Title ?? referenceEntry?.BookTitle ?? "Bilinmiyor";
        var author = book?.Author ?? referenceEntry?.BookAuthor ?? "Bilinmiyor";
        var category = book?.Category ?? referenceEntry?.BookCategory;

        if (entries.Count == 0)
        {
            return new BookHistoryResponse(
                BookId: bookId,
                Title: title,
                Author: author,
                Category: category,
                TotalBorrowed: 0,
                TotalReturned: 0,
                ActiveLoans: 0,
                LateReturns: 0,
                Borrowers: Array.Empty<BookBorrowerSummary>(),
                Entries: Array.Empty<BookHistoryEntry>());
        }

        var totalBorrowed = entries.Count;
        var totalReturned = entries.Count(IsReturned);
        var activeLoans = entries.Count(entry => !IsReturned(entry));
        var lateReturns = entries.Count(entry => IsReturned(entry) && entry.WasLate);

        var borrowers = entries
            .GroupBy(entry => BuildBorrowerKey(entry.Borrower, entry.StudentNumber))
            .Select(group =>
            {
                var sample = group.First();
                return new BookBorrowerSummary(
                    Borrower: sample.Borrower,
                    StudentNumber: sample.StudentNumber,
                    BorrowCount: group.Count(),
                    ReturnCount: group.Count(IsReturned),
                    LateCount: group.Count(entry => entry.WasLate),
                    LastBorrowedAt: group.Max(entry => (DateTime?)entry.BorrowedAt),
                    AverageReturnDays: CalculateAverageDuration(group));
            })
            .OrderByDescending(summary => summary.LastBorrowedAt)
            .ToArray();

        var historyEntries = entries
            .OrderByDescending(entry => entry.BorrowedAt)
            .Select(entry =>
            {
                var durationDays = entry.DurationDays;
                if (!durationDays.HasValue && entry.ReturnedAt.HasValue)
                {
                    durationDays = CalculateDurationDays(entry.BorrowedAt, entry.ReturnedAt.Value);
                }

                return new BookHistoryEntry(
                    BookId: entry.BookId,
                    Title: entry.BookTitle,
                    Author: entry.BookAuthor,
                    Category: entry.BookCategory,
                    Borrower: entry.Borrower,
                    StudentNumber: entry.StudentNumber,
                    BorrowedAt: entry.BorrowedAt,
                    DueDate: entry.DueDate,
                    ReturnedAt: entry.ReturnedAt,
                    WasLate: entry.WasLate,
                    LateDays: entry.LateDays,
                    BorrowPersonel: entry.BorrowPersonel,
                    ReturnPersonel: entry.ReturnPersonel,
                    LoanDays: entry.LoanDays,
                    DurationDays: durationDays,
                    Status: entry.Status);
            })
            .ToArray();

        return new BookHistoryResponse(
            BookId: bookId,
            Title: title,
            Author: author,
            Category: category,
            TotalBorrowed: totalBorrowed,
            TotalReturned: totalReturned,
            ActiveLoans: activeLoans,
            LateReturns: lateReturns,
            Borrowers: borrowers,
            Entries: historyEntries);
    }

    private static string BuildBorrowerKey(string? borrower, int? studentNumber)
    {
        if (studentNumber.HasValue)
        {
            return $"num:{studentNumber.Value}";
        }

        var normalized = borrower?.Trim().ToLowerInvariant();
        if (!string.IsNullOrEmpty(normalized))
        {
            return $"name:{normalized}";
        }

        return "unknown";
    }

    private static int? CalculateAverageDuration(IEnumerable<LoanHistoryEntity> entries)
    {
        var completed = entries
            .Where(entry => entry.ReturnedAt.HasValue)
            .Select(entry => entry.DurationDays ?? CalculateDurationDays(entry.BorrowedAt, entry.ReturnedAt!.Value))
            .Where(value => value > 0)
            .ToList();

        if (completed.Count == 0)
        {
            return null;
        }

        return (int)Math.Round(completed.Average());
    }

    public sealed record BookHistoryResponse(
        Guid BookId,
        string Title,
        string Author,
        string? Category,
        int TotalBorrowed,
        int TotalReturned,
        int ActiveLoans,
        int LateReturns,
        IReadOnlyList<BookBorrowerSummary> Borrowers,
        IReadOnlyList<BookHistoryEntry> Entries);

    public sealed record BookBorrowerSummary(
        string Borrower,
        int? StudentNumber,
        int BorrowCount,
        int ReturnCount,
        int LateCount,
        DateTime? LastBorrowedAt,
        int? AverageReturnDays);

    public sealed record BookHistoryEntry(
        Guid BookId,
        string Title,
        string Author,
        string? Category,
        string Borrower,
        int? StudentNumber,
        DateTime BorrowedAt,
        DateTime DueDate,
        DateTime? ReturnedAt,
        bool WasLate,
        int LateDays,
        string BorrowPersonel,
        string? ReturnPersonel,
        int LoanDays,
        int? DurationDays,
        string Status);
}
