namespace Kutuphane.Core.Domain;

public enum UserRole
{
    Student,
    personel,
    Admin,
}

public sealed record User(
    string Username,
    string Password,
    UserRole Role);
