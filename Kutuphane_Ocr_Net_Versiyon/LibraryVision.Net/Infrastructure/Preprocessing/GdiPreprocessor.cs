using System.Drawing;
using System.Drawing.Imaging;
using LibraryVision.Net.Contracts;
using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Infrastructure.Preprocessing;

public sealed class GdiPreprocessor : IImagePreprocessor
{
    public ImageAsset Transform(ImageAsset asset)
    {
        using var inputStream = new MemoryStream(asset.Bytes);
        using var bitmap = new Bitmap(inputStream);
        using var processed = ApplyPipeline(bitmap);
        using var output = new MemoryStream();
        processed.Save(output, ImageFormat.Png);
        return asset with { Bytes = output.ToArray(), MimeType = "image/png" };
    }

    private static Bitmap ApplyPipeline(Bitmap source)
    {
        var grayscale = ToGrayscale(source);
        var contrast = StretchContrast(grayscale);
        var sharpened = Sharpen(contrast);
        return sharpened;
    }

    private static Bitmap ToGrayscale(Bitmap source)
    {
        var result = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
        for (var y = 0; y < source.Height; y++)
        {
            for (var x = 0; x < source.Width; x++)
            {
                var pixel = source.GetPixel(x, y);
                var luminance = (int)(pixel.R * 0.299 + pixel.G * 0.587 + pixel.B * 0.114);
                var gray = Color.FromArgb(luminance, luminance, luminance);
                result.SetPixel(x, y, gray);
            }
        }

        return result;
    }

    private static Bitmap StretchContrast(Bitmap source)
    {
        var (min, max) = FindIntensityRange(source);
        if (max - min < 10)
        {
            return (Bitmap)source.Clone();
        }

        var result = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
        for (var y = 0; y < source.Height; y++)
        {
            for (var x = 0; x < source.Width; x++)
            {
                var pixel = source.GetPixel(x, y);
                var stretched = (pixel.R - min) * 255 / (max - min);
                stretched = Math.Clamp(stretched, 0, 255);
                var gray = Color.FromArgb(stretched, stretched, stretched);
                result.SetPixel(x, y, gray);
            }
        }

        return result;
    }

    private static (int Min, int Max) FindIntensityRange(Bitmap bitmap)
    {
        var min = 255;
        var max = 0;
        for (var y = 0; y < bitmap.Height; y++)
        {
            for (var x = 0; x < bitmap.Width; x++)
            {
                var value = bitmap.GetPixel(x, y).R;
                min = Math.Min(min, value);
                max = Math.Max(max, value);
            }
        }

        return (min, max);
    }

    private static Bitmap Sharpen(Bitmap source)
    {
        var kernel = new[,]
        {
            { 0, -1, 0 },
            { -1, 5, -1 },
            { 0, -1, 0 }
        };

        var result = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
        for (var y = 1; y < source.Height - 1; y++)
        {
            for (var x = 1; x < source.Width - 1; x++)
            {
                var sum = 0;
                for (var ky = -1; ky <= 1; ky++)
                {
                    for (var kx = -1; kx <= 1; kx++)
                    {
                        var weight = kernel[ky + 1, kx + 1];
                        var intensity = source.GetPixel(x + kx, y + ky).R;
                        sum += weight * intensity;
                    }
                }

                sum = Math.Clamp(sum, 0, 255);
                result.SetPixel(x, y, Color.FromArgb(sum, sum, sum));
            }
        }

        return result;
    }
}
