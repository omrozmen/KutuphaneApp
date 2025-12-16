using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Kutuphane.Core.Domain;

namespace Kutuphane.Core.Abstractions.Repositories;

public interface IUserRepository
{
    Task<User?> FindByUsernameAsync(string username, CancellationToken cancellationToken = default);

    Task<User> SaveAsync(User user, CancellationToken cancellationToken = default);

    Task DeleteAsync(string username, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<User>> ListAllAsync(CancellationToken cancellationToken = default);
}
