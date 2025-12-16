using System;
using System.Collections.Generic;
using System.Text;

namespace Kutuphane.Infrastructure.Files.Directories;

internal static class CsvLineParser
{
    public static string[] Split(string line)
    {
        var result = new List<string>();
        if (line is null)
        {
            return Array.Empty<string>();
        }

        // remove UTF-8 BOM if present so column names match expected headers
        if (line.Length > 0 && line[0] == '\ufeff')
        {
            line = line.TrimStart('\ufeff');
        }

        var builder = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];
            if (ch == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    builder.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }

                continue;
            }

            if (ch == ',' && !inQuotes)
            {
                result.Add(builder.ToString());
                builder.Clear();
                continue;
            }

            builder.Append(ch);
        }

        result.Add(builder.ToString());
        return result.ToArray();
    }
}
