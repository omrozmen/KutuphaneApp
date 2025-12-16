using LibraryVision.Net.Contracts;
using LibraryVision.Net.Domain.Entities;

namespace LibraryVision.Net.Application;

public sealed class ImageProcessingPipeline
{
    private readonly IImageRepository _repository;
    private readonly IImagePreprocessor _preprocessor;
    private readonly IOcrService _ocrService;
    private readonly ITextParser _parser;
    private readonly IBookExporter _exporter;

    public ImageProcessingPipeline(
        IImageRepository repository,
        IImagePreprocessor preprocessor,
        IOcrService ocrService,
        ITextParser parser,
        IBookExporter exporter)
    {
        _repository = repository;
        _preprocessor = preprocessor;
        _ocrService = ocrService;
        _parser = parser;
        _exporter = exporter;
    }

    public ProcessingReport Run()
    {
        var records = new List<BookRecord>();
        var processedImages = 0;

        foreach (var asset in _repository.ListImages())
        {
            processedImages++;
            var transformed = _preprocessor.Transform(asset);
            var blocks = _ocrService.Extract(transformed);
            var parsed = _parser.Parse(blocks, transformed.SourceFile);
            records.AddRange(parsed);
        }

        var outputDir = _exporter.Export(records).FullName;
        return new ProcessingReport(processedImages, records.Count, outputDir);
    }
}
