using System;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;

namespace Kutuphane.Core.Application.Auth;

public sealed class AuthenticationService
{
    private readonly IUserRepository _repository;

    public AuthenticationService(IUserRepository repository)
    {
        _repository = repository;
    }

    public async Task<User> LoginAsync(string username, string password, CancellationToken cancellationToken = default)
    {
        username = (username ?? string.Empty).Trim();
        password ??= string.Empty;
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
        {
            throw new InvalidOperationException("Kullanıcı adı ve parola gerekli");
        }

        var user = await _repository.FindByUsernameAsync(username, cancellationToken);
        if (user is null || user.Password != password)
        {
            throw new InvalidOperationException("Geçersiz bilgiler");
        }

        // Admin ve personel login olabilir, öğrenciler login olamaz
        if (user.Role != UserRole.Admin && user.Role != UserRole.personel)
        {
            throw new InvalidOperationException("Sadece admin ve personel kullanıcılar login olabilir.");
        }

        return user;
    }

    public async Task<User?> VerifyUserAsync(string username, CancellationToken cancellationToken = default)
    {
        username = (username ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(username))
        {
            return null;
        }

        var user = await _repository.FindByUsernameAsync(username, cancellationToken);
        if (user == null)
        {
            return null;
        }

        // Admin ve personel login olabilir, öğrenciler login olamaz
        if (user.Role != UserRole.Admin && user.Role != UserRole.personel)
        {
            return null;
        }

        return user;
    }
}
