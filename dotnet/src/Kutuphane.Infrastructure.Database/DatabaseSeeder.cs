using System;
using System.Data.Common;
using System.Linq;
using System.Threading.Tasks;
using Kutuphane.Core.Domain;
using Kutuphane.Infrastructure.Database.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kutuphane.Infrastructure.Database;

public class DatabaseSeeder
{
    private readonly KutuphaneDbContext _context;

    public DatabaseSeeder(KutuphaneDbContext context)
    {
        _context = context;
    }

    public async Task SeedAsync()
    {
        // Ensure database is created
        await _context.Database.EnsureCreatedAsync();

        // Migrate existing database: Add new columns if they don't exist
        await MigrateDatabaseAsync();

        // Check if already seeded
        if (await _context.Users.AnyAsync())
        {
            return; // Already seeded
        }

        // Seed default admin user
        var adminUser = new UserEntity
        {
            Id = 1,
            Username = "admin",
            Password = "admin",
            Role = "ADMIN",
            Name = "Sistem",
            Surname = "Yöneticisi"
        };
        _context.Users.Add(adminUser);



        await _context.SaveChangesAsync();
    }

    private async Task MigrateDatabaseAsync()
    {
        try
        {
            var connection = _context.Database.GetDbConnection();
            await connection.OpenAsync();
            
            try
            {
                // Users tablosu için migration: Id ekle, Username/Password nullable yap, Name/Surname zorunlu yap
                await MigrateUsersTableAsync(connection);
                await EnsureColumnAsync(connection, "Users", "Surname", "TEXT");
                await EnsureColumnAsync(connection, "Users", "Position", "TEXT");
                await EnsureColumnAsync(connection, "Books", "Category", "TEXT NOT NULL DEFAULT 'Genel'", "UPDATE Books SET Category = COALESCE(NULLIF(Category, ''), 'Genel');");
                await EnsureColumnAsync(connection, "Books", "TotalQuantity", "INTEGER NOT NULL DEFAULT 0", "UPDATE Books SET TotalQuantity = CASE WHEN TotalQuantity <= 0 THEN Quantity ELSE TotalQuantity END;");
                await EnsureColumnAsync(connection, "Books", "LastPersonel", "TEXT");
                await EnsureColumnAsync(connection, "Books", "HealthyCount", "INTEGER NOT NULL DEFAULT 0", "UPDATE Books SET HealthyCount = CASE WHEN TotalQuantity > 0 THEN TotalQuantity ELSE Quantity END;");
                await EnsureColumnAsync(connection, "Books", "DamagedCount", "INTEGER NOT NULL DEFAULT 0");
                await EnsureColumnAsync(connection, "Books", "LostCount", "INTEGER NOT NULL DEFAULT 0");
                await EnsureColumnAsync(connection, "Books", "Shelf", "TEXT");
                await EnsureColumnAsync(connection, "Books", "Publisher", "TEXT");
                await EnsureColumnAsync(connection, "Books", "Summary", "TEXT");
                await EnsureColumnAsync(connection, "Books", "BookNumber", "INTEGER");
                await EnsureColumnAsync(connection, "Books", "Year", "INTEGER");
                await EnsureColumnAsync(connection, "Books", "PageCount", "INTEGER");

                // Ensure frequently used tables exist (Loans migrated from JSON, statistics tables, etc.)
                await EnsureLoansTableAsync(connection);
                // Yeni kolonlar için tablo zaten varsa da ALTER TABLE uygula
                await EnsureColumnAsync(connection, "Loans", "Personel", "TEXT NOT NULL DEFAULT ''", "UPDATE Loans SET Personel = COALESCE(NULLIF(Personel, ''), '');");
                await EnsureBookStatsTableAsync(connection);
                await MigrateStudentStatsTableAsync(connection);
                await EnsureActivityLogsTableAsync(connection);
                await EnsureLoanHistoryTableAsync(connection);

                // Normalize existing data for downstream queries
                await ExecuteNonQueryAsync(connection, "UPDATE Books SET Category = COALESCE(NULLIF(Category, ''), 'Genel');");
                await ExecuteNonQueryAsync(connection, "UPDATE Books SET TotalQuantity = CASE WHEN TotalQuantity <= 0 THEN Quantity ELSE TotalQuantity END;");
            }
            finally
            {
                await connection.CloseAsync();
            }
        }
        catch (Exception ex)
        {
            // Log error but don't fail - migration is optional
            Console.WriteLine($"Database migration warning: {ex.Message}");
        }
    }

    public async Task MigrateFromJsonAsync(string jsonFilePath)
    {
        // This method can be used to migrate existing JSON data to database
        // Implementation depends on your JSON structure
        // For now, we'll just ensure the database is created
        await _context.Database.EnsureCreatedAsync();
    }

