using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace Kutuphane.Infrastructure.Files.Directories;

public sealed record personelRecord(string Username, string Password, string Name);

/// <summary>
/// Reads personel account definitions from CSV files.
/// </summary>
public sealed class personelDirectory
{
    private readonly string _filePath;

    public personelDirectory(string filePath)
    {
        _filePath = filePath;
    }

    public IReadOnlyList<personelRecord> ListRecords()
    {
        if (!File.Exists(_filePath))
        {
            return Array.Empty<personelRecord>();
        }

        var lines = File.ReadAllLines(_filePath, Encoding.UTF8);
        if (lines.Length == 0)
        {
            return Array.Empty<personelRecord>();
        }

        var header = CsvLineParser.Split(lines[0]).Select(h => h.Trim().ToLowerInvariant()).ToArray();
        // Türkçe ve İngilizce header'ları destekle
        var usernameIndex = FindColumnIndex(header, "username", "kullanici_adi", "kullanıcı adı");
        var passwordIndex = FindColumnIndex(header, "password", "sifre", "şifre");
        var nameIndex = FindColumnIndex(header, "name", "ad");
        if (usernameIndex < 0 || passwordIndex < 0 || nameIndex < 0)
        {
            return Array.Empty<personelRecord>();
        }

        var records = new List<personelRecord>();
        for (var i = 1; i < lines.Length; i++)
        {
            var columns = CsvLineParser.Split(lines[i]);
            if (columns.Length <= Math.Max(usernameIndex, Math.Max(passwordIndex, nameIndex)))
            {
                continue;
            }

            var username = columns[usernameIndex].Trim();
            var password = columns[passwordIndex].Trim();
            var name = columns[nameIndex].Trim();
            if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password) || string.IsNullOrEmpty(name))
            {
                continue;
            }

            records.Add(new personelRecord(username, password, name));
        }

        return records;
    }

    /// <summary>
    /// Append new personel records to CSV file, skipping duplicates based on all columns
    /// </summary>
    public void AppendRecords(IEnumerable<personelRecord> newRecords)
    {
        var recordsList = newRecords.ToList();
        if (recordsList.Count == 0)
        {
            return;
        }

        var fileExists = File.Exists(_filePath);
        var existingRecords = new HashSet<personelRecord>();
        var hasHeader = false;

        if (fileExists)
        {
            try
            {
                var existingLines = File.ReadAllLines(_filePath, Encoding.UTF8);
                
                if (existingLines.Length > 0)
                {
                    var firstLine = existingLines[0].Trim().ToLowerInvariant();
                    hasHeader = firstLine.Contains("username") && firstLine.Contains("password") && firstLine.Contains("name");
                    
                    int startIndex = hasHeader ? 1 : 0;
                    
                    for (int i = startIndex; i < existingLines.Length; i++)
                    {
                        var line = existingLines[i].Trim();
                        if (string.IsNullOrWhiteSpace(line))
                            continue;
                        
                        var columns = CsvLineParser.Split(line);
                        if (columns.Length >= 3)
                        {
                            var username = columns[0].Trim();
                            var password = columns.Length > 1 ? columns[1].Trim() : "";
                            var name = columns.Length > 2 ? columns[2].Trim() : "";
                            
                            if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password) && !string.IsNullOrWhiteSpace(name))
                            {
                                existingRecords.Add(new personelRecord(username, password, name));
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
            .Where(r => !string.IsNullOrWhiteSpace(r.Username) && !string.IsNullOrWhiteSpace(r.Password) && !string.IsNullOrWhiteSpace(r.Name))
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
                writer.WriteLine("username,password,name");
                writer.Flush();
            }

            foreach (var record in toAdd)
            {
                var line = $"{EscapeCsvField(record.Username)},{EscapeCsvField(record.Password)},{EscapeCsvField(record.Name)}";
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
