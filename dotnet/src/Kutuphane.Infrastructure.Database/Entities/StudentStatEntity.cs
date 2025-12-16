using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Kutuphane.Infrastructure.Database.Entities;

[Table("StudentStats")]
public class StudentStatEntity
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Surname { get; set; } = string.Empty;

    public int Borrowed { get; set; }

    public int Returned { get; set; }

    public int Late { get; set; }
}



