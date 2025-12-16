using System;
using Kutuphane.Infrastructure.External.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Kutuphane.Infrastructure.External;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddExternalDataServices(this IServiceCollection services)
    {
        // Google Books API servisi
        services.AddHttpClient<GoogleBooksService>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        return services;
    }
}