    private static async Task EnsureColumnAsync(DbConnection connection, string tableName, string columnName, string definition, string? postAddSql = null)
    {
        using var checkCmd = connection.CreateCommand();
        checkCmd.CommandText = $"SELECT COUNT(*) FROM pragma_table_info('{tableName}') WHERE name='{columnName}';";
        var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
        if (exists)
        {
            return;
        }

        using var alterCmd = connection.CreateCommand();
        alterCmd.CommandText = $"ALTER TABLE {tableName} ADD COLUMN {columnName} {definition};";
        await alterCmd.ExecuteNonQueryAsync();

        if (!string.IsNullOrWhiteSpace(postAddSql))
        {
            await ExecuteNonQueryAsync(connection, postAddSql);
        }
    }

    private static async Task EnsureLoansTableAsync(DbConnection connection)
    {
        const string createLoansSql = @"
CREATE TABLE IF NOT EXISTS Loans (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    BookId TEXT NOT NULL,
    Borrower TEXT NOT NULL,
    DueDate TEXT NOT NULL,
    Personel TEXT NOT NULL,
    FOREIGN KEY (BookId) REFERENCES Books(Id) ON DELETE CASCADE
);";

        await ExecuteNonQueryAsync(connection, createLoansSql);
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Loans_BookId ON Loans(BookId);");
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Loans_Borrower ON Loans(Borrower);");
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Loans_DueDate ON Loans(DueDate);");
    }

    private static async Task EnsureBookStatsTableAsync(DbConnection connection)
    {
        const string createBookStatsSql = @"
CREATE TABLE IF NOT EXISTS BookStats (
    Id TEXT NOT NULL PRIMARY KEY,
    Title TEXT NOT NULL,
    Author TEXT NOT NULL,
    Category TEXT NOT NULL,
    Quantity INTEGER NOT NULL DEFAULT 0,
    Borrowed INTEGER NOT NULL DEFAULT 0,
    Returned INTEGER NOT NULL DEFAULT 0,
    Late INTEGER NOT NULL DEFAULT 0
);";

        await ExecuteNonQueryAsync(connection, createBookStatsSql);
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_BookStats_Title ON BookStats(Title);");
    }

    private static async Task EnsureStudentStatsTableAsync(DbConnection connection)
    {
        const string createStudentStatsSql = @"
CREATE TABLE IF NOT EXISTS StudentStats (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Surname TEXT NOT NULL,
    Borrowed INTEGER NOT NULL DEFAULT 0,
    Returned INTEGER NOT NULL DEFAULT 0,
    Late INTEGER NOT NULL DEFAULT 0
);";

        await ExecuteNonQueryAsync(connection, createStudentStatsSql);
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_StudentStats_Name_Surname ON StudentStats(Name, Surname);");
    }

    private static async Task EnsureActivityLogsTableAsync(DbConnection connection)
    {
        const string createActivityLogsSql = @"
CREATE TABLE IF NOT EXISTS ActivityLogs (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Timestamp TEXT NOT NULL,
    Username TEXT NOT NULL,
    Action TEXT NOT NULL,
    Details TEXT
);";

        await ExecuteNonQueryAsync(connection, createActivityLogsSql);
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_ActivityLogs_Timestamp ON ActivityLogs(Timestamp);");
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_ActivityLogs_Username ON ActivityLogs(Username);");
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_ActivityLogs_Action ON ActivityLogs(Action);");
    }

    private static async Task EnsureLoanHistoryTableAsync(DbConnection connection)
    {
        const string createSql = @"
CREATE TABLE IF NOT EXISTS LoanHistory (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    BookId TEXT NOT NULL,
    BookTitle TEXT NOT NULL,
    BookAuthor TEXT NOT NULL,
    BookCategory TEXT,
    Borrower TEXT NOT NULL,
    NormalizedBorrower TEXT NOT NULL,
    StudentNumber INTEGER,
    BorrowedAt TEXT NOT NULL,
    DueDate TEXT NOT NULL,
    LoanDays INTEGER NOT NULL DEFAULT 0,
    ReturnedAt TEXT,
    BorrowPersonel TEXT NOT NULL,
    ReturnPersonel TEXT,
    WasLate INTEGER NOT NULL DEFAULT 0,
    LateDays INTEGER NOT NULL DEFAULT 0,
    DurationDays INTEGER,
    Status TEXT NOT NULL DEFAULT 'ACTIVE'
);";

        await ExecuteNonQueryAsync(connection, createSql);
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_LoanHistory_BookId ON LoanHistory(BookId);");
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_LoanHistory_NormalizedBorrower ON LoanHistory(NormalizedBorrower);");
        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_LoanHistory_Status ON LoanHistory(Status);");
    }

