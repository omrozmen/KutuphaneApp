using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Application.BookCatalog;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/record-types")]
public partial class RecordTypesController : ControllerBase
{
    private readonly string _userSettingsPath;
    private readonly BookCatalogService _bookCatalog;
    private readonly KutuphaneDbContext _context;
    private readonly string _logFilePath;
    private static readonly object _logLock = new object();

    private void LogToFile(string message)
    {
        try
        {
            lock (_logLock)
            {
                var logEntry = $"[{DateTime.Now:dd.MM.yyyy HH:mm:ss}] {message}{Environment.NewLine}";
                System.IO.File.AppendAllText(_logFilePath, logEntry);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Loglama hatası: {ex.Message}");
        }
    }

    public RecordTypesController(
        BookCatalogService bookCatalog,
        KutuphaneDbContext context)
    {
        _bookCatalog = bookCatalog;
        _context = context;
        
        // Log dosyası yolu - Proje klasöründe
        _logFilePath = "/Users/evhesap/Desktop/Kutuphane_calisiyor_AsilCalisma_AntiGravity/RecordTypes_Log.txt";
        
        // User settings dosyası için varsayılan yol (export ayarları için)
        var appDataPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "KutuphaneApp"
        );
        Directory.CreateDirectory(appDataPath);
        _userSettingsPath = Path.Combine(appDataPath, "user-settings.json");

        LogToFile("RecordTypesController başlatıldı.");
        LogToFile($"Log dosyası yolu: {_logFilePath}");
        LogToFile($"User settings dosyası yolu: {_userSettingsPath}");
    }

    [HttpGet("{username}")]
    public IActionResult GetRecordTypes(string username)
    {
        try
        {
            if (!System.IO.File.Exists(_userSettingsPath))
            {
                return Ok(new List<object>());
            }

            var jsonContent = System.IO.File.ReadAllText(_userSettingsPath);
            UserSettingsRoot? root;
            
            try
            {
                root = JsonSerializer.Deserialize<UserSettingsRoot>(jsonContent, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
            }
            catch
            {
                // Eski format ile uyumluluk için JsonElement ile dene
                var settings = JsonSerializer.Deserialize<JsonElement>(jsonContent);
            if (!settings.TryGetProperty("userSettings", out var userSettings))
            {
                return Ok(new List<object>());
            }

                if (!userSettings.TryGetProperty(username, out var userSettingElement))
            {
                return Ok(new List<object>());
            }

                if (!userSettingElement.TryGetProperty("recordPaths", out var recordPaths))
            {
                return Ok(new List<object>());
            }

                var customRecordsList = new List<object>();
            foreach (var recordPath in recordPaths.EnumerateArray())
            {
                if (recordPath.TryGetProperty("type", out var type) && type.GetString() != "all")
                {
                        customRecordsList.Add(new
                    {
                        id = recordPath.TryGetProperty("id", out var id) ? id.GetString() : "",
                        name = recordPath.TryGetProperty("name", out var name) ? name.GetString() : "",
                        dataTypes = recordPath.TryGetProperty("dataTypes", out var dataTypes) 
                            ? dataTypes.EnumerateArray().Select(d => d.GetString()).Where(s => s != null).ToList() 
                            : new List<string?>(),
                        filePath = recordPath.TryGetProperty("filePath", out var filePath) ? filePath.GetString() : "",
                        saveMode = recordPath.TryGetProperty("saveMode", out var saveMode) ? saveMode.GetString() : "current"
                    });
                }
                }
                return Ok(customRecordsList);
            }

            if (root == null || root.UserSettings == null)
            {
                return Ok(new List<object>());
            }

            if (!root.UserSettings.ContainsKey(username))
            {
                return Ok(new List<object>());
            }

            var userSetting = root.UserSettings[username];
            if (userSetting.RecordPaths == null)
            {
                return Ok(new List<object>());
            }

            // Sadece custom kayıt tiplerini döndür (type != "all")
            var customRecords = userSetting.RecordPaths
                .Where(r => r.Type != "all")
                .Select(r => new
                {
                    id = r.Id,
                    name = r.Name,
                    dataTypes = r.DataTypes ?? new List<string>(),
                    filePath = r.FilePath,
                    saveMode = r.SaveMode
                })
                .ToList();

            return Ok(customRecords);
        }
        catch (Exception ex)
        {
            return BadRequest(new { success = false, message = $"Kayıt tipleri yüklenemedi: {ex.Message}" });
        }
    }

    [HttpPost("{username}")]
    public IActionResult SaveRecordType(string username, [FromBody] RecordTypeRequest request)
    {
        try
        {
            Console.WriteLine($"SaveRecordType çağrıldı - Username: {username}, RecordId: {request.Id}, Name: {request.Name}");
            
            if (request == null || string.IsNullOrWhiteSpace(request.Id) || string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { success = false, message = "Geçersiz istek. Id ve Name alanları gereklidir." });
            }

            // Klasörü oluştur
            var directory = Path.GetDirectoryName(_userSettingsPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
                Console.WriteLine($"Klasör oluşturuldu: {directory}");
            }

            // Yeni kayıt tipi objesi
            var newRecordType = new RecordTypeModel
            {
                Id = request.Id,
                Name = request.Name,
                Type = "custom",
                FileType = "xlsx",
                FilePath = request.FilePath ?? "",
                Locked = false,
                AutoSave = true,
                SaveMode = request.SaveMode ?? "current",
                DataTypes = request.DataTypes ?? new List<string>(),
                SaveToCurrentDateFolder = request.SaveToCurrentDateFolder ?? false
            };

            // Mevcut dosyayı oku veya yeni oluştur
            UserSettingsRoot? root;
            if (System.IO.File.Exists(_userSettingsPath))
            {
                try
            {
                var jsonContent = System.IO.File.ReadAllText(_userSettingsPath);
                    root = JsonSerializer.Deserialize<UserSettingsRoot>(jsonContent, new JsonSerializerOptions 
                    { 
                        PropertyNameCaseInsensitive = true 
                    });
                Console.WriteLine($"Mevcut user-settings.json dosyası okundu");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Dosya okuma hatası: {ex.Message}, yeni dosya oluşturulacak");
                    root = new UserSettingsRoot();
                }
            }
            else
            {
                root = new UserSettingsRoot();
                Console.WriteLine($"Yeni user-settings.json dosyası oluşturulacak");
            }

            // Root null kontrolü
            if (root == null)
            {
                root = new UserSettingsRoot();
            }

            // UserSettings'i başlat
            if (root.UserSettings == null)
            {
                root.UserSettings = new Dictionary<string, UserSetting>();
            }

            // Kullanıcı ayarlarını al veya oluştur
            if (!root.UserSettings.ContainsKey(username))
            {
                root.UserSettings[username] = new UserSetting
                {
                    Username = username,
                    RecordPaths = new List<RecordTypeModel>()
                };
            }

            var userSetting = root.UserSettings[username];
            if (userSetting.RecordPaths == null)
            {
                userSetting.RecordPaths = new List<RecordTypeModel>();
            }

            // Mevcut kayıt tipini bul ve güncelle veya yeni ekle
            var existingIndex = userSetting.RecordPaths.FindIndex(r => r.Id == request.Id);
            if (existingIndex >= 0)
            {
                // Güncelle
                userSetting.RecordPaths[existingIndex] = newRecordType;
                Console.WriteLine($"Kayıt tipi güncellendi: {request.Id}");
                    }
                    else
                    {
                // Yeni ekle
                userSetting.RecordPaths.Add(newRecordType);
                Console.WriteLine($"Yeni kayıt tipi eklendi: {request.Id}");
            }

            // JSON'a yaz
            var options = new JsonSerializerOptions 
            { 
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };
            
            var json = JsonSerializer.Serialize(root, options);
            Console.WriteLine($"JSON serileştirme tamamlandı, uzunluk: {json.Length}");
            
            System.IO.File.WriteAllText(_userSettingsPath, json);
            Console.WriteLine($"Dosya başarıyla yazıldı: {_userSettingsPath}");

            return Ok(new { success = true, message = "Kayıt tipi başarıyla kaydedildi" });
        }
        catch (Exception ex)
        {
            var errorMessage = $"Kayıt tipi kaydedilemedi: {ex.Message}";
            if (ex.InnerException != null)
            {
                errorMessage += $" Inner: {ex.InnerException.Message}";
            }
            Console.WriteLine($"HATA: {errorMessage}");
            Console.WriteLine($"Stack trace: {ex.StackTrace}");
            return BadRequest(new { success = false, message = errorMessage });
        }
    }

