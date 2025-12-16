using System;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.EntityFrameworkCore;
using BCrypt.Net;

namespace Kutuphane.Infrastructure.Database.Services;

public class RecoveryCodeService
{
    private readonly KutuphaneDbContext _dbContext;

    public RecoveryCodeService(KutuphaneDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    /// <summary>
    /// 12 karakterlik recovery code oluşturur (Format: XXXX-XXXX-XXXX)
    /// </summary>
    public string GenerateRecoveryCode()
    {
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        var random = new Random();
        var code = new char[12];

        for (int i = 0; i < 12; i++)
        {
            code[i] = chars[random.Next(chars.Length)];
        }

        // Format: XXXX-XXXX-XXXX
        return $"{new string(code, 0, 4)}-{new string(code, 4, 4)}-{new string(code, 8, 4)}";
    }

    /// <summary>
    /// Kullanıcı için yeni recovery code oluşturur ve kaydeder
    /// </summary>
    public async Task<string> CreateRecoveryCodeAsync(string username)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null)
        {
            throw new Exception("Kullanıcı bulunamadı");
        }

        // Sadece admin için recovery code
        if (user.Role != "ADMIN" && user.Role != "Admin")
        {
            throw new Exception("Recovery code sadece admin kullanıcıları için oluşturulabilir");
        }

        // Aktif kod kontrolü - kullanılmamış kod varsa yeni üretme
        if (!string.IsNullOrEmpty(user.RecoveryCode) && !user.RecoveryCodeUsed)
        {
            throw new Exception("Aktif bir kurtarma kodunuz zaten var. Kodu kullanana kadar yeni kod üretemezsiniz.");
        }

        var recoveryCode = GenerateRecoveryCode();
        user.RecoveryCode = recoveryCode;
        user.RecoveryCodeCreatedAt = DateTime.UtcNow;
        user.RecoveryCodeUsed = false;

        await _dbContext.SaveChangesAsync();

        return recoveryCode;
    }

    /// <summary>
    /// Recovery code'u doğrular
    /// </summary>
    public async Task<bool> ValidateRecoveryCodeAsync(string username, string code)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) return false;

        if (string.IsNullOrEmpty(user.RecoveryCode)) return false;
        if (user.RecoveryCodeUsed) return false;

        // Süre kontrolü yok - süresiz geçerli
        return user.RecoveryCode.Equals(code, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Recovery code ile şifreyi sıfırlar
    /// </summary>
    public async Task<bool> ResetPasswordWithRecoveryCodeAsync(string username, string code, string newPassword)
    {
        if (!await ValidateRecoveryCodeAsync(username, code))
        {
            return false;
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) return false;

        // Şifreyi hashle ve kaydet
        user.Password = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.RecoveryCodeUsed = true;

        await _dbContext.SaveChangesAsync();

        return true;
    }

    /// <summary>
    /// Kullan İcının recovery code'u var mı kontrol eder
    /// </summary>
    public async Task<bool> HasRecoveryCodeAsync(string username)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) return false;

        return !string.IsNullOrEmpty(user.RecoveryCode) && !user.RecoveryCodeUsed;
    }

    /// <summary>
    /// Recovery code kullanıldı olarak işaretle ve otomatik yeni kod üret
    /// </summary>
    public async Task UseRecoveryCodeAndRegenerateAsync(string username)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (user == null) return;

        // Mevcut kodu kullanıldı olarak işaretle
        user.RecoveryCodeUsed = true;

        // Hemen yeni kod üret
        var newRecoveryCode = GenerateRecoveryCode();
        user.RecoveryCode = newRecoveryCode;
        user.RecoveryCodeCreatedAt = DateTime.UtcNow;
        user.RecoveryCodeUsed = false;

        await _dbContext.SaveChangesAsync();
    }
}
