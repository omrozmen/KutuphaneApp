using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace Kutuphane.Infrastructure.Files.Directories;

public sealed record StudentRecord(
    string Name,
    string Surname,
    int? Class = null,
    string? Branch = null,
    int? StudentNumber = null,
    int PenaltyPoints = 0);

/// <summary>
/// Reads student records from CSV files exported from Excel.
/// </summary>
public sealed class StudentDirectory
{
    private readonly string _filePath;

    public StudentDirectory(string filePath)
    {
        _filePath = filePath;
    }

    public IReadOnlyList<StudentRecord> ListRecords()
    {
        if (!File.Exists(_filePath))
        {
            return Array.Empty<StudentRecord>();
        }

        var lines = File.ReadAllLines(_filePath, Encoding.UTF8);
        if (lines.Length == 0)
        {
            return Array.Empty<StudentRecord>();
        }

        var header = CsvLineParser.Split(lines[0]).Select(h => h.Trim().ToLowerInvariant()).ToArray();
        // Türkçe ve İngilizce header'ları destekle - artık username/password yok
        var hasStructuredColumns = (header.Contains("name") || header.Contains("ad") || header.Contains("ad"))
            && (header.Contains("surname") || header.Contains("soyad") || header.Contains("soyad"));

        if (!hasStructuredColumns)
        {
            // fallback to simple single-column sheet - ad ve soyadı ayır
            return lines
                .Select(line => line.Trim())
                .Where(line => !string.IsNullOrWhiteSpace(line) && !string.Equals(line, "ogrenci", StringComparison.OrdinalIgnoreCase))
                .Select(value =>
                {
                    var parts = value.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    var name = parts.Length > 0 ? parts[0] : value;
                    var surname = parts.Length > 1 ? string.Join(" ", parts.Skip(1)) : "";
                    return new StudentRecord(name, surname, null, null, null, 0);
                })
                .ToArray();
        }

        var nameIndex = FindColumnIndex(header, "name", "ad", "ad");
        var surnameIndex = FindColumnIndex(header, "surname", "soyad", "soyad");
        var classIndex = FindColumnIndex(header, "sinif", "class");
        var branchIndex = FindColumnIndex(header, "sube", "branch");
        var numaraIndex = FindColumnIndex(header, "numara", "studentnumber");
        var penaltyIndex = FindColumnIndex(header, "ceza_puani", "penaltypoints");
        
        var records = new List<StudentRecord>();
        for (var i = 1; i < lines.Length; i++)
        {
            var columns = CsvLineParser.Split(lines[i]);
            if (nameIndex < 0 || nameIndex >= columns.Length)
            {
                continue;
            }

            var name = columns[nameIndex].Trim();
            var surname = surnameIndex >= 0 && surnameIndex < columns.Length ? columns[surnameIndex].Trim() : "";
            if (string.IsNullOrEmpty(name))
            {
                continue;
            }

            int? classValue = null;
            if (classIndex >= 0 && classIndex < columns.Length && int.TryParse(columns[classIndex].Trim(), out var parsedClass))
            {
                classValue = parsedClass;
            }

            string? branch = null;
            if (branchIndex >= 0 && branchIndex < columns.Length)
            {
                branch = columns[branchIndex].Trim();
                if (string.IsNullOrWhiteSpace(branch))
                {
                    branch = null;
                }
            }

            int? studentNumber = null;
            if (numaraIndex >= 0 && numaraIndex < columns.Length && int.TryParse(columns[numaraIndex].Trim(), out var parsedNumara))
            {
                studentNumber = parsedNumara;
            }

            int penaltyPoints = 0;
            if (penaltyIndex >= 0 && penaltyIndex < columns.Length && int.TryParse(columns[penaltyIndex].Trim(), out var parsedPenalty))
            {
                penaltyPoints = parsedPenalty;
            }

            records.Add(new StudentRecord(name, surname, classValue, branch, studentNumber, penaltyPoints));
        }

        return records;
    }

    public IReadOnlyList<string> ListNames() => ListRecords().Select(record => $"{record.Name} {record.Surname}".Trim()).ToArray();

