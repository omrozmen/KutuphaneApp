using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Kutuphane.Infrastructure.Database.Entities;

[Table("BookStats")]
public class BookStatEntity
{
    [Key]
    public Guid Id { get; set; }

    [Required]
    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Author { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string Category { get; set; } = "Genel";

    public int Quantity { get; set; }

    public int Borrowed { get; set; }

    public int Returned { get; set; }

    public int Late { get; set; }
}