    private static async Task MigrateStudentStatsTableAsync(DbConnection connection)
    {
        using var checkTableCmd = connection.CreateCommand();
        checkTableCmd.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='StudentStats';";
        var tableExists = Convert.ToInt32(await checkTableCmd.ExecuteScalarAsync()) > 0;

        if (!tableExists)
        {
            await EnsureStudentStatsTableAsync(connection);
            return;
        }

        // Eski tabloda Id, Surname veya sayaç kolonları eksikse yeniden oluştur
        static async Task<bool> ColumnExistsAsync(DbConnection conn, string column)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = $"SELECT COUNT(*) FROM pragma_table_info('StudentStats') WHERE name='{column}';";
            return Convert.ToInt32(await cmd.ExecuteScalarAsync()) > 0;
        }

        var hasId = await ColumnExistsAsync(connection, "Id");
        var hasSurname = await ColumnExistsAsync(connection, "Surname");
        var hasBorrowed = await ColumnExistsAsync(connection, "Borrowed");
        var hasReturned = await ColumnExistsAsync(connection, "Returned");
        var hasLate = await ColumnExistsAsync(connection, "Late");

        var needsRebuild = !hasId || !hasSurname || !hasBorrowed || !hasReturned || !hasLate;
        if (needsRebuild)
        {
            await ExecuteNonQueryAsync(connection, @"
CREATE TABLE IF NOT EXISTS StudentStats_New (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Surname TEXT NOT NULL,
    Borrowed INTEGER NOT NULL DEFAULT 0,
    Returned INTEGER NOT NULL DEFAULT 0,
    Late INTEGER NOT NULL DEFAULT 0
);");

            var surnameExpr = hasSurname ? "COALESCE(Surname, '')" : "''";
            var borrowedExpr = hasBorrowed ? "COALESCE(Borrowed, 0)" : "0";
            var returnedExpr = hasReturned ? "COALESCE(Returned, 0)" : "0";
            var lateExpr = hasLate ? "COALESCE(Late, 0)" : "0";

            await ExecuteNonQueryAsync(connection, $@"
INSERT INTO StudentStats_New (Name, Surname, Borrowed, Returned, Late)
SELECT Name,
       {surnameExpr},
       {borrowedExpr},
       {returnedExpr},
       {lateExpr}
FROM StudentStats;");

            await ExecuteNonQueryAsync(connection, "DROP TABLE StudentStats;");
            await ExecuteNonQueryAsync(connection, "ALTER TABLE StudentStats_New RENAME TO StudentStats;");
        }

        await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_StudentStats_Name_Surname ON StudentStats(Name, Surname);");
    }

    private static async Task MigrateUsersTableAsync(DbConnection connection)
    {
        // Id kolonu var mı kontrol et
        using var checkIdCmd = connection.CreateCommand();
        checkIdCmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('Users') WHERE name='Id';";
        var hasId = Convert.ToInt32(await checkIdCmd.ExecuteScalarAsync()) > 0;

        if (!hasId)
        {
            // Yeni tablo oluştur
            await ExecuteNonQueryAsync(connection, @"
CREATE TABLE IF NOT EXISTS Users_New (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Username TEXT,
    Password TEXT,
    Role TEXT NOT NULL,
    Name TEXT NOT NULL,
    Surname TEXT NOT NULL,
    Class INTEGER,
    Branch TEXT,
    StudentNumber INTEGER UNIQUE,
    PenaltyPoints INTEGER NOT NULL DEFAULT 0,
    Position TEXT
);");

            // Mevcut verileri kopyala
            await ExecuteNonQueryAsync(connection, @"
INSERT INTO Users_New (Username, Password, Role, Name, Surname, Class, Branch, StudentNumber, PenaltyPoints, Position)
SELECT Username, Password, Role, COALESCE(Name, ''), COALESCE(Surname, ''), Class, Branch, StudentNumber, PenaltyPoints, Position
FROM Users;");

            // Eski tabloyu sil ve yenisini yeniden adlandır
            await ExecuteNonQueryAsync(connection, "DROP TABLE Users;");
            await ExecuteNonQueryAsync(connection, "ALTER TABLE Users_New RENAME TO Users;");

            // Index'leri oluştur
            await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Users_Username ON Users(Username);");
            await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Users_StudentNumber ON Users(StudentNumber);");
            await ExecuteNonQueryAsync(connection, "CREATE INDEX IF NOT EXISTS IX_Users_Role ON Users(Role);");
        }
        else
        {
            // Id zaten var, sadece eksik kolonları ekle
            await EnsureColumnAsync(connection, "Users", "Surname", "TEXT", "UPDATE Users SET Surname = '' WHERE Surname IS NULL;");
            
            // Name ve Surname'ı NOT NULL yap (SQLite'da direkt ALTER COLUMN yok, bu yüzden sadece kontrol ediyoruz)
            // Mevcut verileri güncelle
            await ExecuteNonQueryAsync(connection, "UPDATE Users SET Name = COALESCE(Name, '') WHERE Name IS NULL;");
            await ExecuteNonQueryAsync(connection, "UPDATE Users SET Surname = COALESCE(Surname, '') WHERE Surname IS NULL;");
        }
    }

    private static async Task ExecuteNonQueryAsync(DbConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
}
