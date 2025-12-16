const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5208/api";

type RequestOptions = RequestInit & { query?: Record<string, string | number | undefined> };

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
  if (path.startsWith("http")) {
    const url = new URL(path);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }
        url.searchParams.append(key, String(value));
      });
    }
    return url.toString();
  }
  
  // BASE_URL zaten /api içeriyor (http://localhost:5208/api)
  // Path'te /api/ varsa kaldır (çift prefix'i önlemek için)
  let cleanPath = path;
  if (cleanPath.startsWith("/api/")) {
    cleanPath = cleanPath.substring(5); // "/api/" kısmını kaldır
  } else if (cleanPath.startsWith("/api")) {
    cleanPath = cleanPath.substring(4); // "/api" kısmını kaldır
  }
  
  // Path'in başında / olmalı
  if (!cleanPath.startsWith("/")) {
    cleanPath = `/${cleanPath}`;
  }
  
  // BASE_URL'in sonunda / olmamalı, path'in başında / olmalı
  const baseUrl = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  const fullPath = `${baseUrl}${cleanPath}`;
  const url = new URL(fullPath);
  
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      url.searchParams.append(key, String(value));
    });
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);
  // Debug için URL'yi logla
  if (path.includes("database/info") || path.includes("admin")) {
    console.log(`[httpClient] Requesting: ${path} -> ${url}`);
  }
  const headers = new Headers(options.headers);
  
  // FormData ise Content-Type'ı ayarlama (browser otomatik ayarlar)
  if (!(options.body instanceof FormData) && !headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  
  const response = await fetch(url, {
    credentials: options.credentials ?? "include", // cookie tabanlı oturum için her istekte gönder
    ...options,
    headers
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const text = await response.text();
      if (text) {
        try {
          const json = JSON.parse(text);
          message = json.message || json.error || text;
        } catch {
          message = text;
        }
      }
    } catch {
      // Fallback to statusText
    }
    throw new Error(message || response.statusText);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const httpClient = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>) =>
    request<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { 
      ...options, 
      method: "POST", 
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined)
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined })
};
