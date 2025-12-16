using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using OfficeOpenXml;
using Kutuphane.Infrastructure.Files.Directories;

namespace Kutuphane.Infrastructure.Files.Services;

/// <summary>
/// Reads Excel files and converts them to CSV records
/// </summary>
public sealed class ExcelReaderService
{
    public ExcelReaderService()
    {
        ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
    }

    public IReadOnlyList<BookSheetRecord> ReadBooksFromExcel(Stream stream)
    {
        using var package = new ExcelPackage(stream);
        var worksheet = package.Workbook.Worksheets[0];
        
        if (worksheet.Dimension == null)
        {
            return Array.Empty<BookSheetRecord>();
        }

        var records = new List<BookSheetRecord>();
        var startRow = 2; // Assume row 1 is header
        
        // Find header row (Türkçe ve İngilizce header'ları destekle)
        for (int row = 1; row <= worksheet.Dimension.End.Row; row++)
        {
            var firstCell = worksheet.Cells[row, 1].Text?.Trim().ToLowerInvariant() ?? "";
            if (firstCell == "title" || firstCell == "baslik" || firstCell.Contains("title") || firstCell.Contains("başlık"))
            {
                startRow = row + 1;
                break;
            }
        }

        // Find column indices (Türkçe ve İngilizce header'ları destekle)
        var headerRow = startRow - 1;
        var titleCol = FindColumnIndex(worksheet, headerRow, "title", "baslik", "başlık");
        var authorCol = FindColumnIndex(worksheet, headerRow, "author", "yazar");
        
        if (titleCol < 0 || authorCol < 0)
        {
            return Array.Empty<BookSheetRecord>();
        }

        var categoryCol = FindColumnIndex(worksheet, headerRow, "category", "kategori");
        var quantityCol = FindColumnIndex(worksheet, headerRow, "quantity", "miktar");
        var shelfCol = FindColumnIndex(worksheet, headerRow, "shelf", "raf");
        var publisherCol = FindColumnIndex(worksheet, headerRow, "publisher", "yayinevi", "yayınevi");
        var summaryCol = FindColumnIndex(worksheet, headerRow, "summary", "ozet", "özet");
        var numaraCol = FindColumnIndex(worksheet, headerRow, "numara", "booknumber");
        var yearCol = FindColumnIndex(worksheet, headerRow, "year", "yil", "yıl");
        var pageCountCol = FindColumnIndex(worksheet, headerRow, "pagecount", "pages", "sayfa_sayisi", "sayfa sayısı");

        for (int row = startRow; row <= worksheet.Dimension.End.Row; row++)
        {
            var title = worksheet.Cells[row, titleCol].Text?.Trim() ?? "";
            var author = worksheet.Cells[row, authorCol].Text?.Trim() ?? "";
            
            if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(author))
            {
                continue;
            }

            var category = categoryCol >= 0 ? (worksheet.Cells[row, categoryCol].Text?.Trim() ?? "Roman") : "Roman";
            if (string.IsNullOrWhiteSpace(category))
            {
                category = "Roman";
            }

            var quantity = 1;
            if (quantityCol >= 0 && int.TryParse(worksheet.Cells[row, quantityCol].Text?.Trim(), out var parsedQty))
            {
                quantity = Math.Max(1, parsedQty);
            }

            var shelf = shelfCol >= 0 ? (worksheet.Cells[row, shelfCol].Text?.Trim() ?? "") : "";
            var publisher = publisherCol >= 0 ? (worksheet.Cells[row, publisherCol].Text?.Trim() ?? "") : "";
            var summary = summaryCol >= 0 ? (worksheet.Cells[row, summaryCol].Text?.Trim() ?? "") : "";
            
            int? bookNumber = null;
            if (numaraCol >= 0 && int.TryParse(worksheet.Cells[row, numaraCol].Text?.Trim(), out var parsedNumara))
            {
                bookNumber = parsedNumara;
            }
            
            int? year = null;
            if (yearCol >= 0 && int.TryParse(worksheet.Cells[row, yearCol].Text?.Trim(), out var parsedYear))
            {
                year = parsedYear;
            }
            
            int? pageCount = null;
            if (pageCountCol >= 0 && int.TryParse(worksheet.Cells[row, pageCountCol].Text?.Trim(), out var parsedPageCount))
            {
                pageCount = parsedPageCount;
            }

            records.Add(new BookSheetRecord(title, author, category, quantity, shelf, publisher, summary, bookNumber, year, pageCount));
        }

