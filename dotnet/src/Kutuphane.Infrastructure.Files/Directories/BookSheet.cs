using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace Kutuphane.Infrastructure.Files.Directories;

public sealed record BookSheetRecord(
    string Title,
    string Author,
    string Category,
    int Quantity,
    string Shelf,
    string Publisher,
    string Summary,
    int? BookNumber = null,
    int? Year = null,
    int? PageCount = null);

/// <summary>
/// Reads book metadata exported from Excel CSV.
/// </summary>
public sealed class BookSheet
{
    private readonly string _filePath;

    public BookSheet(string filePath)
    {
        _filePath = filePath;
    }

    public IReadOnlyList<BookSheetRecord> ListRecords()
    {
        if (!File.Exists(_filePath))
        {
            return Array.Empty<BookSheetRecord>();
        }

        var lines = File.ReadAllLines(_filePath, Encoding.UTF8);
        if (lines.Length == 0)
        {
            return Array.Empty<BookSheetRecord>();
        }

        var header = CsvLineParser.Split(lines[0]).Select(h => h.Trim().ToLowerInvariant()).ToArray();
        // Türkçe ve İngilizce header'ları destekle
        var titleIndex = FindColumnIndex(header, "title", "baslik", "başlık");
        var authorIndex = FindColumnIndex(header, "author", "yazar");
        if (titleIndex < 0 || authorIndex < 0)
        {
            return Array.Empty<BookSheetRecord>();
        }

        var categoryIndex = FindColumnIndex(header, "category", "kategori");
        var quantityIndex = FindColumnIndex(header, "quantity", "miktar");
        var shelfIndex = FindColumnIndex(header, "shelf", "raf");
        var publisherIndex = FindColumnIndex(header, "publisher", "yayinevi", "yayınevi");
        var summaryIndex = FindColumnIndex(header, "summary", "ozet", "özet");
        var numaraIndex = FindColumnIndex(header, "numara", "booknumber");
        var yearIndex = FindColumnIndex(header, "year", "yil", "yıl");
        var pageCountIndex = FindColumnIndex(header, "pagecount", "pages", "sayfa_sayisi", "sayfa sayısı");
        var records = new List<BookSheetRecord>();

        for (var i = 1; i < lines.Length; i++)
        {
            var columns = CsvLineParser.Split(lines[i]);
            if (columns.Length <= Math.Max(titleIndex, authorIndex))
            {
                continue;
            }

            var title = columns[titleIndex].Trim();
            var author = columns[authorIndex].Trim();
            if (string.IsNullOrEmpty(title) || string.IsNullOrEmpty(author))
            {
                continue;
            }

            var category = categoryIndex >= 0 && categoryIndex < columns.Length
                ? columns[categoryIndex].Trim()
                : "Genel";
            if (string.IsNullOrWhiteSpace(category))
            {
                category = "Genel";
            }

            var quantity = 1;
            if (quantityIndex >= 0 && quantityIndex < columns.Length && int.TryParse(columns[quantityIndex], out var parsed))
            {
                quantity = Math.Max(1, parsed);
            }

            var shelf = shelfIndex >= 0 && shelfIndex < columns.Length ? columns[shelfIndex].Trim() : string.Empty;
            var publisher = publisherIndex >= 0 && publisherIndex < columns.Length ? columns[publisherIndex].Trim() : string.Empty;
            var summary = summaryIndex >= 0 && summaryIndex < columns.Length ? columns[summaryIndex].Trim() : string.Empty;
            
            int? bookNumber = null;
            if (numaraIndex >= 0 && numaraIndex < columns.Length && int.TryParse(columns[numaraIndex].Trim(), out var parsedNumara))
            {
                bookNumber = parsedNumara;
            }
            
            int? year = null;
            if (yearIndex >= 0 && yearIndex < columns.Length && int.TryParse(columns[yearIndex].Trim(), out var parsedYear))
            {
                year = parsedYear;
            }
            
            int? pageCount = null;
            if (pageCountIndex >= 0 && pageCountIndex < columns.Length && int.TryParse(columns[pageCountIndex].Trim(), out var parsedPageCount))
            {
                pageCount = parsedPageCount;
            }
            
            records.Add(new BookSheetRecord(title, author, category, quantity, shelf, publisher, summary, bookNumber, year, pageCount));
        }

        return records;
    }

