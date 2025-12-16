using System;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kutuphane.Infrastructure.Database;

public class KutuphaneDbContext : DbContext
{
    public DbSet<BookEntity> Books { get; set; }
    public DbSet<LoanEntity> Loans { get; set; }
    public DbSet<UserEntity> Users { get; set; }
    public DbSet<BookStatEntity> BookStats { get; set; }
    public DbSet<StudentStatEntity> StudentStats { get; set; }
    public DbSet<ActivityLogEntity> ActivityLogs { get; set; }
    public DbSet<LoanHistoryEntity> LoanHistory { get; set; }

    public KutuphaneDbContext(DbContextOptions<KutuphaneDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Book entity configuration
        modelBuilder.Entity<BookEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Title);
            entity.HasIndex(e => e.Author);
            entity.HasIndex(e => e.Category);
        });

        // Loan entity configuration
        modelBuilder.Entity<LoanEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.BookId);
            entity.HasIndex(e => e.Borrower);
            entity.HasIndex(e => e.DueDate);
            
            entity.HasOne(e => e.Book)
                .WithMany(b => b.Loans)
                .HasForeignKey(e => e.BookId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // User entity configuration
        modelBuilder.Entity<UserEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Username).IsUnique();
            entity.HasIndex(e => e.StudentNumber).IsUnique();
            entity.HasIndex(e => e.Role);
        });

        // BookStat entity configuration
        modelBuilder.Entity<BookStatEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Title);
        });

        // StudentStat entity configuration
        modelBuilder.Entity<StudentStatEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.Name, e.Surname });
        });

        // ActivityLog entity configuration
        modelBuilder.Entity<ActivityLogEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Timestamp);
            entity.HasIndex(e => e.Username);
            entity.HasIndex(e => e.Action);
        });

        modelBuilder.Entity<LoanHistoryEntity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.BookId);
            entity.HasIndex(e => e.NormalizedBorrower);
            entity.HasIndex(e => e.Status);
            entity.Property(e => e.Status).HasDefaultValue("ACTIVE");
        });
    }
}



