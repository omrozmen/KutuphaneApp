using System.IO;
using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Contracts;

public interface ITextParser
{
    IReadOnlyList<BookRecord> Parse(IReadOnlyList<TextBlock> blocks, FileInfo source);
}
