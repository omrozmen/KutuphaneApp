using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Kutuphane.Infrastructure.Database.Entities;

[Table("Loans")]
public class LoanEntity
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    public Guid BookId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Borrower { get; set; } = string.Empty;

    [Required]
    public DateTime DueDate { get; set; }

    [Required]
    [MaxLength(200)]
    [Column("Staff")] // Veritabanındaki kolon adı Staff, kodda personel olarak kullanılıyor
    public string personel { get; set; } = string.Empty;

    // Navigation property
    [ForeignKey(nameof(BookId))]
    public virtual BookEntity? Book { get; set; }
}
