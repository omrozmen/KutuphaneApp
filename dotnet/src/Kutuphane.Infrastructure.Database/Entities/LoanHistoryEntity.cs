using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Kutuphane.Infrastructure.Database.Entities;

[Table("LoanHistory")]
public class LoanHistoryEntity
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    [Required]
    public Guid BookId { get; set; }

    [Required]
    [MaxLength(256)]
    public string BookTitle { get; set; } = string.Empty;

    [Required]
    [MaxLength(256)]
    public string BookAuthor { get; set; } = string.Empty;

    [MaxLength(128)]
    public string? BookCategory { get; set; } = "Genel";

    [Required]
    [MaxLength(256)]
    public string Borrower { get; set; } = string.Empty;

    [Required]
    [MaxLength(256)]
    public string NormalizedBorrower { get; set; } = string.Empty;

    public int? StudentNumber { get; set; }

    [Required]
    public DateTime BorrowedAt { get; set; }

    [Required]
    public DateTime DueDate { get; set; }

    public int LoanDays { get; set; }

    public DateTime? ReturnedAt { get; set; }

    [Required]
    [MaxLength(128)]
    public string BorrowPersonel { get; set; } = string.Empty;

    [MaxLength(128)]
    public string? ReturnPersonel { get; set; }

    public bool WasLate { get; set; }

    public int LateDays { get; set; }

    public int? DurationDays { get; set; }

    [Required]
    [MaxLength(32)]
    public string Status { get; set; } = "ACTIVE";
}


