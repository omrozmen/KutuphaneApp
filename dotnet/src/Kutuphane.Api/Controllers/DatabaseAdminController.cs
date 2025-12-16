using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Application.Admin;
using Kutuphane.Core.Application.BookCatalog;
using Kutuphane.Core.Application.Statistics;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.Database.Entities;
using Kutuphane.Infrastructure.Database.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OfficeOpenXml;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class DatabaseAdminController : ControllerBase
{
    private readonly BookCatalogService _bookCatalog;
    private readonly IUserRepository _userRepository;
    private readonly AdminService _adminService;
    private readonly KutuphaneDbContext _context;
    private readonly DatabaseBackupService _backupService;
    private readonly IServiceProvider _serviceProvider;
    private readonly Kutuphane.Infrastructure.Database.Services.AutoBackupService? _autoBackupService;
    private readonly StatisticsService _statistics;

    public DatabaseAdminController(
        BookCatalogService bookCatalog,
        IUserRepository userRepository,
        AdminService adminService,
        KutuphaneDbContext context,
        DatabaseBackupService backupService,
        IServiceProvider serviceProvider,
        StatisticsService statistics,
        Kutuphane.Infrastructure.Database.Services.AutoBackupService? autoBackupService = null)
    {
        _bookCatalog = bookCatalog;
        _userRepository = userRepository;
        _adminService = adminService;
        _context = context;
        _backupService = backupService;
        _serviceProvider = serviceProvider;
        _statistics = statistics;
        _autoBackupService = autoBackupService;
    }

    // Öğrenci işlemleri - Sadece DB'den
    [HttpPost("students")]
    public async Task<ActionResult<AddStudentResponse>> AddStudent([FromBody] AddStudentRequest request, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Surname))
        {
            return BadRequest(new { message = "Ad ve Soyad zorunludur" });
        }

        if (!request.StudentNumber.HasValue)
        {
            return BadRequest(new { message = "Öğrenci numarası zorunludur" });
        }

        // Aynı numarada öğrenci kontrolü - DB'den
        var existingStudent = await _context.Users
            .FirstOrDefaultAsync(u => u.StudentNumber == request.StudentNumber, cancellationToken);
        if (existingStudent != null)
        {
            return BadRequest(new { message = $"Bu öğrenci numarası ({request.StudentNumber}) zaten kullanılıyor." });
        }

        // Öğrenci oluştur - kullanıcı adı/şifre olmadan
        var userEntity = new UserEntity
        {
            Username = null, // Öğrenciler için username yok
            Password = null, // Öğrenciler için şifre yok
            Role = "Student",
            Name = request.Name,
            Surname = request.Surname,
            Class = request.Class,
            Branch = request.Branch,
            StudentNumber = request.StudentNumber
        };
        _context.Users.Add(userEntity);
        await _context.SaveChangesAsync(cancellationToken);

        // Veri değişikliği olduğunda kayıtları güncelle
        try
        {
            var recordTypesController = _serviceProvider.GetRequiredService<RecordTypesController>();
            var username = Request.Cookies["kutuphane_session"] ?? "";
            await recordTypesController.UpdateRecordsOnDataChange(username, new List<string> { "ogrenci_bilgileri" }, cancellationToken);
        }
        catch (Exception ex)
        {
            // Kayıt güncelleme hatası kritik değil, sessizce devam et
            System.Diagnostics.Debug.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
        }

        // Öğrenci ekleme işlemini logla
        try
        {
            var username = Request.Cookies["kutuphane_session"] ?? "";
            if (!string.IsNullOrEmpty(username))
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = username,
                    Action = "ADD_STUDENT",
                    Details = $"Öğrenci eklendi: {request.Name} {request.Surname} (No: {request.StudentNumber}, Sınıf: {request.Class}{request.Branch})"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
        }
        catch
        {
            // Log kaydetme hatası kritik değil, sessizce devam et
        }

        return Ok(new AddStudentResponse 
        { 
            Success = true, 
            Message = "Öğrenci başarıyla eklendi" 
        });
    }

    [HttpGet("students")]
    public async Task<ActionResult<List<StudentInfoResponse>>> GetStudents(CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var students = await _context.Users
            .Where(u => u.Role == "Student")
            .ToListAsync(cancellationToken);

        var response = students.Select(s => new StudentInfoResponse
        {
            StudentNumber = s.StudentNumber,
            Name = s.Name ?? "",
            Surname = s.Surname ?? "",
            Class = s.Class,
            Branch = s.Branch ?? "",
            PenaltyPoints = s.PenaltyPoints
        }).ToList();

        return Ok(response);
    }

    [HttpGet("classes")]
    public IActionResult GetClasses()
    {
        // Sınıf listesi: 9-12 arası
        var classes = new List<int> { 9, 10, 11, 12 };
        return Ok(classes);
    }

    [HttpPut("students/{studentNumber}")]
    public async Task<ActionResult<AddStudentResponse>> UpdateStudent(int studentNumber, [FromBody] UpdateStudentRequest request, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var student = await _context.Users
            .FirstOrDefaultAsync(u => u.StudentNumber == studentNumber && u.Role == "Student", cancellationToken);
        
        if (student == null)
        {
            return NotFound(new { message = "Öğrenci bulunamadı" });
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
        {
            student.Name = request.Name;
        }
        if (!string.IsNullOrWhiteSpace(request.Surname))
        {
            student.Surname = request.Surname;
        }
        if (request.Class.HasValue)
        {
            student.Class = request.Class;
        }
        if (request.Branch != null)
        {
            student.Branch = request.Branch;
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Veri değişikliği olduğunda kayıtları güncelle
        try
        {
            var recordTypesController = _serviceProvider.GetRequiredService<RecordTypesController>();
            var username = Request.Cookies["kutuphane_session"] ?? "";
            await recordTypesController.UpdateRecordsOnDataChange(username, new List<string> { "ogrenci_bilgileri" }, cancellationToken);
        }
        catch (Exception ex)
        {
            // Kayıt güncelleme hatası kritik değil, sessizce devam et
            System.Diagnostics.Debug.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
        }

        // Öğrenci güncelleme işlemini logla
        try
        {
            var username = Request.Cookies["kutuphane_session"] ?? "";
            if (!string.IsNullOrEmpty(username))
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = username,
                    Action = "UPDATE_STUDENT",
                    Details = $"Öğrenci güncellendi: {student.Name} {student.Surname} (No: {studentNumber})"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
        }
        catch
        {
            // Log kaydetme hatası kritik değil, sessizce devam et
        }

        return Ok(new AddStudentResponse 
        { 
            Success = true, 
            Message = "Öğrenci başarıyla güncellendi" 
        });
    }

    [HttpPut("students/{studentName}/penalty")]
    public async Task<ActionResult> UpdateStudentPenalty(string studentName, [FromBody] UpdatePenaltyRequest request, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        if (request.PenaltyPoints < 0)
        {
            return BadRequest(new { message = "Ceza puanı negatif olamaz" });
        }

        // Öğrenciyi bul - Name veya Name+Surname kombinasyonu ile
        var studentParts = studentName.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        var name = studentParts.Length > 0 ? studentParts[0] : studentName.Trim();
        var surname = studentParts.Length > 1 ? string.Join(" ", studentParts.Skip(1)) : "";
        var nameLower = name.ToLower();
        var surnameLower = surname.ToLower();
        var studentNameLower = studentName.Trim().ToLower();
        
        // Tüm öğrencileri çek ve client-side'da filtrele (EF Core StringComparison desteklemediği için)
        var allStudents = await _context.Users
            .Where(u => u.Role == "Student")
            .ToListAsync(cancellationToken);
        
        var student = allStudents.FirstOrDefault(u => 
            (surname == "" && u.Name != null && u.Name.ToLower() == nameLower) ||
            (surname != "" && u.Name != null && u.Surname != null && 
             u.Name.ToLower() == nameLower && u.Surname.ToLower() == surnameLower) ||
            (u.Name != null && u.Surname != null && 
             (u.Name + " " + u.Surname).Trim().ToLower() == studentNameLower));
        
        if (student == null)
        {
            return NotFound(new { message = "Öğrenci bulunamadı" });
        }

        student.PenaltyPoints = request.PenaltyPoints;
        await _context.SaveChangesAsync(cancellationToken);

        // Ceza puanı güncelleme işlemini logla
        try
        {
            var username = Request.Cookies["kutuphane_session"] ?? "";
            if (!string.IsNullOrEmpty(username))
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = username,
                    Action = "UPDATE_PENALTY",
                    Details = $"Öğrenci ceza puanı güncellendi: {student.Name} {student.Surname} (No: {student.StudentNumber}) - Yeni puan: {request.PenaltyPoints}"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
        }
        catch
        {
            // Log kaydetme hatası kritik değil, sessizce devam et
        }

        return Ok(new { message = "Ceza puanı başarıyla güncellendi", penaltyPoints = request.PenaltyPoints });
    }

    [HttpDelete("students/{studentNumber}")]
    public async Task<ActionResult> DeleteStudent(int studentNumber, CancellationToken cancellationToken)
        => await DeleteStudentInternal(studentNumber, cancellationToken);

    // Bazı istemciler öğrenci numarasını path yerine query/body ile gönderiyor.
    // Aynı silme mantığını tekrar kullanarak 405 hatasını önlüyoruz.
    [HttpDelete("students")]
    public async Task<ActionResult> DeleteStudentFlexible(
        [FromQuery] int? studentNumber,
        [FromBody] JsonElement? body,
        CancellationToken cancellationToken)
    {
        // Body'den çoklu seçim destekleniyor; frontend bazen dizi, bazen obje gönderiyor
        var numbers = new List<int>();

        if (body.HasValue)
        {
            var json = body.Value;
            // Dizi olarak geldiyse (örn: [1,2,3])
            if (json.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in json.EnumerateArray())
                {
                    if (item.TryGetInt32(out var val))
                    {
                        numbers.Add(val);
                    }
                    else if (item.ValueKind == JsonValueKind.Object &&
                             TryGetInt(item, "studentNumber", out var sn))
                    {
                        numbers.Add(sn);
                    }
                }
            }
            // Obje olarak geldiyse
            else if (json.ValueKind == JsonValueKind.Object)
            {
                if (TryGetInt(json, "studentNumber", out var single))
                {
                    numbers.Add(single);
                }

                if (TryGetIntArray(json, "studentNumbers", numbers))
                {
                    // already added inside
                }
                // Bazı frontend'ler "students" içinde {studentNumber: x} listesi yolluyor
                else if (TryGetIntArray(json, "students", numbers))
                {
                    // handled
                }
                else if (json.TryGetProperty("students", out var studentsProp) &&
                         studentsProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var stu in studentsProp.EnumerateArray())
                    {
                        if (TryGetInt(stu, "studentNumber", out var sn2))
                        {
                            numbers.Add(sn2);
                        }
                    }
                }
            }
        }

        if (studentNumber.HasValue)
        {
            numbers.Add(studentNumber.Value);
        }

        if (numbers.Count == 0)
        {
            return BadRequest(new { message = "Öğrenci numarası gerekli" });
        }

        var results = await DeleteStudentsInternal(numbers, cancellationToken);
        return results;
    }

    private async Task<ActionResult> DeleteStudentInternal(int studentNumber, CancellationToken cancellationToken)
        => await DeleteStudentsInternal(new List<int> { studentNumber }, cancellationToken);

    private async Task<ActionResult> DeleteStudentsInternal(IEnumerable<int> studentNumbers, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var numberList = studentNumbers.Distinct().ToList();
        if (numberList.Count == 0)
        {
            return BadRequest(new { message = "Öğrenci numarası gerekli" });
        }

        var students = await _context.Users
            .Where(u => u.Role == "Student" && u.StudentNumber.HasValue && numberList.Contains(u.StudentNumber.Value))
            .ToListAsync(cancellationToken);

        if (students.Count == 0)
        {
            return NotFound(new { message = "Öğrenci bulunamadı" });
        }

        // Öğrencileri silmeden önce ödünç kayıtlarını temizle
        foreach (var student in students)
        {
            var studentName = $"{student.Name} {student.Surname}".Trim();
            if (!string.IsNullOrWhiteSpace(studentName))
            {
                await _bookCatalog.RemoveLoansByBorrowerAsync(studentName, cancellationToken);
                
                // Öğrenci istatistiklerini temizle
                var studentStats = await _context.StudentStats
                    .Where(s => s.Name == student.Name && s.Surname == student.Surname)
                    .ToListAsync(cancellationToken);
                if (studentStats.Any())
                {
                    _context.StudentStats.RemoveRange(studentStats);
                }

                // LoanHistory temizle - HEM isim HEM numara ile!
                // StudentHistory endpoint hem NormalizedBorrower hem de StudentNumber ile sorgu yaptığı için
                // her iki koşulla da eşleşenleri silmeliyiz
                var normalizedName = studentName.ToLower().Trim();
                var loanHistory = await _context.LoanHistory
                    .Where(lh => lh.NormalizedBorrower == normalizedName || 
                                 (student.StudentNumber.HasValue && lh.StudentNumber == student.StudentNumber.Value))
                    .ToListAsync(cancellationToken);
                if (loanHistory.Any())
                {
                    _context.LoanHistory.RemoveRange(loanHistory);
                }
            }
        }

        _context.Users.RemoveRange(students);
        await _context.SaveChangesAsync(cancellationToken);

        // Veri değişikliği olduğunda kayıtları güncelle
        try
        {
            var recordTypesController = _serviceProvider.GetRequiredService<RecordTypesController>();
            var username = Request.Cookies["kutuphane_session"] ?? "";
            await recordTypesController.UpdateRecordsOnDataChange(username, new List<string> { "ogrenci_bilgileri" }, cancellationToken);
        }
        catch (Exception ex)
        {
            // Kayıt güncelleme hatası kritik değil, sessizce devam et
            System.Diagnostics.Debug.WriteLine($"Kayıt güncelleme hatası: {ex.Message}");
        }

        // Öğrenci silme işlemini logla
        try
        {
            var username = Request.Cookies["kutuphane_session"] ?? "";
            if (!string.IsNullOrEmpty(username))
            {
                foreach (var student in students)
                {
                    var log = new ActivityLogEntity
                    {
                        Timestamp = DateTime.Now,
                        Username = username,
                        Action = "DELETE_STUDENT",
                        Details = $"Öğrenci silindi: {student.Name} {student.Surname} (No: {student.StudentNumber})"
                    };
                    _context.ActivityLogs.Add(log);
                }
                await _context.SaveChangesAsync(cancellationToken);
            }
        }
        catch
        {
            // Log kaydetme hatası kritik değil, sessizce devam et
        }

        return Ok(new 
        { 
            message = "Öğrenci(ler) başarıyla silindi", 
            deleted = students.Select(s => s.StudentNumber) 
        });
    }

    public class DeleteStudentRequest
    {
        public int? StudentNumber { get; set; }
        public List<int>? StudentNumbers { get; set; }
    }

    private static bool TryGetInt(JsonElement element, string property, out int value)
    {
        value = default;
        if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var direct))
        {
            value = direct;
            return true;
        }

        if (element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(property, out var prop) &&
            prop.TryGetInt32(out var fromProp))
        {
            value = fromProp;
            return true;
        }

        return false;
    }

    private static bool TryGetIntArray(JsonElement element, string property, List<int> target)
    {
        if (element.ValueKind == JsonValueKind.Object &&
            element.TryGetProperty(property, out var arr) &&
            arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                if (item.TryGetInt32(out var val))
                {
                    target.Add(val);
                }
                else if (item.ValueKind == JsonValueKind.Object &&
                         TryGetInt(item, "studentNumber", out var nested))
                {
                    target.Add(nested);
                }
            }
            return true;
        }

        return false;
    }

    // Personel işlemleri - Sadece DB'den
    [HttpPost("personel")]
    public async Task<ActionResult> Addpersonel([FromBody] CreatepersonelRequest request, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Surname))
        {
            return BadRequest(new { message = "Kullanıcı adı, ad ve soyad zorunludur" });
        }

        // Kullanıcı adı kontrolü
        var existingUser = await _userRepository.FindByUsernameAsync(request.Username, cancellationToken);
        if (existingUser != null)
        {
            return BadRequest(new { message = "Bu kullanıcı adı zaten kullanılıyor." });
        }

        try
        {
            var password = string.IsNullOrWhiteSpace(request.Password) ? "1234" : request.Password;
            await _adminService.CreatepersonelAsync(request.Username, password, request.Name, cancellationToken);
            
            // UserEntity'yi güncelle - Name, Surname, Position ekle
            var userEntity = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == request.Username, cancellationToken);
            if (userEntity != null)
            {
                userEntity.Name = request.Name;
                userEntity.Surname = request.Surname;
                userEntity.Position = request.Position;
                await _context.SaveChangesAsync(cancellationToken);
            }
            else
            {
                // Eğer userEntity bulunamazsa, direkt oluştur
                var newpersonelEntity = new UserEntity
                {
                    Username = request.Username,
                    Password = password,
                    Role = "personel",
                    Name = request.Name,
                    Surname = request.Surname,
                    Position = request.Position
                };
                _context.Users.Add(newpersonelEntity);
                await _context.SaveChangesAsync(cancellationToken);
            }

            // Personel ekleme işlemini logla
            try
            {
                var username = Request.Cookies["kutuphane_session"] ?? "";
                if (!string.IsNullOrEmpty(username))
                {
                    var log = new ActivityLogEntity
                    {
                        Timestamp = DateTime.Now,
                        Username = username,
                        Action = "ADD_PERSONEL",
                        Details = $"Personel eklendi: {request.Name} {request.Surname} (Kullanıcı Adı: {request.Username})"
                    };
                    _context.ActivityLogs.Add(log);
                    await _context.SaveChangesAsync(cancellationToken);
                }
            }
            catch
            {
                // Log kaydetme hatası kritik değil, sessizce devam et
            }

            return Ok(new { message = "Personel başarıyla oluşturuldu" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"Personel oluşturulamadı: {ex.Message}" });
        }
    }

    [HttpGet("personel")]
    public async Task<ActionResult<List<personelInfoResponse>>> Getpersonel(CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var personel = await _context.Users
            .Where(u => u.Role == "personel")
            .ToListAsync(cancellationToken);

        var response = personel.Select(s => new personelInfoResponse
        {
            Username = s.Username ?? "",
            Name = s.Name ?? "",
            Surname = s.Surname ?? "",
            Position = s.Position ?? ""
        }).ToList();

        return Ok(response);
    }

    [HttpPut("personel/{username}")]
    public async Task<ActionResult> Updatepersonel(string username, [FromBody] UpdatepersonelRequest request, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
        if (user == null || user.Role != "personel")
        {
            return NotFound(new { message = "Personel bulunamadı" });
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
        {
            user.Name = request.Name;
        }
        if (!string.IsNullOrWhiteSpace(request.Surname))
        {
            user.Surname = request.Surname;
        }
        if (request.Position != null)
        {
            user.Position = request.Position;
        }
        if (!string.IsNullOrWhiteSpace(request.Password))
        {
            user.Password = request.Password;
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Personel güncelleme işlemini logla
        try
        {
            var loggedUsername = Request.Cookies["kutuphane_session"] ?? "";
            if (!string.IsNullOrEmpty(loggedUsername))
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = loggedUsername,
                    Action = "UPDATE_PERSONEL",
                    Details = $"Personel güncellendi: {user.Name} {user.Surname} (Kullanıcı Adı: {username})"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
        }
        catch
        {
            // Log kaydetme hatası kritik değil, sessizce devam et
        }

        return Ok(new { message = "Personel başarıyla güncellendi" });
    }

    [HttpDelete("personel/{username}")]
    public async Task<ActionResult> Deletepersonel(string username, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var user = await _userRepository.FindByUsernameAsync(username, cancellationToken);
        if (user == null || user.Role != UserRole.personel)
        {
            return NotFound(new { message = "Personel bulunamadı" });
        }

        await _userRepository.DeleteAsync(username, cancellationToken);

        // Personel silme işlemini logla
        try
        {
            var loggedUsername = Request.Cookies["kutuphane_session"] ?? "";
            if (!string.IsNullOrEmpty(loggedUsername))
            {
                // UserEntity'den bilgileri al (silmeden önce)
                var userEntity = await _context.Users
                    .FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
                var name = userEntity?.Name ?? "";
                var surname = userEntity?.Surname ?? "";
                
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = loggedUsername,
                    Action = "DELETE_PERSONEL",
                    Details = $"Personel silindi: {name} {surname} (Kullanıcı Adı: {username})"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
        }
        catch
        {
            // Log kaydetme hatası kritik değil, sessizce devam et
        }

        return Ok(new { message = "Personel başarıyla silindi" });
    }

    // Veritabanı yönetimi
    [HttpGet("database/info")]
    public async Task<ActionResult<DatabaseInfoResponse>> GetDatabaseInfo(CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var bookCount = await _context.Books.CountAsync(cancellationToken);
        // Kullanıcı sayısı: sadece admin ve personeller (öğrenciler dahil değil)
        var userCount = await _context.Users.CountAsync(u => u.Role == "personel" || u.Role == "ADMIN" || u.Role == "Admin", cancellationToken);
        var loanCount = await _context.Loans.CountAsync(cancellationToken);
        var studentCount = await _context.Users.CountAsync(u => u.Role == "Student", cancellationToken);
        var personelCount = await _context.Users.CountAsync(u => u.Role == "personel", cancellationToken);
        var adminCount = await _context.Users.CountAsync(u => u.Role == "ADMIN" || u.Role == "Admin", cancellationToken);

        return Ok(new DatabaseInfoResponse
        {
            BookCount = bookCount,
            UserCount = userCount,
            LoanCount = loanCount,
            StudentCount = studentCount,
            personelCount = personelCount,
            AdminCount = adminCount,
            DatabasePath = _backupService.DatabasePath
        });
    }

    [HttpPost("database/backup")]
    public async Task<ActionResult<BackupResponse>> CreateBackup(CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        try
        {
            var backupPath = await _backupService.BackupAsync(null, false, cancellationToken);
            return Ok(new BackupResponse { Success = true, BackupPath = backupPath, Message = "Yedek başarıyla oluşturuldu" });
        }
        catch (Exception ex)
        {
            return BadRequest(new BackupResponse { Success = false, Message = ex.Message });
        }
    }

    [HttpGet("database/backups")]
    public ActionResult<List<string>> ListBackups()
    {
        // TODO: Admin kontrolü ekle
        var backups = _backupService.ListBackups();
        return Ok(backups.ToList());
    }

    [HttpPost("database/restore")]
    public async Task<ActionResult<RestoreResponse>> RestoreBackup([FromBody] RestoreRequest request, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        try
        {
            // Geri yükleme sırasında before_restore yedeği oluşturma - veri kaybını önlemek için false
            await _backupService.RestoreAsync(request.BackupPath, createSafetyBackup: false, cancellationToken);
            return Ok(new RestoreResponse { Success = true, Message = "Yedek başarıyla geri yüklendi" });
        }
        catch (Exception ex)
        {
            return BadRequest(new RestoreResponse { Success = false, Message = ex.Message });
        }
    }

    [HttpDelete("database/backups/{backupFileName}")]
    public ActionResult<BackupResponse> DeleteBackup(string backupFileName)
    {
        // TODO: Admin kontrolü ekle
        try
        {
            var backupDir = _backupService.GetBackupDirectory();
            var backupPath = Path.Combine(backupDir, backupFileName);
            
            if (!System.IO.File.Exists(backupPath))
            {
                return NotFound(new BackupResponse { Success = false, Message = "Yedek dosyası bulunamadı" });
            }

            System.IO.File.Delete(backupPath);
            return Ok(new BackupResponse { Success = true, Message = "Yedek başarıyla silindi" });
        }
        catch (Exception ex)
        {
            return BadRequest(new BackupResponse { Success = false, Message = ex.Message });
        }
    }

    [HttpPost("database/cleanup")]
    public ActionResult<CleanupResponse> CleanupOldBackups([FromBody] CleanupRequest? request)
    {
        // TODO: Admin kontrolü ekle
        try
        {
            var daysToKeep = request?.DaysToKeep ?? 30;
            var deletedCount = _backupService.CleanOldBackups(daysToKeep);
            return Ok(new CleanupResponse 
            { 
                Success = true, 
                DeletedCount = deletedCount,
                Message = $"{deletedCount} eski yedek dosyası temizlendi" 
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new CleanupResponse { Success = false, Message = ex.Message });
        }
    }

    [HttpPost("database/clear-all")]
    public async Task<ActionResult> ClearAllData(CancellationToken cancellationToken)
    {
        try
        {
            // Önce bir yedek alalım
            var backupPath = await _backupService.BackupAsync(null, false, cancellationToken);
            
            // Tüm tabloları temizle
            _context.Loans.RemoveRange(_context.Loans);
            _context.Books.RemoveRange(_context.Books);
            
            // Sadece öğrencileri temizle (Admin ve Personel kalsın)
            var studentsToDelete = _context.Users.Where(u => u.Role == "Student");
            _context.Users.RemoveRange(studentsToDelete);
            
            // İstatistik verilerini temizle
            _context.StudentStats.RemoveRange(_context.StudentStats);
            
            // Activity logları temizle (isteğe bağlı)
            _context.ActivityLogs.RemoveRange(_context.ActivityLogs);
            
            await _context.SaveChangesAsync(cancellationToken);
            
            // Loglama
            var username = Request.Cookies["kutuphane_session"] ?? "";
            if (!string.IsNullOrEmpty(username))
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = username,
                    Action = "CLEAR_DATABASE",
                    Details = $"Veritabanı tamamen temizlendi. Yedek: {backupPath}"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
            
            return Ok(new 
            { 
                success = true, 
                message = "Veritabanı başarıyla temizlendi (Kitaplar, Öğrenciler, Ödünçler ve İstatistikler silindi. Admin/Personel korundu.)",
                backupPath = backupPath
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { success = false, message = $"Hata: {ex.Message}" });
        }
    }

    [HttpGet("database/auto-backup/status")]
    public ActionResult<AutoBackupStatusResponse> GetAutoBackupStatus()
    {
        // TODO: Admin kontrolü ekle
        if (_autoBackupService == null)
        {
            return Ok(new AutoBackupStatusResponse
            {
                Enabled = false,
                IntervalDays = 30,
                LastBackupDate = null
            });
        }

        return Ok(new AutoBackupStatusResponse
        {
            Enabled = _autoBackupService.IsEnabled,
            IntervalDays = _autoBackupService.BackupIntervalDays,
            LastBackupDate = _autoBackupService.LastBackupDate
        });
    }

    [HttpPost("database/auto-backup/configure")]
    public ActionResult<ConfigureAutoBackupResponse> ConfigureAutoBackup([FromBody] ConfigureAutoBackupRequest request)
    {
        // TODO: Admin kontrolü ekle
        if (_autoBackupService == null)
        {
            return BadRequest(new ConfigureAutoBackupResponse 
            { 
                Success = false, 
                Message = "Otomatik yedekleme servisi kullanılamıyor" 
            });
        }

        try
        {
            if (request.IntervalDays.HasValue && request.IntervalDays.Value > 0)
            {
                _autoBackupService.SetBackupInterval(request.IntervalDays.Value);
            }

            if (request.Enabled.HasValue)
            {
                _autoBackupService.SetEnabled(request.Enabled.Value);
            }

            return Ok(new ConfigureAutoBackupResponse
            {
                Success = true,
                Message = "Otomatik yedekleme ayarları güncellendi"
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new ConfigureAutoBackupResponse 
            { 
                Success = false, 
                Message = ex.Message 
            });
        }
    }

    // Tüm verileri görüntüleme
    [HttpGet("data/books")]
    public async Task<ActionResult<List<BookEntity>>> GetAllBooks(CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var books = await _context.Books
            .Include(b => b.Loans)
            .ToListAsync(cancellationToken);
        return Ok(books);
    }

    [HttpGet("data/users")]
    public async Task<ActionResult<List<UserEntity>>> GetAllUsers(CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var users = await _context.Users.ToListAsync(cancellationToken);
        return Ok(users);
    }

    [HttpGet("data/loans")]
    public async Task<ActionResult<List<LoanInfoResponse>>> GetAllLoans(CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var loans = await _context.Loans
            .Include(l => l.Book)
            .ToListAsync(cancellationToken);
        
        // DTO kullanarak döngüsel referansı önle
        var response = loans.Select(l => new LoanInfoResponse
        {
            Id = l.Id,
            BookId = l.BookId,
            Borrower = l.Borrower,
            DueDate = l.DueDate,
            personel = l.personel,
            BookTitle = l.Book?.Title ?? "Bilinmiyor",
            BookAuthor = l.Book?.Author ?? "Bilinmiyor"
        }).ToList();
        
        return Ok(response);
    }

    /// <summary>
    /// Excel dosyası yükler ve veritabanına ekler (DB karşılaştırması ile)
    /// </summary>
    [HttpPost("upload-excel")]
    public async Task<ActionResult<UploadExcelResponse>> UploadExcel(
        IFormFile file,
        [FromForm] string tableType,
        CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "Dosya seçilmedi" });
        }

        if (string.IsNullOrWhiteSpace(tableType))
        {
            return BadRequest(new { message = "Tablo tipi belirtilmedi" });
        }

        try
        {
            int added = 0;
            int skipped = 0;
            int total = 0;

            // Dosya tipini kontrol et
            var fileName = file.FileName.ToLower();
            var isCsv = fileName.EndsWith(".csv") || file.ContentType == "text/csv";

            if (isCsv)
            {
                // CSV dosyasını işle
                using var stream = file.OpenReadStream();
                using var reader = new StreamReader(stream, Encoding.UTF8);
                
                var lines = new List<string>();
                while (!reader.EndOfStream)
                {
                    var line = reader.ReadLine();
                    if (!string.IsNullOrWhiteSpace(line))
                    {
                        lines.Add(line);
                    }
                }

                if (lines.Count < 2)
                {
                    return BadRequest(new { message = "CSV dosyasında veri yok (en az bir veri satırı olmalı)" });
                }

                // Header satırını oku
                var headerLine = lines[0];
                var headerColumns = SplitCsvLine(headerLine);
                var headers = headerColumns.Select(h => h.Trim().ToLower()).ToList();

                // Veri satırlarını işle
                var dataRows = new List<string[]>();
                for (int i = 1; i < lines.Count; i++)
                {
                    var columns = SplitCsvLine(lines[i]);
                    dataRows.Add(columns);
                }

                switch (tableType.ToLower())
                {
                    case "books":
                        (added, skipped, total) = await ProcessBooksCsv(headers, dataRows, cancellationToken);
                        break;
                    case "students":
                        (added, skipped, total) = await ProcessStudentsCsv(headers, dataRows, cancellationToken);
                        break;
                    case "loans":
                        (added, skipped, total) = await ProcessLoansCsv(headers, dataRows, cancellationToken);
                        break;
                    case "personel":
                        (added, skipped, total) = await ProcessPersonelCsv(headers, dataRows, cancellationToken);
                        break;
                    default:
                        return BadRequest(new { message = $"Geçersiz tablo tipi: {tableType}" });
                }
            }
            else
            {
                // Excel dosyasını işle
                using var stream = file.OpenReadStream();
                using var package = new OfficeOpenXml.ExcelPackage(stream);

                var worksheet = package.Workbook.Worksheets[0];
                if (worksheet == null || worksheet.Dimension == null)
                {
                    return BadRequest(new { message = "Excel dosyası boş veya geçersiz" });
                }

                var rowCount = worksheet.Dimension.Rows;
                var colCount = worksheet.Dimension.Columns;

                if (rowCount < 2)
                {
                    return BadRequest(new { message = "Excel dosyasında veri yok (en az bir veri satırı olmalı)" });
                }

                // Header satırını oku
                var headers = new List<string>();
                for (int col = 1; col <= colCount; col++)
                {
                    var headerValue = worksheet.Cells[1, col].Value?.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(headerValue))
                    {
                        headers.Add(headerValue.ToLower());
                    }
                }

                switch (tableType.ToLower())
                {
                    case "books":
                        (added, skipped, total) = await ProcessBooksExcel(worksheet, headers, rowCount, colCount, cancellationToken);
                        break;
                    case "students":
                        (added, skipped, total) = await ProcessStudentsExcel(worksheet, headers, rowCount, colCount, cancellationToken);
                        break;
                    case "loans":
                        (added, skipped, total) = await ProcessLoansExcel(worksheet, headers, rowCount, colCount, cancellationToken);
                        break;
                    case "personel":
                        (added, skipped, total) = await ProcessPersonelExcel(worksheet, headers, rowCount, colCount, cancellationToken);
                        break;
                    default:
                        return BadRequest(new { message = $"Geçersiz tablo tipi: {tableType}" });
                }
            }

            return Ok(new UploadExcelResponse
            {
                Added = added,
                Skipped = skipped,
                Total = total
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"Dosya işlenirken hata oluştu: {ex.Message}" });
        }
    }

    private async Task<(int added, int skipped, int total)> ProcessBooksExcel(
        OfficeOpenXml.ExcelWorksheet worksheet,
        List<string> headers,
        int rowCount,
        int colCount,
        CancellationToken cancellationToken)
    {
        // Kitap yükleme öncesi eski kitap istatistiklerini temizle
        var existingBookStats = await _context.BookStats.ToListAsync(cancellationToken);
        if (existingBookStats.Any())
        {
            _context.BookStats.RemoveRange(existingBookStats);
            await _context.SaveChangesAsync(cancellationToken);
        }

        int added = 0;
        int skipped = 0;

        // Zorunlu kolonları bul (Export'ta kullanılan başlıkları da destekle)
        // Export başlıkları: "Başlık", "Yazar", "Kategori", "Miktar", "Raf", "Yayınevi", "Özet", "Numara", "Yıl", "Sayfa Sayısı"
        var titleCol = FindHeaderIndex(headers, "başlık", "baslik", "title", "kitap başlık", "kitap başlığı");
        var authorCol = FindHeaderIndex(headers, "yazar", "author", "yazar adı");

        // Zorunlu kolonlar kontrolü
        if (titleCol == -1 || authorCol == -1)
        {
            throw new Exception("Excel dosyasında 'Başlık' (veya 'title') ve 'Yazar' (veya 'author') kolonları zorunludur");
        }

        // Opsiyonel kolonları bul (Export başlıklarını da destekle)
        var categoryCol = FindHeaderIndex(headers, "kategori", "category");
        var quantityCol = FindHeaderIndex(headers, "miktar", "quantity", "adet");
        var shelfCol = FindHeaderIndex(headers, "raf", "shelf");
        var publisherCol = FindHeaderIndex(headers, "yayınevi", "yayinevi", "publisher");
        var summaryCol = FindHeaderIndex(headers, "özet", "ozet", "summary");
        var bookNumberCol = FindHeaderIndex(headers, "numara", "booknumber", "kitap numarası", "kitap numarasi");
        var yearCol = FindHeaderIndex(headers, "yıl", "yil", "year");
        var pageCountCol = FindHeaderIndex(headers, "sayfa sayısı", "sayfa_sayisi", "sayfa sayisi", "pagecount", "page count");

        // Debug: Hangi sütunlar bulundu?
        Console.WriteLine($"[Excel Import] Sütun Eşleşmeleri:");
        Console.WriteLine($"  Başlık={titleCol}, Yazar={authorCol}, Kategori={categoryCol}, Miktar={quantityCol}");
        Console.WriteLine($"  Raf={shelfCol}, Yayınevi={publisherCol}, Yıl={yearCol}, Sayfa={pageCountCol}, Numara={bookNumberCol}");

        for (int row = 2; row <= rowCount; row++)
        {
            var title = worksheet.Cells[row, titleCol + 1].Value?.ToString()?.Trim();
            var author = worksheet.Cells[row, authorCol + 1].Value?.ToString()?.Trim();

            Console.WriteLine($"[Excel Import] Satır {row}: Başlık='{title}', Yazar='{author}'");

            if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(author))
            {
                Console.WriteLine($"[Excel Import] Satır {row} ATLANDI: Başlık veya yazar boş");
                skipped++;
                continue;
            }

            // DB'de aynı kitap var mı kontrol et (title + author kombinasyonu)
            var existingBook = await _context.Books
                .FirstOrDefaultAsync(b => 
                    b.Title == title && 
                    b.Author == author, 
                    cancellationToken);

            if (existingBook != null)
            {
                Console.WriteLine($"[Excel Import] Satır {row} ATLANDI: Kitap zaten var ('{title}' - {author})");
                skipped++;
                continue;
            }

            // Opsiyonel alanları al (varsa)
            var categoryValue = categoryCol >= 0 && !string.IsNullOrWhiteSpace(worksheet.Cells[row, categoryCol + 1].Value?.ToString())
                ? worksheet.Cells[row, categoryCol + 1].Value?.ToString()?.Trim() ?? "Genel"
                : "Genel";
            var quantityValue = quantityCol >= 0 && int.TryParse(worksheet.Cells[row, quantityCol + 1].Value?.ToString(), out var qty) ? qty : 1;
            
            // Künye alanlarını da al
            var shelfValue = shelfCol >= 0 ? worksheet.Cells[row, shelfCol + 1].Value?.ToString()?.Trim() : null;
            var publisherValue = publisherCol >= 0 ? worksheet.Cells[row, publisherCol + 1].Value?.ToString()?.Trim() : null;
            var summaryValue = summaryCol >= 0 ? worksheet.Cells[row, summaryCol + 1].Value?.ToString()?.Trim() : null;
            
            // BookNumber ve PageCount için önce double parse et, sonra int'e çevir (Excel'deki ondalıklı sayılar için)
            int? bookNumberValue = null;
            if (bookNumberCol >= 0 && worksheet.Cells[row, bookNumberCol + 1].Value != null)
            {
                var bnStr = worksheet.Cells[row, bookNumberCol + 1].Value.ToString();
                if (double.TryParse(bnStr, out var bnDouble))
                {
                    bookNumberValue = (int)Math.Round(bnDouble);
                }
            }
            
            int? yearValue = null;
            if (yearCol >= 0 && worksheet.Cells[row, yearCol + 1].Value != null)
            {
                var yrStr = worksheet.Cells[row, yearCol + 1].Value.ToString();
                if (double.TryParse(yrStr, out var yrDouble))
                {
                    yearValue = (int)Math.Round(yrDouble);
                }
            }
            
            int? pageCountValue = null;
            if (pageCountCol >= 0 && worksheet.Cells[row, pageCountCol + 1].Value != null)
            {
                var pgStr = worksheet.Cells[row, pageCountCol + 1].Value.ToString();
                if (double.TryParse(pgStr, out var pgDouble))
                {
                    pageCountValue = (int)Math.Round(pgDouble);
                }
            }

            Console.WriteLine($"[Excel Import] Satır {row} Künye: Sayfa={pageCountValue}, Yıl={yearValue}, Yayınevi='{publisherValue}', Raf='{shelfValue}'");

            // Yeni kitap oluştur
            var book = new BookEntity
            {
                Id = Guid.NewGuid(),
                Title = title,
                Author = author,
                Category = categoryValue,
                Quantity = quantityValue,
                TotalQuantity = quantityValue,
                Shelf = shelfValue,
                Publisher = publisherValue,
                Summary = summaryValue,
                BookNumber = bookNumberValue,
                Year = yearValue,
                PageCount = pageCountValue
            };

            _context.Books.Add(book);
            added++;
            Console.WriteLine($"[Excel Import] Satır {row} EKLENDİ: '{title}' - {author}");
        }

        await _context.SaveChangesAsync(cancellationToken);
        return (added, skipped, added + skipped);
    }

    private async Task<(int added, int skipped, int total)> ProcessStudentsExcel(
        OfficeOpenXml.ExcelWorksheet worksheet,
        List<string> headers,
        int rowCount,
        int colCount,
        CancellationToken cancellationToken)
    {
        // Öğrenci yükleme öncesi eski istatistikleri temizle
        var existingStats = await _context.StudentStats.ToListAsync(cancellationToken);
        if (existingStats.Any())
        {
            _context.StudentStats.RemoveRange(existingStats);
            await _context.SaveChangesAsync(cancellationToken);
        }

        int added = 0;
        int skipped = 0;

        // Zorunlu kolonları bul - Ad, Soyad, Numara
        var nameCol = FindHeaderIndex(headers, "ad", "name");
        var surnameCol = FindHeaderIndex(headers, "soyad", "surname");
        var numaraCol = FindHeaderIndex(headers, "numara", "studentnumber", "no", "numara");

        // Zorunlu kolonlar kontrolü
        if (nameCol == -1 || surnameCol == -1 || numaraCol == -1)
        {
            throw new Exception("Excel dosyasında 'Ad' (veya 'name'), 'Soyad' (veya 'surname') ve 'Numara' (veya 'studentnumber'/'no') kolonları zorunludur");
        }

        // Opsiyonel kolonları bul
        var sinifCol = FindHeaderIndex(headers, "sınıf", "sinif", "class");
        var subeCol = FindHeaderIndex(headers, "şube", "sube", "branch", "section");
        var usernameCol = FindHeaderIndex(headers, "kullanıcı adı", "kullanici_adi", "kullanici adi", "username");
        var passwordCol = FindHeaderIndex(headers, "şifre", "sifre", "password");
        var cezaPuanCol = FindHeaderIndex(headers, "ceza puanı", "ceza_puani", "ceza puani", "penaltypoints");

        for (int row = 2; row <= rowCount; row++)
        {
            var nameValue = worksheet.Cells[row, nameCol + 1].Value?.ToString()?.Trim();
            var surnameValue = worksheet.Cells[row, surnameCol + 1].Value?.ToString()?.Trim();
            var numaraStr = worksheet.Cells[row, numaraCol + 1].Value?.ToString()?.Trim();

            // Zorunlu alanlar kontrolü (Ad, Soyad ve Numara)
            if (string.IsNullOrWhiteSpace(nameValue) || 
                string.IsNullOrWhiteSpace(surnameValue) || 
                string.IsNullOrWhiteSpace(numaraStr) || 
                !int.TryParse(numaraStr, out var numara))
            {
                skipped++;
                continue;
            }

            // DB'de aynı öğrenci var mı kontrol et (numara ile)
            var existingStudent = await _context.Users
                .FirstOrDefaultAsync(u => u.StudentNumber == numara && u.Role == "Student", cancellationToken);

            if (existingStudent != null)
            {
                skipped++;
                continue;
            }

            // Ad ve soyad
            string name = nameValue;
            string surname = surnameValue;

            // Opsiyonel alanları al (varsa)
            var usernameValue = usernameCol >= 0 ? worksheet.Cells[row, usernameCol + 1].Value?.ToString()?.Trim() : null;
            var passwordValue = passwordCol >= 0 ? worksheet.Cells[row, passwordCol + 1].Value?.ToString()?.Trim() : null;
            var branchValue = subeCol >= 0 ? worksheet.Cells[row, subeCol + 1].Value?.ToString()?.Trim() : null;
            var classValue = sinifCol >= 0 && int.TryParse(worksheet.Cells[row, sinifCol + 1].Value?.ToString(), out var cls) ? cls : (int?)null;
            var penaltyPoints = cezaPuanCol >= 0 && int.TryParse(worksheet.Cells[row, cezaPuanCol + 1].Value?.ToString(), out var penalty) ? penalty : 0;

            // Yeni öğrenci oluştur
            var student = new UserEntity
            {
                Username = !string.IsNullOrWhiteSpace(usernameValue) ? usernameValue : null,
                Password = !string.IsNullOrWhiteSpace(passwordValue) ? passwordValue : null,
                Role = "Student",
                Name = name,
                Surname = surname,
                StudentNumber = numara,
                Class = classValue,
                Branch = branchValue,
                PenaltyPoints = penaltyPoints
            };

            _context.Users.Add(student);
            added++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return (added, skipped, added + skipped);
    }

    private async Task<(int added, int skipped, int total)> ProcessLoansExcel(
        OfficeOpenXml.ExcelWorksheet worksheet,
        List<string> headers,
        int rowCount,
        int colCount,
        CancellationToken cancellationToken)
    {
        // NOT: Ödünç yükleme sırasında mevcut geçmişi SİLMİYORUZ
        // Çünkü aktif ödünçlerin geçmişi de silinir, bu yanlış!
        // Upload edilen loans geçmişe EKLENİR.

        int added = 0;
        int skipped = 0;

        // Zorunlu kolonları bul
        // Artık "Ad" ve "Soyad" sütunları ayrı ayrı zorunlu
        // Önce kitap başlık ve yazar ile kitap bulmayı dene, yoksa kitap_id ile
        var bookTitleCol = FindHeaderIndex(headers, "kitap başlık", "kitap baslik", "kitap başlığı", "kitap basligi", "title", "başlık", "baslik");
        var authorCol = FindHeaderIndex(headers, "yazar", "author");
        var bookIdCol = FindHeaderIndex(headers, "kitap_id", "kitapid", "bookid", "kitap id");
        var nameCol = FindHeaderIndex(headers, "ad", "name");
        var surnameCol = FindHeaderIndex(headers, "soyad", "surname");
        var dueDateCol = FindHeaderIndex(headers, "teslim tarihi", "teslim_tarihi", "teslim tarihi", "duedate", "teslim_tarihi", "teslim tarihi");
        var personelCol = FindHeaderIndex(headers, "personel", "staff");

        // Zorunlu kolonlar kontrolü
        bool useBookTitle = bookTitleCol >= 0 && authorCol >= 0;
        bool useBookId = bookIdCol >= 0;
        
        if (!useBookTitle && !useBookId)
        {
            throw new Exception("Excel dosyasında 'Kitap Başlık' ve 'Yazar' (veya 'kitap_id'/'bookid') kolonları zorunludur");
        }
        
        if (nameCol == -1 || surnameCol == -1 || dueDateCol == -1)
        {
            throw new Exception("Excel dosyasında 'Ad' (veya 'name'), 'Soyad' (veya 'surname') ve 'Teslim Tarihi' (veya 'duedate') kolonları zorunludur");
        }

        for (int row = 2; row <= rowCount; row++)
        {
            var nameValue = nameCol >= 0 ? worksheet.Cells[row, nameCol + 1].Value?.ToString()?.Trim() : null;
            var surnameValue = surnameCol >= 0 ? worksheet.Cells[row, surnameCol + 1].Value?.ToString()?.Trim() : null;
            var dueDateStr = dueDateCol >= 0 ? worksheet.Cells[row, dueDateCol + 1].Value?.ToString()?.Trim() : null;

            // Zorunlu alanlar kontrolü
            if (string.IsNullOrWhiteSpace(nameValue) || string.IsNullOrWhiteSpace(surnameValue) || string.IsNullOrWhiteSpace(dueDateStr))
            {
                skipped++;
                continue;
            }
            
            // Ad ve Soyad'ı birleştir
            var borrower = $"{nameValue} {surnameValue}".Trim();

            if (!DateTime.TryParse(dueDateStr, out var dueDate))
            {
                skipped++;
                continue;
            }

            // Kitap bulma: Önce başlık + yazar ile, yoksa kitap_id ile
            BookEntity? book = null;
            if (useBookTitle)
            {
                var bookTitle = worksheet.Cells[row, bookTitleCol + 1].Value?.ToString()?.Trim();
                var author = authorCol >= 0 ? worksheet.Cells[row, authorCol + 1].Value?.ToString()?.Trim() : null;
                
                if (!string.IsNullOrWhiteSpace(bookTitle) && !string.IsNullOrWhiteSpace(author))
                {
                    book = await _context.Books
                        .FirstOrDefaultAsync(b => b.Title == bookTitle && b.Author == author, cancellationToken);
                }
            }
            
            if (book == null && useBookId)
            {
                var bookIdStr = worksheet.Cells[row, bookIdCol + 1].Value?.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(bookIdStr) && Guid.TryParse(bookIdStr, out var bookId))
                {
                    book = await _context.Books.FindAsync(new object[] { bookId }, cancellationToken);
                }
            }

            if (book == null)
            {
                skipped++;
                continue;
            }

            // DB'de aynı ödünç kaydı var mı kontrol et (bookId + borrower + dueDate kombinasyonu)
            var existingLoan = await _context.Loans
                .FirstOrDefaultAsync(l => 
                    l.BookId == book.Id && 
                    l.Borrower == borrower && 
                    l.DueDate.Date == dueDate.Date, 
                    cancellationToken);

            if (existingLoan != null)
            {
                skipped++;
                continue;
            }

            // Yeni ödünç kaydı oluştur
            var personelValue = personelCol >= 0 ? worksheet.Cells[row, personelCol + 1].Value?.ToString()?.Trim() : null;
            var loan = new LoanEntity
            {
                BookId = book.Id,
                Borrower = borrower,
                DueDate = dueDate,
                personel = !string.IsNullOrWhiteSpace(personelValue) ? personelValue : ""
            };

            _context.Loans.Add(loan);
            
            // Kitap stoğunu güncelle (quantity azalt)
            if (book.Quantity > 0)
            {
                book.Quantity--;
            }
            
            // *** LoanHistory kaydı oluştur (Geçmişe entegre etmek için) ***
            var normalizedBorrower = borrower.Trim().ToLower();
            int? studentNumber = null;
            
            // Öğrenci numarasını bul (ad + soyad eşleştirmesi)
            var allStudents = await _context.Users
                .Where(u => u.Role == "Student")
                .ToListAsync(cancellationToken);
            
            var matchedStudent = allStudents.FirstOrDefault(u =>
            {
                var fullName = $"{u.Name} {u.Surname}".Trim().ToLower();
                return fullName == normalizedBorrower;
            });
            
            if (matchedStudent != null)
            {
                studentNumber = matchedStudent.StudentNumber;
            }
            
            // LoanHistory entity oluştur
            var loanHistoryEntry = new LoanHistoryEntity
            {
                BookId = book.Id,
                BookTitle = book.Title,
                BookAuthor = book.Author,
                BookCategory = book.Category,
                Borrower = borrower.Trim(),
                NormalizedBorrower = normalizedBorrower,
                StudentNumber = studentNumber,
                BorrowedAt = DateTime.UtcNow,
                DueDate = dueDate,
                LoanDays = (int)Math.Max(1, (dueDate - DateTime.UtcNow).TotalDays),
                BorrowPersonel = !string.IsNullOrWhiteSpace(personelValue) ? personelValue : "Excel Upload",
                Status = "ACTIVE"
            };
            
            _context.LoanHistory.Add(loanHistoryEntry);
            
            // Record statistics for this loan
            try
            {
                var bookDomain = Book.Restore(
                    book.Id,
                    book.Title,
                    book.Author,
                    book.Category,
                    book.TotalQuantity,
                    book.TotalQuantity,
                    book.TotalQuantity,
                    0,
                    0,
                    Array.Empty<LoanEntry>(),
                    null,
                    book.Shelf,
                    book.Publisher,
                    null,
                    book.BookNumber,
                    book.Year,
                    null
                );
                await _statistics.RecordBorrowAsync(bookDomain, borrower, cancellationToken);
            }
            catch (Exception statsEx)
            {
                // Log but don't fail the upload
                System.Diagnostics.Debug.WriteLine($"Statistics recording failed for {borrower}: {statsEx.Message}");
            }
            
            added++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return (added, skipped, added + skipped);
    }

    private async Task<(int added, int skipped, int total)> ProcessPersonelExcel(
        OfficeOpenXml.ExcelWorksheet worksheet,
        List<string> headers,
        int rowCount,
        int colCount,
        CancellationToken cancellationToken)
    {
        int added = 0;
        int skipped = 0;

        // Zorunlu kolonları bul (Export'ta kullanılan başlıkları da destekle)
        // Export başlıkları: "Kullanıcı Adı", "Ad"
        var usernameCol = FindHeaderIndex(headers, "kullanıcı adı", "kullanici_adi", "kullanici adi", "username");
        var nameCol = FindHeaderIndex(headers, "ad", "name");
        var passwordCol = FindHeaderIndex(headers, "şifre", "sifre", "password");
        var surnameCol = FindHeaderIndex(headers, "soyad", "surname");
        var positionCol = FindHeaderIndex(headers, "pozisyon", "position", "gorev", "görev");

        // Zorunlu kolonlar kontrolü (Şifre opsiyonel olabilir)
        if (usernameCol == -1 || nameCol == -1)
        {
            throw new Exception("Excel dosyasında 'Kullanıcı Adı' (veya 'username') ve 'Ad' (veya 'name') kolonları zorunludur");
        }

        var seenUsernames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (int row = 2; row <= rowCount; row++)
        {
            var usernameValue = worksheet.Cells[row, usernameCol + 1].Value?.ToString()?.Trim();
            var passwordValue = passwordCol >= 0 ? worksheet.Cells[row, passwordCol + 1].Value?.ToString()?.Trim() : null;
            var nameValue = worksheet.Cells[row, nameCol + 1].Value?.ToString()?.Trim();
            var surnameValue = surnameCol >= 0 ? worksheet.Cells[row, surnameCol + 1].Value?.ToString()?.Trim() : null;
            var positionValue = positionCol >= 0 ? worksheet.Cells[row, positionCol + 1].Value?.ToString()?.Trim() : null;

            // Satırın tamamen boş olup olmadığını kontrol et
            // Eğer zorunlu alanlar boşsa ve satır tamamen boşsa, bu satırı sayma (boş satırları atla)
            bool isRowEmpty = string.IsNullOrWhiteSpace(usernameValue) && 
                             string.IsNullOrWhiteSpace(nameValue) &&
                             string.IsNullOrWhiteSpace(passwordValue) &&
                             string.IsNullOrWhiteSpace(surnameValue) &&
                             string.IsNullOrWhiteSpace(positionValue);
            
            if (isRowEmpty)
            {
                // Boş satırı sayma, sadece devam et
                continue;
            }

            // Zorunlu alanlar kontrolü (şifre opsiyonel)
            if (string.IsNullOrWhiteSpace(usernameValue) || string.IsNullOrWhiteSpace(nameValue))
            {
                skipped++;
                continue;
            }
            
            // Şifre yoksa varsayılan şifre kullan (veya boş bırakılabilir)
            if (string.IsNullOrWhiteSpace(passwordValue))
            {
                passwordValue = "123456"; // Varsayılan şifre
            }

            var normalizedUsername = usernameValue.Trim();
            if (!seenUsernames.Add(normalizedUsername))
            {
                skipped++;
                continue;
            }

            var existingUser = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == normalizedUsername, cancellationToken);

            if (existingUser != null)
            {
                skipped++;
                continue;
            }

            var (finalName, finalSurname) = NormalizePersonelName(nameValue, surnameValue);
            var personel = new UserEntity
            {
                Username = normalizedUsername,
                Password = passwordValue,
                Role = "personel",
                Name = finalName,
                Surname = finalSurname
            };

            if (!string.IsNullOrWhiteSpace(positionValue))
            {
                personel.Position = positionValue;
            }

            _context.Users.Add(personel);
            added++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return (added, skipped, added + skipped);
    }

    // CSV işleme metodları
    private async Task<(int added, int skipped, int total)> ProcessBooksCsv(
        List<string> headers,
        List<string[]> dataRows,
        CancellationToken cancellationToken)
    {
        // Kitap yükleme öncesi eski kitap istatistiklerini temizle
        var existingBookStats = await _context.BookStats.ToListAsync(cancellationToken);
        if (existingBookStats.Any())
        {
            _context.BookStats.RemoveRange(existingBookStats);
            await _context.SaveChangesAsync(cancellationToken);
        }

        int added = 0;
        int skipped = 0;

        // Zorunlu kolonları bul (Export'ta kullanılan başlıkları da destekle)
        // Export başlıkları: "Başlık", "Yazar", "Kategori", "Miktar", "Raf", "Yayınevi", "Özet", "Numara", "Yıl", "Sayfa Sayısı"
        var titleCol = FindHeaderIndex(headers, "başlık", "baslik", "title", "kitap başlık", "kitap başlığı");
        var authorCol = FindHeaderIndex(headers, "yazar", "author", "yazar adı");

        // Zorunlu kolonlar kontrolü
        if (titleCol == -1 || authorCol == -1)
        {
            throw new Exception("CSV dosyasında 'Başlık' (veya 'title') ve 'Yazar' (veya 'author') kolonları zorunludur");
        }

        // Opsiyonel kolonları bul (Export başlıklarını da destekle)
        var categoryCol = FindHeaderIndex(headers, "kategori", "category");
        var quantityCol = FindHeaderIndex(headers, "miktar", "quantity", "adet");
        var shelfCol = FindHeaderIndex(headers, "raf", "shelf");
        var publisherCol = FindHeaderIndex(headers, "yayınevi", "yayinevi", "publisher");
        var summaryCol = FindHeaderIndex(headers, "özet", "ozet", "summary");
        var bookNumberCol = FindHeaderIndex(headers, "numara", "booknumber", "kitap numarası", "kitap numarasi");
        var yearCol = FindHeaderIndex(headers, "yıl", "yil", "year");
        var pageCountCol = FindHeaderIndex(headers, "sayfa sayısı", "sayfa_sayisi", "sayfa sayisi", "pagecount", "page count");

        foreach (var row in dataRows)
        {
            if (row.Length <= Math.Max(titleCol, authorCol))
            {
                skipped++;
                continue;
            }

            var title = row[titleCol]?.Trim();
            var author = row[authorCol]?.Trim();

            if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(author))
            {
                skipped++;
                continue;
            }

            // DB'de aynı kitap var mı kontrol et (title + author kombinasyonu)
            var existingBook = await _context.Books
                .FirstOrDefaultAsync(b => 
                    b.Title == title && 
                    b.Author == author, 
                    cancellationToken);

            if (existingBook != null)
            {
                skipped++;
                continue;
            }

            // Opsiyonel alanları al (varsa)
            var categoryValue = categoryCol >= 0 && categoryCol < row.Length && !string.IsNullOrWhiteSpace(row[categoryCol])
                ? row[categoryCol].Trim()
                : "Genel";
            var quantityValue = quantityCol >= 0 && quantityCol < row.Length && int.TryParse(row[quantityCol]?.Trim(), out var qty) ? qty : 1;
            
            // Künye alanlarını da al
            var shelfValue = shelfCol >= 0 && shelfCol < row.Length ? row[shelfCol]?.Trim() : null;
            var publisherValue = publisherCol >= 0 && publisherCol < row.Length ? row[publisherCol]?.Trim() : null;
            var summaryValue = summaryCol >= 0 && summaryCol < row.Length ? row[summaryCol]?.Trim() : null;
            
            // Ondalıklı sayıları destekle
            int? bookNumberValue = null;
            if (bookNumberCol >= 0 && bookNumberCol < row.Length && !string.IsNullOrWhiteSpace(row[bookNumberCol]))
            {
                if (double.TryParse(row[bookNumberCol].Trim(), out var bnDouble))
                {
                    bookNumberValue = (int)Math.Round(bnDouble);
                }
            }
            
            int? yearValue = null;
            if (yearCol >= 0 && yearCol < row.Length && !string.IsNullOrWhiteSpace(row[yearCol]))
            {
                if (double.TryParse(row[yearCol].Trim(), out var yrDouble))
                {
                    yearValue = (int)Math.Round(yrDouble);
                }
            }
            
            int? pageCountValue = null;
            if (pageCountCol >= 0 && pageCountCol < row.Length && !string.IsNullOrWhiteSpace(row[pageCountCol]))
            {
                if (double.TryParse(row[pageCountCol].Trim(), out var pgDouble))
                {
                    pageCountValue = (int)Math.Round(pgDouble);
                }
            }

            // Yeni kitap oluştur
            var book = new BookEntity
            {
                Id = Guid.NewGuid(),
                Title = title,
                Author = author,
                Category = categoryValue,
                Quantity = quantityValue,
                TotalQuantity = quantityValue,
                Shelf = shelfValue,
                Publisher = publisherValue,
                Summary = summaryValue,
                BookNumber = bookNumberValue,
                Year = yearValue,
                PageCount = pageCountValue
            };

            _context.Books.Add(book);
            added++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return (added, skipped, added + skipped);
    }

    private async Task<(int added, int skipped, int total)> ProcessStudentsCsv(
        List<string> headers,
        List<string[]> dataRows,
        CancellationToken cancellationToken)
    {
        // Öğrenci yükleme öncesi eski istatistikleri temizle
        var existingStats = await _context.StudentStats.ToListAsync(cancellationToken);
        if (existingStats.Any())
        {
            _context.StudentStats.RemoveRange(existingStats);
            await _context.SaveChangesAsync(cancellationToken);
        }

        int added = 0;
        int skipped = 0;

        // Zorunlu kolonları bul - Ad, Soyad, Numara
        var nameCol = FindHeaderIndex(headers, "ad", "name");
        var surnameCol = FindHeaderIndex(headers, "soyad", "surname");
        var numaraCol = FindHeaderIndex(headers, "numara", "studentnumber", "no", "numara");

        // Zorunlu kolonlar kontrolü
        if (nameCol == -1 || surnameCol == -1 || numaraCol == -1)
        {
            throw new Exception("CSV dosyasında 'Ad' (veya 'name'), 'Soyad' (veya 'surname') ve 'Numara' (veya 'studentnumber'/'no') kolonları zorunludur");
        }

        // Opsiyonel kolonları bul
        var sinifCol = FindHeaderIndex(headers, "sınıf", "sinif", "class");
        var subeCol = FindHeaderIndex(headers, "şube", "sube", "branch", "section");
        var usernameCol = FindHeaderIndex(headers, "kullanıcı adı", "kullanici_adi", "kullanici adi", "username");
        var passwordCol = FindHeaderIndex(headers, "şifre", "sifre", "password");
        var cezaPuanCol = FindHeaderIndex(headers, "ceza puanı", "ceza_puani", "ceza puani", "penaltypoints");

        foreach (var row in dataRows)
        {
            // Satır uzunluğu kontrolü - zorunlu sütunların en büyük indeksini kontrol et
            var maxRequiredCol = Math.Max(Math.Max(nameCol, surnameCol), numaraCol);
            if (row.Length <= maxRequiredCol)
            {
                skipped++;
                continue;
            }

            var nameValue = row[nameCol]?.Trim();
            var surnameValue = row[surnameCol]?.Trim();
            var numaraStr = row[numaraCol]?.Trim();

            // Zorunlu alanlar kontrolü (Ad, Soyad ve Numara)
            if (string.IsNullOrWhiteSpace(nameValue) || 
                string.IsNullOrWhiteSpace(surnameValue) || 
                string.IsNullOrWhiteSpace(numaraStr) || 
                !int.TryParse(numaraStr, out var numara))
            {
                skipped++;
                continue;
            }

            // DB'de aynı öğrenci var mı kontrol et (numara ile)
            var existingStudent = await _context.Users
                .FirstOrDefaultAsync(u => u.StudentNumber == numara && u.Role == "Student", cancellationToken);

            if (existingStudent != null)
            {
                skipped++;
                continue;
            }

            // Ad ve soyad
            string name = nameValue;
            string surname = surnameValue;

            // Opsiyonel alanları al (varsa)
            var usernameValue = usernameCol >= 0 && usernameCol < row.Length ? row[usernameCol]?.Trim() : null;
            var passwordValue = passwordCol >= 0 && passwordCol < row.Length ? row[passwordCol]?.Trim() : null;
            var branchValue = subeCol >= 0 && subeCol < row.Length ? row[subeCol]?.Trim() : null;
            var classValue = sinifCol >= 0 && sinifCol < row.Length && int.TryParse(row[sinifCol]?.Trim(), out var cls) ? cls : (int?)null;
            var penaltyPoints = cezaPuanCol >= 0 && cezaPuanCol < row.Length && int.TryParse(row[cezaPuanCol]?.Trim(), out var penalty) ? penalty : 0;

            // Yeni öğrenci oluştur
            var student = new UserEntity
            {
                Username = !string.IsNullOrWhiteSpace(usernameValue) ? usernameValue : null,
                Password = !string.IsNullOrWhiteSpace(passwordValue) ? passwordValue : null,
                Role = "Student",
                Name = name,
                Surname = surname,
                StudentNumber = numara,
                Class = classValue,
                Branch = branchValue,
                PenaltyPoints = penaltyPoints
            };

            _context.Users.Add(student);
            added++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return (added, skipped, added + skipped);
    }

    private async Task<(int added, int skipped, int total)> ProcessLoansCsv(
        List<string> headers,
        List<string[]> dataRows,
        CancellationToken cancellationToken)
    {
        // NOT: Ödünç yükleme sırasında mevcut geçmişi SİLMİYORUZ
        // Çünkü aktif ödünçlerin geçmişi de silinir, bu yanlış!
        // Upload edilen loans geçmişe EKLENİR.

        int added = 0;
        int skipped = 0;

        // Zorunlu kolonları bul
        // Artık "Ad" ve "Soyad" sütunları ayrı ayrı zorunlu
        // Önce kitap başlık ve yazar ile kitap bulmayı dene, yoksa kitap_id ile
        var bookTitleCol = FindHeaderIndex(headers, "kitap başlık", "kitap baslik", "kitap başlığı", "kitap basligi", "title", "başlık", "baslik");
        var authorCol = FindHeaderIndex(headers, "yazar", "author");
        var bookIdCol = FindHeaderIndex(headers, "kitap_id", "kitapid", "bookid", "kitap id");
        var nameCol = FindHeaderIndex(headers, "ad", "name");
        var surnameCol = FindHeaderIndex(headers, "soyad", "surname");
        var dueDateCol = FindHeaderIndex(headers, "teslim tarihi", "teslim_tarihi", "teslim tarihi", "duedate", "teslim_tarihi", "teslim tarihi");
        var personelCol = FindHeaderIndex(headers, "personel", "staff");

        // Zorunlu kolonlar kontrolü
        bool useBookTitle = bookTitleCol >= 0 && authorCol >= 0;
        bool useBookId = bookIdCol >= 0;
        
        if (!useBookTitle && !useBookId)
        {
            throw new Exception("CSV dosyasında 'Kitap Başlık' ve 'Yazar' (veya 'kitap_id'/'bookid') kolonları zorunludur");
        }
        
        if (nameCol == -1 || surnameCol == -1 || dueDateCol == -1)
        {
            throw new Exception("CSV dosyasında 'Ad' (veya 'name'), 'Soyad' (veya 'surname') ve 'Teslim Tarihi' (veya 'duedate') kolonları zorunludur");
        }

        foreach (var row in dataRows)
        {
            var nameValue = nameCol >= 0 && nameCol < row.Length ? row[nameCol]?.Trim() : null;
            var surnameValue = surnameCol >= 0 && surnameCol < row.Length ? row[surnameCol]?.Trim() : null;
            var dueDateStr = dueDateCol >= 0 && dueDateCol < row.Length ? row[dueDateCol]?.Trim() : null;

            // Zorunlu alanlar kontrolü
            if (string.IsNullOrWhiteSpace(nameValue) || string.IsNullOrWhiteSpace(surnameValue) || string.IsNullOrWhiteSpace(dueDateStr))
            {
                skipped++;
                continue;
            }
            
            // Ad ve Soyad'ı birleştir
            var borrower = $"{nameValue} {surnameValue}".Trim();

            if (!DateTime.TryParse(dueDateStr, out var dueDate))
            {
                skipped++;
                continue;
            }

            // Kitap bulma: Önce başlık + yazar ile, yoksa kitap_id ile
            BookEntity? book = null;
            if (useBookTitle)
            {
                var bookTitle = bookTitleCol >= 0 && bookTitleCol < row.Length ? row[bookTitleCol]?.Trim() : null;
                var author = authorCol >= 0 && authorCol < row.Length ? row[authorCol]?.Trim() : null;
                
                if (!string.IsNullOrWhiteSpace(bookTitle) && !string.IsNullOrWhiteSpace(author))
                {
                    book = await _context.Books
                        .FirstOrDefaultAsync(b => b.Title == bookTitle && b.Author == author, cancellationToken);
                }
            }
            
            if (book == null && useBookId)
            {
                var bookIdStr = bookIdCol >= 0 && bookIdCol < row.Length ? row[bookIdCol]?.Trim() : null;
                if (!string.IsNullOrWhiteSpace(bookIdStr) && Guid.TryParse(bookIdStr, out var bookId))
                {
                    book = await _context.Books.FindAsync(new object[] { bookId }, cancellationToken);
                }
            }

            if (book == null)
            {
                skipped++;
                continue;
            }

            // DB'de aynı ödünç kaydı var mı kontrol et (bookId + borrower + dueDate kombinasyonu)
            var existingLoan = await _context.Loans
                .FirstOrDefaultAsync(l => 
                    l.BookId == book.Id && 
                    l.Borrower == borrower && 
                    l.DueDate.Date == dueDate.Date, 
                    cancellationToken);

            if (existingLoan != null)
            {
                skipped++;
                continue;
            }

            // Yeni ödünç kaydı oluştur
            var personelValue = personelCol >= 0 && personelCol < row.Length ? row[personelCol]?.Trim() : null;
            var loan = new LoanEntity
            {
                BookId = book.Id,
                Borrower = borrower,
                DueDate = dueDate,
                personel = !string.IsNullOrWhiteSpace(personelValue) ? personelValue : ""
            };

            _context.Loans.Add(loan);
            
            // Kitap stoğunu güncelle (quantity azalt)
            if (book.Quantity > 0)
            {
                book.Quantity--;
            }
            
            // *** LoanHistory kaydı oluştur (Geçmişe entegre etmek için) ***
            var normalizedBorrower = borrower.Trim().ToLower();
            int? studentNumber = null;
            
            // Öğrenci numarasını bul (ad + soyad eşleştirmesi)
            var allStudents = await _context.Users
                .Where(u => u.Role == "Student")
                .ToListAsync(cancellationToken);
            
            var matchedStudent = allStudents.FirstOrDefault(u =>
            {
                var fullName = $"{u.Name} {u.Surname}".Trim().ToLower();
                return fullName == normalizedBorrower;
            });
            
            if (matchedStudent != null)
            {
                studentNumber = matchedStudent.StudentNumber;
            }
            
            // LoanHistory entity oluştur
            var loanHistoryEntry = new LoanHistoryEntity
            {
                BookId = book.Id,
                BookTitle = book.Title,
                BookAuthor = book.Author,
                BookCategory = book.Category,
                Borrower = borrower.Trim(),
                NormalizedBorrower = normalizedBorrower,
                StudentNumber = studentNumber,
                BorrowedAt = DateTime.UtcNow,
                DueDate = dueDate,
                LoanDays = (int)Math.Max(1, (dueDate - DateTime.UtcNow).TotalDays),
                BorrowPersonel = !string.IsNullOrWhiteSpace(personelValue) ? personelValue : "CSV Upload",
                Status = "ACTIVE"
            };
            
            _context.LoanHistory.Add(loanHistoryEntry);
            
            // Record statistics for this loan
            try
            {
                var bookDomain = Book.Restore(
                    book.Id,
                    book.Title,
                    book.Author,
                    book.Category,
                    book.TotalQuantity,
                    book.TotalQuantity,
                    book.TotalQuantity,
                    0,
                    0,
                    Array.Empty<LoanEntry>(),
                    null,
                    book.Shelf,
                    book.Publisher,
                    null,
                    book.BookNumber,
                    book.Year,
                    null
                );
                await _statistics.RecordBorrowAsync(bookDomain, borrower, cancellationToken);
            }
            catch (Exception statsEx)
            {
                // Log but don't fail the upload
                System.Diagnostics.Debug.WriteLine($"Statistics recording failed for {borrower}: {statsEx.Message}");
            }
            
            added++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return (added, skipped, added + skipped);
    }

    private async Task<(int added, int skipped, int total)> ProcessPersonelCsv(
        List<string> headers,
        List<string[]> dataRows,
        CancellationToken cancellationToken)
    {
        int added = 0;
        int skipped = 0;

        // Zorunlu kolonları bul (Export'ta kullanılan başlıkları da destekle)
        // Export başlıkları: "Kullanıcı Adı", "Ad"
        var usernameCol = FindHeaderIndex(headers, "kullanıcı adı", "kullanici_adi", "kullanici adi", "username");
        var nameCol = FindHeaderIndex(headers, "ad", "name");
        var passwordCol = FindHeaderIndex(headers, "şifre", "sifre", "password");
        var surnameCol = FindHeaderIndex(headers, "soyad", "surname");
        var positionCol = FindHeaderIndex(headers, "pozisyon", "position", "gorev", "görev");

        // Zorunlu kolonlar kontrolü (Şifre opsiyonel olabilir)
        if (usernameCol == -1 || nameCol == -1)
        {
            throw new Exception("CSV dosyasında 'Kullanıcı Adı' (veya 'username') ve 'Ad' (veya 'name') kolonları zorunludur");
        }

        var seenUsernames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in dataRows)
        {
            // Sadece zorunlu kolonları kontrol et (passwordCol opsiyonel ve -1 olabilir)
            var maxRequiredCol = Math.Max(usernameCol, nameCol);
            if (row.Length <= maxRequiredCol)
            {
                skipped++;
                continue;
            }
            
            // Satırın tamamen boş olup olmadığını kontrol et
            var usernameValue = row[usernameCol]?.Trim();
            var nameValue = row[nameCol]?.Trim();
            var passwordValue = passwordCol >= 0 && passwordCol < row.Length ? row[passwordCol]?.Trim() : null;
            var surnameValue = surnameCol >= 0 && surnameCol < row.Length ? row[surnameCol]?.Trim() : null;
            var positionValue = positionCol >= 0 && positionCol < row.Length ? row[positionCol]?.Trim() : null;
            
            bool isRowEmpty = string.IsNullOrWhiteSpace(usernameValue) && 
                             string.IsNullOrWhiteSpace(nameValue) &&
                             string.IsNullOrWhiteSpace(passwordValue) &&
                             string.IsNullOrWhiteSpace(surnameValue) &&
                             string.IsNullOrWhiteSpace(positionValue);
            
            if (isRowEmpty)
            {
                // Boş satırı sayma, sadece devam et
                continue;
            }

            // Zorunlu alanlar kontrolü (şifre opsiyonel)
            if (string.IsNullOrWhiteSpace(usernameValue) || string.IsNullOrWhiteSpace(nameValue))
            {
                skipped++;
                continue;
            }
            
            // Şifre yoksa varsayılan şifre kullan (veya boş bırakılabilir)
            if (string.IsNullOrWhiteSpace(passwordValue))
            {
                passwordValue = "123456"; // Varsayılan şifre
            }

            var normalizedUsername = usernameValue!;
            if (!seenUsernames.Add(normalizedUsername))
            {
                skipped++;
                continue;
            }

            var existingPersonel = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == normalizedUsername, cancellationToken);

            if (existingPersonel != null)
            {
                skipped++;
                continue;
            }

            var (finalName, finalSurname) = NormalizePersonelName(nameValue, surnameValue);
            var personel = new UserEntity
            {
                Username = normalizedUsername,
                Password = passwordValue,
                Role = "personel",
                Name = finalName,
                Surname = finalSurname
            };

            if (!string.IsNullOrWhiteSpace(positionValue))
            {
                personel.Position = positionValue;
            }

            _context.Users.Add(personel);
            added++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return (added, skipped, added + skipped);
    }

    // CSV satırını parse et
    private static string[] SplitCsvLine(string line)
    {
        if (string.IsNullOrEmpty(line))
        {
            return Array.Empty<string>();
        }

        // UTF-8 BOM'u kaldır
        if (line.Length > 0 && line[0] == '\ufeff')
        {
            line = line.TrimStart('\ufeff');
        }

        var result = new List<string>();
        var builder = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var ch = line[i];
            if (ch == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    builder.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (ch == ',' && !inQuotes)
            {
                result.Add(builder.ToString());
                builder.Clear();
                continue;
            }

            builder.Append(ch);
        }

        result.Add(builder.ToString());
        return result.ToArray();
    }

    private static int FindExcelHeaderIndex(List<string> headers, params string[] aliases)
    {
        if (headers == null || headers.Count == 0 || aliases == null || aliases.Length == 0)
        {
            return -1;
        }

        foreach (var alias in aliases)
        {
            if (string.IsNullOrWhiteSpace(alias))
            {
                continue;
            }

            var searched = alias.Trim().ToLowerInvariant();
            var index = headers.IndexOf(searched);
            if (index >= 0)
            {
                return index;
            }
        }

        return -1;
    }

    /// <summary>
    /// Header'ı normalize eder (boşlukları, alt çizgileri ve Türkçe karakterleri işler)
    /// </summary>
    private static string NormalizeHeader(string header)
    {
        if (string.IsNullOrWhiteSpace(header))
            return string.Empty;

        return header.Trim()
            .ToLowerInvariant()
            .Replace("ı", "i")
            .Replace("ş", "s")
            .Replace("ğ", "g")
            .Replace("ü", "u")
            .Replace("ö", "o")
            .Replace("ç", "c")
            .Replace(" ", "_")
            .Replace("-", "_");
    }

    /// <summary>
    /// Header listesinde normalize edilmiş header'ı arar (boşluk, alt çizgi ve Türkçe karakter varyasyonlarını destekler)
    /// </summary>
    private static int FindHeaderIndex(List<string> headers, params string[] aliases)
    {
        if (headers == null || headers.Count == 0 || aliases == null || aliases.Length == 0)
        {
            return -1;
        }

        // Önce normalize edilmiş header listesi oluştur
        var normalizedHeaders = headers.Select(h => NormalizeHeader(h)).ToList();

        foreach (var alias in aliases)
        {
            if (string.IsNullOrWhiteSpace(alias))
            {
                continue;
            }

            var normalizedAlias = NormalizeHeader(alias);
            
            // Normalize edilmiş listede ara
            var index = normalizedHeaders.IndexOf(normalizedAlias);
            if (index >= 0)
            {
                return index;
            }

            // Ayrıca direkt lowercase karşılaştırması da yap (boşluklu versiyonlar için)
            var aliasLower = alias.Trim().ToLowerInvariant();
            var directIndex = headers.IndexOf(aliasLower);
            if (directIndex >= 0)
            {
                return directIndex;
            }
        }

        return -1;
    }

    private static (string Name, string Surname) NormalizePersonelName(string nameValue, string? surnameValue)
    {
        var trimmedName = nameValue?.Trim() ?? string.Empty;
        var trimmedSurname = surnameValue?.Trim();

        if (string.IsNullOrWhiteSpace(trimmedSurname))
        {
            var nameParts = trimmedName.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (nameParts.Length > 1)
            {
                trimmedSurname = string.Join(" ", nameParts.Skip(1));
                trimmedName = nameParts[0];
            }
            else
            {
                trimmedSurname = string.Empty;
            }
        }

        return (trimmedName, trimmedSurname ?? string.Empty);
    }
}

// Request/Response modelleri
public class AddStudentRequest
{
    public string Name { get; set; } = string.Empty;
    public string Surname { get; set; } = string.Empty;
    public int? Class { get; set; }
    public string? Branch { get; set; }
    public int? StudentNumber { get; set; }
}

public class UpdateStudentRequest
{
    public string? Name { get; set; }
    public string? Surname { get; set; }
    public int? Class { get; set; }
    public string? Branch { get; set; }
}

public class AddStudentResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class StudentInfoResponse
{
    public int? StudentNumber { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Surname { get; set; } = string.Empty;
    public int? Class { get; set; }
    public string Branch { get; set; } = string.Empty;
    public int PenaltyPoints { get; set; }
}

public class personelInfoResponse
{
    public string Username { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Surname { get; set; } = string.Empty;
    public string Position { get; set; } = string.Empty;
}

public class DatabaseInfoResponse
{
    public int BookCount { get; set; }
    public int UserCount { get; set; }
    public int LoanCount { get; set; }
    public int StudentCount { get; set; }
    public int personelCount { get; set; }
    public int AdminCount { get; set; }
    public string DatabasePath { get; set; } = string.Empty;
}

public class BackupResponse
{
    public bool Success { get; set; }
    public string? BackupPath { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class RestoreRequest
{
    public string BackupPath { get; set; } = string.Empty;
}

public class RestoreResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class CreatepersonelRequest
{
    public string Username { get; set; } = string.Empty;
    public string? Password { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Surname { get; set; } = string.Empty;
    public string? Position { get; set; }
}

public class UpdatepersonelRequest
{
    public string? Name { get; set; }
    public string? Surname { get; set; }
    public string? Position { get; set; }
    public string? Password { get; set; }
}

public class LoanInfoResponse
{
    public int Id { get; set; }
    public Guid BookId { get; set; }
    public string Borrower { get; set; } = string.Empty;
    public DateTime DueDate { get; set; }
    public string personel { get; set; } = string.Empty;
    public string BookTitle { get; set; } = string.Empty;
    public string BookAuthor { get; set; } = string.Empty;
}

public class UploadExcelResponse
{
    public int Added { get; set; }
    public int Skipped { get; set; }
    public int Total { get; set; }
}

public class UpdatePenaltyRequest
{
    public int PenaltyPoints { get; set; }
    public string? PersonelName { get; set; }
}

public class CleanupRequest
{
    public int DaysToKeep { get; set; } = 30;
}

public class CleanupResponse
{
    public bool Success { get; set; }
    public int DeletedCount { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class AutoBackupStatusResponse
{
    public bool Enabled { get; set; }
    public int IntervalDays { get; set; }
    public DateTime? LastBackupDate { get; set; }
}

public class ConfigureAutoBackupRequest
{
    public bool? Enabled { get; set; }
    public int? IntervalDays { get; set; }
}

public class ConfigureAutoBackupResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
}
