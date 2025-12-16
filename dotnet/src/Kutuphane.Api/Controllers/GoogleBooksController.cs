using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Application.BookCatalog;
using Kutuphane.Core.Application.Sync;
using Kutuphane.Infrastructure.External.Services;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.AspNetCore.Mvc;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/google-books")]
public class GoogleBooksController : ControllerBase
{
    private readonly GoogleBooksService _googleBooksService;
    private readonly ExcelSyncService _excelSync;
    private readonly BookCatalogService _bookCatalog;
    private readonly KutuphaneDbContext _context;

    public GoogleBooksController(
        GoogleBooksService googleBooksService,
        ExcelSyncService excelSync,
        BookCatalogService bookCatalog,
        KutuphaneDbContext context)
    {
        _googleBooksService = googleBooksService;
        _excelSync = excelSync;
        _bookCatalog = bookCatalog;
        _context = context;
    }

    [HttpGet("test")]
    public IActionResult Test()
    {
        return Ok(new { message = "GoogleBooksController çalışıyor!" });
    }

    [HttpGet("search")]
    public async Task<ActionResult<IEnumerable<GoogleBookResult>>> SearchBooks(
        [FromQuery] string query,
        [FromQuery] int maxResults = 40,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { message = "Arama sorgusu boş olamaz" });
        }

        try
        {
            var results = await _googleBooksService.SearchBooksAsync(query, maxResults, cancellationToken);
            return Ok(results);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Arama sırasında hata oluştu: {ex.Message}" });
        }
    }

    [HttpPost("add-to-csv")]
    public async Task<ActionResult<AddToCsvResponse>> AddToCsv(
        [FromBody] AddToCsvRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request.Books == null || request.Books.Count == 0)
        {
            return BadRequest(new { message = "Kitap listesi boş" });
        }

        // Storage bağımlılıkları kaldırıldı - artık direkt DB'ye ekleniyor

        // Direkt DB'ye ekle - SADECE YENİ EKLENEN KİTAPLARI EKLE
        var importedCount = 0;
        var allExistingBooks = await _bookCatalog.ListAllAsync(cancellationToken);
        var existingTitles = allExistingBooks
            .Select(b => (b.Title.ToLowerInvariant().Trim(), b.Author.ToLowerInvariant().Trim()))
            .ToHashSet();
        var logUsername = !string.IsNullOrWhiteSpace(request.PersonelName)
            ? request.PersonelName!.Trim()
            : Request.Cookies["kutuphane_session"];
        if (string.IsNullOrWhiteSpace(logUsername))
        {
            logUsername = "Sistem";
        }
        var logEntries = new List<ActivityLogEntity>();

        foreach (var book in request.Books)
        {
            try
            {
                // Kitap zaten varsa ekleme (duplicate kontrolü)
                var titleKey = book.Title.ToLowerInvariant().Trim();
                var authorKey = book.Author.ToLowerInvariant().Trim();
                var exists = existingTitles.Contains((titleKey, authorKey));
                
                if (!exists)
                {
                    var normalizedQuantity = book.Quantity > 0 ? book.Quantity : 1;
                    await _bookCatalog.RegisterAsync(
                        new RegisterBookRequest(
                            book.Title,
                            book.Author,
                            book.Category,
                            normalizedQuantity,
                            normalizedQuantity,
                            0,
                            0,
                            book.Shelf,
                            book.Publisher,
                            book.Summary,
                            book.BookNumber,
                            book.Year,
                            book.PageCount),
                        cancellationToken);
                    importedCount++;
                    existingTitles.Add((titleKey, authorKey)); // Cache'e ekle

                    logEntries.Add(new ActivityLogEntity
                    {
                        Timestamp = DateTime.Now,
                        Username = logUsername,
                        Action = "ADD_BOOK",
                        Details = $"Kitap eklendi: '{book.Title}' - {book.Author} (Adet: {normalizedQuantity})"
                    });
                }
            }
            catch
            {
                // Hata durumunda devam et (duplicate veya başka bir hata)
            }
        }

        if (logEntries.Count > 0)
        {
            try
            {
                _context.ActivityLogs.AddRange(logEntries);
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GoogleBooks log kaydetme hatası: {ex.Message}");
            }
        }

        return Ok(new AddToCsvResponse
        {
            AddedToCsv = importedCount,
            ImportedToSystem = importedCount
        });
    }

    public sealed record AddToCsvRequest(List<BookToAdd> Books, string? PersonelName);

    public sealed record BookToAdd(
        string Title,
        string Author,
        string Category,
        int Quantity,
        string? Shelf,
        string? Publisher,
        string? Summary,
        int? Year,
        int? PageCount,
        int? BookNumber);

    public sealed class AddToCsvResponse
    {
        public int AddedToCsv { get; set; }
        public int ImportedToSystem { get; set; }
    }
}

