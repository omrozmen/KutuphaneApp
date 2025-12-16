using System;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/system-settings")]
public class SystemSettingsController : ControllerBase
{
    private readonly string _settingsPath;
    private const int DefaultMaxBorrowLimit = 5;
    private const int DefaultMaxPenaltyPoints = 100;

    public SystemSettingsController()
    {
        var storageDir = Path.Combine(Directory.GetCurrentDirectory(), "storage");
        if (!Directory.Exists(storageDir))
        {
            Directory.CreateDirectory(storageDir);
        }
        _settingsPath = Path.Combine(storageDir, "system-settings.json");
    }

    [HttpGet]
    public async Task<ActionResult<SystemSettingsResponse>> GetSettings(CancellationToken cancellationToken)
    {
        try
        {
            SystemSettings settings;
            if (System.IO.File.Exists(_settingsPath))
            {
                var json = await System.IO.File.ReadAllTextAsync(_settingsPath, cancellationToken);
                settings = JsonSerializer.Deserialize<SystemSettings>(json) ?? new SystemSettings();
            }
            else
            {
                settings = new SystemSettings
                {
                    MaxBorrowLimit = DefaultMaxBorrowLimit,
                    MaxPenaltyPoints = DefaultMaxPenaltyPoints
                };
                await SaveSettings(settings, cancellationToken);
            }

            return Ok(new SystemSettingsResponse
            {
                MaxBorrowLimit = settings.MaxBorrowLimit,
                MaxPenaltyPoints = settings.MaxPenaltyPoints
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Ayarlar yüklenemedi: {ex.Message}" });
        }
    }

    [HttpPut]
    public async Task<ActionResult> UpdateSettings([FromBody] UpdateSystemSettingsRequest request, CancellationToken cancellationToken)
    {
        try
        {
            if (request.MaxBorrowLimit < 1)
            {
                return BadRequest(new { message = "Kitap alma sınırı en az 1 olmalıdır" });
            }

            if (request.MaxPenaltyPoints < 1)
            {
                return BadRequest(new { message = "Ceza puanı sınırı en az 1 olmalıdır" });
            }

            var settings = new SystemSettings
            {
                MaxBorrowLimit = request.MaxBorrowLimit,
                MaxPenaltyPoints = request.MaxPenaltyPoints
            };

            await SaveSettings(settings, cancellationToken);

            return Ok(new { message = "Ayarlar başarıyla güncellendi" });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = $"Ayarlar güncellenemedi: {ex.Message}" });
        }
    }

    private async Task SaveSettings(SystemSettings settings, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
        await System.IO.File.WriteAllTextAsync(_settingsPath, json, cancellationToken);
    }
}

public class SystemSettings
{
    public int MaxBorrowLimit { get; set; } = 5;
    public int MaxPenaltyPoints { get; set; } = 100;
}

public class SystemSettingsResponse
{
    public int MaxBorrowLimit { get; set; }
    public int MaxPenaltyPoints { get; set; }
}

public class UpdateSystemSettingsRequest
{
    public int MaxBorrowLimit { get; set; }
    public int MaxPenaltyPoints { get; set; }
}
