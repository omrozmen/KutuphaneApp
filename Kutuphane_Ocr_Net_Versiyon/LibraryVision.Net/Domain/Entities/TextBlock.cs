using System.Drawing;

namespace LibraryVision.Net.Domain.Entities;

public sealed record TextBlock(string Content, Rectangle? BoundingBox);
