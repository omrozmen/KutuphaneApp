using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Application.BookCatalog;
using Kutuphane.Core.Application.Statistics;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BooksController : ControllerBase
{
    private readonly BookCatalogService _catalog;
    private readonly StatisticsService _statistics;
    private readonly KutuphaneDbContext _context;
    private readonly IServiceProvider _serviceProvider;

    public BooksController(
        BookCatalogService catalog, 
        StatisticsService statistics,
        KutuphaneDbContext context,
        IServiceProvider serviceProvider)
    {
        _catalog = catalog;
        _statistics = statistics;
        _context = context;
        _serviceProvider = serviceProvider;
    }

    // Storage bağımlılıkları kaldırıldı - artık sadece DB kullanılıyor

    [HttpGet]
    public async Task<ActionResult<IEnumerable<BookResponse>>> GetAll(
        [FromQuery] string? keyword,
        [FromQuery] string? category,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var books = await _catalog.SearchAsync(keyword, category, cancellationToken);
            return Ok(books.Select(MapBook));
        }
        catch (Exception ex)
        {
            var errorMessage = $"Kitaplar yüklenemedi: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return StatusCode(500, new { message = errorMessage });
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<BookResponse>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var book = await _catalog.FindByIdAsync(id, cancellationToken);
        if (book is null)
        {
            return NotFound();
        }

        return Ok(MapBook(book));
    }

    [HttpGet("loans")]
    public async Task<ActionResult<IEnumerable<LoanInfoResponse>>> GetLoans(CancellationToken cancellationToken)
    {
        try
        {
            var loans = await _catalog.LoanOverviewAsync(cancellationToken);
            return Ok(loans.Select(loan => new LoanInfoResponse(
                loan.BookId,
                loan.Title,
                loan.Author,
                loan.Category,
                loan.Borrower,
                loan.DueDate,
                loan.RemainingDays,
                loan.personel)));
        }
        catch (Exception ex)
        {
            var errorMessage = $"Ödünç kayıtları yüklenemedi: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return StatusCode(500, new { message = errorMessage });
        }
    }

    [HttpPost]
    public async Task<ActionResult<BookResponse>> Register(RegisterBookRequestDto request, CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Title))
            {
                return BadRequest(new { message = "Kitap başlığı gereklidir" });
            }

            if (string.IsNullOrWhiteSpace(request.Author))
            {
                return BadRequest(new { message = "Yazar adı gereklidir" });
            }

            if (request.Quantity <= 0)
            {
                return BadRequest(new { message = "Adet 0'dan büyük olmalıdır" });
            }

            var book = await _catalog.RegisterAsync(
                new RegisterBookRequest(
                    request.Title,
                    request.Author,
                    request.Category,
                    request.Quantity,
                    request.HealthyCount,
                    request.DamagedCount,
                    request.LostCount,
                    request.Shelf,
                    request.Publisher,
                    request.Summary,
                    request.BookNumber,
                    request.Year,
                    request.PageCount),
                cancellationToken);
            
            // Kitabın başarıyla kaydedildiğini doğrula
            var savedBook = await _catalog.FindByIdAsync(book.Id, cancellationToken);
            if (savedBook == null)
            {
                return StatusCode(500, new { message = "Kitap kaydedildi ancak doğrulanamadı. Lütfen sayfayı yenileyin." });
            }

            // Storage bağımlılıkları kaldırıldı - artık sadece DB kullanılıyor
            var username = Request.Cookies["kutuphane_session"] ?? request.personelName ?? "";

            // Kitap ekleme işlemini logla (kayıt dosyalarından önce)
            try
            {
                if (!string.IsNullOrEmpty(username))
                {
                    // ActivityLogs tablosunun var olup olmadığını kontrol et
                    if (await _context.Database.CanConnectAsync(cancellationToken))
                    {
                        var log = new ActivityLogEntity
                        {
                            Timestamp = DateTime.Now,
                            Username = username,
                            Action = "ADD_BOOK",
                            Details = $"Kitap eklendi: '{book.Title}' - {book.Author} (Adet: {book.Quantity})"
                        };
                        _context.ActivityLogs.Add(log);
                        var saved = await _context.SaveChangesAsync(cancellationToken);
                        Console.WriteLine($"ADD_BOOK log kaydedildi: {saved} kayıt etkilendi, Kitap: {book.Title}");
                    }
                    else
                    {
                        Console.WriteLine("ADD_BOOK log kaydetme hatası: Veritabanı bağlantısı kurulamadı");
                    }
                }
                else
                {
                    Console.WriteLine("ADD_BOOK log kaydetme hatası: Kullanıcı adı bulunamadı");
                }
            }
            catch (Exception ex)
            {
                // Log kaydetme hatası kritik değil, sessizce devam et
                Console.WriteLine($"ADD_BOOK log kaydetme hatası: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
            }

            // Veri değişikliği olduğunda kayıtları güncelle (log eklendikten sonra)
            try
            {
                var recordTypesController = _serviceProvider.GetRequiredService<RecordTypesController>();
                if (!string.IsNullOrEmpty(username))
                {
                    await recordTypesController.UpdateRecordsOnDataChange(username, new List<string> { "kitap_listesi" }, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                // Kayıt güncelleme hatası kritik değil, sessizce devam et
                Console.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
            }

            return CreatedAtAction(nameof(GetById), new { id = book.Id }, MapBook(book));
        }
        catch (Exception ex)
        {
            var errorMessage = $"Kitap kaydedilemedi: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return BadRequest(new { message = errorMessage });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<BookResponse>> Update(
        Guid id,
        UpdateBookRequestDto request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            if (request.TotalQuantity <= 0)
            {
                return BadRequest(new { message = "Toplam adet 0'dan büyük olmalıdır" });
            }

            var book = await _catalog.UpdateAsync(
                id,
                new UpdateBookRequest(
                    request.Title,
                    request.Author,
                    request.Category,
                    request.TotalQuantity,
                    request.HealthyCount,
                    request.DamagedCount,
                    request.LostCount,
                    request.Shelf,
                    request.Publisher,
                    request.Summary,
                    request.BookNumber,
                    request.Year,
                    request.PageCount),
                cancellationToken);
            
            // Kitabın başarıyla güncellendiğini doğrula
            var updatedBook = await _catalog.FindByIdAsync(id, cancellationToken);
            if (updatedBook == null)
            {
                return StatusCode(500, new { message = "Kitap güncellendi ancak doğrulanamadı. Lütfen sayfayı yenileyin." });
            }

            // Storage bağımlılıkları kaldırıldı - artık sadece DB kullanılıyor
            var username = Request.Cookies["kutuphane_session"] ?? request.personelName ?? "";

            // Kitap güncelleme işlemini logla (kayıt dosyalarından önce)
            try
            {
                if (!string.IsNullOrEmpty(username))
                {
                    var log = new ActivityLogEntity
                    {
                        Timestamp = DateTime.Now,
                        Username = username,
                        Action = "UPDATE_BOOK",
                        Details = $"Kitap güncellendi: '{book.Title}' - {book.Author} (Yeni Adet: {book.Quantity})"
                    };
                    _context.ActivityLogs.Add(log);
                    await _context.SaveChangesAsync(cancellationToken);
                }
            }
            catch
            {
                // Log kaydetme hatası kritik değil, sessizce devam et
            }

            // Veri değişikliği olduğunda kayıtları güncelle (log eklendikten sonra)
            try
            {
                var recordTypesController = _serviceProvider.GetRequiredService<RecordTypesController>();
                if (!string.IsNullOrEmpty(username))
                {
                    await recordTypesController.UpdateRecordsOnDataChange(username, new List<string> { "kitap_listesi" }, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                // Kayıt güncelleme hatası kritik değil, sessizce devam et
                Console.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
            }

            return Ok(MapBook(book));
        }
        catch (Exception ex)
        {
            var errorMessage = $"Kitap güncellenemedi: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return BadRequest(new { message = errorMessage });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromQuery] string? personelName, CancellationToken cancellationToken)
    {
        // Silinmeden önce kitabı al (istatistikleri güncellemek için)
        var bookToDelete = await _catalog.FindByIdAsync(id, cancellationToken);
        
        // Kitabı sil
        await _catalog.DeleteAsync(id, cancellationToken);
        
        // Eğer kitapta ödünç kayıtları varsa, istatistikleri güncelle
        if (bookToDelete != null && bookToDelete.Loans.Count > 0)
        {
            await _statistics.RemoveBookLoansAsync(bookToDelete, cancellationToken);
        }

        // Storage bağımlılıkları kaldırıldı - artık sadece DB kullanılıyor
        var username = Request.Cookies["kutuphane_session"] ?? personelName ?? "";

        // Kitap silme işlemini logla (kayıt dosyalarından önce)
        try
        {
            if (!string.IsNullOrEmpty(username) && bookToDelete != null)
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = username,
                    Action = "DELETE_BOOK",
                    Details = $"Kitap silindi: '{bookToDelete.Title}' - {bookToDelete.Author}"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
        }
        catch
        {
            // Log kaydetme hatası kritik değil, sessizce devam et
        }

        // Veri değişikliği olduğunda kayıtları güncelle (log eklendikten sonra)
        try
        {
            var recordTypesController = _serviceProvider.GetRequiredService<RecordTypesController>();
            if (!string.IsNullOrEmpty(username))
            {
                await recordTypesController.UpdateRecordsOnDataChange(username, new List<string> { "kitap_listesi" }, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            // Kayıt güncelleme hatası kritik değil, sessizce devam et
            Console.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
            System.Diagnostics.Debug.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
        }
        
        return NoContent();
    }

    [HttpPost("{id:guid}/borrow")]
    public async Task<ActionResult<BookResponse>> Borrow(Guid id, BorrowRequest request, CancellationToken cancellationToken)
    {
        // Check if student is banned (penalty points >= 50) - DB'den kontrol et
        // Öğrenci adı Name+Surname kombinasyonu olabilir veya sadece Name olabilir
        var borrowerParts = request.Borrower.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        var borrowerName = borrowerParts.Length > 0 ? borrowerParts[0] : request.Borrower.Trim();
        var borrowerSurname = borrowerParts.Length > 1 ? string.Join(" ", borrowerParts.Skip(1)) : "";
        var borrowerNameLower = borrowerName.ToLower();
        var borrowerSurnameLower = borrowerSurname.ToLower();
        var borrowerFullLower = request.Borrower.Trim().ToLower();
        
        var student = await _context.Users
            .FirstOrDefaultAsync(u => u.Role == "Student" && 
                ((borrowerSurname == "" && u.Name != null && u.Name.ToLower() == borrowerNameLower) ||
                 (borrowerSurname != "" && u.Name != null && u.Surname != null && 
                  u.Name.ToLower() == borrowerNameLower && u.Surname.ToLower() == borrowerSurnameLower) ||
                 (u.Name != null && u.Surname != null && 
                  (u.Name + " " + u.Surname).ToLower() == borrowerFullLower)), cancellationToken);
        
        // Sistem ayarlarından ceza puanı sınırını al
        var maxPenaltyPoints = await GetMaxPenaltyPointsAsync(cancellationToken);
        if (student != null && student.PenaltyPoints >= maxPenaltyPoints)
        {
            return BadRequest(new { message = $"Bu öğrenci cezalı durumda (Ceza Puanı: {student.PenaltyPoints}). Kitap ödünç alamaz." });
        }

        try
        {
            // personelName boşsa cookie'den al, yoksa default değer kullan
            var personelName = string.IsNullOrWhiteSpace(request.personelName) 
                ? (Request.Cookies["kutuphane_session"] ?? "Bilinmiyor")
                : request.personelName;
            
            var updated = await _catalog.BorrowAsync(
                new BorrowBookRequest(id, request.Borrower, request.Days, personelName),
                cancellationToken);
            await _statistics.RecordBorrowAsync(updated, request.Borrower, cancellationToken);
            await RecordLoanHistoryBorrowAsync(
                updated,
                request.Borrower,
                request.Days,
                personelName,
                student?.StudentNumber,
                cancellationToken);
            
            // Storage bağımlılıkları kaldırıldı - artık sadece DB kullanılıyor
            var username = Request.Cookies["kutuphane_session"] ?? request.personelName ?? "";
            var dueDate = DateTime.Now.AddDays(request.Days);

            // Ödünç alma işlemini logla (kayıt dosyalarından önce)
            try
            {
                if (!string.IsNullOrEmpty(username))
                {
                    var log = new ActivityLogEntity
                    {
                        Timestamp = DateTime.Now,
                        Username = username,
                        Action = "ADD_LOAN",
                        Details = $"Kitap ödünç verildi: '{updated.Title}' - Öğrenci: {request.Borrower} - Teslim: {dueDate:dd-MM-yyyy}"
                    };
                    _context.ActivityLogs.Add(log);
                    await _context.SaveChangesAsync(cancellationToken);
                }
            }
            catch
            {
                // Log kaydetme hatası kritik değil, sessizce devam et
            }
            
            // Veri değişikliği olduğunda kayıtları güncelle (log eklendikten sonra)
            try
            {
                var recordTypesController = _serviceProvider.GetRequiredService<RecordTypesController>();
                if (!string.IsNullOrEmpty(username))
                {
                    await recordTypesController.UpdateRecordsOnDataChange(username, new List<string> { "odunc_bilgileri" }, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                // Kayıt güncelleme hatası kritik değil, sessizce devam et
                Console.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
            }
            
            return Ok(MapBook(updated));
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/return")]
    public async Task<ActionResult<BookResponse>> Return(Guid id, ReturnRequest request, CancellationToken cancellationToken)
    {
        // personelName kontrolü
        if (string.IsNullOrWhiteSpace(request.personelName))
        {
            return BadRequest(new { message = "Personel adı gereklidir" });
        }

        var existing = await _catalog.FindByIdAsync(id, cancellationToken);
        if (existing is null)
        {
            return NotFound(new { message = "Kitap bulunamadı" });
        }

        // Eğer kitapta hiç ödünç kaydı yoksa
        if (!existing.Loans.Any())
        {
            return BadRequest(new { message = "Bu kitapta ödünç kaydı bulunmuyor" });
        }

        var borrower = string.IsNullOrWhiteSpace(request.Borrower)
            ? existing.Borrowers().FirstOrDefault()
            : request.Borrower.Trim();

        if (string.IsNullOrEmpty(borrower))
        {
            return BadRequest(new { message = "Geri alınacak öğrenci bulunamadı. Lütfen öğrenci adını belirtin." });
        }

        var loanEntry = existing.LoanFor(borrower);
        if (loanEntry == null)
        {
            var availableBorrowers = string.Join(", ", existing.Borrowers());
            return BadRequest(new { message = $"'{borrower}' adlı öğrenci bu kitabı ödünç almamış. Mevcut ödünç alanlar: {availableBorrowers}" });
        }

        var isLate = loanEntry.DueDate < DateTime.UtcNow;
        var daysLate = isLate ? (int)Math.Ceiling((DateTime.UtcNow - loanEntry.DueDate).TotalDays) : 0;

        try
        {
            var updated = await _catalog.MarkReturnedAsync(id, request.personelName, borrower, cancellationToken);
            
            // NOT: Ceza puanları artık otomatik olarak eklenmiyor
            // Ceza puanları dinamik olarak hesaplanacak ve sadece INSERT edilecek (UPDATE yapılmayacak)
            // Kitaplar teslim edildiğinde ceza puanı değişmeyecek, sadece manuel güncelleme ile değişecek
            
            // Record return in statistics (works even if student is deleted)
            try
            {
                await _statistics.RecordReturnAsync(updated, borrower, isLate, cancellationToken);
            }
            catch (Exception statsEx)
            {
                // Log but don't fail the return operation if statistics update fails
                // The book is already returned, statistics update is secondary
                // In production, you might want to log this to a logging service
                System.Diagnostics.Debug.WriteLine($"Statistics update failed for return: {statsEx.Message}");
            }

            // *** YENİ: Otomatik ceza puanı hesaplama ***
            if (isLate && daysLate > 0)
            {
                try
                {
                    // Öğrenciyi bul
                    var borrowerLower = borrower.ToLower();
                    var allStudents = await _context.Users
                        .Where(u => u.Role == "Student")
                        .ToListAsync(cancellationToken);
                    
                    var student = allStudents.FirstOrDefault(u =>
                    {
                        var fullName = $"{u.Name} {u.Surname}".Trim().ToLower();
                        var firstName = u.Name?.ToLower() ?? "";
                        return fullName == borrowerLower || firstName == borrowerLower;
                    });

                    if (student != null)
                    {
                        // Ceza puanı hesapla: 1 gün = 1 puan
                        var calculatedPenalty = daysLate;
                        
                        // Maksimum değeri koru
                        if (calculatedPenalty > student.PenaltyPoints)
                        {
                            student.PenaltyPoints = calculatedPenalty;
                            await _context.SaveChangesAsync(cancellationToken);
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Ceza puanı güncelleme hatası kritik değil, sessizce devam et
                    System.Diagnostics.Debug.WriteLine($"Penalty points update failed: {ex.Message}");
                }
            }

            // Storage bağımlılıkları kaldırıldı - artık sadece DB kullanılıyor
            var username = Request.Cookies["kutuphane_session"] ?? request.personelName ?? "";

            await RecordLoanHistoryReturnAsync(
                id,
                borrower,
                request.personelName ?? "",
                isLate,
                daysLate,
                cancellationToken);

            // Kitap iade işlemini logla (kayıt dosyalarından önce)
            try
            {
                if (!string.IsNullOrEmpty(username))
                {
                    var lateInfo = isLate ? $" (Gecikme: {daysLate} gün)" : "";
                    var log = new ActivityLogEntity
                    {
                        Timestamp = DateTime.Now,
                        Username = username,
                        Action = "RETURN_LOAN",
                        Details = $"Kitap iade edildi: '{updated.Title}' - Öğrenci: {borrower}{lateInfo}"
                    };
                    _context.ActivityLogs.Add(log);
                    await _context.SaveChangesAsync(cancellationToken);
                }
            }
            catch
            {
                // Log kaydetme hatası kritik değil, sessizce devam et
            }
            
            // Veri değişikliği olduğunda kayıtları güncelle (log eklendikten sonra)
            try
            {
                var recordTypesController = _serviceProvider.GetRequiredService<RecordTypesController>();
                if (!string.IsNullOrEmpty(username))
                {
                    await recordTypesController.UpdateRecordsOnDataChange(username, new List<string> { "odunc_bilgileri" }, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                // Kayıt güncelleme hatası kritik değil, sessizce devam et
                Console.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
                System.Diagnostics.Debug.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
            }
            
            return Ok(MapBook(updated));
        }
        catch (Exception ex)
        {
            // Provide more detailed error message
            var errorMessage = ex.Message;
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return BadRequest(new { message = $"Teslim alma işlemi başarısız oldu: {errorMessage}" });
        }
    }

    private BookResponse MapBook(Book book)
    {
        // Storage bağımlılıkları kaldırıldı - ek bilgiler artık DB'de değil, sadece temel bilgiler
        return new BookResponse(
            book.Id,
            book.Title,
            book.Author,
            book.Category,
            book.Quantity,
            book.TotalQuantity,
            book.HealthyCount,
            book.DamagedCount,
            book.LostCount,
            book.Loans.Select(entry => new LoanEntryResponse(entry.Borrower, entry.DueDate, entry.personel)).ToArray(),
            Shelf: book.Shelf,
            Publisher: book.Publisher,
            Summary: book.Summary,
            BookNumber: book.BookNumber,
            Year: book.Year,
            PageCount: book.PageCount);
    }

    public sealed record RegisterBookRequestDto(
        string Title,
        string Author,
        string Category,
        int Quantity,
        int HealthyCount = 0,
        int DamagedCount = 0,
        int LostCount = 0,
        string? Shelf = null,
        string? Publisher = null,
        string? Summary = null,
        int? BookNumber = null,
        int? Year = null,
        int? PageCount = null,
        string? personelName = null);

    public sealed record UpdateBookRequestDto(
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
        int? PageCount = null,
        string? personelName = null);

    public sealed record BorrowRequest(string Borrower, int Days, string personelName);

    public sealed record ReturnRequest(string personelName, string? Borrower);

    public sealed record BookResponse(
        Guid Id,
        string Title,
        string Author,
        string Category,
        int Quantity,
        int TotalQuantity,
        int HealthyCount,
        int DamagedCount,
        int LostCount,
        IReadOnlyCollection<LoanEntryResponse> Loans,
        string? Shelf = null,
        string? Publisher = null,
        string? Summary = null,
        int? BookNumber = null,
        int? Year = null,
        int? PageCount = null);

    public sealed record LoanEntryResponse(string Borrower, DateTime DueDate, string personel);

    public sealed record LoanInfoResponse(
        Guid BookId,
        string Title,
        string Author,
        string Category,
        string Borrower,
        DateTime DueDate,
        int RemainingDays,
        string? personel);

    private static string NormalizeBorrowerName(string? borrower)
    {
        if (string.IsNullOrWhiteSpace(borrower))
        {
            return string.Empty;
        }

        var parts = borrower.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var normalized = string.Join(" ", parts);
        return normalized.Trim().ToLowerInvariant();
    }

    private async Task RecordLoanHistoryBorrowAsync(
        Book updatedBook,
        string borrower,
        int days,
        string personelName,
        int? studentNumber,
        CancellationToken cancellationToken)
    {
        var normalizedBorrower = NormalizeBorrowerName(borrower);
        if (string.IsNullOrEmpty(normalizedBorrower))
        {
            return;
        }

        var loanEntry = updatedBook.LoanFor(borrower) ??
                        updatedBook.Loans.FirstOrDefault(entry =>
                            string.Equals(NormalizeBorrowerName(entry.Borrower), normalizedBorrower, StringComparison.OrdinalIgnoreCase));
        if (loanEntry is null)
        {
            return;
        }

        var borrowedAt = DateTime.UtcNow;

        var historyEntry = new LoanHistoryEntity
        {
            BookId = updatedBook.Id,
            BookTitle = updatedBook.Title,
            BookAuthor = updatedBook.Author,
            BookCategory = updatedBook.Category,
            Borrower = borrower.Trim(),
            NormalizedBorrower = normalizedBorrower,
            StudentNumber = studentNumber,
            BorrowedAt = borrowedAt,
            DueDate = loanEntry.DueDate,
            LoanDays = Math.Max(1, days),
            BorrowPersonel = personelName,
            Status = "ACTIVE"
        };

        _context.LoanHistory.Add(historyEntry);
        await _context.SaveChangesAsync(cancellationToken);
    }

    private async Task RecordLoanHistoryReturnAsync(
        Guid bookId,
        string borrower,
        string personelName,
        bool wasLate,
        int lateDays,
        CancellationToken cancellationToken)
    {
        var normalizedBorrower = NormalizeBorrowerName(borrower);
        if (string.IsNullOrEmpty(normalizedBorrower))
        {
            return;
        }

        var historyEntry = await _context.LoanHistory
            .Where(entry =>
                entry.BookId == bookId &&
                entry.Status == "ACTIVE" &&
                entry.NormalizedBorrower == normalizedBorrower)
            .OrderByDescending(entry => entry.BorrowedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (historyEntry is null)
        {
            return;
        }

        var returnedAt = DateTime.UtcNow;

        historyEntry.Status = "RETURNED";
        historyEntry.ReturnPersonel = personelName;
        historyEntry.ReturnedAt = returnedAt;
        historyEntry.WasLate = wasLate;
        historyEntry.LateDays = wasLate ? Math.Max(0, lateDays) : 0;
        if (historyEntry.ReturnedAt.HasValue)
        {
            var duration = (int)Math.Max(1, Math.Round((historyEntry.ReturnedAt.Value - historyEntry.BorrowedAt).TotalDays));
            historyEntry.DurationDays = duration;
        }

        await _context.SaveChangesAsync(cancellationToken);
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
}
