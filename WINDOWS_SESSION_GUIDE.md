# Windows Masaüstü Uygulaması için Session Yönetimi

Bu dokümantasyon, Windows masaüstü uygulaması için session yönetiminin nasıl uygulanacağını açıklar.

## Mevcut Yapı

Backend API'de session yönetimi için aşağıdaki endpoint'ler mevcuttur:

### 1. Login Endpoint
```
POST /api/auth/login
Body: { "username": "string", "password": "string" }
Response: { "username": "string", "role": "string" }
```

Login başarılı olduğunda, backend bir cookie (`kutuphane_session`) oluşturur. Bu cookie 30 gün geçerlidir.

### 2. Verify Session Endpoint
```
GET /api/auth/verify
Response: { "username": "string", "role": "string" }
```

Bu endpoint, mevcut session'ın geçerli olup olmadığını kontrol eder.

### 3. Logout Endpoint
```
POST /api/auth/logout
Response: { "message": "Çıkış yapıldı" }
```

Bu endpoint, session cookie'sini siler.

## Windows Uygulaması İçin Öneriler

### 1. Local Storage Kullanımı

Windows uygulamasında, kullanıcı bilgisini saklamak için:

**C# (WPF/WinUI) için:**
```csharp
// Kullanıcı bilgisini kaydet
var userJson = JsonSerializer.Serialize(user);
ApplicationData.Current.LocalSettings.Values["kutuphane_user"] = userJson;

// Kullanıcı bilgisini yükle
if (ApplicationData.Current.LocalSettings.Values.ContainsKey("kutuphane_user"))
{
    var userJson = ApplicationData.Current.LocalSettings.Values["kutuphane_user"].ToString();
    var user = JsonSerializer.Deserialize<User>(userJson);
}
```

**VB.NET için:**
```vb
' Kullanıcı bilgisini kaydet
Dim userJson As String = JsonSerializer.Serialize(user)
ApplicationData.Current.LocalSettings.Values("kutuphane_user") = userJson

' Kullanıcı bilgisini yükle
If ApplicationData.Current.LocalSettings.Values.ContainsKey("kutuphane_user") Then
    Dim userJson As String = ApplicationData.Current.LocalSettings.Values("kutuphane_user").ToString()
    Dim user = JsonSerializer.Deserialize(Of User)(userJson)
End If
```

### 2. HTTP Client Yapılandırması

Windows uygulamasında HTTP istekleri yaparken, cookie'leri otomatik olarak yönetmek için:

**C# için:**
```csharp
var handler = new HttpClientHandler
{
    UseCookies = true,
    CookieContainer = new CookieContainer()
};

var httpClient = new HttpClient(handler)
{
    BaseAddress = new Uri("http://localhost:5208/api")
};

// Login sonrası cookie'ler otomatik olarak saklanır
// Sonraki isteklerde cookie'ler otomatik olarak gönderilir
```

### 3. Session Doğrulama

Uygulama başlatıldığında veya sayfa yenilendiğinde:

```csharp
private async Task<bool> VerifySessionAsync()
{
    try
    {
        var response = await httpClient.GetAsync("/auth/verify");
        if (response.IsSuccessStatusCode)
        {
            var userJson = await response.Content.ReadAsStringAsync();
            var user = JsonSerializer.Deserialize<User>(userJson);
            
            // Local storage'ı güncelle
            ApplicationData.Current.LocalSettings.Values["kutuphane_user"] = userJson;
            return true;
        }
    }
    catch
    {
        // Session geçersiz
        ApplicationData.Current.LocalSettings.Values.Remove("kutuphane_user");
    }
    return false;
}
```

### 4. Logout İşlemi

```csharp
private async Task LogoutAsync()
{
    try
    {
        await httpClient.PostAsync("/auth/logout", null);
    }
    catch
    {
        // Hata olsa bile devam et
    }
    
    // Local storage'ı temizle
    ApplicationData.Current.LocalSettings.Values.Remove("kutuphane_user");
    
    // Kullanıcıyı login ekranına yönlendir
    NavigateToLogin();
}
```

## Önemli Notlar

1. **Cookie Yönetimi**: Windows uygulamasında HTTP client, cookie'leri otomatik olarak yönetir. Ekstra bir işlem yapmanıza gerek yoktur.

2. **Local Storage**: Kullanıcı bilgisini local storage'da saklayın, böylece uygulama kapatılıp açıldığında otomatik olarak giriş yapılmış olur.

3. **Session Doğrulama**: Uygulama başlatıldığında veya belirli aralıklarla session'ı doğrulayın.

4. **Güvenlik**: Production ortamında, HTTPS kullanın ve cookie'lerin `Secure` flag'ini `true` yapın.

## Örnek Kullanım

```csharp
public class AuthService
{
    private readonly HttpClient _httpClient;
    
    public AuthService()
    {
        var handler = new HttpClientHandler
        {
            UseCookies = true,
            CookieContainer = new CookieContainer()
        };
        
        _httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://localhost:5208/api")
        };
    }
    
    public async Task<User> LoginAsync(string username, string password)
    {
        var request = new { username, password };
        var json = JsonSerializer.Serialize(request);
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        
        var response = await _httpClient.PostAsync("/auth/login", content);
        response.EnsureSuccessStatusCode();
        
        var userJson = await response.Content.ReadAsStringAsync();
        var user = JsonSerializer.Deserialize<User>(userJson);
        
        // Local storage'a kaydet
        ApplicationData.Current.LocalSettings.Values["kutuphane_user"] = userJson;
        
        return user;
    }
    
    public async Task<bool> VerifySessionAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync("/auth/verify");
            if (response.IsSuccessStatusCode)
            {
                var userJson = await response.Content.ReadAsStringAsync();
                ApplicationData.Current.LocalSettings.Values["kutuphane_user"] = userJson;
                return true;
            }
        }
        catch
        {
            ApplicationData.Current.LocalSettings.Values.Remove("kutuphane_user");
        }
        return false;
    }
    
    public async Task LogoutAsync()
    {
        try
        {
            await _httpClient.PostAsync("/auth/logout", null);
        }
        catch { }
        
        ApplicationData.Current.LocalSettings.Values.Remove("kutuphane_user");
    }
}
```