    public void AppendRecords(IEnumerable<BookSheetRecord> newRecords)
    {
        // Dizin yoksa oluştur
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        // Mevcut kayıtları kontrol et (duplicate önleme için - tüm sütunlar)
        var existingRecords = new HashSet<BookSheetRecord>();
        bool fileExists = File.Exists(_filePath);
        bool hasHeader = false;

        if (fileExists)
        {
            try
            {
                var existingLines = File.ReadAllLines(_filePath, Encoding.UTF8);
                
                if (existingLines.Length > 0)
                {
                    var header = CsvLineParser.Split(existingLines[0]).Select(h => h.Trim().ToLowerInvariant()).ToArray();
                    // Türkçe ve İngilizce header'ları destekle
                    var titleIndex = FindColumnIndex(header, "title", "baslik", "başlık");
                    var authorIndex = FindColumnIndex(header, "author", "yazar");
                    
                    if (titleIndex >= 0 && authorIndex >= 0)
                    {
                        hasHeader = true;
                        var categoryIndex = FindColumnIndex(header, "category", "kategori");
                        var quantityIndex = FindColumnIndex(header, "quantity", "miktar");
                        var shelfIndex = FindColumnIndex(header, "shelf", "raf");
                        var publisherIndex = FindColumnIndex(header, "publisher", "yayinevi", "yayınevi");
                        var summaryIndex = FindColumnIndex(header, "summary", "ozet", "özet");
                        var numaraIndex = FindColumnIndex(header, "numara", "booknumber");
                        var yearIndex = FindColumnIndex(header, "year", "yil", "yıl");
                        var pageCountIndex = FindColumnIndex(header, "pagecount", "pages", "sayfa_sayisi", "sayfa sayısı");
                        
                        for (int i = 1; i < existingLines.Length; i++)
                        {
                            var line = existingLines[i].Trim();
                            if (string.IsNullOrWhiteSpace(line))
                                continue;
                            
                            var columns = CsvLineParser.Split(line);
                            if (columns.Length > Math.Max(titleIndex, authorIndex))
                            {
                                var title = columns[titleIndex].Trim();
                                var author = columns[authorIndex].Trim();
                                
                                if (!string.IsNullOrWhiteSpace(title) && !string.IsNullOrWhiteSpace(author))
                                {
                                    var category = categoryIndex >= 0 && categoryIndex < columns.Length
                                        ? columns[categoryIndex].Trim()
                                        : "Genel";
                                    if (string.IsNullOrWhiteSpace(category))
                                    {
                                        category = "Genel";
                                    }
                                    
                                    var quantity = 1;
                                    if (quantityIndex >= 0 && quantityIndex < columns.Length && int.TryParse(columns[quantityIndex], out var parsed))
                                    {
                                        quantity = Math.Max(1, parsed);
                                    }
                                    
                                    var shelf = shelfIndex >= 0 && shelfIndex < columns.Length ? columns[shelfIndex].Trim() : string.Empty;
                                    var publisher = publisherIndex >= 0 && publisherIndex < columns.Length ? columns[publisherIndex].Trim() : string.Empty;
                                    var summary = summaryIndex >= 0 && summaryIndex < columns.Length ? columns[summaryIndex].Trim() : string.Empty;
                                    
                                    int? bookNumber = null;
                                    if (numaraIndex >= 0 && numaraIndex < columns.Length && int.TryParse(columns[numaraIndex].Trim(), out var parsedNumara))
                                    {
                                        bookNumber = parsedNumara;
                                    }
                                    
                                    int? year = null;
                                    if (yearIndex >= 0 && yearIndex < columns.Length && int.TryParse(columns[yearIndex].Trim(), out var parsedYear))
                                    {
                                        year = parsedYear;
                                    }
                                    
                                    int? pageCount = null;
                                    if (pageCountIndex >= 0 && pageCountIndex < columns.Length && int.TryParse(columns[pageCountIndex].Trim(), out var parsedPageCount))
                                    {
                                        pageCount = parsedPageCount;
                                    }
                                    
                                    existingRecords.Add(new BookSheetRecord(title, author, category, quantity, shelf, publisher, summary, bookNumber, year, pageCount));
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"CSV dosyası okunamadı: {ex.Message}", ex);
            }
        }

        // Yeni kayıtları filtrele (duplicate kontrolü - tüm sütunlar)
        var toAdd = newRecords
            .Where(r => !string.IsNullOrWhiteSpace(r.Title) && !string.IsNullOrWhiteSpace(r.Author))
            .Where(r => !existingRecords.Contains(r))
            .ToList();
        
        if (toAdd.Count == 0)
        {
            return; // Eklenebilecek yeni kayıt yok
        }

        // YENİ KAYITLARI DOSYANIN SONUNA EKLE - MEVCUT İÇERİĞE DOKUNMADAN
        // StreamWriter ile append mode (true) kullanarak dosyanın sonuna ekle
        StreamWriter? writer = null;
        try
        {
            writer = new StreamWriter(_filePath, append: true, encoding: new UTF8Encoding(false));
            
            // Dosya yoksa veya header yoksa, önce header ekle
            if (!fileExists || !hasHeader)
            {
                writer.WriteLine("title,author,category,quantity,shelf,publisher,summary,numara,year,pagecount");
                writer.Flush();
            }

            // Yeni kayıtları dosyanın sonuna ekle
            foreach (var record in toAdd)
            {
                var numara = record.BookNumber?.ToString() ?? "";
                var year = record.Year?.ToString() ?? "";
                var pageCount = record.PageCount?.ToString() ?? "";
                var line = $"{EscapeCsvField(record.Title)},{EscapeCsvField(record.Author)},{EscapeCsvField(record.Category)},{record.Quantity},{EscapeCsvField(record.Shelf)},{EscapeCsvField(record.Publisher)},{EscapeCsvField(record.Summary)},{numara},{year},{pageCount}";
                writer.WriteLine(line);
            }
            
            // Tüm verileri diske yaz
            writer.Flush();
            writer.Close();
            writer = null;

            // Dosyanın başarıyla yazıldığını doğrula
            if (!File.Exists(_filePath))
            {
                throw new IOException($"CSV dosyası oluşturulamadı: {_filePath}");
            }

            // Dosyanın içeriğini kontrol et
            var writtenLines = File.ReadAllLines(_filePath, Encoding.UTF8);
            if (writtenLines.Length == 0)
            {
                throw new IOException($"CSV dosyası boş kaldı: {_filePath}");
            }
        }
        catch (Exception ex)
        {
            // Writer'ı kapat (eğer açıksa)
            if (writer != null)
            {
                try
                {
                    writer.Flush();
                    writer.Close();
                }
                catch
                {
                    // Stream kapatılamazsa devam et
                }
            }

            throw new IOException($"CSV dosyasına yazma hatası: {_filePath}. Detay: {ex.Message}", ex);
        }
        finally
        {
            writer?.Dispose();
        }
    }

    private static string EscapeCsvField(string field)
    {
        if (string.IsNullOrEmpty(field))
        {
            return string.Empty;
        }

        if (field.Contains(',') || field.Contains('"') || field.Contains('\n'))
        {
            return $"\"{field.Replace("\"", "\"\"")}\"";
        }

        return field;
    }

    private static int FindColumnIndex(string[] header, params string[] columnNames)
    {
        foreach (var columnName in columnNames)
        {
            var index = Array.IndexOf(header, columnName.ToLowerInvariant());
            if (index >= 0)
            {
                return index;
            }
        }
        return -1;
    }
}
