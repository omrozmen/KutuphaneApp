using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace Kutuphane.Infrastructure.Files.Directories;

public sealed record LogRecord(
    DateTime Timestamp,
    string Action, // "CSV_ADD", "CSV_OVERWRITE"
    string FilePath,
    string DataType, // "BOOKS", "STUDENTS", "LOANS", "ALL"
    string personelName,
    int RecordCount,
    string? Details = null);

/// <summary>
/// Manages log records in CSV format.
/// </summary>
public sealed class LogDirectory
{
    private readonly string _filePath;

    public LogDirectory(string filePath)
    {
        _filePath = filePath;
        EnsureFileExists();
    }

    private void EnsureFileExists()
    {
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        if (!File.Exists(_filePath))
        {
            var header = "timestamp,action,file_path,data_type,personel_name,record_count,details";
            File.WriteAllText(_filePath, header + Environment.NewLine, new UTF8Encoding(false));
        }
    }

    public void LogCsvAction(
        string action, // "CSV_ADD" veya "CSV_OVERWRITE"
        string filePath,
        string dataType, // "BOOKS", "STUDENTS", "LOANS", "ALL"
        string personelName,
        int recordCount,
        string? details = null)
    {
        var record = new LogRecord(
            DateTime.UtcNow,
            action,
            filePath,
            dataType,
            personelName,
            recordCount,
            details);

        AppendLog(record);
    }

    private void AppendLog(LogRecord record)
    {
        StreamWriter? writer = null;
        try
        {
            // Dosyanın var olduğundan emin ol
            EnsureFileExists();
            
            var line = $"{record.Timestamp:dd-MM-yyyy HH:mm:ss},{EscapeCsvField(record.Action)},{EscapeCsvField(record.FilePath)},{EscapeCsvField(record.DataType)},{EscapeCsvField(record.personelName)},{record.RecordCount},{EscapeCsvField(record.Details ?? "")}";
            
            writer = new StreamWriter(_filePath, append: true, encoding: new UTF8Encoding(false));
            writer.WriteLine(line);
            
            // Tüm verileri diske yaz
            writer.Flush();
            writer.Close();
            writer = null;
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

            // Log yazma hatası - sistem çalışmaya devam etmeli
            // Production'da burada bir logging servisine log gönderilebilir
            System.Diagnostics.Debug.WriteLine($"Log yazma hatası: {ex.Message}");
            // Hata fırlatma - log yazma başarısız olsa bile uygulama çalışmaya devam etmeli
        }
        finally
        {
            writer?.Dispose();
        }
    }

    public IReadOnlyList<LogRecord> ListRecords()
    {
        if (!File.Exists(_filePath))
        {
            return Array.Empty<LogRecord>();
        }

        var lines = File.ReadAllLines(_filePath, Encoding.UTF8);
        if (lines.Length <= 1)
        {
            return Array.Empty<LogRecord>();
        }

        var records = new List<LogRecord>();
        for (var i = 1; i < lines.Length; i++)
        {
            var columns = CsvLineParser.Split(lines[i]);
            if (columns.Length < 6)
            {
                continue;
            }

            if (columns.Length >= 6 && DateTime.TryParse(columns[0].Trim(), out var timestamp))
            {
                var action = columns[1].Trim();
                var filePath = columns[2].Trim();
                var dataType = columns[3].Trim();
                var personelName = columns[4].Trim();
                var recordCount = int.TryParse(columns[5].Trim(), out var count) ? count : 0;
                var details = columns.Length > 6 ? columns[6].Trim() : null;
                
                var record = new LogRecord(
                    timestamp,
                    action,
                    filePath,
                    dataType,
                    personelName,
                    recordCount,
                    details);
                records.Add(record);
            }
        }

        return records.OrderByDescending(r => r.Timestamp).ToList();
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
}



