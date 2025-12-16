using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Contracts;

public interface IImageRepository
{
    IEnumerable<ImageAsset> ListImages();
}
