using System.Text.RegularExpressions;
using LibraryVision.Net.Contracts;
using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Infrastructure.Parsing;

public sealed class HeuristicBookParser : ITextParser
{
    private static readonly Regex IsbnPattern =
        new(@"(97[89][-\s]?)?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?[\dxX]", RegexOptions.Compiled);

    private static readonly Regex[] AuthorPatterns =
    {
        new(@"^by (?<name>.+)$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^yazar[:\s]+(?<name>.+)$", RegexOptions.IgnoreCase | RegexOptions.Compiled)
    };

    private static readonly Regex[] PublisherPatterns =
    {
        new(@"publisher[:\s]+(?<name>.+)$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"yayınevi[:\s]+(?<name>.+)$", RegexOptions.IgnoreCase | RegexOptions.Compiled)
    };

    public IReadOnlyList<BookRecord> Parse(IReadOnlyList<TextBlock> blocks, FileInfo source)
    {
        var lines = Normalize(blocks);
        if (lines.Count == 0)
        {
            return new[]
            {
                new BookRecord(source.Name, null, null, null, source, string.Empty)
            };
        }

        var groups = SplitGroups(lines);
        if (groups.Count == 0)
        {
            groups.Add(lines);
        }

        var records = new List<BookRecord>();
        foreach (var group in groups)
        {
            var blob = string.Join(Environment.NewLine, group);
            var record = new BookRecord(
                group.First(),
                GuessAuthor(group),
                GuessPublisher(group),
                GuessIsbn(blob),
                source,
                blob);
            records.Add(record);
        }

        if (records.Count == 0)
        {
            var blob = string.Join(Environment.NewLine, lines);
            records.Add(new BookRecord(lines[0], null, null, GuessIsbn(blob), source, blob));
        }

        return records;
    }

    private static List<string> Normalize(IReadOnlyList<TextBlock> blocks)
    {
        var list = new List<string>();
        foreach (var block in blocks)
        {
            foreach (var segment in block.Content.Split('\n', '\r'))
            {
                var clean = segment.Trim();
                if (!string.IsNullOrEmpty(clean))
                {
                    list.Add(clean);
                }
            }
        }

        return list;
    }

    private static List<List<string>> SplitGroups(IReadOnlyList<string> lines)
    {
        var groups = new List<List<string>> { new() };
        foreach (var line in lines)
        {
            if (IsSeparator(line))
            {
                groups.Add(new List<string>());
                continue;
            }

            groups[^1].Add(line);
        }

        return groups.Where(group => group.Count > 0).ToList();
    }

    private static bool IsSeparator(string line) => line.Length < 3 && !line.Any(char.IsLetterOrDigit);

    private static string? GuessAuthor(IEnumerable<string> lines)
    {
        foreach (var line in lines.Take(4))
        {
            foreach (var pattern in AuthorPatterns)
            {
                var match = pattern.Match(line);
                if (match.Success)
                {
                    return match.Groups["name"].Value.Trim();
                }
            }
        }

        return null;
    }

    private static string? GuessPublisher(IEnumerable<string> lines)
    {
        foreach (var line in lines)
        {
            foreach (var pattern in PublisherPatterns)
            {
                var match = pattern.Match(line);
                if (match.Success)
                {
                    return match.Groups["name"].Value.Trim();
                }
            }
        }

        return null;
    }

    private static string? GuessIsbn(string blob)
    {
        var flattened = blob.Replace(" ", string.Empty, StringComparison.Ordinal);
        var match = IsbnPattern.Match(flattened);
        return match.Success ? match.Value : null;
    }
}
