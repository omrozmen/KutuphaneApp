using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace LibraryVision.Net.Infrastructure.ImageRepository;

internal static class HeicConverter
{
    public static byte[] ConvertToPng(string path) => ConvertToPngAsync(path).GetAwaiter().GetResult();

    private static async Task<byte[]> ConvertToPngAsync(string path)
    {
        using var sourceStream = File.OpenRead(path).AsInputStream();
        using var memoryStream = new InMemoryRandomAccessStream();
        await RandomAccessStream.CopyAsync(sourceStream, memoryStream);
        memoryStream.Seek(0);

        var decoder = await BitmapDecoder.CreateAsync(memoryStream);
        using var softwareBitmap = await decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied);

        using var output = new InMemoryRandomAccessStream();
        var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, output);
        encoder.SetSoftwareBitmap(softwareBitmap);
        await encoder.FlushAsync();

        var buffer = new byte[output.Size];
        output.Seek(0);
        await output.ReadAsync(buffer.AsBuffer(), (uint)output.Size, InputStreamOptions.None);
        return buffer;
    }
}
