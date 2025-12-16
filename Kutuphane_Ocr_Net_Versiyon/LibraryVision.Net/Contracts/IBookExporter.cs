using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Contracts;

public interface IBookExporter
{
    DirectoryInfo Export(IEnumerable<BookRecord> records);
}
