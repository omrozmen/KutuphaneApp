using LibraryVision.Net;
using LibraryVision.Net.Application;
using LibraryVision.Net.Contracts;
using LibraryVision.Net.Infrastructure.Exporting;
using LibraryVision.Net.Infrastructure.ImageRepository;
using LibraryVision.Net.Infrastructure.Ocr;
using LibraryVision.Net.Infrastructure.Parsing;
using LibraryVision.Net.Infrastructure.Preprocessing;

var options = AppOptions.Parse(args);

Console.WriteLine("Girdi klasörü  : " + options.InputDirectory.FullName);
Console.WriteLine("Çıktı klasörü  : " + options.OutputDirectory.FullName);
Console.WriteLine("Dil paketi     : " + options.LanguageTag);

IImageRepository repository = new DirectoryImageRepository(options.InputDirectory);
IImagePreprocessor preprocessor = new GdiPreprocessor();
using IOcrService ocrService = new WindowsOcrService(options.LanguageTag);
ITextParser parser = new HeuristicBookParser();
IBookExporter exporter = new SpreadsheetXmlExporter(options.OutputDirectory);

var pipeline = new ImageProcessingPipeline(repository, preprocessor, ocrService, parser, exporter);
var report = pipeline.Run();

Console.WriteLine($"Toplam {report.ProcessedImages} görsel işlendi, {report.ExportedRecords} kayıt oluşturuldu.");
Console.WriteLine("Excel çıktıları: " + report.OutputDirectory);
