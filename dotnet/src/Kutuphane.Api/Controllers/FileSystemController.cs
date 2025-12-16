using Microsoft.AspNetCore.Mvc;
using System.IO;
using System.Text.RegularExpressions;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/filesystem")]
public class FileSystemController : ControllerBase
{
    [HttpGet("browse")]
    public IActionResult BrowseDirectory([FromQuery] string? path = null)
    {
        try
        {
            // Eğer path verilmemişse, masaüstünü döndür
            if (string.IsNullOrWhiteSpace(path))
            {
                var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                return Ok(new BrowseResponse
                {
                    CurrentPath = desktopPath,
                    Items = GetDirectoryItems(desktopPath)
                });
            }

            // "Masaüstü" yolunu gerçek yola çevir
            var resolvedPath = ResolvePath(path);
            
            // Klasör yoksa oluştur
            if (!Directory.Exists(resolvedPath))
            {
                try
                {
                    Directory.CreateDirectory(resolvedPath);
                }
                catch (Exception ex)
                {
                    // Klasör oluşturulamazsa hata döndür
                    return BadRequest(new { message = $"Klasör oluşturulamadı: {ex.Message}" });
                }
            }

            return Ok(new BrowseResponse
            {
                CurrentPath = resolvedPath,
                Items = GetDirectoryItems(resolvedPath)
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("create-folder")]
    public IActionResult CreateFolder([FromBody] CreateFolderRequest request)
    {
        try
        {
            var resolvedPath = ResolvePath(request.ParentPath);
            
            if (!Directory.Exists(resolvedPath))
            {
                return NotFound(new { message = "Üst klasör bulunamadı" });
            }

            var newFolderPath = Path.Combine(resolvedPath, request.FolderName);
            
            if (Directory.Exists(newFolderPath))
            {
                return Conflict(new { message = "Klasör zaten mevcut" });
            }

            Directory.CreateDirectory(newFolderPath);

            return Ok(new { 
                success = true, 
                message = "Klasör oluşturuldu",
                path = newFolderPath
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("select-path")]
    public IActionResult SelectPath([FromBody] SelectPathRequest request)
    {
        try
        {
            var resolvedPath = ResolvePath(request.Path);
            
            // Klasörün var olup olmadığını kontrol et
            var directory = Path.GetDirectoryName(resolvedPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            return Ok(new { 
                success = true, 
                message = "Dosya yolu seçildi",
                path = resolvedPath
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private List<DirectoryItem> GetDirectoryItems(string path)
    {
        var items = new List<DirectoryItem>();

        try
        {
            // Klasörleri ekle
            var directories = Directory.GetDirectories(path);
            foreach (var dir in directories)
            {
                var dirInfo = new DirectoryInfo(dir);
                items.Add(new DirectoryItem
                {
                    Name = dirInfo.Name,
                    Path = dir,
                    Type = "directory",
                    LastModified = dirInfo.LastWriteTime.ToString("dd-MM-yyyy HH:mm:ss")
                });
            }

            // Dosyaları ekle
            var files = Directory.GetFiles(path);
            foreach (var file in files)
            {
                var fileInfo = new FileInfo(file);
                items.Add(new DirectoryItem
                {
                    Name = fileInfo.Name,
                    Path = file,
                    Type = "file",
                    Size = fileInfo.Length,
                    LastModified = fileInfo.LastWriteTime.ToString("dd-MM-yyyy HH:mm:ss")
                });
            }
        }
        catch
        {
            // Hata durumunda boş liste döndür
        }

        return items.OrderBy(i => i.Type == "directory" ? 0 : 1)
                    .ThenBy(i => i.Name)
                    .ToList();
    }

    private string ResolvePath(string path)
    {
        // "Masaüstü" yolunu gerçek yola çevir
        if (path.StartsWith("Masaüstü/", StringComparison.OrdinalIgnoreCase) || 
            path.StartsWith("Desktop/", StringComparison.OrdinalIgnoreCase))
        {
            var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            path = path.Replace("Masaüstü/", "").Replace("Desktop/", "");
            return Path.Combine(desktopPath, path);
        }

        // Eğer path zaten tam yol ise, olduğu gibi döndür
        if (Path.IsPathRooted(path))
        {
            return path;
        }

        // Göreceli yol ise, masaüstüne göre çözümle
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
        return Path.Combine(desktop, path);
    }

    public sealed record BrowseResponse
    {
        public string CurrentPath { get; init; } = string.Empty;
        public List<DirectoryItem> Items { get; init; } = new();
    }

    public sealed record DirectoryItem
    {
        public string Name { get; init; } = string.Empty;
        public string Path { get; init; } = string.Empty;
        public string Type { get; init; } = string.Empty; // "directory" veya "file"
        public long? Size { get; init; }
        public string LastModified { get; init; } = string.Empty;
    }

    public sealed record CreateFolderRequest(string ParentPath, string FolderName);

    public sealed record SelectPathRequest(string Path);

    [HttpPost("cleanup-old-folders")]
    public IActionResult CleanupOldFolders([FromBody] CleanupRequest? request = null)
    {
        try
        {
            var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            var kutuphaneAppPath = Path.Combine(desktopPath, "KütüphaneApp");
            
            if (!Directory.Exists(kutuphaneAppPath))
            {
                return Ok(new { 
                    success = true, 
                    message = "KütüphaneApp klasörü bulunamadı",
                    deletedCount = 0
                });
            }

            var deletedCount = 0;
            var cutoffDate = DateTime.Now.AddMonths(-1); // 1 ay öncesi
            
            // KütüphaneApp altındaki tüm kullanıcı klasörlerini kontrol et
            var userDirectories = Directory.GetDirectories(kutuphaneAppPath);
            
            foreach (var userDir in userDirectories)
            {
                var userDirInfo = new DirectoryInfo(userDir);
                
                // Kullanıcı klasörü altındaki tarih klasörlerini kontrol et
                var dateDirectories = Directory.GetDirectories(userDir);
                
                foreach (var dateDir in dateDirectories)
                {
                    var dateDirInfo = new DirectoryInfo(dateDir);
                    
                    // Klasör adı tarih formatında mı kontrol et (gg-aa-yyyy)
                    if (System.Text.RegularExpressions.Regex.IsMatch(dateDirInfo.Name, @"^\d{2}-\d{2}-\d{4}$"))
                    {
                        // Tarih klasörünün oluşturulma tarihini kontrol et
                        if (dateDirInfo.CreationTime < cutoffDate || dateDirInfo.LastWriteTime < cutoffDate)
                        {
                            try
                            {
                                Directory.Delete(dateDir, true); // Klasörü ve içeriğini sil
                                deletedCount++;
                            }
                            catch (Exception ex)
                            {
                                // Silme hatası - log'la ama devam et
                                System.Diagnostics.Debug.WriteLine($"Klasör silme hatası: {dateDir}, Hata: {ex.Message}");
                            }
                        }
                    }
                }
                
                // Eğer kullanıcı klasörü boşaldıysa, onu da sil
                if (Directory.GetDirectories(userDir).Length == 0 && Directory.GetFiles(userDir).Length == 0)
                {
                    try
                    {
                        Directory.Delete(userDir, true);
                    }
                    catch
                    {
                        // Hata durumunda devam et
                    }
                }
            }

            return Ok(new { 
                success = true, 
                message = $"{deletedCount} adet eski klasör silindi",
                deletedCount = deletedCount
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    public sealed record CleanupRequest(string? Username = null);

    [HttpPost("save-file-path")]
    public async Task<IActionResult> SaveFilePath([FromForm] IFormFile? file, [FromForm] string? suggestedPath = null)
    {
        try
        {
            if (file == null && string.IsNullOrWhiteSpace(suggestedPath))
            {
                return BadRequest(new { message = "Dosya veya yol gerekli" });
            }

            string finalPath;
            
            if (file != null)
            {
                // Dosya yüklendiyse, masaüstüne kaydet ve yolunu döndür
                var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                var fileName = file.FileName;
                var filePath = Path.Combine(desktopPath, "KütüphaneApp", fileName);
                
                // Klasörü oluştur
                var directory = Path.GetDirectoryName(filePath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }
                
                // Dosyayı kaydet
                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }
                
                // Masaüstü/KütüphaneApp formatında döndür
                finalPath = $"Masaüstü/KütüphaneApp/{fileName}";
            }
            else
            {
                // Sadece yol verildiyse, onu kullan
                finalPath = suggestedPath ?? "";
            }

            return Ok(new { 
                success = true, 
                message = "Dosya yolu kaydedildi",
                path = finalPath
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}

