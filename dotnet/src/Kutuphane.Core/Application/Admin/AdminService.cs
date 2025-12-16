using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;

namespace Kutuphane.Core.Application.Admin;

/// <summary>
/// Admin işlemleri için servis - sadece Admin rolüne sahip kullanıcılar kullanabilir
/// </summary>
public class AdminService
{
    private readonly IUserRepository _userRepository;

    public AdminService(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    /// <summary>
    /// Kullanıcı rolünü değiştirir (sadece Admin)
    /// </summary>
    public async Task ChangeUserRoleAsync(string username, UserRole newRole, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.FindByUsernameAsync(username, cancellationToken);
        if (user == null)
        {
            throw new InvalidOperationException($"Kullanıcı bulunamadı: {username}");
        }

        var updatedUser = new User(user.Username, user.Password, newRole);
        await _userRepository.SaveAsync(updatedUser, cancellationToken);
    }

    /// <summary>
    /// Kullanıcı şifresini değiştirir (sadece Admin)
    /// </summary>
    public async Task ChangeUserPasswordAsync(string username, string newPassword, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.FindByUsernameAsync(username, cancellationToken);
        if (user == null)
        {
            throw new InvalidOperationException($"Kullanıcı bulunamadı: {username}");
        }

        var updatedUser = new User(user.Username, newPassword, user.Role);
        await _userRepository.SaveAsync(updatedUser, cancellationToken);
    }

    /// <summary>
    /// Yeni personel oluşturur (sadece Admin)
    /// </summary>
    public async Task CreatepersonelAsync(string username, string password, string name, CancellationToken cancellationToken = default)
    {
        var existingUser = await _userRepository.FindByUsernameAsync(username, cancellationToken);
        if (existingUser != null)
        {
            throw new InvalidOperationException($"Kullanıcı zaten mevcut: {username}");
        }

        var newpersonel = new User(username, password, UserRole.personel);
        await _userRepository.SaveAsync(newpersonel, cancellationToken);
    }

    /// <summary>
    /// Yeni admin oluşturur (sadece Admin)
    /// </summary>
    public async Task CreateAdminAsync(string username, string password, string name, CancellationToken cancellationToken = default)
    {
        var existingUser = await _userRepository.FindByUsernameAsync(username, cancellationToken);
        if (existingUser != null)
        {
            throw new InvalidOperationException($"Kullanıcı zaten mevcut: {username}");
        }

        var newAdmin = new User(username, password, UserRole.Admin);
        await _userRepository.SaveAsync(newAdmin, cancellationToken);
    }

    /// <summary>
    /// Kullanıcıyı siler (sadece Admin)
    /// </summary>
    public async Task DeleteUserAsync(string username, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.FindByUsernameAsync(username, cancellationToken);
        if (user == null)
        {
            throw new InvalidOperationException($"Kullanıcı bulunamadı: {username}");
        }

        // Admin kendini silemez
        // Bu kontrolü controller'da yapabilirsiniz

        await _userRepository.DeleteAsync(username, cancellationToken);
    }

    /// <summary>
    /// Tüm kullanıcıları listeler (sadece Admin)
    /// </summary>
    public async Task<IReadOnlyList<User>> ListAllUsersAsync(CancellationToken cancellationToken = default)
    {
        return await _userRepository.ListAllAsync(cancellationToken);
    }

    /// <summary>
    /// Kullanıcı bilgilerini getirir (sadece Admin)
    /// </summary>
    public async Task<User?> GetUserAsync(string username, CancellationToken cancellationToken = default)
    {
        return await _userRepository.FindByUsernameAsync(username, cancellationToken);
    }
}
