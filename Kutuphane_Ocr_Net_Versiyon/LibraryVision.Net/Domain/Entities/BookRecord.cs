using System.IO;

namespace LibraryVision.Net.Domain.Entities;

public sealed record BookRecord(
    string Title,
    string? Author,
    string? Publisher,
    string? Isbn,
    FileInfo SourceImage,
    string RawText);
