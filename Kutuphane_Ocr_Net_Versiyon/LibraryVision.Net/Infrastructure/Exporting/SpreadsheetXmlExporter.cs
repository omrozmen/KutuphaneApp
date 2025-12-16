using System.Text;
using System.Xml;
using LibraryVision.Net.Contracts;
using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Infrastructure.Exporting;

public sealed class SpreadsheetXmlExporter : IBookExporter
{
    private readonly DirectoryInfo _outputDirectory;

    public SpreadsheetXmlExporter(DirectoryInfo outputDirectory)
    {
        _outputDirectory = outputDirectory;
    }

    public DirectoryInfo Export(IEnumerable<BookRecord> records)
    {
        _outputDirectory.Create();
        foreach (var group in records.GroupBy(record => record.SourceImage.FullName))
        {
            var safeName = MakeSafeFileName(Path.GetFileNameWithoutExtension(group.Key));
            var filePath = Path.Combine(_outputDirectory.FullName, $"{safeName}.xml");
            var xml = BuildWorkbookXml(group.ToList());
            File.WriteAllText(filePath, xml, Encoding.UTF8);
        }

        return _outputDirectory;
    }

    private static string BuildWorkbookXml(IReadOnlyList<BookRecord> records)
    {
        var settings = new XmlWriterSettings
        {
            Encoding = Encoding.UTF8,
            Indent = true,
            OmitXmlDeclaration = false
        };

        using var stringWriter = new StringWriter();
        using (var writer = XmlWriter.Create(stringWriter, settings))
        {
            writer.WriteStartElement("Workbook", "urn:schemas-microsoft-com:office:spreadsheet");
            writer.WriteAttributeString("xmlns", "o", null, "urn:schemas-microsoft-com:office:office");
            writer.WriteAttributeString("xmlns", "x", null, "urn:schemas-microsoft-com:office:excel");
            writer.WriteAttributeString("xmlns", "ss", null, "urn:schemas-microsoft-com:office:spreadsheet");

            writer.WriteStartElement("Worksheet");
            writer.WriteAttributeString("ss", "Name", null, "Books");
            writer.WriteStartElement("Table");

            WriteRow(writer, "Title", "Author", "Publisher", "ISBN", "Source Image", "Raw Text");
            foreach (var record in records)
            {
                WriteRow(
                    writer,
                    record.Title,
                    record.Author ?? string.Empty,
                    record.Publisher ?? string.Empty,
                    record.Isbn ?? string.Empty,
                    record.SourceImage.FullName,
                    record.RawText);
            }

            writer.WriteEndElement(); // Table
            writer.WriteEndElement(); // Worksheet
            writer.WriteEndElement(); // Workbook
        }

        return stringWriter.ToString();
    }

    private static void WriteRow(XmlWriter writer, params string[] cells)
    {
        writer.WriteStartElement("Row");
        foreach (var cell in cells)
        {
            writer.WriteStartElement("Cell");
            writer.WriteStartElement("Data");
            writer.WriteAttributeString("ss", "Type", null, "String");
            writer.WriteString(cell);
            writer.WriteEndElement(); // Data
            writer.WriteEndElement(); // Cell
        }

        writer.WriteEndElement(); // Row
    }

    private static string MakeSafeFileName(string input)
    {
        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            input = input.Replace(invalid, '_');
        }

        return string.IsNullOrWhiteSpace(input) ? "image" : input;
    }
}