    /// <summary>
    /// Append new student records to CSV file, skipping duplicates based on all columns
    /// </summary>
    public void AppendRecords(IEnumerable<StudentRecord> newRecords)
    {
        var recordsList = newRecords.ToList();
        if (recordsList.Count == 0)
        {
            return;
        }

        var fileExists = File.Exists(_filePath);
        var existingRecords = new HashSet<StudentRecord>();
        var hasHeader = false;

        if (fileExists)
        {
            try
            {
                var existingLines = File.ReadAllLines(_filePath, Encoding.UTF8);
                
                if (existingLines.Length > 0)
                {
                    var firstLine = existingLines[0].Trim().ToLowerInvariant();
                    hasHeader = (firstLine.Contains("name") || firstLine.Contains("ad")) && 
                                (firstLine.Contains("surname") || firstLine.Contains("soyad"));
                    
                    int startIndex = hasHeader ? 1 : 0;
                    
                    for (int i = startIndex; i < existingLines.Length; i++)
                    {
                        var line = existingLines[i].Trim();
                        if (string.IsNullOrWhiteSpace(line))
                            continue;
                        
                        var columns = CsvLineParser.Split(line);
                        if (columns.Length >= 1)
                        {
                            var name = columns[0].Trim();
                            var surname = columns.Length > 1 ? columns[1].Trim() : "";
                            
                            if (!string.IsNullOrWhiteSpace(name))
                            {
                                int? classValue = null;
                                string? branch = null;
                                int? studentNumber = null;
                                
                                if (columns.Length > 2 && int.TryParse(columns[2].Trim(), out var parsedClass))
                                {
                                    classValue = parsedClass;
                                }
                                if (columns.Length > 3)
                                {
                                    branch = columns[3].Trim();
                                    if (string.IsNullOrWhiteSpace(branch))
                                        branch = null;
                                }
                                if (columns.Length > 4 && int.TryParse(columns[4].Trim(), out var parsedNumara))
                                {
                                    studentNumber = parsedNumara;
                                }
                                
                                int penaltyPoints = 0;
                                if (columns.Length > 5 && int.TryParse(columns[5].Trim(), out var parsedPenalty))
                                {
                                    penaltyPoints = parsedPenalty;
                                }
                                
                                existingRecords.Add(new StudentRecord(name, surname, classValue, branch, studentNumber, penaltyPoints));
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

        // Filter duplicates - check all columns
        var toAdd = recordsList
            .Where(r => !string.IsNullOrWhiteSpace(r.Name))
            .Where(r => !existingRecords.Contains(r))
            .ToList();
        
        if (toAdd.Count == 0)
        {
            return;
        }

        StreamWriter? writer = null;
        try
        {
            writer = new StreamWriter(_filePath, append: true, encoding: new UTF8Encoding(false));
            
            if (!fileExists || !hasHeader)
            {
                writer.WriteLine("ad,soyad,sinif,sube,numara,ceza_puani");
                writer.Flush();
            }

            foreach (var record in toAdd)
            {
                var sinif = record.Class?.ToString() ?? "";
                var sube = record.Branch ?? "";
                var numara = record.StudentNumber?.ToString() ?? "";
                var cezaPuan = record.PenaltyPoints.ToString();
                var line = $"{EscapeCsvField(record.Name)},{EscapeCsvField(record.Surname)},{sinif},{sube},{numara},{cezaPuan}";
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

    /// <summary>
    /// Updates student records in CSV file
    /// </summary>
    public void UpdateRecords(IEnumerable<StudentRecord> updatedRecords)
    {
        var updatedList = updatedRecords.ToList();
        if (updatedList.Count == 0)
        {
            return;
        }

        var allRecords = ListRecords().ToList();
        var updatedSet = updatedList.ToHashSet();

        // Mevcut kayıtları güncelle
        for (int i = 0; i < allRecords.Count; i++)
        {
            var existing = allRecords[i];
            var updated = updatedSet.FirstOrDefault(u => u.Name == existing.Name && u.Surname == existing.Surname);
            if (updated != null)
            {
                allRecords[i] = updated;
            }
        }

        // CSV dosyasını yeniden yaz
        StreamWriter? writer = null;
        try
        {
            writer = new StreamWriter(_filePath, append: false, encoding: new UTF8Encoding(false));
            writer.WriteLine("ad,soyad,sinif,sube,numara,ceza_puani");
            foreach (var record in allRecords)
            {
                var sinif = record.Class?.ToString() ?? "";
                var sube = record.Branch ?? "";
                var numara = record.StudentNumber?.ToString() ?? "";
                var cezaPuan = record.PenaltyPoints.ToString();
                var line = $"{EscapeCsvField(record.Name)},{EscapeCsvField(record.Surname)},{sinif},{sube},{numara},{cezaPuan}";
                writer.WriteLine(line);
            }
            
            writer.Flush();
            writer.Close();
            writer = null;

            // Dosyanın başarıyla yazıldığını doğrula
            if (!File.Exists(_filePath))
            {
                throw new IOException($"CSV dosyası oluşturulamadı: {_filePath}");
            }
        }
        catch (Exception ex)
        {
            if (writer != null)
            {
                try
                {
                    writer.Flush();
                    writer.Close();
                }
                catch { }
            }
            throw new IOException($"CSV dosyasına yazma hatası: {_filePath}. Detay: {ex.Message}", ex);
        }
        finally
        {
            writer?.Dispose();
        }
    }

    /// <summary>
    /// Deletes student records from CSV file by name
    /// </summary>
    public void DeleteRecords(IEnumerable<string> studentNames)
    {
        var namesToDelete = studentNames.ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (namesToDelete.Count == 0)
        {
            return;
        }

        var allRecords = ListRecords().ToList();
        var remainingRecords = allRecords.Where(r => !namesToDelete.Contains($"{r.Name} {r.Surname}".Trim()) && !namesToDelete.Contains(r.Name)).ToList();

        // CSV dosyasını yeniden yaz - ceza_puani sütununu da dahil et
        StreamWriter? writer = null;
        try
        {
            writer = new StreamWriter(_filePath, append: false, encoding: new UTF8Encoding(false));
            writer.WriteLine("ad,soyad,sinif,sube,numara,ceza_puani");
            foreach (var record in remainingRecords)
            {
                var sinif = record.Class?.ToString() ?? "";
                var sube = record.Branch ?? "";
                var numara = record.StudentNumber?.ToString() ?? "";
                var cezaPuan = record.PenaltyPoints.ToString();
                var line = $"{EscapeCsvField(record.Name)},{EscapeCsvField(record.Surname)},{sinif},{sube},{numara},{cezaPuan}";
                writer.WriteLine(line);
            }
            
            writer.Flush();
            writer.Close();
            writer = null;

            // Dosyanın başarıyla yazıldığını doğrula
            if (!File.Exists(_filePath))
            {
                throw new IOException($"CSV dosyası oluşturulamadı: {_filePath}");
            }
        }
        catch (Exception ex)
        {
            if (writer != null)
            {
                try
                {
                    writer.Flush();
                    writer.Close();
                }
                catch { }
            }
            throw new IOException($"CSV dosyasına yazma hatası: {_filePath}. Detay: {ex.Message}", ex);
        }
        finally
        {
            writer?.Dispose();
        }
    }

    /// <summary>
    /// Updates penalty points for a student by name
    /// </summary>
    public void UpdatePenaltyPoints(string studentName, int penaltyPoints)
    {
        var allRecords = ListRecords().ToList();
        var student = allRecords.FirstOrDefault(r => 
            r.Name.Equals(studentName, StringComparison.OrdinalIgnoreCase) ||
            $"{r.Name} {r.Surname}".Trim().Equals(studentName, StringComparison.OrdinalIgnoreCase));
        
        if (student == null)
        {
            return; // Student not found, skip
        }

        var updated = student with { PenaltyPoints = penaltyPoints };
        var updatedList = allRecords.Select(r => 
            (r.Name.Equals(studentName, StringComparison.OrdinalIgnoreCase) ||
             $"{r.Name} {r.Surname}".Trim().Equals(studentName, StringComparison.OrdinalIgnoreCase)) ? updated : r).ToList();

        // CSV dosyasını yeniden yaz
        StreamWriter? writer = null;
        try
        {
            writer = new StreamWriter(_filePath, append: false, encoding: new UTF8Encoding(false));
            writer.WriteLine("ad,soyad,sinif,sube,numara,ceza_puani");
            foreach (var record in updatedList)
            {
                var sinif = record.Class?.ToString() ?? "";
                var sube = record.Branch ?? "";
                var numara = record.StudentNumber?.ToString() ?? "";
                var cezaPuan = record.PenaltyPoints.ToString();
                var line = $"{EscapeCsvField(record.Name)},{EscapeCsvField(record.Surname)},{sinif},{sube},{numara},{cezaPuan}";
                writer.WriteLine(line);
            }
            
            writer.Flush();
            writer.Close();
            writer = null;

            // Dosyanın başarıyla yazıldığını doğrula
            if (!File.Exists(_filePath))
            {
                throw new IOException($"CSV dosyası oluşturulamadı: {_filePath}");
            }
        }
        catch (Exception ex)
        {
            if (writer != null)
            {
                try
                {
                    writer.Flush();
                    writer.Close();
                }
                catch { }
            }
            throw new IOException($"CSV dosyasına yazma hatası: {_filePath}. Detay: {ex.Message}", ex);
        }
        finally
        {
            writer?.Dispose();
        }
    }

    /// <summary>
    /// Adds penalty points to a student by name
    /// </summary>
    public void AddPenaltyPoints(string studentName, int pointsToAdd)
    {
        var allRecords = ListRecords().ToList();
        var student = allRecords.FirstOrDefault(r => 
            r.Name.Equals(studentName, StringComparison.OrdinalIgnoreCase) ||
            $"{r.Name} {r.Surname}".Trim().Equals(studentName, StringComparison.OrdinalIgnoreCase));
        
        if (student == null)
        {
            return; // Student not found, skip
        }

        var newPenaltyPoints = student.PenaltyPoints + pointsToAdd;
        UpdatePenaltyPoints(studentName, newPenaltyPoints);
    }

    /// <summary>
    /// Updates penalty points to the maximum value (current or new)
    /// Only updates if new value is greater than current value
    /// </summary>
    public void UpdatePenaltyPointsToMax(string studentName, int newPenaltyPoints)
    {
        var allRecords = ListRecords().ToList();
        var student = allRecords.FirstOrDefault(r => 
            r.Name.Equals(studentName, StringComparison.OrdinalIgnoreCase) ||
            $"{r.Name} {r.Surname}".Trim().Equals(studentName, StringComparison.OrdinalIgnoreCase));
        
        if (student == null)
        {
            return; // Student not found, skip
        }

        // Sadece yeni değer mevcut değerden büyükse UPDATE yap
        if (newPenaltyPoints > student.PenaltyPoints)
        {
            UpdatePenaltyPoints(studentName, newPenaltyPoints);
        }
        // Eğer yeni değer mevcut değerden küçük veya eşitse, mevcut değeri koru
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
