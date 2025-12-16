using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Files.Models;
using Kutuphane.Infrastructure.Files.Storage;

namespace Kutuphane.Infrastructure.Files.Repositories;

public sealed class FileUserRepository : IUserRepository
{
    private readonly JsonFileStorage<LibraryDatabaseModel> _storage;

    public FileUserRepository(JsonFileStorage<LibraryDatabaseModel> storage)
    {
        _storage = storage;
    }

    public async Task<User?> FindByUsernameAsync(string username, CancellationToken cancellationToken = default)
    {
        var data = await _storage.ReadAsync(cancellationToken);
        
        // Data veya Users null ise null döndür
        if (data == null || data.Users == null)
        {
            return null;
        }

        var record = data.Users.FirstOrDefault(
            item => string.Equals(item.Username, username, StringComparison.OrdinalIgnoreCase));
        return record is null ? null : ToDomain(record);
    }

    public async Task<User> SaveAsync(User user, CancellationToken cancellationToken = default)
    {
        if (user == null)
        {
            throw new ArgumentNullException(nameof(user), "User cannot be null");
        }

        var data = await _storage.ReadAsync(cancellationToken);
        
        // Data null ise yeni bir instance oluştur
        if (data == null)
        {
            data = new LibraryDatabaseModel();
        }
        
        // Users listesi null ise yeni bir liste oluştur
        if (data.Users == null)
        {
            data.Users = new List<UserRecordModel>();
        }

        var serialized = ToRecord(user);
        var index = data.Users.FindIndex(item =>
            string.Equals(item.Username, serialized.Username, StringComparison.OrdinalIgnoreCase));
        if (index >= 0)
        {
            data.Users[index] = serialized;
        }
        else
        {
            data.Users.Add(serialized);
        }

        await _storage.WriteAsync(data, cancellationToken);
        return user;
    }

    public async Task DeleteAsync(string username, CancellationToken cancellationToken = default)
    {
        var data = await _storage.ReadAsync(cancellationToken);
        
        // Data veya Users null ise işlem yapma
        if (data == null || data.Users == null)
        {
            return;
        }

        data.Users.RemoveAll(item => string.Equals(item.Username, username, StringComparison.OrdinalIgnoreCase));
        await _storage.WriteAsync(data, cancellationToken);
    }

    public async Task<IReadOnlyList<User>> ListAllAsync(CancellationToken cancellationToken = default)
    {
        var data = await _storage.ReadAsync(cancellationToken);
        
        // Data veya Users null ise boş liste döndür
        if (data == null || data.Users == null)
        {
            return Array.Empty<User>();
        }

        return data.Users.Select(ToDomain).ToArray();
    }

    private static UserRecordModel ToRecord(User user) =>
        new()
        {
            Username = user.Username,
            Password = user.Password,
            Role = user.Role.ToString().ToUpperInvariant(),
        };

    private static User ToDomain(UserRecordModel record)
    {
        if (!Enum.TryParse<UserRole>(record.Role, ignoreCase: true, out var role))
        {
            role = UserRole.Student;
        }

        return new User(record.Username, record.Password, role);
    }
}
