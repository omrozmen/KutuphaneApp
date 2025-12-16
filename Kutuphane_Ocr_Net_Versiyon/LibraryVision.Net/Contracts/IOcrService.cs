using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Contracts;

public interface IOcrService : IDisposable
{
    IReadOnlyList<TextBlock> Extract(ImageAsset asset);
}
