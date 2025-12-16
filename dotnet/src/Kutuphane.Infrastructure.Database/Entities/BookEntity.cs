using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Kutuphane.Infrastructure.Database.Entities;

[Table("Books")]
public class BookEntity
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

    public int TotalQuantity { get; set; }

    public int HealthyCount { get; set; }

    public int DamagedCount { get; set; }

    public int LostCount { get; set; }

    [MaxLength(200)]
    [Column("LastPersonel")] // Eski kolon adıyla uyum sağla
    public string? Lastpersonel { get; set; }

    [MaxLength(50)]
    public string? Shelf { get; set; }

    [MaxLength(100)]
    public string? Publisher { get; set; }

    [MaxLength(1000)]
    public string? Summary { get; set; }

    public int? BookNumber { get; set; }

    public int? Year { get; set; }

    public int? PageCount { get; set; }

    // Navigation property
    public virtual ICollection<LoanEntity> Loans { get; set; } = new List<LoanEntity>();
}
