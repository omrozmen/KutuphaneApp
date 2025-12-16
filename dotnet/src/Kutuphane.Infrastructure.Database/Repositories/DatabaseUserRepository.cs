using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Abstractions.Repositories;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kutuphane.Infrastructure.Database.Repositories;

public class DatabaseUserRepository : IUserRepository
{
    private readonly KutuphaneDbContext _context;

    public DatabaseUserRepository(KutuphaneDbContext context)
    {
        _context = context;
    }

    public async Task<User?> FindByUsernameAsync(string username, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return null;
        }

        var entity = await _context.Users
            .FirstOrDefaultAsync(u => u.Username == username, cancellationToken);

        return entity == null ? null : ToDomain(entity);
    }

    public async Task<User> SaveAsync(User user, CancellationToken cancellationToken = default)
    {
        if (user == null)
        {
            throw new ArgumentNullException(nameof(user), "User cannot be null");
        }

        var entity = await _context.Users
            .FirstOrDefaultAsync(u => u.Username == user.Username, cancellationToken);

        if (entity == null)
        {
            entity = new UserEntity
            {
                Username = user.Username,
                Password = user.Password,
                Role = user.Role.ToString(),
                Name = "", // Personel/admin için boş olabilir
                Surname = ""
            };
            _context.Users.Add(entity);
        }
        else
        {
            entity.Password = user.Password;
            entity.Role = user.Role.ToString();
        }

        await _context.SaveChangesAsync(cancellationToken);
        return user;
    }

    public async Task DeleteAsync(string username, CancellationToken cancellationToken = default)
    {
        var entity = await _context.Users
            .FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
        if (entity != null)
        {
            _context.Users.Remove(entity);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<IReadOnlyList<User>> ListAllAsync(CancellationToken cancellationToken = default)
    {
        var entities = await _context.Users.ToListAsync(cancellationToken);
        return entities.Select(ToDomain).ToArray();
    }

    private static User ToDomain(UserEntity entity)
    {
        var role = entity.Role switch
        {
            "Student" => UserRole.Student,
            "personel" => UserRole.personel,
            "ADMIN" => UserRole.Admin,
            "Admin" => UserRole.Admin,
            _ => UserRole.Student
        };

        return new User(entity.Username ?? string.Empty, entity.Password ?? string.Empty, role);
    }
}



