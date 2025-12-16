using Kutuphane.Core.Application.Auth;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.Database.Entities;
using Kutuphane.Infrastructure.Database.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthenticationService _authenticationService;
    private readonly KutuphaneDbContext _context;
    private readonly RecoveryCodeService _recoveryCodeService;

    public AuthController(
        AuthenticationService authenticationService, 
        KutuphaneDbContext context,
        RecoveryCodeService recoveryCodeService)
    {
        _authenticationService = authenticationService;
        _context = context;
        _recoveryCodeService = recoveryCodeService;
    }

    [HttpPost("login")]
    public async Task<ActionResult<UserResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        try
        {
            bool usedRecoveryCode = false;
            User user;

            try
            {
                // Önce normal şifre ile dene
                user = await _authenticationService.LoginAsync(request.Username, request.Password, cancellationToken);
            }
            catch (InvalidOperationException)
            {
                // Normal şifre başarısız, kurtarma kodu ile dene
                var isValidRecoveryCode = await _recoveryCodeService.ValidateRecoveryCodeAsync(request.Username, request.Password);
                
                if (!isValidRecoveryCode)
                {
                    return BadRequest(new { message = "Kullanıcı adı veya şifre hatalı" });
                }

                // Kurtarma kodu geçerli, kullanıcıyı al
                user = await _authenticationService.VerifyUserAsync(request.Username, cancellationToken);
                if (user == null)
                {
                    return BadRequest(new { message = "Kullanıcı bulunamadı" });
                }

                usedRecoveryCode = true;

                // Kurtarma kodunu kullanıldı olarak işaretle (yenileme YOK - manuel yapmalı)
                var dbUser = await _context.Users.FirstOrDefaultAsync(u => u.Username == request.Username, cancellationToken);
                if (dbUser != null)
                {
                    dbUser.RecoveryCodeUsed = true;
                    await _context.SaveChangesAsync(cancellationToken);
                }
            }

            // Session cookie ayarla (30 gün geçerli)
            Response.Cookies.Append("kutuphane_session", user.Username, new Microsoft.AspNetCore.Http.CookieOptions
            {
                Expires = DateTimeOffset.UtcNow.AddDays(30),
                HttpOnly = false, // JavaScript'ten erişilebilir
                SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax,
                Secure = false // HTTPS kullanıyorsanız true yapın
            });
            
            // Login işlemini logla
            try
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = user.Username,
                    Action = "LOGIN",
                    Details = usedRecoveryCode 
                        ? "Kullanıcı kurtarma kodu ile giriş yaptı (manuel yeni kod üretmeli)" 
                        : "Kullanıcı giriş yaptı"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                // Log kaydetme hatası kritik değil, sessizce devam et
                Console.WriteLine($"Login log kaydetme hatası: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
            }
            
            return Ok(new UserResponse(user.Username, user.Role.ToString(), usedRecoveryCode));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == request.Username, cancellationToken);
            if (user == null)
            {
                return BadRequest(new { message = "Kullanıcı bulunamadı" });
            }

            // Yeni şifreyi hash'le ve kaydet
            user.Password = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _context.SaveChangesAsync(cancellationToken);

            // Log kaydı
            try
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = user.Username,
                    Action = "PASSWORD_CHANGE",
                    Details = "Kullanıcı şifresini değiştirdi"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Şifre değiştirme log hatası: {ex.Message}");
            }

            return Ok(new { message = "Şifre başarıyla değiştirildi" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("verify")]
    public async Task<ActionResult<UserResponse>> VerifySession(CancellationToken cancellationToken)
    {
        try
        {
            // Cookie'den kullanıcı adını al
            var username = Request.Cookies["kutuphane_session"];
            if (string.IsNullOrEmpty(username))
            {
                return Unauthorized(new { message = "Oturum bulunamadı" });
            }

            // Kullanıcıyı doğrula
            var user = await _authenticationService.VerifyUserAsync(username, cancellationToken);
            if (user == null)
            {
                return Unauthorized(new { message = "Kullanıcı bulunamadı" });
            }

            return Ok(new UserResponse(user.Username, user.Role.ToString()));
        }
        catch (Exception ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        // Cookie'den kullanıcı adını al (silmeden önce)
        var username = Request.Cookies["kutuphane_session"];
        
        // Cookie'yi sil
        Response.Cookies.Delete("kutuphane_session");
        
        // Logout işlemini logla
        if (!string.IsNullOrEmpty(username))
        {
            try
            {
                var log = new ActivityLogEntity
                {
                    Timestamp = DateTime.Now,
                    Username = username,
                    Action = "LOGOUT",
                    Details = $"Kullanıcı çıkış yaptı"
                };
                _context.ActivityLogs.Add(log);
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                // Log kaydetme hatası kritik değil, sessizce devam et
                Console.WriteLine($"Logout log kaydetme hatası: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
            }
        }
        
        return Ok(new { message = "Çıkış yapıldı" });
    }

    // Recovery Code Endpoints
    [HttpPost("recovery-code/generate")]
    public async Task<ActionResult<RecoveryCodeResponse>> GenerateRecoveryCode([FromBody] RecoveryCodeGenerateRequest request)
    {
        try
        {
            // Önce admin şifresini doğrula
            try
            {
                await _authenticationService.LoginAsync(request.Username, request.Password, CancellationToken.None);
            }
            catch (InvalidOperationException)
            {
                return BadRequest(new { message = "Admin şifresi yanlış" });
            }

            var code = await _recoveryCodeService.CreateRecoveryCodeAsync(request.Username);
            return Ok(new RecoveryCodeResponse { RecoveryCode = code, Message = "Kurtarma kodu oluşturuldu" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("recovery-code/check/{username}")]
    public async Task<ActionResult<RecoveryCodeCheckResponse>> CheckRecoveryCode(string username)
    {
        try
        {
            var hasCode = await _recoveryCodeService.HasRecoveryCodeAsync(username);
            return Ok(new RecoveryCodeCheckResponse { HasRecoveryCode = hasCode });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("recovery-code/reset")]
    public async Task<IActionResult> ResetRecoveryCode([FromBody] RecoveryCodeGenerateRequest request)
    {
        try
        {
            // Önce admin şifresini doğrula
            try
            {
                await _authenticationService.LoginAsync(request.Username, request.Password, CancellationToken.None);
            }
            catch (InvalidOperationException)
            {
                return BadRequest(new { message = "Admin şifresi yanlış" });
            }

            // Mevcut kodu tamamen sil - YENİ KOD ÜRETME
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == request.Username);
            if (user != null)
            {
                // Tüm recovery code alanlarını temizle
                user.RecoveryCode = null;
                user.RecoveryCodeCreatedAt = null;
                user.RecoveryCodeUsed = false;
                await _context.SaveChangesAsync();
            }

            return Ok(new { message = "Kurtarma kodu silindi. Yeni kod üretebilirsiniz." });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("recovery-code/reset-password")]
    public async Task<IActionResult> ResetPasswordWithRecoveryCode([FromBody] RecoveryCodeResetRequest request)
    {
        try
        {
            var success = await _recoveryCodeService.ResetPasswordWithRecoveryCodeAsync(
                request.Username, 
                request.RecoveryCode, 
                request.NewPassword);

            if (!success)
            {
                return BadRequest(new { message = "Geçersiz kurtarma kodu veya kullanıcı" });
            }

            return Ok(new { message = "Şifre başarıyla sıfırlandı" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    public sealed record LoginRequest(string Username, string Password);
    public sealed record UserResponse
    {
        public string Username { get; init; }
        public string Role { get; init; }
        public bool UsedRecoveryCode { get; init; }

        public UserResponse(string username, string role, bool usedRecoveryCode = false)
        {
            Username = username;
            Role = role;
            UsedRecoveryCode = usedRecoveryCode;
        }
    }
    public sealed record ChangePasswordRequest(string Username, string NewPassword);
    public sealed record RecoveryCodeGenerateRequest(string Username, string Password);
    public sealed record RecoveryCodeResponse
    {
        public string RecoveryCode { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }
    public sealed record RecoveryCodeCheckResponse
    {
        public bool HasRecoveryCode { get; set; }
    }
    public sealed record RecoveryCodeResetRequest(string Username, string RecoveryCode, string NewPassword);
}