        return records;
    }

    public IReadOnlyList<StudentRecord> ReadStudentsFromExcel(Stream stream)
    {
        using var package = new ExcelPackage(stream);
        var worksheet = package.Workbook.Worksheets[0];
        
        if (worksheet.Dimension == null)
        {
            return Array.Empty<StudentRecord>();
        }

        var records = new List<StudentRecord>();
        var startRow = 2;
        
        // Find header row (Türkçe ve İngilizce header'ları destekle)
        for (int row = 1; row <= worksheet.Dimension.End.Row; row++)
        {
            var firstCell = worksheet.Cells[row, 1].Text?.Trim().ToLowerInvariant() ?? "";
            if (firstCell == "name" || firstCell == "ad" || firstCell == "ad" || firstCell.Contains("name") || firstCell.Contains("ad"))
            {
                startRow = row + 1;
                break;
            }
        }

        var headerRow = startRow - 1;
        var nameCol = FindColumnIndex(worksheet, headerRow, "name", "ad", "ad");
        var surnameCol = FindColumnIndex(worksheet, headerRow, "surname", "soyad", "soyad");
        
        if (nameCol < 0)
        {
            return Array.Empty<StudentRecord>();
        }

        var classCol = FindColumnIndex(worksheet, headerRow, "sinif", "class");
        var branchCol = FindColumnIndex(worksheet, headerRow, "sube", "branch");
        var numaraCol = FindColumnIndex(worksheet, headerRow, "numara", "studentnumber");
        var penaltyCol = FindColumnIndex(worksheet, headerRow, "ceza_puani", "penaltypoints");

        for (int row = startRow; row <= worksheet.Dimension.End.Row; row++)
        {
            var name = worksheet.Cells[row, nameCol].Text?.Trim() ?? "";
            var surname = surnameCol >= 0 ? (worksheet.Cells[row, surnameCol].Text?.Trim() ?? "") : "";
            
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            int? classValue = null;
            if (classCol >= 0 && int.TryParse(worksheet.Cells[row, classCol].Text?.Trim(), out var parsedClass))
            {
                classValue = parsedClass;
            }

            string? branch = null;
            if (branchCol >= 0)
            {
                branch = worksheet.Cells[row, branchCol].Text?.Trim();
                if (string.IsNullOrWhiteSpace(branch))
                {
                    branch = null;
                }
            }

            int? studentNumber = null;
            if (numaraCol >= 0 && int.TryParse(worksheet.Cells[row, numaraCol].Text?.Trim(), out var parsedNumara))
            {
                studentNumber = parsedNumara;
            }

            int penaltyPoints = 0;
            if (penaltyCol >= 0 && int.TryParse(worksheet.Cells[row, penaltyCol].Text?.Trim(), out var parsedPenalty))
            {
                penaltyPoints = parsedPenalty;
            }

            records.Add(new StudentRecord(name, surname, classValue, branch, studentNumber, penaltyPoints));
        }

        return records;
    }

    public IReadOnlyList<personelRecord> ReadpersonelFromExcel(Stream stream)
    {
        using var package = new ExcelPackage(stream);
        var worksheet = package.Workbook.Worksheets[0];
        
        if (worksheet.Dimension == null)
        {
            return Array.Empty<personelRecord>();
        }

        var records = new List<personelRecord>();
        var startRow = 2;
        
        // Find header row (Türkçe ve İngilizce header'ları destekle)
        for (int row = 1; row <= worksheet.Dimension.End.Row; row++)
        {
            var firstCell = worksheet.Cells[row, 1].Text?.Trim().ToLowerInvariant() ?? "";
            if (firstCell == "username" || firstCell == "kullanici_adi" || firstCell == "kullanıcı adı" || firstCell.Contains("username") || firstCell.Contains("kullanici"))
            {
                startRow = row + 1;
                break;
            }
        }

        var headerRow = startRow - 1;
        var usernameCol = FindColumnIndex(worksheet, headerRow, "username", "kullanici_adi", "kullanıcı adı");
        var passwordCol = FindColumnIndex(worksheet, headerRow, "password", "sifre", "şifre");
        var nameCol = FindColumnIndex(worksheet, headerRow, "name", "ad");
        
        if (usernameCol < 0 || passwordCol < 0 || nameCol < 0)
        {
            return Array.Empty<personelRecord>();
        }

        for (int row = startRow; row <= worksheet.Dimension.End.Row; row++)
        {
            var username = worksheet.Cells[row, usernameCol].Text?.Trim() ?? "";
            var password = worksheet.Cells[row, passwordCol].Text?.Trim() ?? "";
            var name = worksheet.Cells[row, nameCol].Text?.Trim() ?? "";
            
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            records.Add(new personelRecord(username, password, name));
        }

        return records;
    }

    private static int FindColumnIndex(ExcelWorksheet worksheet, int headerRow, params string[] columnNames)
    {
        for (int col = 1; col <= worksheet.Dimension.End.Column; col++)
        {
            var cellValue = worksheet.Cells[headerRow, col].Text?.Trim().ToLowerInvariant() ?? "";
            foreach (var columnName in columnNames)
            {
                if (cellValue == columnName.ToLowerInvariant() || cellValue.Contains(columnName.ToLowerInvariant()))
                {
                    return col;
                }
            }
        }
        return -1;
    }
}



