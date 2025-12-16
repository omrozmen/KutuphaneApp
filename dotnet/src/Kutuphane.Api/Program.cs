using Kutuphane.Core.Application.Auth;
using Kutuphane.Core.Application.BookCatalog;
using Kutuphane.Core.Application.Statistics;
using Kutuphane.Core.Application.Sync;
using Kutuphane.Infrastructure.Database;
using Kutuphane.Infrastructure.External;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;

// EPPlus lisans ayarı (non-commercial kullanım için)
ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://localhost:5208");

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.MaxDepth = 32;
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Database configuration - SQLite only
var dbPath = builder.Configuration.GetValue<string>("Database:Path");
if (string.IsNullOrWhiteSpace(dbPath))
{
    // Default path: %LocalAppData%/KutuphaneApp/kutuphane.db
    var appDataPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KutuphaneApp"
    );
    Directory.CreateDirectory(appDataPath);
    dbPath = Path.Combine(appDataPath, "kutuphane.db");
}

builder.Services.AddDatabaseInfrastructure(options =>
{
    options.DatabasePath = dbPath;
});

builder.Services.AddScoped<BookCatalogService>();
builder.Services.AddScoped<AuthenticationService>();
builder.Services.AddScoped<StatisticsService>();
builder.Services.AddScoped<ExcelSyncService>();
builder.Services.AddScoped<Kutuphane.Core.Application.Admin.AdminService>();

// External data services (Google Books API, Excel, vb.)
builder.Services.AddExternalDataServices();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ??
                     new[] { "http://localhost:5173" };
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

// Ensure database is created and seeded
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<KutuphaneDbContext>();
    var seeder = new DatabaseSeeder(context);
    await seeder.SeedAsync();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Kutuphane API v1");
    });
}

app.UseCors();
app.UseAuthorization();
app.MapControllers();
app.Run();
