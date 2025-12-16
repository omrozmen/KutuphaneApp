namespace LibraryVision.Net;

internal sealed class AppOptions
{
    private AppOptions(DirectoryInfo inputDirectory, DirectoryInfo outputDirectory, string languageTag)
    {
        InputDirectory = inputDirectory;
        OutputDirectory = outputDirectory;
        LanguageTag = NormalizeLanguage(languageTag);
    }

    public DirectoryInfo InputDirectory { get; }
    public DirectoryInfo OutputDirectory { get; }
    public string LanguageTag { get; }

    public static AppOptions Parse(string[] args)
    {
        var values = Tokenize(args);

        var inputPath = values.TryGetValue("input-dir", out var input) ? input : Path.Combine(Environment.CurrentDirectory, "Goruntuler");
        var outputPath = values.TryGetValue("output-dir", out var output) ? output : Path.Combine(Environment.CurrentDirectory, "output");
        var language = values.TryGetValue("lang", out var lang) ? lang : "tr-TR";

        return new AppOptions(new DirectoryInfo(inputPath), new DirectoryInfo(outputPath), language);
    }

    private static Dictionary<string, string> Tokenize(string[] args)
    {
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < args.Length; i++)
        {
            if (!args[i].StartsWith("--", StringComparison.Ordinal))
            {
                continue;
            }

            var key = args[i][2..];
            if (i + 1 < args.Length && !args[i + 1].StartsWith("--", StringComparison.Ordinal))
            {
                dict[key] = args[++i];
            }
            else
            {
                dict[key] = "true";
            }
        }

        return dict;
    }

    private static string NormalizeLanguage(string tag)
    {
        var lowered = tag.ToLowerInvariant();
        return lowered switch
        {
            "tur" or "tr" or "tr-tr" => "tr-TR",
            "eng" or "en" or "en-us" => "en-US",
            _ => tag
        };
    }
}
