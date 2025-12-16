import { FormEvent, useEffect, useMemo, useState } from "react";
import { Book } from "../api/types";
import { ConditionCounts, normalizeConditionCounts, tryAdjustConditionCounts } from "../utils/bookCondition";

type Props = {
  book?: Book | null;
  onSave: (data: {
    title: string;
    author: string;
    category: string;
    quantity: number;
    healthyCount: number;
    damagedCount: number;
    lostCount: number;
    id?: string;
    shelf?: string;
    publisher?: string;
    summary?: string;
    year?: number;
    pageCount?: number;
    bookNumber?: number;
  }) => Promise<void>;
  onClose: () => void;
};

const BookFormModal = ({ book, onSave, onClose }: Props) => {
  const [title, setTitle] = useState(book?.title || "");
  const [author, setAuthor] = useState(book?.author || "");
  const [category, setCategory] = useState(book?.category || "Roman");
  const [quantity, setQuantity] = useState(book?.totalQuantity || 1);
  const initialCounts = useMemo<ConditionCounts>(() => {
    const total = book?.totalQuantity ?? 1;
    const defaults: ConditionCounts = {
      healthy: book?.healthyCount ?? Math.max(total - (book?.damagedCount ?? 0) - (book?.lostCount ?? 0), 0),
      damaged: book?.damagedCount ?? 0,
      lost: book?.lostCount ?? 0,
    };
    return normalizeConditionCounts(total, defaults);
  }, [book]);
  const [conditionCounts, setConditionCounts] = useState<ConditionCounts>(initialCounts);
  const [shelf, setShelf] = useState(book?.shelf || "");
  const [publisher, setPublisher] = useState(book?.publisher || "");
  const [summary, setSummary] = useState(book?.summary || "");
  const [year, setYear] = useState(book?.year?.toString() || "");
  const [pageCount, setPageCount] = useState(book?.pageCount?.toString() || "");
  const [bookNumber, setBookNumber] = useState(book?.bookNumber?.toString() || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = ["Roman", "Tarih", "Deneme", "Psikoloji", "Fantastik", "Bilim Kurgu", "Macera", "Biyografi"];

  useEffect(() => {
    setTitle(book?.title || "");
    setAuthor(book?.author || "");
    setCategory(book?.category || "Roman");
    const total = book?.totalQuantity ?? 1;
    setQuantity(total);
    setConditionCounts(normalizeConditionCounts(total, {
      healthy: book?.healthyCount ?? Math.max(total - (book?.damagedCount ?? 0) - (book?.lostCount ?? 0), 0),
      damaged: book?.damagedCount ?? 0,
      lost: book?.lostCount ?? 0,
    }));
  }, [book]);

  const healthyCount = conditionCounts.healthy;
  const damagedCount = conditionCounts.damaged;
  const lostCount = conditionCounts.lost;
  const totalCondition = healthyCount + damagedCount + lostCount;

  const handleQuantityChange = (value: number) => {
    const sanitized = Math.max(1, value);
    const minAllowed = damagedCount + lostCount || 0;
    const nextQuantity = Math.max(sanitized, minAllowed);
    setQuantity(nextQuantity);
    setConditionCounts((prev) => normalizeConditionCounts(nextQuantity, prev));
  };

  const handleConditionAdjust = (type: "healthy" | "damaged" | "lost", delta: 1 | -1) => {
    setConditionCounts((prev) => {
      const result = tryAdjustConditionCounts(quantity, prev, type, delta);
      return result.changed ? result.counts : prev;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !author.trim()) {
      setError("Başlık ve yazar alanları zorunludur");
      return;
    }

    setLoading(true);
    try {
      await onSave({
        title: title.trim(),
        author: author.trim(),
        category,
        quantity,
        healthyCount,
        damagedCount,
        lostCount,
        id: book?.id, // Düzenleme için ID gönder
        shelf: shelf.trim() || "", // Boş string gönder, undefined değil
        publisher: publisher.trim() || "", // Boş string gönder, undefined değil
        summary: summary.trim() || "", // Boş string gönder, undefined değil
        year: year ? parseInt(year) : undefined,
        pageCount: pageCount ? parseInt(pageCount) : undefined,
        bookNumber: bookNumber ? parseInt(bookNumber) : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız oldu");
    } finally {
      setLoading(false);
    }
  };

  return (
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
        zIndex: 10001,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: "900px",
          width: "90%",
          maxHeight: "90vh",
          position: "relative",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            color: "#64748b",
          }}
        >
          ×
        </button>
        <h2 style={{ marginTop: 0 }}>{book ? "Kitap Düzenle" : "Yeni Kitap Ekle"}</h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", maxHeight: "70vh", overflowY: "auto", paddingRight: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Kitap Başlığı <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                placeholder="Kitap başlığını girin"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Yazar <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                placeholder="Yazar adını girin"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Kategori
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Adet
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                min="1"
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
              />
            </div>

            <div style={{ gridColumn: "1 / -1", backgroundColor: "#f1f5f9", borderRadius: "8px", padding: "12px", border: "1px solid #e2e8f0" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                Kitap Durumu Dağılımı
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                <div>
                  <span style={{ display: "block", color: "#0f172a", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Sağlam</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleConditionAdjust("healthy", -1)}
                      disabled={healthyCount <= 0}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: "1px solid #cbd5f5",
                        background: healthyCount > 0 ? "#ffffff" : "#e2e8f0",
                        cursor: healthyCount > 0 ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        fontSize: "18px",
                        fontWeight: 600,
                      }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: "40px", textAlign: "center", fontWeight: 600 }}>{healthyCount}</span>
                    <button
                      type="button"
                      onClick={() => handleConditionAdjust("healthy", 1)}
                      disabled={totalCondition >= quantity && damagedCount === 0 && lostCount === 0}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: "1px solid #cbd5f5",
                        background: totalCondition < quantity || damagedCount > 0 || lostCount > 0 ? "#ffffff" : "#e2e8f0",
                        cursor: totalCondition < quantity || damagedCount > 0 || lostCount > 0 ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        fontSize: "18px",
                        fontWeight: 600,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <span style={{ display: "block", color: "#b45309", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Hasarlı</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleConditionAdjust("damaged", -1)}
                      disabled={damagedCount <= 0}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: "1px solid #fcd34d",
                        background: damagedCount > 0 ? "#ffffff" : "#fefce8",
                        cursor: damagedCount > 0 ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        fontSize: "18px",
                        fontWeight: 600,
                      }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: "40px", textAlign: "center", fontWeight: 600 }}>{damagedCount}</span>
                    <button
                      type="button"
                      onClick={() => handleConditionAdjust("damaged", 1)}
                      disabled={healthyCount <= 0}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: "1px solid #fcd34d",
                        background: healthyCount > 0 ? "#ffffff" : "#fefce8",
                        cursor: healthyCount > 0 ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        fontSize: "18px",
                        fontWeight: 600,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <span style={{ display: "block", color: "#dc2626", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Kayıp</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleConditionAdjust("lost", -1)}
                      disabled={lostCount <= 0}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: "1px solid #fecaca",
                        background: lostCount > 0 ? "#ffffff" : "#fef2f2",
                        cursor: lostCount > 0 ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        fontSize: "18px",
                        fontWeight: 600,
                      }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: "40px", textAlign: "center", fontWeight: 600 }}>{lostCount}</span>
                    <button
                      type="button"
                      onClick={() => handleConditionAdjust("lost", 1)}
                      disabled={healthyCount <= 0}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: "1px solid #fecaca",
                        background: healthyCount > 0 ? "#ffffff" : "#fef2f2",
                        cursor: healthyCount > 0 ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        fontSize: "18px",
                        fontWeight: 600,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#475569" }}>
                Toplam: <strong>{totalCondition}</strong> / {quantity}
              </p>
              <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
                Hasarlı veya kayıp sayısı artarken sağlam kitap sayısı otomatik düşer.
              </p>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Raf Numarası
              </label>
              <input
                type="text"
                value={shelf}
                onChange={(e) => setShelf(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                placeholder="Örn: Raf-ROM-A01-01"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Yayınevi
              </label>
              <input
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                placeholder="Yayınevi adını girin"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Yayın Yılı
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                placeholder="Örn: 2020"
                min="1800"
                max="2024"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Sayfa Sayısı
              </label>
              <input
                type="number"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                placeholder="Örn: 350"
                min="1"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                Kitap Numarası
              </label>
              <input
                type="number"
                value={bookNumber}
                onChange={(e) => setBookNumber(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "14px" }}
                placeholder="Örn: 1234"
                min="1"
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
              Özet
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Kitap özetini girin (opsiyonel)"
              rows={4}
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical", fontSize: "14px" }}
            />
          </div>

          {error && <p style={{ color: "#ef4444", margin: 0 }}>{error}</p>}

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "10px 20px" }}>
              İptal
            </button>
            <button type="submit" className="primary" disabled={loading} style={{ padding: "10px 20px" }}>
              {loading ? "Kaydediliyor..." : book ? "Güncelle" : "Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookFormModal;

