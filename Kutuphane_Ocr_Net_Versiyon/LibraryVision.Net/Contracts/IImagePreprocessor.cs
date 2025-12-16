using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Contracts;

public interface IImagePreprocessor
{
    ImageAsset Transform(ImageAsset asset);
}
