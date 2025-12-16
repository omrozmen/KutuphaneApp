using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Kutuphane.Infrastructure.External.Services;

public sealed class GoogleBooksService
{
    private readonly HttpClient _httpClient;
    private const string BaseUrl = "https://www.googleapis.com/books/v1/volumes";

    public GoogleBooksService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<IReadOnlyList<GoogleBookResult>> SearchBooksAsync(
        string query,
        int maxResults = 40,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"{BaseUrl}?q={Uri.EscapeDataString(query)}&maxResults={maxResults}&langRestrict=tr";
            var response = await _httpClient.GetAsync(url, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
                throw new HttpRequestException($"Google Books API hatası: {response.StatusCode} - {errorContent}");
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            if (string.IsNullOrWhiteSpace(json))
            {
                return Array.Empty<GoogleBookResult>();
            }

            var data = JsonSerializer.Deserialize<GoogleBooksResponse>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (data?.Items == null || data.Items.Length == 0)
            {
                return Array.Empty<GoogleBookResult>();
            }

            var results = new List<GoogleBookResult>();

            foreach (var item in data.Items)
            {
                try
                {
                    var volumeInfo = item.VolumeInfo;
                    if (volumeInfo == null)
                    {
                        continue;
                    }

                    var title = volumeInfo.Title?.Trim() ?? "";
                    if (string.IsNullOrEmpty(title))
                    {
                        continue;
                    }

                    var authors = volumeInfo.Authors ?? Array.Empty<string>();
                    var author = authors.FirstOrDefault() ?? "Bilinmeyen Yazar";

                    // Türkçe kontrolü
                    if (!IsTurkish(title, author))
                    {
                        continue;
                    }

                    var category = DetermineCategory(volumeInfo.Categories);
                    var publisher = volumeInfo.Publisher ?? "Bilinmeyen Yayınevi";
                    var summary = volumeInfo.Description ?? $"{title} kitabı {category} türünde önemli bir eserdir.";
                    if (summary.Length > 500)
                    {
                        summary = summary.Substring(0, 500) + "...";
                    }

                    var year = 0;
                    if (!string.IsNullOrEmpty(volumeInfo.PublishedDate))
                    {
                        var yearPart = volumeInfo.PublishedDate.Split('-')[0];
                        if (int.TryParse(yearPart, out var parsedYear) && parsedYear >= 1800 && parsedYear <= 2024)
                        {
                            year = parsedYear;
                        }
                    }

                    results.Add(new GoogleBookResult
                    {
                        Title = title,
                        Author = author,
                        Category = category,
                        Publisher = publisher,
                        Summary = summary,
                        Year = year,
                        PageCount = volumeInfo.PageCount ?? 0,
                        Isbn = volumeInfo.IndustryIdentifiers?.FirstOrDefault()?.Identifier ?? ""
                    });
                }
                catch
                {
                    // Bu kitabı atla, devam et
                    continue;
                }
            }

            return results;
        }
        catch (HttpRequestException)
        {
            throw; // HTTP hatalarını yukarı fırlat
        }
        catch (Exception ex)
        {
            throw new Exception($"Google Books API çağrısı başarısız: {ex.Message}", ex);
        }
    }

    private static bool IsTurkish(string title, string author)
    {
        var turkishChars = "çğıöşüÇĞIİÖŞÜ";
        var hasTurkishChar = turkishChars.Any(c => title.Contains(c) || author.Contains(c));

        var turkishAuthors = new[]
        {
            "pamuk", "kemal", "şafak", "ümit", "kulin", "güntekin",
            "adıvar", "ali", "atay", "atılgan", "tanpınar", "ortaylı",
            "inalcık", "meriç", "nesin", "hikmet", "cüceloğlu", "livaneli",
            "menteş", "bıçakçı", "mağden", "kaygusuz", "anar", "uzuner",
            "altan", "tekin", "ağaoğlu", "uyar", "soysal", "genç",
            "toptaş", "ileri", "levi", "erdoğan", "mungan", "şengör",
            "kongar", "tekeli", "afyoncu", "baltaş", "kalkandelen",
            "gürsel", "batur", "müstecaplıoğlu", "süreya", "cansever"
        };

        var authorLower = author.ToLowerInvariant();
        var isTurkishAuthor = turkishAuthors.Any(a => authorLower.Contains(a));

        var foreignAuthors = new[]
        {
            "dostoyevski", "tolstoy", "kafka", "orwell", "steinbeck",
            "austen", "hugo", "flaubert", "tolkien", "rowling", "martin"
        };

        var isForeignAuthor = foreignAuthors.Any(a => authorLower.Contains(a));

        if (isForeignAuthor)
        {
            return false;
        }

        return hasTurkishChar || isTurkishAuthor;
    }

    private static string DetermineCategory(string[]? categories)
    {
        if (categories == null || categories.Length == 0)
        {
            return "Roman";
        }

        var catStr = string.Join(" ", categories).ToLowerInvariant();

        if (catStr.Contains("tarih") || catStr.Contains("history"))
        {
            return "Tarih";
        }
        if (catStr.Contains("felsefe") || catStr.Contains("philosophy") || catStr.Contains("psikoloji") || catStr.Contains("psychology"))
        {
            return "Psikoloji";
        }
        if (catStr.Contains("fantastik") || catStr.Contains("fantasy"))
        {
            return "Fantastik";
        }
        if (catStr.Contains("bilim kurgu") || catStr.Contains("science fiction") || catStr.Contains("sci-fi"))
        {
            return "Bilim Kurgu";
        }
        if (catStr.Contains("deneme") || catStr.Contains("essay"))
        {
            return "Deneme";
        }
        if (catStr.Contains("biyografi") || catStr.Contains("biography"))
        {
            return "Biyografi";
        }
        if (catStr.Contains("macera") || catStr.Contains("adventure"))
        {
            return "Macera";
        }
        if (catStr.Contains("şiir") || catStr.Contains("poetry") || catStr.Contains("poem"))
        {
            return "Şiir";
        }

        return "Roman";
    }

    private sealed class GoogleBooksResponse
    {
        public GoogleBookItem[]? Items { get; set; }
    }

    private sealed class GoogleBookItem
    {
        public VolumeInfo? VolumeInfo { get; set; }
    }

    private sealed class VolumeInfo
    {
        public string? Title { get; set; }
        public string[]? Authors { get; set; }
        public string[]? Categories { get; set; }
        public string? Publisher { get; set; }
        public string? Description { get; set; }
        public string? PublishedDate { get; set; }
        public int? PageCount { get; set; }
        public IndustryIdentifier[]? IndustryIdentifiers { get; set; }
    }

    private sealed class IndustryIdentifier
    {
        public string? Identifier { get; set; }
    }
}

public sealed class GoogleBookResult
{
    public string Title { get; set; } = "";
    public string Author { get; set; } = "";
    public string Category { get; set; } = "";
    public string Publisher { get; set; } = "";
    public string Summary { get; set; } = "";
    public int Year { get; set; }
    public int PageCount { get; set; }
    public string Isbn { get; set; } = "";
}







