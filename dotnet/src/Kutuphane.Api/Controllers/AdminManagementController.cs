using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Application.Admin;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.Database.Entities;
using Kutuphane.Infrastructure.Database.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Kutuphane.Api.Controllers;

[ApiController]
[Route("api/admin/management")]
public class AdminManagementController : ControllerBase
{
    private readonly AdminService _adminService;
    private readonly KutuphaneDbContext _context;

    public AdminManagementController(AdminService adminService, KutuphaneDbContext context)
    {
        _adminService = adminService;
        _context = context;
    }

    /// <summary>
    /// Tüm kullanıcıları listeler (sadece Admin)
    /// </summary>
    [HttpGet("users")]
    public async Task<ActionResult<List<UserInfoResponse>>> GetAllUsers(CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var users = await _context.Users.ToListAsync(cancellationToken);
        var response = users.Select(u => new UserInfoResponse
        {
            Username = u.Username ?? "",
            Name = u.Name,
            Surname = u.Surname,
            Role = u.Role,
            Class = u.Class,
            Branch = u.Branch,
            StudentNumber = u.StudentNumber,
            PenaltyPoints = u.PenaltyPoints
        }).ToList();

        return Ok(response);
    }

    /// <summary>
    /// Kullanıcı rolünü değiştirir (sadece Admin)
    /// </summary>
    [HttpPost("users/{username}/role")]
    public async Task<ActionResult> ChangeUserRole(string username, [FromBody] ChangeRoleRequest request, CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Admin kontrolü ekle
            var role = request.Role switch
            {
                "Student" => UserRole.Student,
                "personel" => UserRole.personel,
                "Admin" => UserRole.Admin,
                _ => throw new ArgumentException("Geçersiz rol")
            };

            await _adminService.ChangeUserRoleAsync(username, role, cancellationToken);
            return Ok(new { message = "Rol başarıyla değiştirildi" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Kullanıcı şifresini değiştirir (sadece Admin)
    /// </summary>
    [HttpPost("users/{username}/password")]
    public async Task<ActionResult> ChangeUserPassword(string username, [FromBody] ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Admin kontrolü ekle
            await _adminService.ChangeUserPasswordAsync(username, request.NewPassword, cancellationToken);
            return Ok(new { message = "Şifre başarıyla değiştirildi" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Yeni personel oluşturur (sadece Admin)
    /// </summary>
    [HttpPost("personel")]
    public async Task<ActionResult> Createpersonel([FromBody] CreatepersonelRequest request, CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Admin kontrolü ekle
            await _adminService.CreatepersonelAsync(request.Username, request.Password ?? "", request.Name, cancellationToken);
            
            // UserEntity'ye ek bilgileri ekle
            var userEntity = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == request.Username, cancellationToken);
            if (userEntity != null)
            {
                userEntity.Name = request.Name;
                await _context.SaveChangesAsync(cancellationToken);
            }

            return Ok(new { message = "Personel başarıyla oluşturuldu" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Yeni admin oluşturur (sadece Admin)
    /// </summary>
    [HttpPost("admins")]
    public async Task<ActionResult> CreateAdmin([FromBody] CreateAdminRequest request, CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Admin kontrolü ekle
            await _adminService.CreateAdminAsync(request.Username, request.Password, request.Name, cancellationToken);
            
            // UserEntity'ye ek bilgileri ekle
            var userEntity = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == request.Username, cancellationToken);
            if (userEntity != null)
            {
                userEntity.Name = request.Name;
                await _context.SaveChangesAsync(cancellationToken);
            }

            return Ok(new { message = "Admin başarıyla oluşturuldu" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Kullanıcıyı siler (sadece Admin)
    /// </summary>
    [HttpDelete("users/{username}")]
    public async Task<ActionResult> DeleteUser(string username, CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Admin kontrolü ekle
            await _adminService.DeleteUserAsync(username, cancellationToken);
            return Ok(new { message = "Kullanıcı başarıyla silindi" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Kullanıcı bilgilerini getirir (sadece Admin)
    /// </summary>
    [HttpGet("users/{username}")]
    public async Task<ActionResult<UserInfoResponse>> GetUser(string username, CancellationToken cancellationToken)
    {
        // TODO: Admin kontrolü ekle
        var userEntity = await _context.Users
            .FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
        if (userEntity == null)
        {
            return NotFound(new { message = "Kullanıcı bulunamadı" });
        }

        var response = new UserInfoResponse
        {
            Username = userEntity.Username ?? "",
            Name = userEntity.Name,
            Surname = userEntity.Surname,
            Role = userEntity.Role,
            Class = userEntity.Class,
            Branch = userEntity.Branch,
            StudentNumber = userEntity.StudentNumber,
            PenaltyPoints = userEntity.PenaltyPoints
        };

        return Ok(response);
    }
}

// Request/Response modelleri
public class ChangeRoleRequest
{
    public string Role { get; set; } = string.Empty;
}

public class ChangePasswordRequest
{
    public string NewPassword { get; set; } = string.Empty;
}

// CreatepersonelRequest moved to DatabaseAdminController to avoid duplicate

public class CreateAdminRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

public class UserInfoResponse
{
    public string Username { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Surname { get; set; }
    public string Role { get; set; } = string.Empty;
    public int? Class { get; set; }
    public string? Branch { get; set; }
    public int? StudentNumber { get; set; }
    public int PenaltyPoints { get; set; }
}
