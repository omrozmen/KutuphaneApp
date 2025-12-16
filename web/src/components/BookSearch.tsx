import { useState } from "react";
import { createPortal } from "react-dom";
import { searchGoogleBooks, addBooksToCsv } from "../api/googleBooks";

type GoogleBook = {
  title: string;
  author: string;
  category: string;
  publisher: string;
  summary: string;
  year: number;
  pageCount: number;
  isbn: string;
};

type Props = {
  onRefresh: () => void;
  personelName: string;
};

const BookSearch = ({ onRefresh, personelName }: Props) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"title" | "author" | "category">("title");
  const [books, setBooks] = useState<GoogleBook[]>([]);
  const [selectedBooks, setSelectedBooks] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMinYear, setFilterMinYear] = useState("");
  const [filterMaxYear, setFilterMaxYear] = useState("");
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [booksToAdd, setBooksToAdd] = useState<Array<{ book: GoogleBook; quantity: number }>>([]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setMessage({ type: "error", text: "Lütfen arama sorgusu girin" });
      return;
    }

    setLoading(true);
    setMessage(null);
    setBooks([]);
    setSelectedBooks(new Set());

    try {
      let query = "";
      if (searchType === "title") {
        query = `intitle:"${searchQuery}"`;
      } else if (searchType === "author") {
        query = `inauthor:"${searchQuery}"`;
      } else if (searchType === "category") {
        query = `subject:"${searchQuery}"`;
      }

      const results = await searchGoogleBooks(query);
      setBooks(results);

      if (results.length === 0) {
        setMessage({ type: "error", text: "Kitap bulunamadı. Lütfen farklı bir arama terimi deneyin." });
      } else {
        setMessage({ type: "success", text: `${results.length} kitap bulundu` });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Arama sırasında hata oluştu";
      setMessage({ type: "error", text: errorMessage });
      console.error("Arama hatası:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleBookSelection = (index: number) => {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedBooks(newSelected);
  };

  const selectAll = () => {
    const filtered = getFilteredBooks();
    setSelectedBooks(new Set(filtered.map((_, idx) => idx)));
  };

  const deselectAll = () => {
    setSelectedBooks(new Set());
  };

  const getFilteredBooks = (): GoogleBook[] => {
    let filtered = books;

    if (filterCategory) {
      filtered = filtered.filter((b) => b.category.toLowerCase() === filterCategory.toLowerCase());
    }

    if (filterMinYear) {
      const minYear = parseInt(filterMinYear);
      if (!isNaN(minYear)) {
        filtered = filtered.filter((b) => b.year >= minYear);
      }
    }

    if (filterMaxYear) {
      const maxYear = parseInt(filterMaxYear);
      if (!isNaN(maxYear)) {
        filtered = filtered.filter((b) => b.year <= maxYear);
      }
    }

    return filtered;
  };

  const handleAddToCsv = () => {
    const filtered = getFilteredBooks();
    const toAdd = Array.from(selectedBooks)
      .map((idx) => filtered[idx])
      .filter(Boolean);

    if (toAdd.length === 0) {
      setMessage({ type: "error", text: "Lütfen en az bir kitap seçin" });
      return;
    }

    // Modal'ı aç ve kitapları quantity ile birlikte hazırla
    const booksWithQuantity = toAdd.map((book) => ({
      book,
      quantity: 1, // Default quantity
    }));
    setBooksToAdd(booksWithQuantity);
    setShowQuantityModal(true);
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    if (quantity < 1) quantity = 1;
    if (quantity > 100) quantity = 100; // Max limit
    const updated = [...booksToAdd];
    updated[index].quantity = quantity;
    setBooksToAdd(updated);
  };

  const handleConfirmAdd = async () => {
    if (booksToAdd.length === 0) {
      setMessage({ type: "error", text: "Eklenecek kitap yok" });
      return;
    }

    setLoading(true);
    setMessage(null);
    setShowQuantityModal(false);

    try {
      const booksToSend = booksToAdd.map((item) => ({
        title: item.book.title,
        author: item.book.author,
        category: item.book.category,
        quantity: item.quantity,
        shelf: "",
        publisher: item.book.publisher,
        summary: item.book.summary,
        year: item.book.year > 0 ? item.book.year : undefined,
        pageCount: item.book.pageCount > 0 ? item.book.pageCount : undefined,
        bookNumber: undefined, // Google Books'ta bookNumber yok, undefined gönder
      }));

      const result = await addBooksToCsv(booksToSend, personelName);
      setMessage({
        type: "success",
        text: `${result.addedToCsv} kitap CSV'ye eklendi, ${result.importedToSystem} kitap sisteme aktarıldı`,
      });
      setSelectedBooks(new Set());
      setBooksToAdd([]);
      onRefresh();
    } catch (error) {
      setMessage({ type: "error", text: "Kitap ekleme sırasında hata oluştu" });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAdd = () => {
    setShowQuantityModal(false);
    setBooksToAdd([]);
  };

  const filteredBooks = getFilteredBooks();

  return (
    <div className="card">
      <h2 style={{ marginBottom: "24px", color: "#0f172a", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
        </svg>
        Google Books ile Kitap Ekle
      </h2>

      {/* Arama Formu */}
      <div style={{ marginBottom: "24px", padding: "20px", background: "rgba(255, 255, 255, 0.6)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.3)" }}>
        <div style={{ display: "flex", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, color: "#1e293b" }}>Arama Türü</label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as "title" | "author" | "category")}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
              }}
            >
              <option value="title">Kitap Başlığı</option>
              <option value="author">Yazar Adı</option>
              <option value="category">Kategori</option>
            </select>
          </div>
          <div style={{ flex: 2, minWidth: "250px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, color: "#1e293b" }}>Arama Sorgusu</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              placeholder={searchType === "title" ? "Örn: Kara Kitap" : searchType === "author" ? "Örn: Orhan Pamuk" : "Örn: Roman, Tarih, Bilim Kurgu"}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={handleSearch}
              disabled={loading}
              style={{
                padding: "8px 24px",
                backgroundColor: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 600,
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Aranıyor..." : "🔍 Ara"}
            </button>
          </div>
        </div>
      </div>

      {/* Filtreler */}
      {books.length > 0 && (
        <div style={{ marginBottom: "24px", padding: "16px", background: "rgba(255, 255, 255, 0.6)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.3)" }}>
          <div style={{ fontWeight: 600, marginBottom: "12px", color: "#1e293b" }}>Filtreler</div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>Kategori</label>
              <input
                type="text"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                placeholder="Roman, Tarih, vb."
                style={{
                  padding: "6px",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  width: "150px",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>Min Yıl</label>
              <input
                type="number"
                value={filterMinYear}
                onChange={(e) => setFilterMinYear(e.target.value)}
                placeholder="1950"
                style={{
                  padding: "6px",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  width: "100px",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>Max Yıl</label>
              <input
                type="number"
                value={filterMaxYear}
                onChange={(e) => setFilterMaxYear(e.target.value)}
                placeholder="2024"
                style={{
                  padding: "6px",
                  borderRadius: "4px",
                  border: "1px solid #d1d5db",
                  width: "100px",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mesaj */}
      {message && (
        <div
          style={{
            padding: "16px",
            borderRadius: "12px",
            marginBottom: "16px",
            background: message.type === "success"
              ? "linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(5, 150, 105, 0.9) 100%)"
              : "linear-gradient(135deg, rgba(239, 68, 68, 0.9) 0%, rgba(220, 38, 38, 0.9) 100%)",
            backdropFilter: "blur(10px)",
            border: `2px solid ${message.type === "success" ? "rgba(16, 185, 129, 0.5)" : "rgba(239, 68, 68, 0.5)"}`,
            color: "#ffffff",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Quantity Modal - Gri arka plan ile modal */}
      {showQuantityModal && createPortal(
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCancelAdd}
        >
          <div
            className="card"
            style={{
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, color: "#1e293b", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Kitap Adetlerini Düzenle
              </h2>
              <button
                onClick={handleCancelAdd}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#64748b",
                  padding: 0,
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
            <p style={{ color: "#1e293b", marginBottom: "20px", fontSize: "14px", fontWeight: 500 }}>
              Her kitap için adet belirleyin (varsayılan: 1)
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              {booksToAdd.map((item, index) => (
                <div
                  key={index}
                  style={{
                    padding: "16px",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    borderRadius: "12px",
                    background: "rgba(255, 255, 255, 0.5)",
                    backdropFilter: "blur(10px)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: "4px", color: "#1e293b" }}>
                      {item.book.title}
                    </div>
                    <div style={{ fontSize: "14px", color: "#475569", fontWeight: 500 }}>
                      {item.book.author} • {item.book.category}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>
                      Adet:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        handleQuantityChange(index, val);
                      }}
                      style={{
                        width: "80px",
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        textAlign: "center",
                        fontSize: "16px",
                        fontWeight: 600,
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <button
                        onClick={() => handleQuantityChange(index, item.quantity + 1)}
                        style={{
                          width: "24px",
                          height: "24px",
                          padding: 0,
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          backgroundColor: "#f9fafb",
                          cursor: "pointer",
                          fontSize: "14px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        +
                      </button>
                      <button
                        onClick={() => handleQuantityChange(index, Math.max(1, item.quantity - 1))}
                        style={{
                          width: "24px",
                          height: "24px",
                          padding: 0,
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          backgroundColor: "#f9fafb",
                          cursor: "pointer",
                          fontSize: "14px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        −
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={handleCancelAdd}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                İptal
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  backgroundColor: loading ? "#9ca3af" : "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {loading ? "Ekleniyor..." : `Ekle (${booksToAdd.reduce((sum, item) => sum + item.quantity, 0)} adet)`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Kitap Listesi */}
      {filteredBooks.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <strong>{filteredBooks.length}</strong> kitap bulundu ({selectedBooks.size} seçili)
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={selectAll}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Tümünü Seç
              </button>
              <button
                onClick={deselectAll}
                disabled={books.length === 0 || selectedBooks.size === 0}
                style={{
                  padding: "6px 12px",
                  backgroundColor: books.length === 0 || selectedBooks.size === 0 ? "#9ca3af" : "#6b7280",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: books.length > 0 && selectedBooks.size > 0 ? "pointer" : "not-allowed",
                  fontSize: "14px",
                }}
              >
                Seçimi Temizle
              </button>
              <button
                onClick={handleAddToCsv}
                disabled={loading || selectedBooks.size === 0}
                style={{
                  padding: "6px 16px",
                  backgroundColor: selectedBooks.size > 0 ? "#2563eb" : "#9ca3af",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: selectedBooks.size > 0 ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                {loading ? "Ekleniyor..." : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px" }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    CSV'ye Ekle ({selectedBooks.size})
                  </>
                )}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {filteredBooks.map((book, index) => {
              const isSelected = selectedBooks.has(index);
              return (
                <div
                  key={index}
                  onClick={() => toggleBookSelection(index)}
                  style={{
                    padding: "16px",
                    border: `2px solid ${isSelected ? "#2563eb" : "#e5e7eb"}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    backgroundColor: isSelected ? "#eff6ff" : "white",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "#93c5fd";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                    }
                  }}
                >
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleBookSelection(index)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ marginTop: "4px" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <h3 style={{ margin: 0, fontSize: "18px", color: "#1f2937" }}>{book.title}</h3>
                        {isSelected && <span style={{ color: "#2563eb", fontWeight: 600 }}>✓ Seçildi</span>}
                      </div>
                      <div style={{ color: "#6b7280", marginBottom: "8px" }}>
                        <strong>Yazar:</strong> {book.author} • <strong>Kategori:</strong> {book.category}
                      </div>
                      {book.year > 0 && (
                        <div style={{ color: "#6b7280", marginBottom: "8px" }}>
                          <strong>Yıl:</strong> {book.year} {book.pageCount > 0 && `• Sayfa: ${book.pageCount}`}
                        </div>
                      )}
                      <div style={{ color: "#6b7280", marginBottom: "8px" }}>
                        <strong>Yayınevi:</strong> {book.publisher}
                      </div>
                      {book.summary && (
                        <div style={{ color: "#4b5563", fontSize: "14px", marginTop: "8px" }}>
                          {book.summary.length > 200 ? book.summary.substring(0, 200) + "..." : book.summary}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {books.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
          Arama yapmak için yukarıdaki formu kullanın
        </div>
      )}
    </div>
  );
};

export default BookSearch;