    [HttpDelete("{username}/{recordTypeId}")]
    public IActionResult DeleteRecordType(string username, string recordTypeId)
    {
        try
        {
            if (!System.IO.File.Exists(_userSettingsPath))
            {
                return BadRequest(new { success = false, message = "Kullanıcı ayarları bulunamadı" });
            }

            var jsonContent = System.IO.File.ReadAllText(_userSettingsPath);
            UserSettingsRoot? root;
            
            try
            {
                root = JsonSerializer.Deserialize<UserSettingsRoot>(jsonContent, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
            }
            catch
            {
                // Eski format ile uyumluluk için JsonElement ile dene
                var jsonElement = JsonSerializer.Deserialize<JsonElement>(jsonContent);
                if (!jsonElement.TryGetProperty("userSettings", out var userSettings))
            {
                return BadRequest(new { success = false, message = "Kullanıcı ayarları bulunamadı" });
            }

                if (!userSettings.TryGetProperty(username, out var userSettingElement))
            {
                return BadRequest(new { success = false, message = "Kullanıcı bulunamadı" });
            }

                if (!userSettingElement.TryGetProperty("recordPaths", out var recordPaths))
            {
                return BadRequest(new { success = false, message = "Kayıt tipleri bulunamadı" });
            }

            var recordPathsList = recordPaths.EnumerateArray().ToList();
            var updatedRecordPaths = new List<JsonElement>();

            foreach (var recordPath in recordPathsList)
            {
                if (recordPath.TryGetProperty("id", out var id) && id.GetString() == recordTypeId)
                {
                        continue; // Sil
                }
                updatedRecordPaths.Add(recordPath);
            }

                // Eski format için güncelleme
            var userSettingObj = new Dictionary<string, object>
            {
                ["username"] = username,
                ["recordPaths"] = updatedRecordPaths.Select(rp => JsonSerializer.Deserialize<object>(rp.GetRawText())).ToList()
            };

            var userSettingsDict = new Dictionary<string, object>();
            foreach (var prop in userSettings.EnumerateObject())
            {
                if (prop.Name != username)
                {
                    userSettingsDict[prop.Name] = JsonSerializer.Deserialize<object>(prop.Value.GetRawText()) ?? new Dictionary<string, object>();
                }
            }
            userSettingsDict[username] = userSettingObj;

            var finalRoot = new Dictionary<string, object>
            {
                ["userSettings"] = userSettingsDict
            };

                var serializerOptions = new JsonSerializerOptions { WriteIndented = true };
                var jsonString = JsonSerializer.Serialize(finalRoot, serializerOptions);
                System.IO.File.WriteAllText(_userSettingsPath, jsonString);

                return Ok(new { success = true, message = "Kayıt tipi başarıyla silindi" });
            }

            if (root == null || root.UserSettings == null)
            {
                return BadRequest(new { success = false, message = "Kullanıcı ayarları bulunamadı" });
            }

            if (!root.UserSettings.ContainsKey(username))
            {
                return BadRequest(new { success = false, message = "Kullanıcı bulunamadı" });
            }

            var userSetting = root.UserSettings[username];
            if (userSetting.RecordPaths == null)
            {
                return BadRequest(new { success = false, message = "Kayıt tipleri bulunamadı" });
            }

            // Kayıt tipini sil
            var removed = userSetting.RecordPaths.RemoveAll(r => r.Id == recordTypeId);
            
            if (removed == 0)
            {
                return BadRequest(new { success = false, message = "Kayıt tipi bulunamadı" });
            }

            // JSON'a yaz
            var options = new JsonSerializerOptions 
            { 
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };
            var json = JsonSerializer.Serialize(root, options);
            System.IO.File.WriteAllText(_userSettingsPath, json);

            return Ok(new { success = true, message = "Kayıt tipi başarıyla silindi" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { success = false, message = $"Kayıt tipi silinemedi: {ex.Message}" });
        }
    }

    [HttpGet("{username}/auto-record-settings")]
    public IActionResult GetAutoRecordSettings(string username)
    {
        try
        {
            if (!System.IO.File.Exists(_userSettingsPath))
            {
                return Ok(new { autoRecordEnabled = false, autoRecordIntervalMinutes = 60 });
            }

            var jsonContent = System.IO.File.ReadAllText(_userSettingsPath);
            UserSettingsRoot? root;
            
            try
            {
                root = JsonSerializer.Deserialize<UserSettingsRoot>(jsonContent, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
            }
            catch
            {
                return Ok(new { autoRecordEnabled = false, autoRecordIntervalMinutes = 60 });
            }

            if (root == null || root.UserSettings == null || !root.UserSettings.ContainsKey(username))
            {
                return Ok(new { autoRecordEnabled = false, autoRecordIntervalMinutes = 60 });
            }

            var userSetting = root.UserSettings[username];
            return Ok(new 
            { 
                autoRecordEnabled = userSetting.AutoRecordEnabled, 
                autoRecordIntervalMinutes = userSetting.AutoRecordIntervalMinutes 
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { success = false, message = $"Ayarlar yüklenemedi: {ex.Message}" });
        }
    }

    [HttpPost("{username}/auto-record-settings")]
    public IActionResult SaveAutoRecordSettings(string username, [FromBody] AutoRecordSettingsRequest request)
    {
        try
        {
            if (request == null)
            {
                return BadRequest(new { success = false, message = "Geçersiz istek" });
            }

            if (request.AutoRecordIntervalMinutes < 1)
            {
                return BadRequest(new { success = false, message = "Aralık en az 1 dakika olmalıdır" });
            }

            // Klasörü oluştur
            var directory = Path.GetDirectoryName(_userSettingsPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            // Mevcut dosyayı oku veya yeni oluştur
            UserSettingsRoot? root;
            if (System.IO.File.Exists(_userSettingsPath))
            {
                try
                {
                    var jsonContent = System.IO.File.ReadAllText(_userSettingsPath);
                    root = JsonSerializer.Deserialize<UserSettingsRoot>(jsonContent, new JsonSerializerOptions 
                    { 
                        PropertyNameCaseInsensitive = true 
                    });
                }
                catch
                {
                    root = new UserSettingsRoot();
                }
            }
            else
            {
                root = new UserSettingsRoot();
            }

            if (root == null)
            {
                root = new UserSettingsRoot();
            }

            if (root.UserSettings == null)
            {
                root.UserSettings = new Dictionary<string, UserSetting>();
            }

            if (!root.UserSettings.ContainsKey(username))
            {
                root.UserSettings[username] = new UserSetting
                {
                    Username = username,
                    RecordPaths = new List<RecordTypeModel>()
                };
            }

            var userSetting = root.UserSettings[username];
            userSetting.AutoRecordEnabled = request.AutoRecordEnabled;
            userSetting.AutoRecordIntervalMinutes = request.AutoRecordIntervalMinutes;

            // JSON'a yaz
            var options = new JsonSerializerOptions 
            { 
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };
            var json = JsonSerializer.Serialize(root, options);
            System.IO.File.WriteAllText(_userSettingsPath, json);

            return Ok(new { success = true, message = "Otomatik kayıt ayarları başarıyla kaydedildi" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { success = false, message = $"Ayarlar kaydedilemedi: {ex.Message}" });
        }
    }

    // Sadece ortak "Kütüphane Verileri.xlsx" dosyasını güncelle
    // Kullanıcı klasörlerini güncellemez - onlar sadece login olduğunda sync edilir
    // Bu metod diğer controller'lardan çağrılabilir
    public async Task UpdateRecordTypesForDataTypes(List<string> dataTypes, CancellationToken cancellationToken)
    {
        try
        {
            if (dataTypes == null || dataTypes.Count == 0)
            {
                return;
            }

            // EPPlus lisans ayarı
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

            // Sadece ortak "Kütüphane Verileri.xlsx" dosyasını güncelle
            // Kullanıcı klasörlerini güncelleme - onlar sadece login olduğunda sync edilir
            var defaultRecordPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "KütüphaneApp");
            try
            {
                if (!Directory.Exists(defaultRecordPath))
                {
                    Directory.CreateDirectory(defaultRecordPath);
                }

                var defaultExcelPath = Path.Combine(defaultRecordPath, "Kütüphane Verileri.xlsx");
                LogToFile($"UpdateRecordTypesForDataTypes: Default Excel güncelleniyor: {defaultExcelPath}");
                await CreateDefaultExcelFile(defaultExcelPath, cancellationToken);
            }
            catch (Exception ex)
            {
                LogToFile($"HATA: UpdateRecordTypesForDataTypes default hata: {ex.Message}");
                Console.WriteLine($"Default kayıt tipi güncellenemedi: {ex.Message}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Kayıt türleri güncellenirken hata: {ex.Message}");
        }
    }

    // Veri değişikliklerinde otomatik kayıt yapma
    // Bu metod diğer controller'lardan çağrılabilir
    // Sadece login olan kullanıcının (username) klasörlerindeki dosyaları günceller
    public async Task UpdateRecordsOnDataChange(string username, List<string> changedDataTypes, CancellationToken cancellationToken)
    {
        try
        {
            Console.WriteLine($"UpdateRecordsOnDataChange çağrıldı - Username: {username}, ChangedDataTypes: {string.Join(", ", changedDataTypes)}");
            
            if (string.IsNullOrEmpty(username) || changedDataTypes == null || changedDataTypes.Count == 0)
            {
                Console.WriteLine("UpdateRecordsOnDataChange: Username veya changedDataTypes boş, işlem yapılmıyor");
                LogToFile($"UpdateRecordsOnDataChange: Username veya changedDataTypes boş (User: {username})");
                return;
            }

            // EPPlus lisans ayarı
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

            // Kullanıcı ayarları dosyası yoksa sadece default'u güncelle
            if (!System.IO.File.Exists(_userSettingsPath))
            {
                Console.WriteLine("UpdateRecordsOnDataChange: User settings dosyası yok, sadece default güncelleniyor");
                LogToFile($"UpdateRecordsOnDataChange: Settings dosyası yok, sadece default güncellenecek (User: {username})");
                await UpdateRecordTypesForDataTypes(changedDataTypes, cancellationToken);
                return;
            }

            var jsonContent = System.IO.File.ReadAllText(_userSettingsPath);
            List<RecordTypeModel>? recordTypes = null;

            // Yeni model formatını dene
            try
            {
                var root = JsonSerializer.Deserialize<UserSettingsRoot>(jsonContent, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
                
                if (root?.UserSettings != null && root.UserSettings.ContainsKey(username))
                {
                    var userSetting = root.UserSettings[username];
                    recordTypes = userSetting.RecordPaths;
                    Console.WriteLine($"UpdateRecordsOnDataChange: Kullanıcı {username} için {recordTypes?.Count ?? 0} kayıt tipi bulundu");
                }
                else
                {
                    Console.WriteLine($"UpdateRecordsOnDataChange: Kullanıcı {username} için kayıt tipi bulunamadı");
                }
            }
            catch
            {
                // Eski format ile uyumluluk için JsonElement ile dene
                var settings = JsonSerializer.Deserialize<JsonElement>(jsonContent);

                if (!settings.TryGetProperty("userSettings", out var userSettings))
                {
                    await UpdateRecordTypesForDataTypes(changedDataTypes, cancellationToken);
                    return;
                }

                if (!userSettings.TryGetProperty(username, out var userSetting))
                {
                    await UpdateRecordTypesForDataTypes(changedDataTypes, cancellationToken);
                    return;
                }

                if (!userSetting.TryGetProperty("recordPaths", out var recordPaths))
                {
                    await UpdateRecordTypesForDataTypes(changedDataTypes, cancellationToken);
                    return;
                }

                // Eski formatı yeni formata çevir
                recordTypes = new List<RecordTypeModel>();
                foreach (var recordPath in recordPaths.EnumerateArray())
                {
                    var recordType = recordPath.TryGetProperty("type", out var type) ? type.GetString() : "";
                    if (recordType == "all")
                    {
                        continue; // Default kayıt tipini atla
                    }

                    recordTypes.Add(new RecordTypeModel
                    {
                        Id = recordPath.TryGetProperty("id", out var id) ? id.GetString() ?? "" : "",
                        Name = recordPath.TryGetProperty("name", out var name) ? name.GetString() ?? "" : "",
                        Type = recordType ?? "custom",
                        FilePath = recordPath.TryGetProperty("filePath", out var fp) ? fp.GetString() ?? "" : "",
                        SaveMode = recordPath.TryGetProperty("saveMode", out var sm) ? sm.GetString() ?? "current" : "current",
                        DataTypes = recordPath.TryGetProperty("dataTypes", out var dt) 
                            ? dt.EnumerateArray().Select(d => d.GetString()).Where(s => s != null).Select(s => s!).ToList() 
                            : new List<string>(),
                        SaveToCurrentDateFolder = recordPath.TryGetProperty("saveToCurrentDateFolder", out var scdf) && scdf.GetBoolean()
                    });
                }
            }

            // Default kayıt tipini güncelle
            await UpdateRecordTypesForDataTypes(changedDataTypes, cancellationToken);

            // Kayıt tipleri yoksa sadece default'u güncelle
            if (recordTypes == null || recordTypes.Count == 0)
            {
                Console.WriteLine($"UpdateRecordsOnDataChange: Kullanıcı {username} için kayıt tipi yok, sadece default güncelleniyor");
                return;
            }

            Console.WriteLine($"UpdateRecordsOnDataChange: Kullanıcı {username} için {recordTypes.Count} kayıt tipi işlenecek");

            // Tüm kayıt tipleri için güncelleme yap
            foreach (var recordType in recordTypes)
            {
                var isDefault = recordType.Type == "all" || recordType.Id == "default";
                
                if (isDefault)
                {
                    continue; // Default kayıt tipi zaten yukarıda işlendi
                }

                var recordName = recordType.Name;
                var filePath = recordType.FilePath;
                var saveMode = recordType.SaveMode;
                var dataTypes = recordType.DataTypes ?? new List<string>();
                var saveToCurrentDateFolder = recordType.SaveToCurrentDateFolder;

                // Bu kayıt tipinde değişen veri tiplerinden herhangi biri var mı?
                var hasChangedDataType = dataTypes.Any(dt => changedDataTypes.Contains(dt));
                if (!hasChangedDataType)
                {
                    continue; // Bu kayıt tipinde değişen veri yok, atla
                }

                if (string.IsNullOrEmpty(filePath) || dataTypes.Count == 0)
                {
                    continue;
                }

                // Dosya yolunu çözümle
                string baseDirectory;
                try
                {
                    string processedFilePath = filePath;
                    
                    // FilePath'teki son tarih klasörünü kaldır (eğer varsa)
                    // Tarih formatı: gg-aa-yyyy (örn: 15-12-2024)
                    var datePattern = @"\d{2}-\d{2}-\d{4}";
                    var regex = new System.Text.RegularExpressions.Regex(datePattern);
                    if (regex.IsMatch(processedFilePath))
                    {
                        // Son tarih klasörünü kaldır
                        var parts = processedFilePath.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);
                        var lastPart = parts.LastOrDefault();
                        if (lastPart != null && regex.IsMatch(lastPart))
                        {
                            // Son kısmı tarih klasörü ise kaldır
                            processedFilePath = string.Join("/", parts.Take(parts.Length - 1));
                        }
                    }

                    if (processedFilePath.StartsWith("Masaüstü/", StringComparison.OrdinalIgnoreCase) ||
                        processedFilePath.StartsWith("Desktop/", StringComparison.OrdinalIgnoreCase))
                    {
                        var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                        if (string.IsNullOrEmpty(desktopPath))
                        {
                            continue;
                        }
                        var pathAfterDesktop = processedFilePath.Replace("Masaüstü/", "").Replace("Desktop/", "").Replace("Masaüstü\\", "").Replace("Desktop\\", "");
                        baseDirectory = Path.Combine(desktopPath, pathAfterDesktop);
                    }
                    else if (Path.IsPathRooted(processedFilePath))
                    {
                        baseDirectory = processedFilePath;
                    }
                    else
                    {
                        var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                        if (string.IsNullOrEmpty(desktopPath))
                        {
                            continue;
                        }
                        baseDirectory = Path.Combine(desktopPath, processedFilePath);
                    }

                    // Eğer güncel tarih klasörüne kaydet seçiliyse, güncel tarih klasörünü ekle
                    if (saveToCurrentDateFolder)
                    {
                        var today = DateTime.Now;
                        var dateFolder = $"{today.Day:D2}-{today.Month:D2}-{today.Year}";
                        baseDirectory = Path.Combine(baseDirectory, dateFolder);
                    }

                    // Klasörü oluştur
                    if (!Directory.Exists(baseDirectory))
                    {
                        Directory.CreateDirectory(baseDirectory);
                        Console.WriteLine($"UpdateRecordsOnDataChange: Klasör oluşturuldu: {baseDirectory}");
                    }
                    else
                    {
                        Console.WriteLine($"UpdateRecordsOnDataChange: Klasör mevcut: {baseDirectory}");
                    }

                    // Değişen veri tiplerini kaydet (kayıt tipinde bu veri tipleri varsa)
                    // Kullanıcı "tüm kitap verilerini gidip düzeltmeni istiyorum" diyor
                    // Bu yüzden kayıt tipinde değişen veri tiplerinden herhangi biri varsa, o kayıt tipindeki tüm veri tiplerini kaydet
                    // hasChangedDataType zaten yukarıda kontrol edildi, bu yüzden tüm veri tiplerini kaydet
                    var dataTypesToSave = dataTypes;
                    Console.WriteLine($"UpdateRecordsOnDataChange: Kayıt tipi {recordName} için {dataTypesToSave.Count} veri tipi kaydedilecek: {string.Join(", ", dataTypesToSave)}");

                    if (saveMode == "overwrite")
                    {
                        // Tek Excel dosyası, birden fazla sayfa
                        var excelFilePath = Path.Combine(baseDirectory, $"{recordName}.xlsx");
                        Console.WriteLine($"UpdateRecordsOnDataChange: Dosya güncelleniyor: {excelFilePath}");
                        await CreateMultiSheetExcelFile(excelFilePath, dataTypesToSave, cancellationToken);
                        Console.WriteLine($"UpdateRecordsOnDataChange: Dosya güncellendi: {excelFilePath}");
                    }
                    else
                    {
                        // Her veri tipi için ayrı Excel dosyası
                        foreach (var dataType in dataTypesToSave)
                        {
                            string fileName = "";
                            switch (dataType)
                            {
                                case "ogrenci_bilgileri":
                                    fileName = "ogrenci listesi.xlsx";
                                    break;
                                case "personel_bilgileri":
                                    fileName = "personel listesi.xlsx";
                                    break;
                                case "kitap_listesi":
                                    fileName = "kitap listesi.xlsx";
                                    break;
                                case "odunc_bilgileri":
                                    fileName = "odunc listesi.xlsx";
                                    break;
                                default:
                                    continue;
                            }

                            var excelFilePath = Path.Combine(baseDirectory, fileName);
                            Console.WriteLine($"UpdateRecordsOnDataChange: Dosya güncelleniyor: {excelFilePath}");
                            LogToFile($"UpdateRecordsOnDataChange: Tek sayfa güncelleniyor: {excelFilePath} (Type: {dataType})");
                            await CreateSingleSheetExcelFile(excelFilePath, dataType, cancellationToken);
                            Console.WriteLine($"UpdateRecordsOnDataChange: Dosya güncellendi: {excelFilePath}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Hata logla ama devam et
                    Console.WriteLine($"Kayıt tipi {recordName} güncellenirken hata: {ex.Message}");
                    Console.WriteLine($"Stack trace: {ex.StackTrace}");
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
            Console.WriteLine($"Stack trace: {ex.StackTrace}");
        }
    }

    [HttpPost("sync")]
    public async Task<IActionResult> SyncRecordTypes([FromBody] SyncRequest request, CancellationToken cancellationToken)
    {
        try
        {
            // EPPlus lisans ayarı
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

            var createdFiles = new List<string>();
            int totalRecordCount = 0;
            
            LogToFile($"SyncRecordTypes çağrıldı. User: {request.Username}");

            // Default kayıt tipi (Tüm Kayıtlar) - her zaman oluştur
            var defaultRecordPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Desktop), "KütüphaneApp");
            try
            {
                if (!Directory.Exists(defaultRecordPath))
                {
                    Directory.CreateDirectory(defaultRecordPath);
                    Console.WriteLine($"Default klasör oluşturuldu: {defaultRecordPath}");
                }

                var defaultExcelPath = Path.Combine(defaultRecordPath, "Kütüphane Verileri.xlsx");
                await CreateDefaultExcelFile(defaultExcelPath, cancellationToken);
                createdFiles.Add(defaultExcelPath);
                Console.WriteLine($"Default Excel dosyası oluşturuldu: {defaultExcelPath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                LogToFile($"HATA: Default kayıt oluşturma hatası: {ex.Message}");
            }

            // Kullanıcı ayarları dosyası yoksa sadece default'u döndür
            if (!System.IO.File.Exists(_userSettingsPath))
            {
                return Ok(new { success = true, message = "Sadece default kayıt tipi oluşturuldu", files = createdFiles, recordCount = totalRecordCount });
            }

            var jsonContent = System.IO.File.ReadAllText(_userSettingsPath);
            List<RecordTypeModel>? recordTypes = null;

            // Yeni model formatını dene
            try
            {
                var root = JsonSerializer.Deserialize<UserSettingsRoot>(jsonContent, new JsonSerializerOptions 
                { 
                    PropertyNameCaseInsensitive = true 
                });
                
                if (root?.UserSettings != null && root.UserSettings.ContainsKey(request.Username))
                {
                    var userSetting = root.UserSettings[request.Username];
                    recordTypes = userSetting.RecordPaths;
                }
            }
            catch
            {
                // Eski format ile uyumluluk için JsonElement ile dene
            var settings = JsonSerializer.Deserialize<JsonElement>(jsonContent);

            if (!settings.TryGetProperty("userSettings", out var userSettings))
            {
                return Ok(new { success = true, message = "Sadece default kayıt tipi oluşturuldu", files = createdFiles, recordCount = totalRecordCount });
            }

            if (!userSettings.TryGetProperty(request.Username, out var userSetting))
            {
                return Ok(new { success = true, message = "Sadece default kayıt tipi oluşturuldu", files = createdFiles, recordCount = totalRecordCount });
            }

                if (!userSetting.TryGetProperty("recordPaths", out var recordPaths))
                {
                    return Ok(new { success = true, message = "Sadece default kayıt tipi oluşturuldu", files = createdFiles, recordCount = totalRecordCount });
                }

                // Eski formatı yeni formata çevir
                recordTypes = new List<RecordTypeModel>();
                foreach (var recordPath in recordPaths.EnumerateArray())
                {
                    var recordType = recordPath.TryGetProperty("type", out var type) ? type.GetString() : "";
                    if (recordType == "all")
                    {
                        continue; // Default kayıt tipini atla
                    }

                    recordTypes.Add(new RecordTypeModel
                    {
                        Id = recordPath.TryGetProperty("id", out var id) ? id.GetString() ?? "" : "",
                        Name = recordPath.TryGetProperty("name", out var name) ? name.GetString() ?? "" : "",
                        Type = recordType ?? "custom",
                        FilePath = recordPath.TryGetProperty("filePath", out var fp) ? fp.GetString() ?? "" : "",
                        SaveMode = recordPath.TryGetProperty("saveMode", out var sm) ? sm.GetString() ?? "current" : "current",
                        DataTypes = recordPath.TryGetProperty("dataTypes", out var dt) 
                            ? dt.EnumerateArray().Select(d => d.GetString()).Where(s => s != null).Select(s => s!).ToList() 
                            : new List<string>(),
                        SaveToCurrentDateFolder = recordPath.TryGetProperty("saveToCurrentDateFolder", out var scdf) && scdf.GetBoolean()
                    });
                }
            }

            // Kayıt tipleri yoksa sadece default'u döndür
            if (recordTypes == null || recordTypes.Count == 0)
            {
                return Ok(new { success = true, message = "Sadece default kayıt tipi oluşturuldu", files = createdFiles, recordCount = totalRecordCount });
            }

            // Tüm kayıt tipleri (default dahil)
            foreach (var recordType in recordTypes)
            {
                var isDefault = recordType.Type == "all" || recordType.Id == "default";
                
                if (isDefault)
                {
                    // Default kayıt tipi zaten yukarıda işlendi, atla
                    continue;
                }

                var recordName = recordType.Name;
                var filePath = recordType.FilePath;
                var saveMode = recordType.SaveMode;
                var dataTypes = recordType.DataTypes ?? new List<string>();
                var saveToCurrentDateFolder = recordType.SaveToCurrentDateFolder;

                if (string.IsNullOrEmpty(filePath) || dataTypes.Count == 0)
                {
                    continue;
                }

                // Dosya yolunu çözümle
                string baseDirectory;
                try
                {
                    string processedFilePath = filePath;
                    
                    // FilePath'teki son tarih klasörünü kaldır (eğer varsa)
                    // Tarih formatı: gg-aa-yyyy (örn: 15-12-2024)
                    var datePattern = @"\d{2}-\d{2}-\d{4}";
                    var regex = new System.Text.RegularExpressions.Regex(datePattern);
                    if (regex.IsMatch(processedFilePath))
                    {
                        // Son tarih klasörünü kaldır
                        var parts = processedFilePath.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries);
                        var lastPart = parts.LastOrDefault();
                        if (lastPart != null && regex.IsMatch(lastPart))
                        {
                            // Son kısmı tarih klasörü ise kaldır
                            processedFilePath = string.Join("/", parts.Take(parts.Length - 1));
                        }
                    }
                    
                    if (processedFilePath.StartsWith("Masaüstü/", StringComparison.OrdinalIgnoreCase) ||
                        processedFilePath.StartsWith("Desktop/", StringComparison.OrdinalIgnoreCase))
                    {
                        var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                        if (string.IsNullOrEmpty(desktopPath))
                        {
                            Console.WriteLine($"Kayıt tipi {recordName}: Masaüstü klasörü bulunamadı");
                            continue;
                        }
                        var pathAfterDesktop = processedFilePath.Replace("Masaüstü/", "").Replace("Desktop/", "").Replace("Masaüstü\\", "").Replace("Desktop\\", "");
                        baseDirectory = Path.Combine(desktopPath, pathAfterDesktop);
                    }
                    else if (Path.IsPathRooted(processedFilePath))
                    {
                        baseDirectory = processedFilePath;
                    }
                    else
                    {
                        var desktopPath = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                        if (string.IsNullOrEmpty(desktopPath))
                        {
                            Console.WriteLine($"Kayıt tipi {recordName}: Masaüstü klasörü bulunamadı");
                            continue;
                        }
                        baseDirectory = Path.Combine(desktopPath, processedFilePath);
                    }

                    // Eğer güncel tarih klasörüne kaydet seçiliyorsa, güncel tarih klasörünü ekle
                    if (saveToCurrentDateFolder)
                    {
                        var today = DateTime.Now;
                        var dateFolder = $"{today.Day:D2}-{today.Month:D2}-{today.Year}";
                        baseDirectory = Path.Combine(baseDirectory, dateFolder);
                    }

                    // Klasörü oluştur
                    if (!Directory.Exists(baseDirectory))
                    {
                        Directory.CreateDirectory(baseDirectory);
                        Console.WriteLine($"Kayıt tipi {recordName}: Klasör oluşturuldu: {baseDirectory}");
                    }
                }
                catch (Exception ex)
                {
                    // Hata logla ama devam et
                    Console.WriteLine($"Kayıt tipi {recordName} için klasör oluşturulamadı: {ex.Message}");
                    Console.WriteLine($"Dosya yolu: {filePath}");
                    LogToFile($"HATA: Klasör oluşturma hatası ({recordName}): {ex.Message} -> {filePath}");
                    continue;
                }

                try
                {
                    if (saveMode == "overwrite")
                    {
                        // Tek Excel dosyası, birden fazla sayfa
                        var excelFilePath = Path.Combine(baseDirectory, $"{recordName}.xlsx");
                        LogToFile($"MultiSheet kayıt oluşturuluyor: {excelFilePath}");
                        await CreateMultiSheetExcelFile(excelFilePath, dataTypes, cancellationToken);
                        createdFiles.Add(excelFilePath);
                        totalRecordCount += dataTypes.Count;
                    }
                    else
                    {
                        // Her veri tipi için ayrı Excel dosyası
                        foreach (var dataType in dataTypes)
                        {
                            string fileName = "";
                            switch (dataType)
                            {
                                case "ogrenci_bilgileri":
                                    fileName = "ogrenci listesi.xlsx";
                                    break;
                                case "personel_bilgileri":
                                    fileName = "personel listesi.xlsx";
                                    break;
                                case "kitap_listesi":
                                    fileName = "kitap listesi.xlsx";
                                    break;
                                case "odunc_bilgileri":
                                    fileName = "odunc listesi.xlsx";
                                    break;
                                default:
                                    continue;
                            }

                            var excelFilePath = Path.Combine(baseDirectory, fileName);
                            await CreateSingleSheetExcelFile(excelFilePath, dataType, cancellationToken);
                            createdFiles.Add(excelFilePath);
                            totalRecordCount++;
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Dosya oluşturma hatası logla ama devam et
                    Console.WriteLine($"Kayıt tipi {recordName} için dosya oluşturulamadı: {ex.Message}");
                    Console.WriteLine($"Dosya yolu: {baseDirectory}");
                    LogToFile($"HATA: Dosya oluşturma hatası ({recordName}): {ex.Message} -> {baseDirectory}");
                }
            }

            return Ok(new { 
                success = true, 
                message = $"Kayıt tipleri başarıyla güncellendi. {createdFiles.Count} dosya oluşturuldu.", 
                files = createdFiles, 
                recordCount = totalRecordCount 
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { success = false, message = $"Kayıt tipleri güncellenemedi: {ex.Message}" });
        }
    }

    private async Task CreateDefaultExcelFile(string filePath, CancellationToken cancellationToken)
    {
        Console.WriteLine($"========== CreateDefaultExcelFile BAŞLADI ==========");
        Console.WriteLine($"Dosya yolu: {filePath}");
        LogToFile($"CreateDefaultExcelFile: Başlıyor -> {filePath}");
        
        ExcelPackage package;
        FileInfo fileInfo = new FileInfo(filePath);
        
        Console.WriteLine($"FileInfo oluşturuldu. Dosya mevcut mu: {fileInfo.Exists}");
        Console.WriteLine($"Dosya dizini: {fileInfo.DirectoryName}");
        
        // Dosya varsa mevcut dosyayı oku, yoksa yeni oluştur
        if (fileInfo.Exists)
        {
            Console.WriteLine($"Mevcut dosya okunuyor: {filePath}");
            package = new ExcelPackage(fileInfo);
        }
        else
        {
            Console.WriteLine($"Yeni Excel paketi oluşturuluyor");
            package = new ExcelPackage();
        }
        
        try
        {
            Console.WriteLine("Excel sayfaları oluşturuluyor...");
            
            // Öğrenci Bilgileri
            var studentSheet = package.Workbook.Worksheets["Öğrenci Bilgileri"];
            if (studentSheet == null)
            {
                studentSheet = package.Workbook.Worksheets.Add("Öğrenci Bilgileri");
                studentSheet.Cells[1, 1].Value = "Ad";
                studentSheet.Cells[1, 2].Value = "Soyad";
                studentSheet.Cells[1, 3].Value = "Sınıf";
                studentSheet.Cells[1, 4].Value = "Şube";
                studentSheet.Cells[1, 5].Value = "Numara";
                studentSheet.Cells[1, 6].Value = "Ceza Puanı";
                FormatHeader(studentSheet.Cells[1, 1, 1, 6]);
            }

            // Mevcut numaraları oku (Kullanıcı Adı yerine Numara kontrol)
            var existingStudentNumbers = new HashSet<int>();
            if (studentSheet.Dimension != null)
            {
                int lastStudentRow = studentSheet.Dimension.End.Row;
                for (int r = 2; r <= lastStudentRow; r++)
                {
                    var studentNumberStr = studentSheet.Cells[r, 5].Value?.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(studentNumberStr) && int.TryParse(studentNumberStr, out int studentNumber))
                    {
                        existingStudentNumbers.Add(studentNumber);
                    }
                }
            }

            // Veritabanından tüm öğrencileri al
            var allStudents = await _context.Users
                .Where(u => u.Role == "Student")
                .OrderBy(u => u.Class)
                .ThenBy(u => u.Branch)
                .ThenBy(u => u.Name)
                .ThenBy(u => u.Surname)
                .ToListAsync(cancellationToken);

            // Son satırı bul
            int startRow = studentSheet.Dimension != null ? studentSheet.Dimension.End.Row + 1 : 2;
            var row = startRow;
            
            // Sadece yeni öğrencileri ekle (StudentNumber ile kontrol)
            foreach (var student in allStudents)
            {
                if (student.StudentNumber.HasValue && !existingStudentNumbers.Contains(student.StudentNumber.Value))
                {
                    studentSheet.Cells[row, 1].Value = student.Name ?? "";
                    studentSheet.Cells[row, 2].Value = student.Surname ?? "";
                    studentSheet.Cells[row, 3].Value = student.Class?.ToString() ?? "";
                    studentSheet.Cells[row, 4].Value = student.Branch ?? "";
                    studentSheet.Cells[row, 5].Value = student.StudentNumber.Value;
                    studentSheet.Cells[row, 6].Value = student.PenaltyPoints;
                    row++;
                }
            }

            if (studentSheet.Dimension != null)
            {
                studentSheet.Cells[studentSheet.Dimension.Address].AutoFitColumns();
            }

            // Personel Bilgileri - APPEND-ONLY: Mevcut kayıtları koru, sadece yeni kayıtları ekle
            var personelSheet = package.Workbook.Worksheets["Personel Bilgileri"];
            if (personelSheet == null)
            {
                // Sayfa yoksa yeni oluştur
                personelSheet = package.Workbook.Worksheets.Add("Personel Bilgileri");
                personelSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                personelSheet.Cells[1, 2].Value = "Ad";
                personelSheet.Cells[1, 3].Value = "Soyad";
                personelSheet.Cells[1, 4].Value = "Pozisyon";
                FormatHeader(personelSheet.Cells[1, 1, 1, 4]);
            }

            // Mevcut kayıtları oku (Excel'den) - SADECE VARSA
            var existingPersonelUsernames = new HashSet<string>();
            if (personelSheet.Dimension != null)
            {
                int lastPersonelRow = personelSheet.Dimension.End.Row;
                for (int r = 2; r <= lastPersonelRow; r++)
                {
                    var username = personelSheet.Cells[r, 1].Value?.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(username))
                    {
                        existingPersonelUsernames.Add(username);
                    }
                }
            }

            // Veritabanından tüm personelleri al
            var allPersonels = await _context.Users
                .Where(u => u.Role == "personel")
                .OrderBy(u => u.Name)
                .ThenBy(u => u.Surname)
                .ToListAsync(cancellationToken);

            // Son satırı bul
            int startPersonelRow = personelSheet.Dimension != null ? personelSheet.Dimension.End.Row + 1 : 2;
            row = startPersonelRow;
            
            // Sadece yeni personelleri ekle
            foreach (var personel in allPersonels)
            {
                var personelUsername = personel.Username?.Trim() ?? "";
                if (!string.IsNullOrWhiteSpace(personelUsername) && !existingPersonelUsernames.Contains(personelUsername))
                {
                    personelSheet.Cells[row, 1].Value = personelUsername;
                    personelSheet.Cells[row, 2].Value = personel.Name ?? "";
                    personelSheet.Cells[row, 3].Value = personel.Surname ?? "";
                    personelSheet.Cells[row, 4].Value = personel.Position ?? "";
                    row++;
                }
            }

            if (personelSheet.Dimension != null)
            {
                personelSheet.Cells[personelSheet.Dimension.Address].AutoFitColumns();
            }

            // Kitap Listesi - APPEND-ONLY: Mevcut kayıtları koru, sadece yeni kayıtları ekle
            var bookSheet = package.Workbook.Worksheets["Kitap Listesi"];
            if (bookSheet == null)
            {
                // Sayfa yoksa yeni oluştur
                bookSheet = package.Workbook.Worksheets.Add("Kitap Listesi");
                bookSheet.Cells[1, 1].Value = "Başlık";
                bookSheet.Cells[1, 2].Value = "Yazar";
                bookSheet.Cells[1, 3].Value = "Kategori";
                bookSheet.Cells[1, 4].Value = "Miktar";
                bookSheet.Cells[1, 5].Value = "Raf";
                bookSheet.Cells[1, 6].Value = "Yayınevi";
                bookSheet.Cells[1, 7].Value = "Özet";
                bookSheet.Cells[1, 8].Value = "Numara";
                bookSheet.Cells[1, 9].Value = "Yıl";
                bookSheet.Cells[1, 10].Value = "Sayfa Sayısı";
                FormatHeader(bookSheet.Cells[1, 1, 1, 10]);
            }

            // Mevcut kitapları oku (Excel'den) - Başlık+Yazar unique key
            var existingBooks = new HashSet<string>();
            if (bookSheet.Dimension != null)
            {
                int lastBookRow = bookSheet.Dimension.End.Row;
                for (int r = 2; r <= lastBookRow; r++)
                {
                    var title = bookSheet.Cells[r, 1].Value?.ToString()?.Trim() ?? "";
                    var author = bookSheet.Cells[r, 2].Value?.ToString()?.Trim() ?? "";
                    if (!string.IsNullOrWhiteSpace(title) && !string.IsNullOrWhiteSpace(author))
                    {
                        existingBooks.Add($"{title}|{author}");
                    }
                }
            }

            // Veritabanından tüm kitapları al
            var allBooks = await _bookCatalog.SearchAsync(null, null, cancellationToken);
            
            // Son satırı bul
            int startBookRow = bookSheet.Dimension != null ? bookSheet.Dimension.End.Row + 1 : 2;
            row = startBookRow;
            
            // Sadece yeni kitapları ekle
            foreach (var book in allBooks.OrderBy(b => b.Title).ThenBy(b => b.Author))
            {
                var bookTitle = book.Title?.Trim() ?? "";
                var bookAuthor = book.Author?.Trim() ?? "";
                var bookKey = $"{bookTitle}|{bookAuthor}";
                
                if (!string.IsNullOrWhiteSpace(bookTitle) && !string.IsNullOrWhiteSpace(bookAuthor) && !existingBooks.Contains(bookKey))
                {
                    bookSheet.Cells[row, 1].Value = bookTitle;
                    bookSheet.Cells[row, 2].Value = bookAuthor;
                    bookSheet.Cells[row, 3].Value = book.Category;
                    bookSheet.Cells[row, 4].Value = book.Quantity;
                    bookSheet.Cells[row, 5].Value = ""; // Shelf
                    bookSheet.Cells[row, 6].Value = ""; // Publisher
                    bookSheet.Cells[row, 7].Value = ""; // Summary
                    bookSheet.Cells[row, 8].Value = ""; // BookNumber
                    bookSheet.Cells[row, 9].Value = ""; // Year
                    bookSheet.Cells[row, 10].Value = ""; // PageCount
                    row++;
                }
            }

            if (bookSheet.Dimension != null)
            {
                bookSheet.Cells[bookSheet.Dimension.Address].AutoFitColumns();
            }

            // Ödünç Bilgileri - APPEND-ONLY: Mevcut kayıtları koru, sadece yeni kayıtları ekle
            var loanSheet = package.Workbook.Worksheets["Ödünç Bilgileri"];
            if (loanSheet == null)
            {
                // Sayfa yoksa yeni oluştur
                loanSheet = package.Workbook.Worksheets.Add("Ödünç Bilgileri");
                loanSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                loanSheet.Cells[1, 2].Value = "Kitap Başlığı";
                loanSheet.Cells[1, 3].Value = "Yazar";
                loanSheet.Cells[1, 4].Value = "Ödünç Tarihi";
                loanSheet.Cells[1, 5].Value = "İade Tarihi";
                loanSheet.Cells[1, 6].Value = "Durum";
                FormatHeader(loanSheet.Cells[1, 1, 1, 6]);
            }

            // Mevcut ödünç kayıtlarını oku - Borrower+Başlık+DueDate unique key
            var existingLoans = new HashSet<string>();
            if (loanSheet.Dimension != null)
            {
                int lastLoanRow = loanSheet.Dimension.End.Row;
                for (int r = 2; r <= lastLoanRow; r++)
                {
                    var borrower = loanSheet.Cells[r, 1].Value?.ToString()?.Trim() ?? "";
                    var title = loanSheet.Cells[r, 2].Value?.ToString()?.Trim() ?? "";
                    var dueDate = loanSheet.Cells[r, 4].Value?.ToString()?.Trim() ?? "";
                    if (!string.IsNullOrWhiteSpace(borrower) && !string.IsNullOrWhiteSpace(title) && !string.IsNullOrWhiteSpace(dueDate))
                    {
                        existingLoans.Add($"{borrower}|{title}|{dueDate}");
                    }
                }
            }

            // Veritabanından tüm ödünç bilgilerini al (SQLite uyumlu)
            // SelectMany APPLY operasyonunu desteklemediği için önce Books'u çekip client-side flatmap yapıyoruz
            var allBooksWithLoans = await _context.Books
                .Include(b => b.Loans)
                .AsNoTracking()
                .ToListAsync(cancellationToken);

            // Client-side flatmap
            var allLoans = allBooksWithLoans
                .SelectMany(b => b.Loans.Select(l => new { Book = b, Loan = l }))
                .ToList();

            // Son satırı bul
            int startLoanRow = loanSheet.Dimension != null ? loanSheet.Dimension.End.Row + 1 : 2;
            row = startLoanRow;
            
            // Sadece yeni ödünç kayıtlarını ekle
            foreach (var item in allLoans.OrderBy(l => l.Loan.DueDate))
            {
                var itemBorrower = item.Loan.Borrower?.Trim() ?? "";
                var itemTitle = item.Book.Title?.Trim() ?? "";
                var itemDueDate = item.Loan.DueDate.ToString("dd-MM-yyyy");
                var loanKey = $"{itemBorrower}|{itemTitle}|{itemDueDate}";
                
                if (!string.IsNullOrWhiteSpace(itemBorrower) && !string.IsNullOrWhiteSpace(itemTitle) && !existingLoans.Contains(loanKey))
                {
                    loanSheet.Cells[row, 1].Value = itemBorrower;
                    loanSheet.Cells[row, 2].Value = itemTitle;
                    loanSheet.Cells[row, 3].Value = item.Book.Author;
                    loanSheet.Cells[row, 4].Value = itemDueDate;
                    loanSheet.Cells[row, 5].Value = ""; // ReturnDate YOK, boş bırak
                    loanSheet.Cells[row, 6].Value = "Ödünçte"; // ReturnDate field'ı olmadığı için hep ödünçte
                    row++;
                }
            }

            if (loanSheet.Dimension != null)
            {
                loanSheet.Cells[loanSheet.Dimension.Address].AutoFitColumns();
            }

            // Loglar Sayfası - APPEND-ONLY + TÜRKÇE ÇEVİRİ
            var logSheet = package.Workbook.Worksheets["Loglar"];
            if (logSheet == null)
            {
                // Sayfa yoksa yeni oluştur
                logSheet = package.Workbook.Worksheets.Add("Loglar");
                logSheet.Cells[1, 1].Value = "Tarih";
                logSheet.Cells[1, 2].Value = "Kullanıcı";
                logSheet.Cells[1, 3].Value = "İşlem";
                logSheet.Cells[1, 4].Value = "Detay";
                FormatHeader(logSheet.Cells[1, 1, 1, 4]);
            }

            // Mevcut logları oku - Timestamp+Username+Action unique key
            var existingLogKeys = new HashSet<string>();
            if (logSheet.Dimension != null)
            {
                int lastLogRow = logSheet.Dimension.End.Row;
                for (int r = 2; r <= lastLogRow; r++)
                {
                    var timestamp = logSheet.Cells[r, 1].Value?.ToString()?.Trim() ?? "";
                    var username = logSheet.Cells[r, 2].Value?.ToString()?.Trim() ?? "";
                    var action = logSheet.Cells[r, 3].Value?.ToString()?.Trim() ?? "";
                    if (!string.IsNullOrWhiteSpace(timestamp) && !string.IsNullOrWhiteSpace(username))
                    {
                        existingLogKeys.Add($"{timestamp}|{username}|{action}");
                    }
                }
            }

            // Veritabanından Activity Logları al
            try
            {
                if (await _context.Database.CanConnectAsync(cancellationToken))
                {
                    var activityLogs = await _context.ActivityLogs
                        .OrderBy(l => l.Timestamp)
                        .ToListAsync(cancellationToken);

                    // Son satırı bul
                    int startLogRow = logSheet.Dimension != null ? logSheet.Dimension.End.Row + 1 : 2;
                    int logRow = startLogRow;
                    
                    foreach (var log in activityLogs)
                    {
                        var logTimestamp = log.Timestamp.ToString("dd-MM-yyyy HH:mm:ss");
                        var logUsername = log.Username?.Trim() ?? "";
                        var logAction = TranslateAction(log.Action)?.Trim() ?? "";
                        var logKey = $"{logTimestamp}|{logUsername}|{logAction}";
                        
                        if (!string.IsNullOrWhiteSpace(logUsername) && !existingLogKeys.Contains(logKey))
                        {
                            logSheet.Cells[logRow, 1].Value = logTimestamp;
                            logSheet.Cells[logRow, 2].Value = logUsername;
                            logSheet.Cells[logRow, 3].Value = logAction;
                            logSheet.Cells[logRow, 4].Value = log.Details ?? "";
                            logRow++;
                        }
                    }

                    if (activityLogs.Count == 0 && logSheet.Dimension == null)
                    {
                        logSheet.Cells[2, 1].Value = "Henüz log kaydı bulunmamaktadır";
                    }
                }
                else
                {
                    if (logSheet.Dimension == null)
                    {
                        logSheet.Cells[2, 1].Value = "Veritabanı bağlantısı kurulamadı";
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Log yükleme hatası: {ex.Message}");
                if (logSheet.Dimension == null)
                {
                    logSheet.Cells[2, 1].Value = $"Log yükleme hatası: {ex.Message}";
                }
            }

            if (logSheet.Dimension != null)
            {
                logSheet.Cells[logSheet.Dimension.Address].AutoFitColumns();
            }

            // Dosyayı kaydet (varsa güncelle, yoksa oluştur)
            Console.WriteLine($"Dosya kaydediliyor: {fileInfo.FullName}");
            Console.WriteLine($"Dosya dizini mevcut mu: {Directory.Exists(fileInfo.DirectoryName)}");
            
            // Dizin yoksa oluştur
            if (!string.IsNullOrEmpty(fileInfo.DirectoryName) && !Directory.Exists(fileInfo.DirectoryName))
            {
                Console.WriteLine($"Dizin oluşturuluyor: {fileInfo.DirectoryName}");
                Directory.CreateDirectory(fileInfo.DirectoryName);
            }
            
            package.SaveAs(fileInfo);
            Console.WriteLine($"✅ Dosya başarıyla kaydedildi: {fileInfo.FullName}");
            Console.WriteLine($"Dosya boyutu: {fileInfo.Length} bytes");
            LogToFile($"CreateDefaultExcelFile: Başarıyla kaydedildi -> {fileInfo.FullName} ({fileInfo.Length} bytes)");
        }
        finally
        {
            Console.WriteLine("Excel paketi dispose ediliyor");
            package?.Dispose();
            Console.WriteLine("========== CreateDefaultExcelFile BİTTİ ==========\n");
        }
    }

    private async Task CreateMultiSheetExcelFile(string filePath, List<string> dataTypes, CancellationToken cancellationToken)
    {
        Console.WriteLine($"========== CreateMultiSheetExcelFile BAŞL ADI ==========");
        Console.WriteLine($"Dosya yolu: {filePath}");
        Console.WriteLine($"Veri tipleri: {string.Join(", ", dataTypes)}");
        LogToFile($"CreateMultiSheetExcelFile: Başlıyor -> {filePath} (Types: {string.Join(",", dataTypes)})");
        
        ExcelPackage package;
        FileInfo fileInfo = new FileInfo(filePath);
        
        Console.WriteLine($"FileInfo oluşturuldu. Dosya mevcut mu: {fileInfo.Exists}");
        
        // Dosya varsa mevcut dosyayı oku, yoksa yeni oluştur
        if (fileInfo.Exists)
        {
            package = new ExcelPackage(fileInfo);
        }
        else
        {
            package = new ExcelPackage();
        }
        
        try
        {
            if (dataTypes.Contains("ogrenci_bilgileri"))
            {
                // Mevcut sayfayı koru, sadece yeni eklenenleri ekle
                var existingSheet = package.Workbook.Worksheets["Öğrenci Bilgileri"];
                ExcelWorksheet studentSheet;
                HashSet<string> existingStudentUsernames = new HashSet<string>();
                
                if (existingSheet != null)
                {
                    var lastRow = existingSheet.Dimension?.End.Row ?? 1;
                    for (int i = 2; i <= lastRow; i++)
                    {
                        var username = existingSheet.Cells[i, 1].Value?.ToString();
                        if (!string.IsNullOrEmpty(username))
                        {
                            existingStudentUsernames.Add(username);
                        }
                    }
                    studentSheet = existingSheet;
                }
                else
                {
                    studentSheet = package.Workbook.Worksheets.Add("Öğrenci Bilgileri");
                    studentSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                    studentSheet.Cells[1, 2].Value = "Ad";
                    studentSheet.Cells[1, 3].Value = "Soyad";
                    studentSheet.Cells[1, 4].Value = "Sınıf";
                    studentSheet.Cells[1, 5].Value = "Şube";
                    studentSheet.Cells[1, 6].Value = "Numara";
                    studentSheet.Cells[1, 7].Value = "Ceza Puanı";
                    FormatHeader(studentSheet.Cells[1, 1, 1, 7]);
                }

                // ActivityLogs'tan ADD_STUDENT işlemlerini al
                var addStudentLogs = await _context.ActivityLogs
                    .Where(l => l.Action == "ADD_STUDENT")
                    .OrderBy(l => l.Timestamp)
                    .ToListAsync(cancellationToken);

                var newStudents = new List<UserEntity>();
                foreach (var log in addStudentLogs)
                {
                    var details = log.Details ?? "";
                    var studentNumberMatch = System.Text.RegularExpressions.Regex.Match(details, @"No:\s*(\d+)");
                    if (studentNumberMatch.Success && int.TryParse(studentNumberMatch.Groups[1].Value, out int studentNumber))
                    {
                        var student = await _context.Users
                            .FirstOrDefaultAsync(u => u.Role == "Student" && u.StudentNumber == studentNumber, cancellationToken);
                        if (student != null && !existingStudentUsernames.Contains(student.Username))
                        {
                            newStudents.Add(student);
                            existingStudentUsernames.Add(student.Username);
                        }
                    }
                }

                int row = studentSheet.Dimension?.End.Row + 1 ?? 2;
                foreach (var student in newStudents)
                {
                    studentSheet.Cells[row, 1].Value = student.Username;
                    studentSheet.Cells[row, 2].Value = student.Name ?? "";
                    studentSheet.Cells[row, 3].Value = student.Surname ?? "";
                    studentSheet.Cells[row, 4].Value = student.Class?.ToString() ?? "";
                    studentSheet.Cells[row, 5].Value = student.Branch ?? "";
                    studentSheet.Cells[row, 6].Value = student.StudentNumber?.ToString() ?? "";
                    studentSheet.Cells[row, 7].Value = student.PenaltyPoints;
                    row++;
                }
                studentSheet.Cells[studentSheet.Dimension?.Address ?? "A1"].AutoFitColumns();
            }

            if (dataTypes.Contains("personel_bilgileri"))
            {
                // Mevcut sayfayı koru, sadece yeni eklenenleri ekle
                var existingSheet = package.Workbook.Worksheets["Personel Bilgileri"];
                ExcelWorksheet personelSheet;
                HashSet<string> existingPersonelUsernames = new HashSet<string>();
                
                if (existingSheet != null)
                {
                    var lastRow = existingSheet.Dimension?.End.Row ?? 1;
                    for (int i = 2; i <= lastRow; i++)
                    {
                        var username = existingSheet.Cells[i, 1].Value?.ToString();
                        if (!string.IsNullOrEmpty(username))
                        {
                            existingPersonelUsernames.Add(username);
                        }
                    }
                    personelSheet = existingSheet;
                }
                else
                {
                    personelSheet = package.Workbook.Worksheets.Add("Personel Bilgileri");
                    personelSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                    personelSheet.Cells[1, 2].Value = "Ad";
                    personelSheet.Cells[1, 3].Value = "Soyad";
                    personelSheet.Cells[1, 4].Value = "Pozisyon";
                    FormatHeader(personelSheet.Cells[1, 1, 1, 4]);
                }

                // ActivityLogs'tan ADD_PERSONEL işlemlerini al
                var addPersonelLogs = await _context.ActivityLogs
                    .Where(l => l.Action == "ADD_PERSONEL")
                    .OrderBy(l => l.Timestamp)
                    .ToListAsync(cancellationToken);

                var newPersonels = new List<UserEntity>();
                foreach (var log in addPersonelLogs)
                {
                    var details = log.Details ?? "";
                    var usernameMatch = System.Text.RegularExpressions.Regex.Match(details, @"Kullanıcı Adı:\s*([^\s\)]+)");
                    if (usernameMatch.Success)
                    {
                        var username = usernameMatch.Groups[1].Value.Trim();
                        var personel = await _context.Users
                            .FirstOrDefaultAsync(u => u.Role == "personel" && u.Username == username, cancellationToken);
                        if (personel != null && !existingPersonelUsernames.Contains(personel.Username))
                        {
                            newPersonels.Add(personel);
                            existingPersonelUsernames.Add(personel.Username);
                        }
                    }
                }

                int row = personelSheet.Dimension?.End.Row + 1 ?? 2;
                foreach (var personel in newPersonels)
                {
                    personelSheet.Cells[row, 1].Value = personel.Username;
                    personelSheet.Cells[row, 2].Value = personel.Name ?? "";
                    personelSheet.Cells[row, 3].Value = personel.Surname ?? "";
                    personelSheet.Cells[row, 4].Value = personel.Position ?? "";
                    row++;
                }
                personelSheet.Cells[personelSheet.Dimension?.Address ?? "A1"].AutoFitColumns();
            }

            if (dataTypes.Contains("kitap_listesi"))
            {
                // Mevcut sayfayı koru, sadece yeni eklenenleri ekle
                var existingSheet = package.Workbook.Worksheets["Kitap Listesi"];
                ExcelWorksheet bookSheet;
                HashSet<string> existingBookKeys = new HashSet<string>();
                
                if (existingSheet != null)
                {
                    var lastRow = existingSheet.Dimension?.End.Row ?? 1;
                    for (int i = 2; i <= lastRow; i++)
                    {
                        var title = existingSheet.Cells[i, 1].Value?.ToString() ?? "";
                        var author = existingSheet.Cells[i, 2].Value?.ToString() ?? "";
                        if (!string.IsNullOrEmpty(title) && !string.IsNullOrEmpty(author))
                        {
                            existingBookKeys.Add($"{title}|{author}");
                        }
                    }
                    bookSheet = existingSheet;
                }
                else
                {
                    bookSheet = package.Workbook.Worksheets.Add("Kitap Listesi");
                    bookSheet.Cells[1, 1].Value = "Başlık";
                    bookSheet.Cells[1, 2].Value = "Yazar";
                    bookSheet.Cells[1, 3].Value = "Kategori";
                    bookSheet.Cells[1, 4].Value = "Miktar";
                    bookSheet.Cells[1, 5].Value = "Raf";
                    bookSheet.Cells[1, 6].Value = "Yayınevi";
                    bookSheet.Cells[1, 7].Value = "Özet";
                    bookSheet.Cells[1, 8].Value = "Numara";
                    bookSheet.Cells[1, 9].Value = "Yıl";
                    bookSheet.Cells[1, 10].Value = "Sayfa Sayısı";
                    FormatHeader(bookSheet.Cells[1, 1, 1, 10]);
                }

                // ActivityLogs'tan ADD_BOOK işlemlerini al
                var addBookLogs = await _context.ActivityLogs
                    .Where(l => l.Action == "ADD_BOOK")
                    .OrderBy(l => l.Timestamp)
                    .ToListAsync(cancellationToken);

                var newBooks = new List<Core.Domain.Book>();
                foreach (var log in addBookLogs)
                {
                    var details = log.Details ?? "";
                    var titleMatch = System.Text.RegularExpressions.Regex.Match(details, @"Kitap eklendi:\s*'([^']+)'");
                    var authorMatch = System.Text.RegularExpressions.Regex.Match(details, @"'\s*-\s*([^(]+)");
                    if (titleMatch.Success && authorMatch.Success)
                    {
                        var title = titleMatch.Groups[1].Value.Trim();
                        var author = authorMatch.Groups[1].Value.Trim();
                        var bookKey = $"{title}|{author}";
                        
                        if (!existingBookKeys.Contains(bookKey))
                        {
                            var book = await _bookCatalog.SearchAsync(title, author, cancellationToken);
                            var foundBook = book.FirstOrDefault(b => b.Title == title && b.Author == author);
                            if (foundBook != null)
                            {
                                newBooks.Add(foundBook);
                                existingBookKeys.Add(bookKey);
                            }
                        }
                    }
                }

                int row = bookSheet.Dimension?.End.Row + 1 ?? 2;
                foreach (var book in newBooks)
                {
                    bookSheet.Cells[row, 1].Value = book.Title;
                    bookSheet.Cells[row, 2].Value = book.Author;
                    bookSheet.Cells[row, 3].Value = book.Category;
                    bookSheet.Cells[row, 4].Value = book.Quantity;
                    bookSheet.Cells[row, 5].Value = ""; // Shelf
                    bookSheet.Cells[row, 6].Value = ""; // Publisher
                    bookSheet.Cells[row, 7].Value = ""; // Summary
                    bookSheet.Cells[row, 8].Value = ""; // BookNumber
                    bookSheet.Cells[row, 9].Value = ""; // Year
                    bookSheet.Cells[row, 10].Value = ""; // PageCount
                    row++;
                }
                bookSheet.Cells[bookSheet.Dimension?.Address ?? "A1"].AutoFitColumns();
            }

            if (dataTypes.Contains("odunc_bilgileri"))
            {
                // Sayfa varsa sil ve yeniden oluştur (güncelleme için)
                var existingSheet = package.Workbook.Worksheets["Ödünç Bilgileri"];
                if (existingSheet != null)
                {
                    package.Workbook.Worksheets.Delete(existingSheet);
                }
                var loanSheet = package.Workbook.Worksheets.Add("Ödünç Bilgileri");
                loanSheet.Cells[1, 1].Value = "Kitap Başlık";
                loanSheet.Cells[1, 2].Value = "Yazar";
                loanSheet.Cells[1, 3].Value = "Öğrenci";
                loanSheet.Cells[1, 4].Value = "Teslim Tarihi";
                loanSheet.Cells[1, 5].Value = "Personel";
                FormatHeader(loanSheet.Cells[1, 1, 1, 5]);

                var loans = await _bookCatalog.LoanOverviewAsync(cancellationToken);
                int row = 2;
                foreach (var loan in loans)
                {
                    loanSheet.Cells[row, 1].Value = loan.Title;
                    loanSheet.Cells[row, 2].Value = loan.Author;
                    loanSheet.Cells[row, 3].Value = loan.Borrower;
                    loanSheet.Cells[row, 4].Value = loan.DueDate.ToString("dd-MM-yyyy");
                    loanSheet.Cells[row, 5].Value = loan.personel ?? "";
                    row++;
                }
                loanSheet.Cells[loanSheet.Dimension.Address].AutoFitColumns();
            }

            // Loglar Sayfası - Sayfa varsa sil ve yeniden oluştur (güncelleme için)
            var existingLogSheet = package.Workbook.Worksheets["Loglar"];
            if (existingLogSheet != null)
            {
                package.Workbook.Worksheets.Delete(existingLogSheet);
            }
            var logSheet = package.Workbook.Worksheets.Add("Loglar");
            logSheet.Cells[1, 1].Value = "Tarih";
            logSheet.Cells[1, 2].Value = "Kullanıcı";
            logSheet.Cells[1, 3].Value = "İşlem";
            logSheet.Cells[1, 4].Value = "Detay";
            FormatHeader(logSheet.Cells[1, 1, 1, 4]);

            // Veritabanından kullanıcı loglarını al ve yaz
            try
            {
                // ActivityLogs tablosunun var olup olmadığını kontrol et
                if (await _context.Database.CanConnectAsync(cancellationToken))
                {
                    var activityLogs = await _context.ActivityLogs
                        .OrderByDescending(l => l.Timestamp)
                        .Take(1000) // Son 1000 log kaydı
                        .ToListAsync(cancellationToken);

                    int logRow = 2;
                    foreach (var log in activityLogs)
                    {
                        logSheet.Cells[logRow, 1].Value = log.Timestamp.ToString("dd-MM-yyyy HH:mm:ss");
                        logSheet.Cells[logRow, 2].Value = log.Username;
                        logSheet.Cells[logRow, 3].Value = log.Action;
                        logSheet.Cells[logRow, 4].Value = log.Details ?? "";
                        logRow++;
                    }
                    
                    // Eğer log yoksa bilgi mesajı yaz
                    if (activityLogs.Count == 0)
                    {
                        logSheet.Cells[2, 1].Value = "Henüz log kaydı bulunmamaktadır";
                    }
                }
                else
                {
                    logSheet.Cells[2, 1].Value = "Veritabanı bağlantısı kurulamadı";
                }
            }
            catch (Exception ex)
            {
                // Log yükleme hatası - detaylı hata mesajı yaz
                Console.WriteLine($"Log yükleme hatası: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                logSheet.Cells[2, 1].Value = $"Log yükleme hatası: {ex.Message}";
            }

            logSheet.Cells[logSheet.Dimension.Address].AutoFitColumns();

            // Dosyayı kaydet (varsa güncelle, yoksa oluştur)
            Console.WriteLine($"Dosya kaydediliyor: {fileInfo.FullName}");
            if (!string.IsNullOrEmpty(fileInfo.DirectoryName) && !Directory.Exists(fileInfo.DirectoryName))
            {
                Console.WriteLine($"Dizin oluşturuluyor: {fileInfo.DirectoryName}");
                Directory.CreateDirectory(fileInfo.DirectoryName);
            }
            package.SaveAs(fileInfo);
            Console.WriteLine($"✅ CreateMultiSheetExcelFile: Dosya başarıyla kaydedildi");
            LogToFile($"CreateMultiSheetExcelFile: Başarıyla kaydedildi -> {fileInfo.FullName}");
            Console.WriteLine("========== CreateMultiSheetExcelFile BİTTİ ==========\n");
        }
        finally
        {
            package?.Dispose();
        }
    }

    private async Task CreateSingleSheetExcelFile(string filePath, string dataType, CancellationToken cancellationToken)
    {
        Console.WriteLine($"========== CreateSingleSheetExcelFile BAŞL ADI ==========");
        Console.WriteLine($"Dosya yolu: {filePath}");
        Console.WriteLine($"Veri tipi: {dataType}");
        LogToFile($"CreateSingleSheetExcelFile: Başlıyor -> {filePath} (Type: {dataType})");
        
        ExcelPackage package;
        FileInfo fileInfo = new FileInfo(filePath);
        
        Console.WriteLine($"FileInfo oluşturuldu. Dosya mevcut mu: {fileInfo.Exists}");
        
        // Dosya varsa mevcut dosyayı oku, yoksa yeni oluştur
        if (fileInfo.Exists)
        {
            package = new ExcelPackage(fileInfo);
        }
        else
        {
            package = new ExcelPackage();
        }
        
        try
        {
            if (dataType == "ogrenci_bilgileri")
            {
                // Sayfa varsa sil ve yeniden oluştur (güncelleme için)
                var existingSheet = package.Workbook.Worksheets["Öğrenci Bilgileri"];
                if (existingSheet != null)
                {
                    package.Workbook.Worksheets.Delete(existingSheet);
                }
                var studentSheet = package.Workbook.Worksheets.Add("Öğrenci Bilgileri");
                studentSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                studentSheet.Cells[1, 2].Value = "Ad";
                studentSheet.Cells[1, 3].Value = "Soyad";
                studentSheet.Cells[1, 4].Value = "Sınıf";
                studentSheet.Cells[1, 5].Value = "Şube";
                studentSheet.Cells[1, 6].Value = "Numara";
                studentSheet.Cells[1, 7].Value = "Ceza Puanı";
                FormatHeader(studentSheet.Cells[1, 1, 1, 7]);

                var studentRecords = await _context.Users
                    .Where(u => u.Role == "Student")
                    .ToListAsync(cancellationToken);
                int row = 2;
                foreach (var student in studentRecords)
                {
                    studentSheet.Cells[row, 1].Value = student.Username;
                    studentSheet.Cells[row, 2].Value = student.Name ?? "";
                    studentSheet.Cells[row, 3].Value = student.Surname ?? "";
                    studentSheet.Cells[row, 4].Value = student.Class?.ToString() ?? "";
                    studentSheet.Cells[row, 5].Value = student.Branch ?? "";
                    studentSheet.Cells[row, 6].Value = student.StudentNumber?.ToString() ?? "";
                    studentSheet.Cells[row, 7].Value = student.PenaltyPoints;
                    row++;
                }
                studentSheet.Cells[studentSheet.Dimension.Address].AutoFitColumns();
            }
            else if (dataType == "personel_bilgileri")
            {
                // Sayfa varsa sil ve yeniden oluştur (güncelleme için)
                var existingSheet = package.Workbook.Worksheets["Personel Bilgileri"];
                if (existingSheet != null)
                {
                    package.Workbook.Worksheets.Delete(existingSheet);
                }
                var personelSheet = package.Workbook.Worksheets.Add("Personel Bilgileri");
                personelSheet.Cells[1, 1].Value = "Kullanıcı Adı";
                personelSheet.Cells[1, 2].Value = "Ad";
                personelSheet.Cells[1, 3].Value = "Soyad";
                personelSheet.Cells[1, 4].Value = "Pozisyon";
                FormatHeader(personelSheet.Cells[1, 1, 1, 4]);

                var personelRecords = await _context.Users
                    .Where(u => u.Role == "personel")
                    .ToListAsync(cancellationToken);
                int row = 2;
                foreach (var personel in personelRecords)
                {
                    personelSheet.Cells[row, 1].Value = personel.Username;
                    personelSheet.Cells[row, 2].Value = personel.Name ?? "";
                    row++;
                }
                personelSheet.Cells[personelSheet.Dimension.Address].AutoFitColumns();
            }
            else if (dataType == "kitap_listesi")
            {
                // Sayfa varsa sil ve yeniden oluştur (güncelleme için)
                var existingSheet = package.Workbook.Worksheets["Kitap Listesi"];
                if (existingSheet != null)
                {
                    package.Workbook.Worksheets.Delete(existingSheet);
                }
                var bookSheet = package.Workbook.Worksheets.Add("Kitap Listesi");
                bookSheet.Cells[1, 1].Value = "Başlık";
                bookSheet.Cells[1, 2].Value = "Yazar";
                bookSheet.Cells[1, 3].Value = "Kategori";
                bookSheet.Cells[1, 4].Value = "Miktar";
                bookSheet.Cells[1, 5].Value = "Raf";
                bookSheet.Cells[1, 6].Value = "Yayınevi";
                bookSheet.Cells[1, 7].Value = "Özet";
                bookSheet.Cells[1, 8].Value = "Numara";
                bookSheet.Cells[1, 9].Value = "Yıl";
                bookSheet.Cells[1, 10].Value = "Sayfa Sayısı";
                FormatHeader(bookSheet.Cells[1, 1, 1, 10]);

                var books = await _bookCatalog.SearchAsync(null, null, cancellationToken);
                int row = 2;
                foreach (var book in books)
                {
                    // Storage bağımlılıkları kaldırıldı - ek bilgiler artık DB'de değil
                    bookSheet.Cells[row, 1].Value = book.Title;
                    bookSheet.Cells[row, 2].Value = book.Author;
                    bookSheet.Cells[row, 3].Value = book.Category;
                    bookSheet.Cells[row, 4].Value = book.Quantity;
                    bookSheet.Cells[row, 5].Value = ""; // Shelf
                    bookSheet.Cells[row, 6].Value = ""; // Publisher
                    bookSheet.Cells[row, 7].Value = ""; // Summary
                    bookSheet.Cells[row, 8].Value = ""; // BookNumber
                    bookSheet.Cells[row, 9].Value = ""; // Year
                    bookSheet.Cells[row, 10].Value = ""; // PageCount
                    row++;
                }
                bookSheet.Cells[bookSheet.Dimension.Address].AutoFitColumns();
            }
            else if (dataType == "odunc_bilgileri")
            {
                // Sayfa varsa sil ve yeniden oluştur (güncelleme için)
                var existingSheet = package.Workbook.Worksheets["Ödünç Bilgileri"];
                if (existingSheet != null)
                {
                    package.Workbook.Worksheets.Delete(existingSheet);
                }
                var loanSheet = package.Workbook.Worksheets.Add("Ödünç Bilgileri");
                loanSheet.Cells[1, 1].Value = "Kitap Başlık";
                loanSheet.Cells[1, 2].Value = "Yazar";
                loanSheet.Cells[1, 3].Value = "Öğrenci";
                loanSheet.Cells[1, 4].Value = "Teslim Tarihi";
                loanSheet.Cells[1, 5].Value = "Personel";
                FormatHeader(loanSheet.Cells[1, 1, 1, 5]);

                var loans = await _bookCatalog.LoanOverviewAsync(cancellationToken);
                int row = 2;
                foreach (var loan in loans)
                {
                    loanSheet.Cells[row, 1].Value = loan.Title;
                    loanSheet.Cells[row, 2].Value = loan.Author;
                    loanSheet.Cells[row, 3].Value = loan.Borrower;
                    loanSheet.Cells[row, 4].Value = loan.DueDate.ToString("dd-MM-yyyy");
                    loanSheet.Cells[row, 5].Value = loan.personel ?? "";
                    row++;
                }
                loanSheet.Cells[loanSheet.Dimension.Address].AutoFitColumns();
            }

            // Loglar sadece "Kütüphane Verileri.xlsx" dosyasında olacak, bu metodda loglar yazılmayacak

            // Dosyayı kaydet (varsa güncelle, yoksa oluştur)
            Console.WriteLine($"Dosya kaydediliyor: {fileInfo.FullName}");
            if (!string.IsNullOrEmpty(fileInfo.DirectoryName) && !Directory.Exists(fileInfo.DirectoryName))
            {
                Console.WriteLine($"Dizin oluşturuluyor: {fileInfo.DirectoryName}");
                Directory.CreateDirectory(fileInfo.DirectoryName);
            }
            package.SaveAs(fileInfo);
            Console.WriteLine($"✅ CreateSingleSheetExcelFile: Dosya başarıyla kaydedildi");
            LogToFile($"CreateSingleSheetExcelFile: Başarıyla kaydedildi -> {fileInfo.FullName}");
            Console.WriteLine("========== CreateSingleSheetExcelFile BİTTİ ==========\n");
        }
        finally
        {
            package?.Dispose();
        }
    }

    private void FormatHeader(OfficeOpenXml.ExcelRange range)
    {
        range.Style.Font.Bold = true;
        range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
        range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
    }



    public sealed record RecordTypeRequest(
        string Id,
        string Name,
        List<string>? DataTypes,
        string? FilePath,
        string? SaveMode,
        bool? SaveToCurrentDateFolder);

    public sealed record SyncRequest(string Username);

    public sealed record AutoRecordSettingsRequest(
        bool AutoRecordEnabled,
        int AutoRecordIntervalMinutes);

    // Model sınıfları
    public class UserSettingsRoot
    {
        public Dictionary<string, UserSetting>? UserSettings { get; set; }
    }

    public class UserSetting
    {
        public string? Username { get; set; }
        public List<RecordTypeModel>? RecordPaths { get; set; }
        public bool AutoRecordEnabled { get; set; } = false;
        public int AutoRecordIntervalMinutes { get; set; } = 60;
    }

    public class RecordTypeModel
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Type { get; set; } = "custom";
        public string FileType { get; set; } = "xlsx";
        public string FilePath { get; set; } = "";
        public bool Locked { get; set; } = false;
        public bool AutoSave { get; set; } = true;
        public string SaveMode { get; set; } = "current";
        public List<string> DataTypes { get; set; } = new List<string>();
        public bool SaveToCurrentDateFolder { get; set; } = false;
    }
}
