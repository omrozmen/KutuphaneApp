using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Kutuphane.Infrastructure.Database.Entities;

[Table("Users")]
public class UserEntity
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [MaxLength(100)]
    public string? Username { get; set; }

    [MaxLength(200)]
    public string? Password { get; set; }

    [Required]
    [MaxLength(20)]
    public string Role { get; set; } = "Student";

    // Common fields
    [MaxLength(200)]
    public string? Name { get; set; }

    [MaxLength(200)]
    public string? Surname { get; set; }

    // Student specific fields (nullable for personel/admin)
    public int? Class { get; set; }

    [MaxLength(10)]
    public string? Branch { get; set; }

    public int? StudentNumber { get; set; }

    public int PenaltyPoints { get; set; } = 0;

    // personel specific fields (nullable for students/admin)
    [MaxLength(100)]
    public string? Position { get; set; }

    // Recovery Code fields (for admin password recovery)
    [MaxLength(20)]
    public string? RecoveryCode { get; set; }
    
    public DateTime? RecoveryCodeCreatedAt { get; set; }
    
    public bool RecoveryCodeUsed { get; set; } = false;
}
