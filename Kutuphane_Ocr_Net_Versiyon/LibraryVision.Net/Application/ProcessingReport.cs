namespace LibraryVision.Net.Application;

public sealed record ProcessingReport(int ProcessedImages, int ExportedRecords, string OutputDirectory);
