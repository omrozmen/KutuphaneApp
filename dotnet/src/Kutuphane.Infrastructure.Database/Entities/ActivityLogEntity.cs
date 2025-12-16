using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Kutuphane.Infrastructure.Database.Entities;

[Table("ActivityLogs")]
public class ActivityLogEntity
{
    [Key]
    public int Id { get; set; }

    [Required]
    public DateTime Timestamp { get; set; }

    [Required]
    [MaxLength(100)]
    public string Username { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string Action { get; set; } = string.Empty; // "LOGIN", "ADD_BOOK", "UPDATE_BOOK", "DELETE_BOOK", "ADD_LOAN", "RETURN_LOAN", "ADD_STUDENT", "UPDATE_STUDENT", "DELETE_STUDENT", "ADD_PERSONEL", "UPDATE_PERSONEL", "DELETE_PERSONEL"

    [MaxLength(500)]
    public string? Details { get; set; } // İşlem detayları (örn: "Kitap: 'Suç ve Ceza' eklendi", "Öğrenci: 'Ahmet Yılmaz' silindi")
}
