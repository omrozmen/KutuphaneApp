using LibraryVision.Net.Contracts;
using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Infrastructure.ImageRepository;

public sealed class DirectoryImageRepository : IImageRepository
{
    private static readonly string[] DefaultSuffixes = { ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".heic", ".heif" };

    private readonly DirectoryInfo _root;
    private readonly HashSet<string> _allowedSuffixes;

    public DirectoryImageRepository(DirectoryInfo root, IEnumerable<string>? allowedSuffixes = null)
    {
        _root = root;
        _allowedSuffixes = new HashSet<string>((allowedSuffixes ?? DefaultSuffixes).Select(s => s.ToLowerInvariant()));
    }

    public IEnumerable<ImageAsset> ListImages()
    {
        if (!_root.Exists)
        {
            yield break;
        }

        foreach (var file in _root.EnumerateFiles("*", SearchOption.AllDirectories))
        {
            if (!_allowedSuffixes.Contains(file.Extension.ToLowerInvariant()))
            {
                continue;
            }

            var (bytes, mime) = LoadFileBytes(file);
            yield return new ImageAsset(file, bytes, mime);
        }
    }

    private (byte[] Bytes, string MimeType) LoadFileBytes(FileInfo file)
    {
        if (IsHeic(file))
        {
            var pngBytes = HeicConverter.ConvertToPng(file.FullName);
            return (pngBytes, "image/png");
        }

        return (File.ReadAllBytes(file.FullName), GuessMimeType(file));
    }

    private static bool IsHeic(FileInfo file) => file.Extension.Equals(".heic", StringComparison.OrdinalIgnoreCase) || file.Extension.Equals(".heif", StringComparison.OrdinalIgnoreCase);

    private static string GuessMimeType(FileInfo file) =>
        file.Extension.ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".bmp" => "image/bmp",
            ".tif" or ".tiff" => "image/tiff",
            ".webp" => "image/webp",
            _ => "image/jpeg",
        };
}
