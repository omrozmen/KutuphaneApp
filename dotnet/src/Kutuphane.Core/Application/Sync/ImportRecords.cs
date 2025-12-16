namespace Kutuphane.Core.Application.Sync;

public sealed record StudentImportRecord(string Username, string Password, string Name);

public sealed record personelImportRecord(string Username, string Password, string Name);

public sealed record BookImportRecord(string Title, string Author, string Category, int Quantity);
