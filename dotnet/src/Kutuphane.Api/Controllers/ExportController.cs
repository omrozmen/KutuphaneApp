using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Application.BookCatalog;
using Kutuphane.Core.Application.Statistics;
using Kutuphane.Infrastructure.Database;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/export")]
public class ExportController : ControllerBase
{
    private readonly BookCatalogService _bookCatalog;
    private readonly StatisticsService _statistics;
    private readonly KutuphaneDbContext _context;

    public ExportController(
        BookCatalogService bookCatalog,
        StatisticsService statistics,
        KutuphaneDbContext context)
    {
        _bookCatalog = bookCatalog;
        _statistics = statistics;
        _context = context;
    }


    [HttpPost("xlsx")]
    public async Task<IActionResult> ExportToXlsx(
        [FromBody] ExportXlsxRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            // EPPlus lisans ayarı (non-commercial kullanım için)
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

            // Request validasyonu
            if (request == null)
            {
                return BadRequest(new { success = false, message = "İstek verisi boş" });
            }

            if (request.DataTypes == null || request.DataTypes.Count == 0)
            {
                return BadRequest(new { success = false, message = "Veri türü seçilmedi" });
            }

            // Seçilen veri tiplerini kontrol et
            var validDataTypes = new[] { "ogrenci_bilgileri", "personel_bilgileri", "kitap_listesi", "odunc_bilgileri" };
            var hasValidDataType = request.DataTypes.Any(dt => validDataTypes.Contains(dt));
            
            if (!hasValidDataType)
            {
                return BadRequest(new { success = false, message = "Geçerli bir veri tipi seçilmedi" });
            }

            var createdFiles = new List<string>();
            int totalRecordCount = 0;
            var isOverwrite = request.SaveMode == "overwrite";

            // "Masaüstü" yolunu gerçek yola çevir
            string baseDirectory;
            try
            {
                var baseFolderPath = request.FilePath ?? "";
                if (baseFolderPath.StartsWith("Masaüstü/", StringComparison.OrdinalIgnoreCase) ||
                    baseFolderPath.StartsWith("Desktop/", StringComparison.OrdinalIgnoreCase))
                {
                    var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                    if (string.IsNullOrEmpty(desktopPath))
                    {
                        return BadRequest(new { success = false, message = "Masaüstü klasörü bulunamadı" });
                    }
                    baseFolderPath = baseFolderPath.Replace("Masaüstü/", "").Replace("Desktop/", "");
                    baseDirectory = Path.Combine(desktopPath, baseFolderPath);
                }
                else if (Path.IsPathRooted(baseFolderPath))
                {
                    baseDirectory = baseFolderPath;
                }
                else
                {
                    var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                    if (string.IsNullOrEmpty(desktopPath))
                    {
                        return BadRequest(new { success = false, message = "Masaüstü klasörü bulunamadı" });
                    }
                    baseDirectory = Path.Combine(desktopPath, baseFolderPath);
                }

                // Klasörü oluştur (yoksa)
                if (!Directory.Exists(baseDirectory))
                {
                    Directory.CreateDirectory(baseDirectory);
                }
            }
            catch (Exception ex)
            {
                return BadRequest(new { success = false, message = $"Klasör oluşturulamadı: {ex.Message}" });
            }

            // Overwrite modu: Tek Excel dosyası, birden fazla sayfa
            if (isOverwrite)
            {
                var excelFilePath = Path.Combine(baseDirectory, "Kütüphane Verileri.xlsx");

                // Excel paketi oluştur - seçilen veri tiplerine göre sayfalar ekle
                using (var package = new ExcelPackage())
                {
                // Öğrenci Bilgileri sayfası (eğer seçildiyse)
                if (request.DataTypes.Contains("ogrenci_bilgileri"))
                {
                    var studentSheet = package.Workbook.Worksheets.Add("Öğrenci Bilgileri");
                    studentSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                    studentSheet.Cells[1, 2].Value = "Ad";
                    studentSheet.Cells[1, 3].Value = "Sınıf";
                    studentSheet.Cells[1, 4].Value = "Şube";
                    studentSheet.Cells[1, 5].Value = "Numara";
                    studentSheet.Cells[1, 6].Value = "Ceza Puanı";

                    using (var range = studentSheet.Cells[1, 1, 1, 6])
                    {
                        range.Style.Font.Bold = true;
                        range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                        range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                    }

                    var studentRecords = await _context.Users
                        .Where(u => u.Role == "Student")
                        .ToListAsync(cancellationToken);
                    int row = 2;
                    foreach (var student in studentRecords)
                    {
                        studentSheet.Cells[row, 1].Value = student.Username;
                        studentSheet.Cells[row, 2].Value = student.Name ?? "";
                        studentSheet.Cells[row, 3].Value = student.Class?.ToString() ?? "";
                        studentSheet.Cells[row, 4].Value = student.Branch ?? "";
                        studentSheet.Cells[row, 5].Value = student.StudentNumber?.ToString() ?? "";
                        studentSheet.Cells[row, 6].Value = student.PenaltyPoints;
                        row++;
                        totalRecordCount++;
                    }
                    studentSheet.Cells[studentSheet.Dimension.Address].AutoFitColumns();
                }

                // Personel Bilgileri sayfası (eğer seçildiyse)
                if (request.DataTypes.Contains("personel_bilgileri"))
                {
                    var personelSheet = package.Workbook.Worksheets.Add("Personel Bilgileri");
                    personelSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                    personelSheet.Cells[1, 2].Value = "Ad";

                    using (var range = personelSheet.Cells[1, 1, 1, 2])
                    {
                        range.Style.Font.Bold = true;
                        range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                        range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                    }

                    var personelRecords = await _context.Users
                        .Where(u => u.Role == "personel")
                        .ToListAsync(cancellationToken);
                    int row = 2;
                    foreach (var personel in personelRecords)
                    {
                        personelSheet.Cells[row, 1].Value = personel.Username;
                        personelSheet.Cells[row, 2].Value = personel.Name ?? "";
                        row++;
                        totalRecordCount++;
                    }
                    personelSheet.Cells[personelSheet.Dimension.Address].AutoFitColumns();
                }

                // Kitap Listesi sayfası (eğer seçildiyse)
                if (request.DataTypes.Contains("kitap_listesi"))
                {
                    var bookSheet = package.Workbook.Worksheets.Add("Kitap Listesi");
                    bookSheet.Cells[1, 1].Value = "Başlık";
                    bookSheet.Cells[1, 2].Value = "Yazar";
                    bookSheet.Cells[1, 3].Value = "Kategori";
                    bookSheet.Cells[1, 4].Value = "Miktar";
                    bookSheet.Cells[1, 5].Value = "Raf";
                    bookSheet.Cells[1, 6].Value = "Yayınevi";
                    bookSheet.Cells[1, 7].Value = "Özet";
                    bookSheet.Cells[1, 8].Value = "Numara";
                    bookSheet.Cells[1, 9].Value = "Yıl";
                    bookSheet.Cells[1, 10].Value = "Sayfa Sayısı";

                    using (var range = bookSheet.Cells[1, 1, 1, 10])
                    {
                        range.Style.Font.Bold = true;
                        range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                        range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                    }

                    var books = await _bookCatalog.SearchAsync(null, null, cancellationToken);
                    int row = 2;
                    foreach (var book in books)
                    {
                        // Storage bağımlılıkları kaldırıldı - ek bilgiler artık DB'de değil
                        bookSheet.Cells[row, 1].Value = book.Title;
                        bookSheet.Cells[row, 2].Value = book.Author;
                        bookSheet.Cells[row, 3].Value = book.Category;
                        bookSheet.Cells[row, 4].Value = book.Quantity;
                        bookSheet.Cells[row, 5].Value = ""; // Shelf
                        bookSheet.Cells[row, 6].Value = ""; // Publisher
                        bookSheet.Cells[row, 7].Value = ""; // Summary
                        bookSheet.Cells[row, 8].Value = ""; // BookNumber
                        bookSheet.Cells[row, 9].Value = ""; // Year
                        bookSheet.Cells[row, 10].Value = ""; // PageCount
                        row++;
                        totalRecordCount++;
                    }
                    bookSheet.Cells[bookSheet.Dimension.Address].AutoFitColumns();
                }

                // Ödünç Bilgileri sayfası (eğer seçildiyse)
                if (request.DataTypes.Contains("odunc_bilgileri"))
                {
                    var loanSheet = package.Workbook.Worksheets.Add("Ödünç Bilgileri");
                    loanSheet.Cells[1, 1].Value = "Kitap Başlık";
                    loanSheet.Cells[1, 2].Value = "Yazar";
                    loanSheet.Cells[1, 3].Value = "Öğrenci";
                    loanSheet.Cells[1, 4].Value = "Teslim Tarihi";
                    loanSheet.Cells[1, 5].Value = "Personel";

                    using (var range = loanSheet.Cells[1, 1, 1, 5])
                    {
                        range.Style.Font.Bold = true;
                        range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                        range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                    }

                    var loans = await _bookCatalog.LoanOverviewAsync(cancellationToken);
                    int row = 2;
                    foreach (var loan in loans)
                    {
                        loanSheet.Cells[row, 1].Value = loan.Title;
                        loanSheet.Cells[row, 2].Value = loan.Author;
                        loanSheet.Cells[row, 3].Value = loan.Borrower;
                        loanSheet.Cells[row, 4].Value = loan.DueDate.ToString("dd-MM-yyyy");
                        loanSheet.Cells[row, 5].Value = loan.personel ?? "";
                        row++;
                        totalRecordCount++;
                    }
                    loanSheet.Cells[loanSheet.Dimension.Address].AutoFitColumns();
                }

                    // Excel dosyasını kaydet
                    var fileInfo = new FileInfo(excelFilePath);
                    package.SaveAs(fileInfo);
                    createdFiles.Add(excelFilePath);

                    // Storage bağımlılıkları kaldırıldı - log artık DB'de değil

                    return Ok(new { success = true, message = "XLSX dosyası başarıyla oluşturuldu", recordCount = totalRecordCount, files = createdFiles });
                }
            }
            else
            {
                // Current modu (Yeni Kayıt): Her veri tipi için ayrı Excel dosyası
                foreach (var dataType in request.DataTypes)
                {
                    string fileName = "";
                    string sheetName = "";

                    switch (dataType)
                    {
                        case "ogrenci_bilgileri":
                            fileName = "ogrenci listesi.xlsx";
                            sheetName = "Öğrenci Bilgileri";
                            break;
                        case "personel_bilgileri":
                            fileName = "personel listesi.xlsx";
                            sheetName = "Personel Bilgileri";
                            break;
                        case "kitap_listesi":
                            fileName = "kitap listesi.xlsx";
                            sheetName = "Kitap Listesi";
                            break;
                        case "odunc_bilgileri":
                            fileName = "odunc listesi.xlsx";
                            sheetName = "Ödünç Bilgileri";
                            break;
                        default:
                            continue;
                    }

                    var excelFilePath = Path.Combine(baseDirectory, fileName);
                    int recordCount = 0;

                    using (var package = new ExcelPackage())
                    {
                        if (dataType == "ogrenci_bilgileri")
                        {
                            var studentSheet = package.Workbook.Worksheets.Add(sheetName);
                            studentSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                            studentSheet.Cells[1, 2].Value = "Ad";
                            studentSheet.Cells[1, 3].Value = "Sınıf";
                            studentSheet.Cells[1, 4].Value = "Şube";
                            studentSheet.Cells[1, 5].Value = "Numara";
                            studentSheet.Cells[1, 6].Value = "Ceza Puanı";

                            using (var range = studentSheet.Cells[1, 1, 1, 6])
                            {
                                range.Style.Font.Bold = true;
                                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                            }

                            var studentRecords = await _context.Users
                                .Where(u => u.Role == "Student")
                                .ToListAsync(cancellationToken);
                            int row = 2;
                            foreach (var student in studentRecords)
                            {
                                studentSheet.Cells[row, 1].Value = student.Username;
                                studentSheet.Cells[row, 2].Value = student.Name ?? "";
                                studentSheet.Cells[row, 3].Value = student.Class?.ToString() ?? "";
                                studentSheet.Cells[row, 4].Value = student.Branch ?? "";
                                studentSheet.Cells[row, 5].Value = student.StudentNumber?.ToString() ?? "";
                                studentSheet.Cells[row, 6].Value = student.PenaltyPoints;
                                row++;
                                recordCount++;
                            }
                            studentSheet.Cells[studentSheet.Dimension.Address].AutoFitColumns();
                        }
                        else if (dataType == "personel_bilgileri")
                        {
                            var personelSheet = package.Workbook.Worksheets.Add(sheetName);
                            personelSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                            personelSheet.Cells[1, 2].Value = "Ad";

                            using (var range = personelSheet.Cells[1, 1, 1, 2])
                            {
                                range.Style.Font.Bold = true;
                                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                            }

                            var personelRecords = await _context.Users
                                .Where(u => u.Role == "personel")
                                .ToListAsync(cancellationToken);
                            int row = 2;
                            foreach (var personel in personelRecords)
                            {
                                personelSheet.Cells[row, 1].Value = personel.Username;
                                personelSheet.Cells[row, 2].Value = personel.Name ?? "";
                                row++;
                                recordCount++;
                            }
                            personelSheet.Cells[personelSheet.Dimension.Address].AutoFitColumns();
                        }
                        else if (dataType == "kitap_listesi")
                        {
                            var bookSheet = package.Workbook.Worksheets.Add(sheetName);
                            bookSheet.Cells[1, 1].Value = "Başlık";
                            bookSheet.Cells[1, 2].Value = "Yazar";
                            bookSheet.Cells[1, 3].Value = "Kategori";
                            bookSheet.Cells[1, 4].Value = "Miktar";
                            bookSheet.Cells[1, 5].Value = "Raf";
                            bookSheet.Cells[1, 6].Value = "Yayınevi";
                            bookSheet.Cells[1, 7].Value = "Özet";
                            bookSheet.Cells[1, 8].Value = "Numara";
                            bookSheet.Cells[1, 9].Value = "Yıl";
                            bookSheet.Cells[1, 10].Value = "Sayfa Sayısı";

                            using (var range = bookSheet.Cells[1, 1, 1, 10])
                            {
                                range.Style.Font.Bold = true;
                                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                            }

                            var books = await _bookCatalog.SearchAsync(null, null, cancellationToken);
                            int row = 2;
                            foreach (var book in books)
                            {
                                // Storage bağımlılıkları kaldırıldı - ek bilgiler artık DB'de değil
                                bookSheet.Cells[row, 1].Value = book.Title;
                                bookSheet.Cells[row, 2].Value = book.Author;
                                bookSheet.Cells[row, 3].Value = book.Category;
                                bookSheet.Cells[row, 4].Value = book.Quantity;
                                bookSheet.Cells[row, 5].Value = ""; // Shelf
                                bookSheet.Cells[row, 6].Value = ""; // Publisher
                                bookSheet.Cells[row, 7].Value = ""; // Summary
                                bookSheet.Cells[row, 8].Value = ""; // BookNumber
                                bookSheet.Cells[row, 9].Value = ""; // Year
                                bookSheet.Cells[row, 10].Value = ""; // PageCount
                                row++;
                                recordCount++;
                            }
                            bookSheet.Cells[bookSheet.Dimension.Address].AutoFitColumns();
                        }
                        else if (dataType == "odunc_bilgileri")
                        {
                            var loanSheet = package.Workbook.Worksheets.Add(sheetName);
                            loanSheet.Cells[1, 1].Value = "Kitap Başlık";
                            loanSheet.Cells[1, 2].Value = "Yazar";
                            loanSheet.Cells[1, 3].Value = "Öğrenci";
                            loanSheet.Cells[1, 4].Value = "Teslim Tarihi";
                            loanSheet.Cells[1, 5].Value = "Personel";

                            using (var range = loanSheet.Cells[1, 1, 1, 5])
                            {
                                range.Style.Font.Bold = true;
                                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                            }

                            var loans = await _bookCatalog.LoanOverviewAsync(cancellationToken);
                            int row = 2;
                            foreach (var loan in loans)
                            {
                                loanSheet.Cells[row, 1].Value = loan.Title;
                                loanSheet.Cells[row, 2].Value = loan.Author;
                                loanSheet.Cells[row, 3].Value = loan.Borrower;
                                loanSheet.Cells[row, 4].Value = loan.DueDate.ToString("dd-MM-yyyy");
                                loanSheet.Cells[row, 5].Value = loan.personel ?? "";
                                row++;
                                recordCount++;
                            }
                            loanSheet.Cells[loanSheet.Dimension.Address].AutoFitColumns();
                        }

                        // Excel dosyasını kaydet
                        var fileInfo = new FileInfo(excelFilePath);
                        package.SaveAs(fileInfo);
                        createdFiles.Add(excelFilePath);
                        totalRecordCount += recordCount;

                        // Storage bağımlılıkları kaldırıldı - log artık DB'de değil
                    }
                }

                if (createdFiles.Count == 0)
                {
                    return BadRequest(new { success = false, message = "Hiçbir dosya oluşturulamadı" });
                }

                return Ok(new { success = true, message = "XLSX dosyaları başarıyla oluşturuldu", recordCount = totalRecordCount, files = createdFiles });
            }
        }
        catch (Exception ex)
        {
            var errorMessage = ex.Message;
            if (ex.InnerException != null)
            {
                errorMessage += $" Detay: {ex.InnerException.Message}";
            }
            return BadRequest(new { success = false, message = $"XLSX export hatası: {errorMessage}" });
        }
    }

    public sealed record ExportXlsxRequest(
        string FilePath,
        string SaveMode, // "overwrite" veya "current"
        List<string> DataTypes,
        string? personelName = null);
}
