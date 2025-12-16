using System.Drawing;
using System.Runtime.InteropServices.WindowsRuntime;
using LibraryVision.Net.Contracts;
using LibraryVision.Net.Domain.Entities;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

namespace LibraryVision.Net.Infrastructure.Ocr;

public sealed class WindowsOcrService : IOcrService
{
    private readonly OcrEngine _engine;

    public WindowsOcrService(string languageTag)
    {
        var language = new Language(languageTag);
        _engine = OcrEngine.TryCreateFromLanguage(language) ?? OcrEngine.TryCreateFromUserProfileLanguages()
            ?? throw new InvalidOperationException("Windows OCR motoru başlatılamadı. İlgili dil paketinin yüklü olduğundan emin olun.");
    }

    public IReadOnlyList<TextBlock> Extract(ImageAsset asset) => ExtractInternalAsync(asset).GetAwaiter().GetResult();

    private async Task<IReadOnlyList<TextBlock>> ExtractInternalAsync(ImageAsset asset)
    {
        using var bitmap = await LoadSoftwareBitmapAsync(asset.Bytes);
        var result = await _engine.RecognizeAsync(bitmap);

        var blocks = new List<TextBlock>();
        foreach (var line in result.Lines)
        {
            var text = string.Join(" ", line.Words.Select(word => word.Text)).Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                continue;
            }

            var rect = ComputeBoundingRect(line.Words.Select(word => word.BoundingRect));
            blocks.Add(new TextBlock(text, rect));
        }

        if (blocks.Count == 0 && !string.IsNullOrWhiteSpace(result.Text))
        {
            blocks.Add(new TextBlock(result.Text.Trim(), null));
        }

        return blocks;
    }

    private static Rectangle? ComputeBoundingRect(IEnumerable<Windows.Foundation.Rect> rects)
    {
        var enumerable = rects.ToList();
        if (enumerable.Count == 0)
        {
            return null;
        }

        var left = enumerable.Min(r => r.X);
        var top = enumerable.Min(r => r.Y);
        var right = enumerable.Max(r => r.X + r.Width);
        var bottom = enumerable.Max(r => r.Y + r.Height);

        return new Rectangle((int)Math.Floor(left), (int)Math.Floor(top), (int)Math.Ceiling(right - left), (int)Math.Ceiling(bottom - top));
    }

    private static async Task<SoftwareBitmap> LoadSoftwareBitmapAsync(byte[] data)
    {
        using var stream = new InMemoryRandomAccessStream();
        await stream.WriteAsync(data.AsBuffer());
        stream.Seek(0);
        var decoder = await BitmapDecoder.CreateAsync(stream);
        return await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);
    }

    public void Dispose()
    {
        // Windows OCR engine does not implement IDisposable; nothing to dispose.
    }
}
