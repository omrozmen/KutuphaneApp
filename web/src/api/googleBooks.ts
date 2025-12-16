import { httpClient } from "./client";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5208/api";

export type GoogleBook = {
  title: string;
  author: string;
  category: string;
  publisher: string;
  summary: string;
  year: number;
  pageCount: number;
  isbn: string;
};

export type BookToAdd = {
  title: string;
  author: string;
  category: string;
  quantity: number;
  shelf: string;
  publisher: string;
  summary: string;
  year?: number;
  pageCount?: number;
  bookNumber?: number;
};

export type AddToCsvResponse = {
  addedToCsv: number;
  importedToSystem: number;
};

export async function searchGoogleBooks(query: string, maxResults: number = 40): Promise<GoogleBook[]> {
  const url = `${API_BASE}/google-books/search?query=${encodeURIComponent(query)}&maxResults=${maxResults}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Arama başarısız (${response.status})`;

      if (response.status === 404) {
        errorMessage = `Endpoint bulunamadı (404). Lütfen backend'in çalıştığından emin olun. URL: ${url}`;
      } else {
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (error instanceof Error) {
      // Network hatası veya CORS hatası
      if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
        throw new Error(`Backend'e bağlanılamıyor. Lütfen backend'in çalıştığından emin olun. (${API_BASE})`);
      }
      throw error;
    }
    throw new Error("Arama sırasında beklenmeyen bir hata oluştu");
  }
}

export async function addBooksToCsv(books: BookToAdd[], personelName?: string): Promise<AddToCsvResponse> {
  return httpClient.post<AddToCsvResponse>("/google-books/add-to-csv", {
    books,
    personelName: personelName?.trim(),
  });
}

