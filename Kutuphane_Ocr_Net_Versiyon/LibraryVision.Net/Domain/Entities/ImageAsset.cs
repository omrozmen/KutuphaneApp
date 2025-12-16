using System.IO;

namespace LibraryVision.Net.Domain.Entities;

public sealed record ImageAsset(FileInfo SourceFile, byte[] Bytes, string MimeType);
