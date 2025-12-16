import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Book, LoanInfo } from "../api/types";
import BookDetailModal from "./BookDetailModal";
import BookFormModal from "./BookFormModal";
import { searchIncludes } from "../utils/searchUtils";
import ConfirmCard from "./ConfirmCard";
import InfoCard from "./InfoCard";
import { httpClient } from "../api/client";

type Props = {
  books: Book[];
  students?: any[];
  loans?: LoanInfo[]; // Silinmiş kitapları filtrelemek için
  personelName?: string;
  onRefresh: () => void;
  onSearch: (keyword: string) => void;
  onAdd?: (data: { title: string; author: string; category: string; quantity: number; id?: string }) => Promise<void>;
  onDelete?: (
    id: string,
    options?: { silent?: boolean; skipConfirm?: boolean; deferRefresh?: boolean; suppressErrorInfo?: boolean }
  ) => Promise<void>;
  onBulkDeleteSuccess?: (deletedCount: number, totalLoanCount: number) => void;
  canEdit?: boolean;
  resetSearch?: boolean; // Sekme değiştiğinde aramayı sıfırlamak için
  filterVariant?: "full" | "compact" | "search-only";
};

type SortOption = "title-asc" | "title-desc" | "author-asc" | "author-desc" | "year-asc" | "year-desc" | "quantity-asc" | "quantity-desc" | "none";

const BookList = ({ books, students = [], loans = [], personelName = "", onRefresh, onSearch, onAdd, onDelete, onBulkDeleteSuccess, canEdit = false, resetSearch = false, filterVariant = "full" }: Props) => {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedAuthor, setSelectedAuthor] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>("");
  const [quantityFilter, setQuantityFilter] = useState<string>("");
  const [conditionFilter, setConditionFilter] = useState<string>(""); // Kitap durum filtresi
  const [pageCountFilter, setPageCountFilter] = useState<string>(""); // Sayfa sayısı filtresi
  const [shelfFilter, setShelfFilter] = useState<string>(""); // Raf numarası filtresi
  const [publisherFilter, setPublisherFilter] = useState<string>(""); // Yayınevi filtresi
  const [missingDataFilters, setMissingDataFilters] = useState<{
    shelf: boolean;
    publisher: boolean;
    pageCount: boolean;
    year: boolean;
    bookNumber: boolean;
    summary: boolean;
  }>({
    shelf: false,
    publisher: false,
    pageCount: false,
    year: false,
    bookNumber: false,
    summary: false,
  });
  const [showMissingDataCard, setShowMissingDataCard] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // Filtreleme bölümünü göster/gizle
  const [sortOption, setSortOption] = useState<SortOption>("title-asc"); // alfabetik varsayılan
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [returningBookId, setReturningBookId] = useState<string | null>(null);
  const [returningBorrower, setReturningBorrower] = useState<string | null>(null);
  const [returnLoading, setReturnLoading] = useState(false);
  const [columnSort, setColumnSort] = useState<string | null>(null);
  const [columnSortDirection, setColumnSortDirection] = useState<"asc" | "desc">("asc");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<string | null>(null);
  const [bulkEditValues, setBulkEditValues] = useState<Map<string, string>>(new Map());
  const [pageInputValue, setPageInputValue] = useState<string>("");
  const [showCatalogInfo, setShowCatalogInfo] = useState(false);
  const [showBulkDeleteDetail, setShowBulkDeleteDetail] = useState(false);
  const [bulkDeleteData, setBulkDeleteData] = useState<{
    type: "books";
    items: Array<{ id: string; name: string; loans: LoanInfo[] }>;
    selectedItems: Set<string>;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [infoCardData, setInfoCardData] = useState<{ title: string; message: string; type: "info" | "success" | "warning" | "error"; icon?: string } | null>(null);
  const isSearchOnly = filterVariant === "search-only";
  const isCompact = filterVariant === "compact" || isSearchOnly;

  const executeBulkDeleteBooks = async (bookIdsToDelete: Set<string>, totalLoanCount: number = 0) => {
    let deletedCount = 0;
    const deletedBooks: string[] = [];
    const errors: string[] = [];
    const bookIdsArray = Array.from(bookIdsToDelete);

    for (const bookId of bookIdsArray) {
      try {
        if (onDelete) {
          await onDelete(bookId, { silent: true, skipConfirm: true, deferRefresh: true, suppressErrorInfo: true });
        }
        const book = books.find(b => b.id === bookId);
        if (book) {
          const totalQty =
            (book.totalQuantity ?? 0) > 0
              ? book.totalQuantity
              : (book.quantity ?? 0) + (Array.isArray(book.loans) ? book.loans.length : 0);
          deletedBooks.push(`${book.title} - ${book.author} (Toplam Adet: ${totalQty})`);
        }
        deletedCount++;
      } catch (error: any) {
        const message = error instanceof Error ? error.message : error?.response?.data?.message;
        const book = books.find(b => b.id === bookId);
        errors.push(book ? `${book.title} - ${book.author}: ${message || "Silinemedi"}` : `${bookId}: ${message || "Silinemedi"}`);
      }
    }

    // Tüm işlemler tamamlandıktan sonra tek bir bilgi penceresi göster
    if (errors.length > 0 && deletedCount === 0) {
      // Sadece hata varsa
      setInfoCardData({
        title: "Hata",
        message: errors.join('\n'),
        type: "error",
        icon: "❌"
      });
      setShowInfoCard(true);
    } else if (deletedCount > 0) {
      // Başarılı silme mesajı
      let message = "";
      if (deletedCount === 1) {
        message = `${deletedBooks[0]} silindi.`;
      } else {
        message = `${deletedCount} kitap silindi:\n${deletedBooks.map(b => `• ${b}`).join('\n')}`;
      }

      if (totalLoanCount > 0) {
        message += `\n\nToplam ${totalLoanCount} ödünçte kitap silindi.`;
      }

      if (errors.length > 0) {
        message += `\n\nHata alınan kitaplar:\n${errors.join('\n')}`;
      }

      setInfoCardData({
        title: "Başarılı",
        message: message,
        type: "success",
        icon: "✅"
      });
      setShowInfoCard(true);
      setSelectionMode(false);
      setSelectedBookIds(new Set());
      onRefresh();
    }
  };

  // Sekme değiştiğinde filtrelemeleri sıfırla
  useEffect(() => {
    if (resetSearch) {
      setSearchTerm("");
      setSelectedCategory("");
      setSelectedAuthor("");
      setYearFilter("");
      setQuantityFilter("");
      setConditionFilter("");
      setPageCountFilter("");
      setSortOption("none");
      setSelectionMode(false);
      setSelectedBookIds(new Set());
      // Backend'e istek gönderme - sadece local filtreleme kullan
      // onSearch("");
    }
  }, [resetSearch]);

  // Aynı ad ve yazara sahip kitapları birleştir (sadece ad ve yazar küçük harf karşılaştırması)
  const mergedBooks = useMemo(() => {
    const bookMap = new Map<string, Book>();

    // Normalize fonksiyonu: tüm metni küçük harfe çevir, boşlukları normalize et
    const normalize = (str: string | undefined | null): string => {
      if (!str) return '';
      return str.toLowerCase().trim().replace(/\s+/g, ' ');
    };

    books.forEach(book => {
      if (!book.title || !book.author) return; // Geçersiz kitapları atla

      // Sadece ad ve yazar küçük harfe çevrilerek karşılaştır
      const normalizedTitle = normalize(book.title);
      const normalizedAuthor = normalize(book.author);
      const key = `${normalizedTitle}_${normalizedAuthor}`;

      if (bookMap.has(key)) {
        const existing = bookMap.get(key)!;
        // Mevcut ödünçleri birleştir
        const mergedLoans = [...(existing.loans || []), ...(book.loans || [])];
        // Mevcut Adetları birleştir
        const mergedQuantity = (existing.quantity || 0) + (book.quantity || 0);

        // totalQuantity hesaplama: 
        // Aynı kitabın birden fazla kopyası birleştirilirken,
        // totalQuantity = quantity + loans.length formülüne göre hesaplanmalı
        // Bu formül her zaman doğru sonucu verir çünkü:
        // - quantity: mevcut Adet (birleştirilmiş)
        // - loans.length: aktif ödünç sayısı (birleştirilmiş)
        // - totalQuantity = mevcut Adet + aktif ödünç = toplam Adet
        const mergedTotalQuantity = mergedQuantity + mergedLoans.length;

        bookMap.set(key, {
          ...existing,
          // Adetları birleştir
          quantity: mergedQuantity,
          // totalQuantity: mevcut Adet + aktif ödünç sayısı (her zaman doğru formül)
          totalQuantity: mergedTotalQuantity,
          // Ödünçleri birleştir
          loans: mergedLoans,
          // Sayfa sayısı büyük olanı al (varsa)
          pageCount: (existing.pageCount && book.pageCount)
            ? Math.max(existing.pageCount, book.pageCount)
            : (existing.pageCount || book.pageCount || undefined),
          // Diğer bilgiler: varsa olanı al, yoksa mevcut olanı koru
          shelf: existing.shelf || book.shelf,
          publisher: existing.publisher || book.publisher,
          summary: existing.summary || book.summary,
          bookNumber: existing.bookNumber || book.bookNumber,
          year: existing.year || book.year,
          // İlk kitabın ID'sini kullan
          id: existing.id,
        });
      } else {
        bookMap.set(key, { ...book });
      }
    });

    return Array.from(bookMap.values());
  }, [books]);

  // Tüm kategorileri çıkar (birleştirilmiş kitaplardan)
  const categories = useMemo(() => {
    const cats = new Set(mergedBooks.map(b => b.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [mergedBooks]);

  // Tüm yazarları çıkar (birleştirilmiş kitaplardan)
  const authors = useMemo(() => {
    const auths = new Set(mergedBooks.map(b => b.author).filter(Boolean));
    return Array.from(auths).sort();
  }, [mergedBooks]);

  // Tüm rafları çıkar (birleştirilmiş kitaplardan)
  const shelves = useMemo(() => {
    const shelfSet = new Set(mergedBooks.map(b => b.shelf).filter(Boolean));
    return Array.from(shelfSet).sort();
  }, [mergedBooks]);

  // Tüm yayınevlerini çıkar (birleştirilmiş kitaplardan)
  const publishers = useMemo(() => {
    const pubSet = new Set(mergedBooks.map(b => b.publisher).filter(Boolean));
    return Array.from(pubSet).sort();
  }, [mergedBooks]);

  // Filtrelenmiş ve sıralanmış kitaplar
  const filteredAndSortedBooks = useMemo(() => {
    // Birleştirilmiş kitaplardan başla
    let filtered = [...mergedBooks];

    // Metin araması - boş string kontrolü (tüm künye bilgileri dahil - VEYA bağlacı ile)
    if (searchTerm && searchTerm.trim()) {
      filtered = filtered.filter(book => {
        const loanCount = book.loans?.length ?? 0;
        const healthyCount = book.healthyCount ?? 0;
        const damagedCount = book.damagedCount ?? 0;
        const lostCount = book.lostCount ?? 0;
        // Tüm künye bilgilerini kontrol et - VEYA bağlacı ile
        // Zorunlu alanlar (title, author, category) her zaman kontrol edilir
        // Opsiyonel alanlar null/undefined kontrolü ile kontrol edilir
        return (
          searchIncludes(book.title, searchTerm) ||
          searchIncludes(book.author, searchTerm) ||
          searchIncludes(book.category, searchTerm) ||
          searchIncludes(book.shelf, searchTerm) ||
          searchIncludes(book.publisher, searchTerm) ||
          searchIncludes(book.summary, searchTerm) ||
          searchIncludes(book.bookNumber, searchTerm) ||
          searchIncludes(book.year, searchTerm) ||
          searchIncludes(book.pageCount, searchTerm) ||
          searchIncludes(book.quantity, searchTerm) || // 0 Adet dâhil
          searchIncludes(book.totalQuantity, searchTerm) || // 0 toplam dâhil
          searchIncludes(loanCount, searchTerm) || // tabloda görünen ödünç sayısı
          searchIncludes(healthyCount, searchTerm) || // sağlam adet
          searchIncludes(damagedCount, searchTerm) || // hasarlı adet
          searchIncludes(lostCount, searchTerm) || // kayıp adet
          (searchTerm.toLowerCase().includes("sağlam") && healthyCount > 0) ||
          (searchTerm.toLowerCase().includes("hasarlı") && damagedCount > 0) ||
          (searchTerm.toLowerCase().includes("hasar") && damagedCount > 0) ||
          (searchTerm.toLowerCase().includes("kayıp") && lostCount > 0)
        );
      });
    }

    // Kategori filtresi (yalnızca tam filtrede)
    if (!isCompact && selectedCategory) {
      filtered = filtered.filter(book => book.category === selectedCategory);
    }

    // Yazar filtresi (yalnızca tam filtrede)
    if (!isCompact && selectedAuthor) {
      filtered = filtered.filter(book => book.author === selectedAuthor);
    }

    // Yıl filtresi (yalnızca tam filtrede)
    if (!isCompact && yearFilter) {
      if (yearFilter === "recent") {
        filtered = filtered.filter(book => book.year && book.year >= 2020);
      } else if (yearFilter === "old") {
        filtered = filtered.filter(book => book.year && book.year < 2000);
      } else if (yearFilter === "2000-2010") {
        filtered = filtered.filter(book => book.year && book.year >= 2000 && book.year <= 2010);
      } else if (yearFilter === "2010-2020") {
        filtered = filtered.filter(book => book.year && book.year >= 2010 && book.year <= 2020);
      }
    }

    // Adet filtresi
    if (quantityFilter) {
      if (quantityFilter === "available") {
        filtered = filtered.filter(book => book.quantity > 0);
      } else if (quantityFilter === "out-of-stock") {
        filtered = filtered.filter(book => book.quantity === 0);
      } else if (quantityFilter === "low-stock") {
        filtered = filtered.filter(book => book.quantity > 0 && book.quantity <= 3);
      } else if (quantityFilter === "medium-stock") {
        filtered = filtered.filter(book => book.quantity >= 4 && book.quantity <= 10);
      }
    }

    // Kitap durum filtresi
    if (conditionFilter) {
      if (conditionFilter === "healthy") {
        filtered = filtered.filter(book => (book.healthyCount ?? 0) > 0);
      } else if (conditionFilter === "damaged") {
        filtered = filtered.filter(book => (book.damagedCount ?? 0) > 0);
      } else if (conditionFilter === "lost") {
        filtered = filtered.filter(book => (book.lostCount ?? 0) > 0);
      } else if (conditionFilter === "healthy-only") {
        filtered = filtered.filter(book => (book.healthyCount ?? 0) > 0 && (book.damagedCount ?? 0) === 0 && (book.lostCount ?? 0) === 0);
      }
    }

    // Sayfa sayısı filtresi
    if (pageCountFilter) {
      if (pageCountFilter === "0-100") {
        filtered = filtered.filter(book => book.pageCount && book.pageCount >= 0 && book.pageCount <= 100);
      } else if (pageCountFilter === "101-200") {
        filtered = filtered.filter(book => book.pageCount && book.pageCount >= 101 && book.pageCount <= 200);
      } else if (pageCountFilter === "201-300") {
        filtered = filtered.filter(book => book.pageCount && book.pageCount >= 201 && book.pageCount <= 300);
      } else if (pageCountFilter === "301+") {
        filtered = filtered.filter(book => book.pageCount && book.pageCount >= 301);
      }
    }

    // Raf filtresi (exact match)
    if (shelfFilter && shelfFilter.trim()) {
      filtered = filtered.filter(book => book.shelf === shelfFilter);
    }

    // Yayınevi filtresi (exact match)
    if (publisherFilter && publisherFilter.trim()) {
      filtered = filtered.filter(book => book.publisher === publisherFilter);
    }

    // Eksik bilgi filtreleri (OR mantığı - herhangi bir seçili alanı eksik olan kitapları göster)
    const hasActiveMissingFilter = Object.values(missingDataFilters).some(v => v);
    if (hasActiveMissingFilter) {
      filtered = filtered.filter(book => {
        // Seçili filtrelerden en az birinin eksik olması yeterli
        if (missingDataFilters.shelf && (!book.shelf || book.shelf.trim() === '')) return true;
        if (missingDataFilters.publisher && (!book.publisher || book.publisher.trim() === '')) return true;
        if (missingDataFilters.pageCount && (!book.pageCount || book.pageCount === 0)) return true;
        if (missingDataFilters.year && (!book.year || book.year === 0)) return true;
        if (missingDataFilters.bookNumber && !book.bookNumber) return true;
        if (missingDataFilters.summary && (!book.summary || book.summary.trim() === '')) return true;
        return false;
      });
    }

    // Sıralama (tam filtrede veya varsayılan sıralama)
    if (sortOption !== "none") {
      filtered = [...filtered].sort((a, b) => {
        switch (sortOption) {
          case "title-asc":
            return a.title.localeCompare(b.title, "tr");
          case "title-desc":
            return b.title.localeCompare(a.title, "tr");
          case "author-asc":
            return a.author.localeCompare(b.author, "tr");
          case "author-desc":
            return b.author.localeCompare(a.author, "tr");
          case "year-asc":
            return (a.year || 0) - (b.year || 0);
          case "year-desc":
            return (b.year || 0) - (a.year || 0);
          case "quantity-asc":
            return a.quantity - b.quantity;
          case "quantity-desc":
            return b.quantity - a.quantity;
          default:
            return 0;
        }
      });
    }

    // Sütun başlığına tıklama sıralaması (tüm modlarda çalışır)
    if (columnSort) {
      filtered = [...filtered].sort((a, b) => {
        let compare = 0;

        switch (columnSort) {
          case "title":
            compare = (a.title || "").localeCompare(b.title || "", "tr");
            break;
          case "author":
            compare = (a.author || "").localeCompare(b.author || "", "tr");
            break;
          case "category":
            compare = (a.category || "").localeCompare(b.category || "", "tr");
            break;
          case "year":
            compare = (a.year || 0) - (b.year || 0);
            break;
          case "quantity":
            compare = (a.quantity ?? 0) - (b.quantity ?? 0);
            break;
          case "loans":
            compare = (a.loans?.length ?? 0) - (b.loans?.length ?? 0);
            break;
          default:
            compare = 0;
        }

        // Eğer eşitse, title'a göre ikincil sıralama yap
        if (compare === 0 && columnSort !== "title") {
          compare = (a.title || "").localeCompare(b.title || "", "tr");
        }

        return columnSortDirection === "asc" ? compare : -compare;
      });
    } else if (sortOption === "none") {
      // Varsayılan sıralama: alfabetik (başlığa göre)
      filtered = [...filtered].sort((a, b) => {
        const titleCompare = (a.title || "").localeCompare(b.title || "", "tr");
        if (titleCompare !== 0) return titleCompare;
        return (a.id || "").localeCompare(b.id || "", "tr");
      });
    }

    return filtered;
  }, [mergedBooks, isCompact, searchTerm, selectedCategory, selectedAuthor, yearFilter, quantityFilter, conditionFilter, pageCountFilter, shelfFilter, publisherFilter, missingDataFilters, sortOption, columnSort, columnSortDirection]);

  // Sayfalama hesapları
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedBooks.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedBooks = filteredAndSortedBooks.slice(startIndex, startIndex + pageSize);

  // Filtreleme veya sıralama değiştiğinde ilk sayfaya dön
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(1);
    }
  }, [searchTerm, selectedCategory, selectedAuthor, yearFilter, quantityFilter, conditionFilter, sortOption, columnSort, columnSortDirection]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    // Arama yapıldığında sayfayı koru, yalnızca dilimleme yapılacak
  };

  const handleRowClick = (book: Book) => {
    setSelectedBook(book);
  };

  const handleDelete = async (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    if (onDelete) {
      await onDelete(bookId);
      onRefresh();
    }
  };

  // Sayfa numaraları oluştur
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7; // Maksimum görünen sayfa sayısı

    if (totalPages <= maxVisible) {
      // Tüm sayfaları göster
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // İlk sayfa
      pages.push(1);

      if (currentPage <= 4) {
        // Başta
        for (let i = 2; i <= 5; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        // Sonda
        pages.push("...");
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Ortada
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      }
    }

    return pages;
  };

  // Sayfa düğmeleri
  const renderPagination = () => {
    const pageNumbers = getPageNumbers();

    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
          <button
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              background: currentPage === 1 ? "#f1f5f9" : "#fff",
              cursor: currentPage === 1 ? "not-allowed" : "pointer",
              color: currentPage === 1 ? "#94a3b8" : "#475569",
              fontWeight: 500,
              fontSize: "14px"
            }}
          >
            Önceki
          </button>

          {pageNumbers.map((pageNum, idx) => {
            if (pageNum === "...") {
              return (
                <span key={`ellipsis-${idx}`} style={{ padding: "0 8px", color: "#94a3b8", fontSize: "14px" }}>
                  ...
                </span>
              );
            }

            const pageNumber = pageNum as number;
            const isActive = pageNumber === currentPage;

            return (
              <span
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
                style={{
                  padding: "0 8px",
                  color: isActive ? "#1d4ed8" : "#475569",
                  cursor: "pointer",
                  fontWeight: isActive ? 700 : 400,
                  fontSize: "14px",
                  textDecoration: isActive ? "underline" : "none",
                  textUnderlineOffset: "2px"
                }}
              >
                {pageNumber}
              </span>
            );
          })}

          <button
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              background: currentPage === totalPages ? "#f1f5f9" : "#fff",
              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              color: currentPage === totalPages ? "#94a3b8" : "#475569",
              fontWeight: 500,
              fontSize: "14px"
            }}
          >
            Sonraki
          </button>

          <input
            type="number"
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const pageNum = parseInt(pageInputValue, 10);
                if (pageNum >= 1 && pageNum <= totalPages) {
                  setPage(pageNum);
                  setPageInputValue("");
                } else {
                  alert(`Lütfen 1 ile ${totalPages} arasında bir sayı girin.`);
                  setPageInputValue("");
                }
              }
            }}
            placeholder={currentPage.toString()}
            min={1}
            max={totalPages}
            style={{
              width: "60px",
              padding: "6px 8px",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              fontSize: "14px",
              textAlign: "center",
              marginLeft: "4px"
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", color: "#64748b" }}>
            {filteredAndSortedBooks.length > 0 ? `${startIndex + 1}-${Math.min(startIndex + pageSize, filteredAndSortedBooks.length)} / ${filteredAndSortedBooks.length}` : "0"}
          </span>
        </div>
      </div>
    );
  };

  // Bilgi penceresi dışına tıklandığında kapat
  useEffect(() => {
    if (showCatalogInfo) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-info-popover-catalog]') && !target.closest('[data-info-button-catalog]')) {
          setShowCatalogInfo(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCatalogInfo]);

  return (
    <>
      <div className="card" style={{ position: "relative" }}>
        {/* Bilgi İkonu - Sağ Üst Köşe */}
        {!isSearchOnly && (
          <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 100 }}>
            <button
              data-info-button-catalog
              onClick={() => setShowCatalogInfo(!showCatalogInfo)}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "2px solid",
                borderColor: showCatalogInfo ? "#3b82f6" : "#fbbf24",
                background: showCatalogInfo ? "#eff6ff" : "#fef9e7",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                color: showCatalogInfo ? "#1d4ed8" : "#d97706",
                transition: "all 0.2s",
                fontWeight: 700,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                position: "relative",
                padding: 0,
              }}
              onMouseEnter={(e) => {
                if (!showCatalogInfo) {
                  e.currentTarget.style.backgroundColor = "#fef3c7";
                  e.currentTarget.style.borderColor = "#f59e0b";
                }
              }}
              onMouseLeave={(e) => {
                if (!showCatalogInfo) {
                  e.currentTarget.style.backgroundColor = "#fef9e7";
                  e.currentTarget.style.borderColor = "#fbbf24";
                }
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={showCatalogInfo ? "#1d4ed8" : "#d97706"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: "block" }}
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <line x1="9" y1="10" x2="15" y2="10" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </button>
            {showCatalogInfo && (
              <div
                data-info-popover-catalog
                style={{
                  position: "absolute",
                  top: "40px",
                  right: "0",
                  width: "400px",
                  maxWidth: "90vw",
                  backgroundColor: "#fef9e7",
                  borderRadius: "12px",
                  border: "1px solid #fbbf24",
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
                  padding: "20px",
                  zIndex: 1001,
                  fontSize: "14px",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "20px",
                    width: "16px",
                    height: "16px",
                    backgroundColor: "#fef9e7",
                    borderLeft: "1px solid #fbbf24",
                    borderTop: "1px solid #fbbf24",
                    transform: "rotate(45deg)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <h3 style={{ marginTop: 0, marginBottom: "10px", fontSize: "16px", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                      </svg>
                      Kitap Kataloğu Kullanımı
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Arama:</strong> Kitap adı, yazar, kategori veya künye bilgilerine göre arama yapabilirsiniz. Aynı ad ve yazara sahip kitaplar otomatik birleştirilir.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Filtreleme:</strong> Kategori, yazar, yıl ve adet durumuna göre filtreleme yapabilirsiniz.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Sıralama:</strong> Sütun başlıklarına tıklayarak kitap adı, yazar, yıl veya adet sayısına göre sıralama yapabilirsiniz.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Kitap Ekleme:</strong> "Yeni Kitap" butonu ile yeni kitap ekleyebilirsiniz. Aynı ad ve yazara sahip kitaplar otomatik birleştirilir.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Kitap Düzenleme:</strong> Kitap satırına tıklayarak detayları görüntüleyebilir ve düzenleyebilirsiniz.
                      </p>
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "#1e293b" }}>Çoklu İşlem:</strong> "Seç" butonu ile birden fazla kitap seçip toplu düzenleme yapabilirsiniz.
                      </p>
                      <p style={{ margin: "8px 0 0 0" }}>
                        <strong style={{ color: "#1e293b" }}>Adet Kontrol:</strong> Adet sayısı otomatik güncellenir. Kitap ödünç verildiğinde azalır, teslim edildiğinde artar.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="toolbar" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <h2 style={{ margin: 0, color: "#1e293b", fontWeight: 700 }}>Kitap Kataloğu</h2>
          </div>
          {isSearchOnly ? (
            <input
              placeholder="Kitap, yazar, kategori veya künye bilgilerine göre ara..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
                <input
                  placeholder="Kitap, yazar, kategori veya künye bilgilerine göre ara..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  style={{ flex: 1, minWidth: "200px", padding: "10px" }}
                />
                {canEdit && onAdd && (
                  <button className="primary" onClick={() => setShowAddModal(true)}>
                    + Yeni Kitap
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => {
                      setSelectionMode(!selectionMode);
                      if (selectionMode) {
                        setSelectedBookIds(new Set());
                      }
                    }}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "8px",
                      border: selectionMode ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                      background: selectionMode ? "#eff6ff" : "#fff",
                      color: selectionMode ? "#1d4ed8" : "#374151",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "14px",
                    }}
                  >
                    {selectionMode ? "✕ Seçimi İptal" : "✓ Seç"}
                  </button>
                )}
              </div>
              {/* Filtreleme Toggle Butonu */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: showFilters ? "2px solid #8b5cf6" : "1px solid #e5e7eb",
                  background: showFilters ? "#f5f3ff" : "#fff",
                  color: showFilters ? "#6d28d9" : "#374151",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  alignSelf: "flex-start",
                  transition: "all 0.2s",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: showFilters ? "rotate(0deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                </svg>
                {showFilters ? "Filtreleme Seçeneklerini Gizle" : "Filtreleme Seçeneklerini Göster"}
              </button>
            </div>
          )}
          {selectionMode && selectedBookIds.size > 0 && canEdit && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "12px", backgroundColor: "#f0f9ff", borderRadius: "8px", border: "1px solid #bae6fd" }}>
              <span style={{ fontWeight: 600, color: "#0369a1" }}>
                {selectedBookIds.size} kitap seçildi
              </span>
              {onAdd && (
                <button
                  onClick={() => setShowBulkEditModal(true)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "1px solid #3b82f6",
                    background: "#3b82f6",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  Seçilenleri Düzenle
                </button>
              )}
              {onDelete && (
                <button
                  onClick={async () => {
                    if (selectedBookIds.size === 0) return;

                    const selectedBooks = books.filter(b => selectedBookIds.has(b.id));
                    const latestLoans = await httpClient.get<LoanInfo[]>("/books/loans");

                    // Ödünç listesi olan kitapları bul
                    const booksWithLoans = selectedBooks.map(book => {
                      const bookLoans = latestLoans.filter(l => l.bookId === book.id);
                      return {
                        id: book.id,
                        name: `${book.title} - ${book.author}`,
                        loans: bookLoans
                      };
                    }).filter(item => item.loans.length > 0);

                    // Eğer ödünç listesi olan kitaplar varsa, detaylı onay kartını göster
                    if (booksWithLoans.length > 0) {
                      setBulkDeleteData({
                        type: "books",
                        items: booksWithLoans,
                        selectedItems: new Set(selectedBookIds)
                      });
                      setShowBulkDeleteDetail(true);
                      return;
                    }

                    // Ödünç yoksa direkt sil
                    await executeBulkDeleteBooks(selectedBookIds);
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    border: "1px solid #ef4444",
                    background: "#ef4444",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  Seçilenleri Sil
                </button>
              )}
            </div>
          )}

          {/* Filtreleme ve Sıralama */}
          {isSearchOnly ? null : isCompact ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "4px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px" }}>
                {[
                  { value: "", label: "Tümü" },
                  { value: "available", label: "Mevcut" },
                  { value: "low-stock", label: "Az Adet (1-3)" },
                  { value: "medium-stock", label: "Orta Adet (4-10)" },
                  { value: "out-of-stock", label: "Tükenen" },
                ].map(option => (
                  <button
                    key={option.label}
                    onClick={() => setQuantityFilter(option.value)}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: quantityFilter === option.value ? "2px solid #2563eb" : "1px solid #e5e7eb",
                      background: quantityFilter === option.value ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      fontWeight: 700,
                      color: quantityFilter === option.value ? "#1d4ed8" : "#475569",
                      transition: "all 0.2s",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {(searchTerm || quantityFilter) && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setQuantityFilter("");
                    onSearch("");
                  }}
                  style={{
                    alignSelf: "flex-start",
                    padding: "8px 16px",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Filtreleri Temizle
                </button>
              )}
            </div>
          ) : showFilters ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "12px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
              {/* İlk Satır - 5 Filtre */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", alignItems: "end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Kategori</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Tümü</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Yazar</label>
                  <select
                    value={selectedAuthor}
                    onChange={(e) => setSelectedAuthor(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Tümü</option>
                    {authors.map(author => (
                      <option key={author} value={author}>{author}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Yıl</label>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Tümü</option>
                    <option value="recent">2020 ve sonrası</option>
                    <option value="2010-2020">2010-2020</option>
                    <option value="2000-2010">2000-2010</option>
                    <option value="old">2000 öncesi</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Adet Durumu</label>
                  <select
                    value={quantityFilter}
                    onChange={(e) => setQuantityFilter(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Tümü</option>
                    <option value="available">Mevcut</option>
                    <option value="low-stock">Az Adet (1-3)</option>
                    <option value="medium-stock">Orta Adet (4-10)</option>
                    <option value="out-of-stock">Adette Yok</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Kitap Durumu</label>
                  <select
                    value={conditionFilter}
                    onChange={(e) => setConditionFilter(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Tümü</option>
                    <option value="healthy">Sağlam Var</option>
                    <option value="damaged">Hasarlı Var</option>
                    <option value="lost">Kayıp Var</option>
                    <option value="healthy-only">Sadece Sağlam</option>
                  </select>
                </div>
              </div>

              {/* İkinci Satır - 4 Filtre */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", alignItems: "end" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Sayfa Sayısı</label>
                  <select
                    value={pageCountFilter}
                    onChange={(e) => setPageCountFilter(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Tümü</option>
                    <option value="0-100">0-100</option>
                    <option value="101-200">101-200</option>
                    <option value="201-300">201-300</option>
                    <option value="301+">301+</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Raf</label>
                  <select
                    value={shelfFilter}
                    onChange={(e) => setShelfFilter(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Tümü</option>
                    {shelves.map(shelf => (
                      <option key={shelf} value={shelf}>{shelf}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Yayınevi</label>
                  <select
                    value={publisherFilter}
                    onChange={(e) => setPublisherFilter(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Tümü</option>
                    {publishers.map(publisher => (
                      <option key={publisher} value={publisher}>{publisher}</option>
                    ))}
                  </select>
                </div>

                <div style={{ gridColumn: "span 2" }}>
                  {(searchTerm || selectedCategory || selectedAuthor || yearFilter || quantityFilter || conditionFilter || pageCountFilter || shelfFilter || publisherFilter || Object.values(missingDataFilters).some(v => v)) && (
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedCategory("");
                        setSelectedAuthor("");
                        setYearFilter("");
                        setQuantityFilter("");
                        setConditionFilter("");
                        setPageCountFilter("");
                        setShelfFilter("");
                        setPublisherFilter("");
                        setMissingDataFilters({
                          shelf: false,
                          publisher: false,
                          pageCount: false,
                          year: false,
                          bookNumber: false,
                          summary: false,
                        });
                        setSortOption("none");
                        onSearch("");
                      }}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                        width: "100%",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Filtreleri Temizle
                    </button>
                  )}
                </div>
              </div>

              {/* Üçüncü Satır - Eksik Bilgiler Filtreleri */}
              <div style={{
                paddingTop: "12px",
                borderTop: "1px solid #e5e7eb",
                display: "flex",
                flexDirection: "column",
                gap: "8px"
              }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "16px", fontWeight: 700, color: "#dc2626" }}>!</span>
                  Eksik Bilgiler
                  {Object.values(missingDataFilters).filter(v => v).length > 0 && (
                    <span style={{
                      backgroundColor: "#dc2626",
                      color: "white",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}>
                      {Object.values(missingDataFilters).filter(v => v).length} aktif
                    </span>
                  )}
                </label>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                  gap: "8px",
                }}>
                  {[
                    { key: "shelf", label: "Raf Eksik" },
                    { key: "publisher", label: "Yayınevi Eksik" },
                    { key: "pageCount", label: "Sayfa Sayısı Eksik" },
                    { key: "year", label: "Yayın Yılı Eksik" },
                    { key: "bookNumber", label: "Kitap No Eksik" },
                    { key: "summary", label: "Özet Eksik" }
                  ].map((filter) => (
                    <label
                      key={filter.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        cursor: "pointer",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        backgroundColor: missingDataFilters[filter.key as keyof typeof missingDataFilters]
                          ? "rgba(220, 38, 38, 0.1)"
                          : "transparent",
                        transition: "all 0.2s",
                        fontSize: "12px",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={missingDataFilters[filter.key as keyof typeof missingDataFilters]}
                        onChange={(e) => setMissingDataFilters(prev => ({
                          ...prev,
                          [filter.key]: e.target.checked
                        }))}
                        style={{
                          cursor: "pointer",
                          width: "14px",
                          height: "14px"
                        }}
                      />
                      <span style={{ fontWeight: 500, color: "#475569" }}>
                        {filter.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

        </div>

        <div style={{ marginBottom: "12px", fontSize: "14px", color: "#64748b" }}>
          Toplam <strong>{books.length}</strong> kitap gösteriliyor
        </div>

        <table className="book-table" style={{ width: "100%", tableLayout: "auto" }}>
          <thead>
            <tr>
              <th
                onClick={() => {
                  if (columnSort === "title") {
                    setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                  } else {
                    setColumnSort("title");
                    setColumnSortDirection("asc");
                  }
                }}
                style={{ cursor: "pointer", userSelect: "none", minWidth: "200px", width: "25%", fontWeight: 600, textTransform: "none" }}
              >
                Başlık {columnSort === "title" && (columnSortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => {
                  if (columnSort === "author") {
                    setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                  } else {
                    setColumnSort("author");
                    setColumnSortDirection("asc");
                  }
                }}
                style={{ cursor: "pointer", userSelect: "none", minWidth: "150px", width: "20%", fontWeight: 600, textTransform: "none" }}
              >
                Yazar {columnSort === "author" && (columnSortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => {
                  if (columnSort === "category") {
                    setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                  } else {
                    setColumnSort("category");
                    setColumnSortDirection("asc");
                  }
                }}
                style={{ cursor: "pointer", userSelect: "none", minWidth: "120px", width: "15%", fontWeight: 600, textTransform: "none" }}
              >
                Kategori {columnSort === "category" && (columnSortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => {
                  if (columnSort === "year") {
                    setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                  } else {
                    setColumnSort("year");
                    setColumnSortDirection("asc");
                  }
                }}
                style={{ cursor: "pointer", userSelect: "none", minWidth: "80px", width: "8%", textAlign: "center", fontWeight: 600, textTransform: "none" }}
              >
                Yıl {columnSort === "year" && (columnSortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => {
                  if (columnSort === "quantity") {
                    setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                  } else {
                    setColumnSort("quantity");
                    setColumnSortDirection("asc");
                  }
                }}
                style={{ cursor: "pointer", userSelect: "none", minWidth: "100px", width: "12%", textAlign: "center", fontWeight: 600, textTransform: "none" }}
              >
                Adet {columnSort === "quantity" && (columnSortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => {
                  if (columnSort === "loans") {
                    setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                  } else {
                    setColumnSort("loans");
                    setColumnSortDirection("asc");
                  }
                }}
                style={{ cursor: "pointer", userSelect: "none", minWidth: "100px", width: "12%", textAlign: "center", fontWeight: 600, textTransform: "none" }}
              >
                Ödünç {columnSort === "loans" && (columnSortDirection === "asc" ? "↑" : "↓")}
              </th>
              {selectionMode && canEdit && (
                <th style={{ width: "60px", textAlign: "center", fontWeight: 600, textTransform: "none" }}>
                  <div
                    onClick={() => {
                      if (selectedBookIds.size === pagedBooks.length && pagedBooks.length > 0) {
                        setSelectedBookIds(new Set());
                      } else {
                        const allPageBookIds = new Set(pagedBooks.map(book => book.id || "").filter(Boolean));
                        setSelectedBookIds(allPageBookIds);
                      }
                    }}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      border: selectedBookIds.size === pagedBooks.length && pagedBooks.length > 0 ? "2px solid #3b82f6" : "2px solid #cbd5e1",
                      background: selectedBookIds.size === pagedBooks.length && pagedBooks.length > 0 ? "#3b82f6" : "white",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s",
                      margin: "0 auto",
                    }}
                  >
                    {selectedBookIds.size === pagedBooks.length && pagedBooks.length > 0 && (
                      <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                    )}
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pagedBooks.map((book) => (
              <tr
                key={book.id}
                onClick={() => {
                  if (!selectionMode) {
                    handleRowClick(book);
                  }
                }}
                style={{ cursor: selectionMode ? "default" : "pointer" }}
                onMouseEnter={(e) => {
                  if (!selectionMode) {
                    e.currentTarget.style.backgroundColor = "#f0f9ff";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selectionMode) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <td style={{ wordBreak: "break-word" }}>
                  <strong>{book.title}</strong>
                </td>
                <td style={{ wordBreak: "break-word" }}>
                  {book.author}
                </td>
                <td>
                  <span style={{
                    backgroundColor: "#e0e7ff",
                    color: "#4338ca",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: 500,
                    display: "inline-block",
                    whiteSpace: "nowrap"
                  }}>
                    {book.category}
                  </span>
                </td>
                <td style={{ color: "#64748b", textAlign: "center" }}>
                  {book.year || "—"}
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    backgroundColor: book.quantity <= 3 ? "#fee2e2" : book.quantity <= 6 ? "#fef3c7" : "#d1fae5",
                    color: book.quantity <= 3 ? "#dc2626" : book.quantity <= 6 ? "#d97706" : "#059669",
                    padding: "4px 8px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "inline-block"
                  }}>
                    {book.quantity} adet
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  {(() => {
                    const loanCount = book.loans.length;
                    let color = "#10b981"; // Yeşil (0 ödünç)
                    if (loanCount > 0 && loanCount <= 3) {
                      color = "#dc2626"; // Kırmızı (1-3 ödünç)
                    } else if (loanCount > 3 && loanCount <= 6) {
                      color = "#d97706"; // Turuncu (4-6 ödünç)
                    } else if (loanCount > 6) {
                      color = "#ef4444"; // Koyu kırmızı (7+ ödünç)
                    }
                    return (
                      <span style={{ color, fontWeight: 600, fontSize: "14px" }}>{loanCount}</span>
                    );
                  })()}
                </td>
                {selectionMode && canEdit && (
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        const newSelected = new Set(selectedBookIds);
                        if (selectedBookIds.has(book.id || "")) {
                          newSelected.delete(book.id || "");
                        } else {
                          newSelected.add(book.id || "");
                        }
                        setSelectedBookIds(newSelected);
                      }}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        border: selectedBookIds.has(book.id || "") ? "2px solid #3b82f6" : "2px solid #cbd5e1",
                        background: selectedBookIds.has(book.id || "") ? "#3b82f6" : "white",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                    >
                      {selectedBookIds.has(book.id || "") && (
                        <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedBooks.length > 0 && renderPagination()}

        {filteredAndSortedBooks.length === 0 && (
          <p style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
            {searchTerm || selectedCategory || yearFilter || quantityFilter || conditionFilter
              ? "Arama kriterlerinize uygun kitap bulunamadı."
              : "Henüz kitap bulunmuyor."}
          </p>
        )}
      </div >

      {selectedBook && createPortal(
        <BookDetailModal
          book={selectedBook}
          students={students}
          loans={loans}
          books={books}
          personelName={personelName}
          onClose={() => setSelectedBook(null)}
          onRefresh={onRefresh}
          onEdit={onAdd ? (book) => {
            setEditingBook(book);
            setSelectedBook(null);
          } : undefined}
        />,
        document.body
      )
      }

      {
        showAddModal && onAdd && createPortal(
          <BookFormModal
            book={null}
            onSave={async (data) => {
              await onAdd(data);
              setShowAddModal(false);
              onRefresh();
            }}
            onClose={() => setShowAddModal(false)}
          />,
          document.body
        )
      }

      {
        editingBook && onAdd && createPortal(
          <BookFormModal
            book={editingBook}
            onSave={async (data) => {
              await onAdd(data);
              setEditingBook(null);
              onRefresh();
            }}
            onClose={() => setEditingBook(null)}
          />,
          document.body
        )
      }

      {
        showBulkEditModal && onAdd && createPortal(
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
            onClick={() => {
              setShowBulkEditModal(false);
              setBulkEditField(null);
              setBulkEditValues(new Map());
            }}
          >
            <div
              className="card"
              style={{
                maxWidth: "900px",
                width: "90%",
                maxHeight: "90vh",
                overflowY: "auto",
                overflowX: "hidden",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <h2 style={{ margin: 0 }}>Çoklu Kitap Düzenleme</h2>
                <button
                  onClick={() => {
                    setShowBulkEditModal(false);
                    setBulkEditField(null);
                    setBulkEditValues(new Map());
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "24px",
                    cursor: "pointer",
                    color: "#64748b",
                  }}
                >
                  ×
                </button>
              </div>

              {!bulkEditField ? (
                <div>
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                    Düzenlenecek Alanı Seçin
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      setBulkEditField(e.target.value);
                      const newValues = new Map<string, string>();
                      mergedBooks.filter(b => selectedBookIds.has(b.id || "")).forEach(book => {
                        const currentValue = e.target.value === "title" ? book.title :
                          e.target.value === "author" ? book.author :
                            e.target.value === "category" ? book.category :
                              e.target.value === "quantity" ? book.totalQuantity?.toString() :
                                e.target.value === "shelf" ? book.shelf :
                                  e.target.value === "publisher" ? book.publisher :
                                    e.target.value === "year" ? book.year?.toString() :
                                      e.target.value === "pageCount" ? book.pageCount?.toString() :
                                        e.target.value === "bookNumber" ? book.bookNumber?.toString() :
                                          e.target.value === "summary" ? book.summary :
                                            "";
                        newValues.set(book.id || "", currentValue || "");
                      });
                      setBulkEditValues(newValues);
                    }}
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", marginBottom: "24px" }}
                  >
                    <option value="">-- Seçiniz --</option>
                    <option value="title">Ad</option>
                    <option value="author">Yazar</option>
                    <option value="category">Kategori</option>
                    <option value="quantity">Adet</option>
                    <option value="shelf">Raf</option>
                    <option value="publisher">Yayınevi</option>
                    <option value="year">Yayın Yılı</option>
                    <option value="pageCount">Sayfa Sayısı</option>
                    <option value="bookNumber">Kitap Numarası</option>
                    <option value="summary">Özet</option>
                  </select>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div>
                      <strong style={{ fontSize: "16px" }}>
                        {bulkEditField === "title" ? "Ad" :
                          bulkEditField === "author" ? "Yazar" :
                            bulkEditField === "category" ? "Kategori" :
                              bulkEditField === "quantity" ? "Adet" :
                                bulkEditField === "shelf" ? "Raf" :
                                  bulkEditField === "publisher" ? "Yayınevi" :
                                    bulkEditField === "year" ? "Yayın Yılı" :
                                      bulkEditField === "pageCount" ? "Sayfa Sayısı" :
                                        bulkEditField === "bookNumber" ? "Kitap Numarası" :
                                          "Özet"} Düzenleme
                      </strong>
                      <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
                        {selectedBookIds.size} kitap seçildi
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setBulkEditField(null);
                        setBulkEditValues(new Map());
                      }}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: "14px",
                      }}
                    >
                      ← Geri
                    </button>
                  </div>

                  <div style={{ maxHeight: "500px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
                    {mergedBooks.filter(b => selectedBookIds.has(b.id || "")).map((book) => {
                      const bookId = book.id || "";
                      const currentValue = bulkEditValues.get(bookId) || "";
                      const currentDisplayValue = bulkEditField === "title" ? book.title :
                        bulkEditField === "author" ? book.author :
                          bulkEditField === "category" ? book.category :
                            bulkEditField === "quantity" ? book.totalQuantity?.toString() :
                              bulkEditField === "shelf" ? book.shelf :
                                bulkEditField === "publisher" ? book.publisher :
                                  bulkEditField === "year" ? book.year?.toString() :
                                    bulkEditField === "pageCount" ? book.pageCount?.toString() :
                                      bulkEditField === "bookNumber" ? book.bookNumber?.toString() :
                                        bulkEditField === "summary" ? book.summary :
                                          "";

                      return (
                        <div
                          key={book.id}
                          style={{
                            padding: "16px",
                            marginBottom: "12px",
                            backgroundColor: "#f8fafc",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <div style={{ marginBottom: "12px" }}>
                            <div style={{ fontWeight: 600, marginBottom: "4px", fontSize: "15px" }}>{book.title}</div>
                            <div style={{ fontSize: "12px", color: "#64748b" }}>
                              {book.author} • {book.category}
                            </div>
                            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
                              Mevcut: {currentDisplayValue || "—"}
                            </div>
                          </div>
                          <div>
                            {bulkEditField === "category" ? (
                              currentValue === "__NEW__" ? (
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                  <input
                                    type="text"
                                    value={bulkEditValues.get(`${bookId}_new`) || ""}
                                    onChange={(e) => {
                                      const newValues = new Map(bulkEditValues);
                                      newValues.set(`${bookId}_new`, e.target.value);
                                      setBulkEditValues(newValues);
                                    }}
                                    placeholder="Yeni kategori adını girin"
                                    style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                  />
                                  <button
                                    onClick={() => {
                                      const newValues = new Map(bulkEditValues);
                                      newValues.set(bookId, "");
                                      newValues.delete(`${bookId}_new`);
                                      setBulkEditValues(newValues);
                                    }}
                                    style={{
                                      padding: "10px 16px",
                                      borderRadius: "6px",
                                      border: "1px solid #e5e7eb",
                                      background: "#fff",
                                      cursor: "pointer",
                                      fontSize: "14px",
                                    }}
                                  >
                                    ← Geri
                                  </button>
                                </div>
                              ) : (
                                <select
                                  value={currentValue}
                                  onChange={(e) => {
                                    const newValues = new Map(bulkEditValues);
                                    if (e.target.value === "__NEW__") {
                                      newValues.set(bookId, "__NEW__");
                                    } else {
                                      newValues.set(bookId, e.target.value);
                                      newValues.delete(`${bookId}_new`);
                                    }
                                    setBulkEditValues(newValues);
                                  }}
                                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                >
                                  <option value="">Kategori seçin</option>
                                  {["Roman", "Tarih", "Deneme", "Psikoloji", "Fantastik", "Bilim Kurgu", "Macera", "Biyografi"].map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                  ))}
                                  <option value="__NEW__">➕ Mevcutlar haricinde ekle</option>
                                </select>
                              )
                            ) : bulkEditField === "quantity" || bulkEditField === "year" || bulkEditField === "pageCount" || bulkEditField === "bookNumber" ? (
                              <input
                                type="number"
                                value={currentValue}
                                onChange={(e) => {
                                  const newValues = new Map(bulkEditValues);
                                  newValues.set(bookId, e.target.value);
                                  setBulkEditValues(newValues);
                                }}
                                placeholder={`Yeni ${bulkEditField === "quantity" ? "adet" : bulkEditField === "year" ? "yayın yılı" : bulkEditField === "pageCount" ? "sayfa sayısı" : "kitap numarası"} değerini girin`}
                                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                                min={bulkEditField === "quantity" || bulkEditField === "pageCount" || bulkEditField === "bookNumber" ? "1" : "1800"}
                                max={bulkEditField === "year" ? "2024" : undefined}
                              />
                            ) : bulkEditField === "summary" ? (
                              <textarea
                                value={currentValue}
                                onChange={(e) => {
                                  const newValues = new Map(bulkEditValues);
                                  newValues.set(bookId, e.target.value);
                                  setBulkEditValues(newValues);
                                }}
                                placeholder="Yeni özet değerini girin"
                                rows={3}
                                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical" }}
                              />
                            ) : (
                              <input
                                type="text"
                                value={currentValue}
                                onChange={(e) => {
                                  const newValues = new Map(bulkEditValues);
                                  newValues.set(bookId, e.target.value);
                                  setBulkEditValues(newValues);
                                }}
                                placeholder={`Yeni ${bulkEditField === "title" ? "ad" : bulkEditField === "author" ? "yazar" : bulkEditField === "shelf" ? "raf" : "yayınevi"} değerini girin`}
                                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowBulkEditModal(false);
                        setBulkEditField(null);
                        setBulkEditValues(new Map());
                      }}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "6px",
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      İptal
                    </button>
                    <button
                      onClick={async () => {
                        // Boş değerleri kontrol et
                        const selectedBooks = mergedBooks.filter(b => selectedBookIds.has(b.id || ""));
                        const emptyValues = selectedBooks.filter(book => {
                          const bookId = book.id || "";
                          const value = bulkEditValues.get(bookId);
                          if (bulkEditField === "category" && value === "__NEW__") {
                            // Yeni kategori için özel kontrol
                            const newCategoryValue = bulkEditValues.get(`${bookId}_new`);
                            return !newCategoryValue || !newCategoryValue.trim();
                          }
                          return !value || (bulkEditField !== "summary" && value !== "__NEW__" && !value.trim());
                        });

                        if (emptyValues.length > 0) {
                          alert(`Lütfen tüm kitaplar için değer girin. ${emptyValues.length} kitap için değer eksik.`);
                          return;
                        }

                        if (!window.confirm(`${selectedBookIds.size} kitabın ${bulkEditField === "title" ? "ismini" : bulkEditField === "author" ? "yazarını" : bulkEditField === "category" ? "kategorisini" : bulkEditField === "quantity" ? "adetini" : bulkEditField === "shelf" ? "rafını" : bulkEditField === "publisher" ? "yayınevini" : bulkEditField === "year" ? "yayın yılını" : bulkEditField === "pageCount" ? "sayfa sayısını" : bulkEditField === "bookNumber" ? "kitap numarasını" : "özetini"} güncellemek istediğinize emin misiniz?`)) {
                          return;
                        }

                        for (const book of selectedBooks) {
                          const bookId = book.id || "";
                          let editValue = bulkEditValues.get(bookId) || "";

                          // Yeni kategori için özel kontrol
                          if (bulkEditField === "category" && editValue === "__NEW__") {
                            editValue = bulkEditValues.get(`${bookId}_new`) || "";
                          }

                          const updateData: any = {
                            title: book.title,
                            author: book.author,
                            category: book.category,
                            quantity: book.totalQuantity,
                            id: book.id,
                          };

                          if (bulkEditField === "title") updateData.title = editValue.trim();
                          else if (bulkEditField === "author") updateData.author = editValue.trim();
                          else if (bulkEditField === "category") updateData.category = editValue.trim();
                          else if (bulkEditField === "quantity") updateData.quantity = parseInt(editValue) || book.totalQuantity;
                          else if (bulkEditField === "shelf") updateData.shelf = editValue.trim();
                          else if (bulkEditField === "publisher") updateData.publisher = editValue.trim();
                          else if (bulkEditField === "year") updateData.year = editValue ? parseInt(editValue) : undefined;
                          else if (bulkEditField === "pageCount") updateData.pageCount = editValue ? parseInt(editValue) : undefined;
                          else if (bulkEditField === "bookNumber") updateData.bookNumber = editValue ? parseInt(editValue) : undefined;
                          else if (bulkEditField === "summary") updateData.summary = editValue.trim();

                          await onAdd(updateData);
                        }

                        setShowBulkEditModal(false);
                        setBulkEditField(null);
                        setBulkEditValues(new Map());
                        setSelectionMode(false);
                        setSelectedBookIds(new Set());
                        onRefresh();
                      }}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "6px",
                        border: "none",
                        background: "#3b82f6",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Kayıt ve Onay
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      }

      {/* Toplu Silme Detay Kartı */}
      <ConfirmCard
        isOpen={showBulkDeleteDetail}
        title="Toplu Kitap Silme"
        icon="⚠️"
        onConfirm={async () => {
          if (!bulkDeleteData) return;

          // Önce uyarı kartını kapat
          setShowBulkDeleteDetail(false);
          const selectedItems = bulkDeleteData.selectedItems;
          const totalLoanCount = bulkDeleteData.items.reduce((sum, item) => {
            if (selectedItems.has(item.id)) {
              return sum + item.loans.length;
            }
            return sum;
          }, 0);

          setBulkDeleteData(null);

          setDeleteLoading(true);
          try {
            await executeBulkDeleteBooks(selectedItems, totalLoanCount);
          } finally {
            setDeleteLoading(false);
          }
        }}
        onCancel={() => {
          setShowBulkDeleteDetail(false);
          setBulkDeleteData(null);
        }}
        confirmText="Tamam, Sil"
        cancelText="İptal"
        confirmButtonColor="#ef4444"
        loading={deleteLoading}
        disabled={bulkDeleteData?.selectedItems.size === 0}
      >
        {bulkDeleteData && (
          <>
            <div style={{ fontSize: "14px", color: "#475569", marginBottom: "16px", lineHeight: "1.6" }}>
              <strong>Silinecekler içerisinde ödünç listesi olanlar var:</strong>
            </div>
            <div style={{ maxHeight: "400px", overflowY: "auto", marginBottom: "16px" }}>
              {bulkDeleteData.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "12px",
                    backgroundColor: "#fef3c7",
                    borderRadius: "8px",
                    border: "1px solid #fbbf24",
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                    <div
                      onClick={() => {
                        const newSelected = new Set(bulkDeleteData.selectedItems);
                        if (bulkDeleteData.selectedItems.has(item.id)) {
                          newSelected.delete(item.id);
                        } else {
                          newSelected.add(item.id);
                        }
                        setBulkDeleteData({
                          ...bulkDeleteData,
                          selectedItems: newSelected
                        });
                      }}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "4px",
                        border: "2px solid #fbbf24",
                        backgroundColor: bulkDeleteData.selectedItems.has(item.id) ? "#f59e0b" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        flexShrink: 0,
                        color: "white",
                        fontWeight: "bold",
                        fontSize: "14px",
                      }}
                    >
                      {bulkDeleteData.selectedItems.has(item.id) && <span>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 600 }}>
                        {item.name} - {item.loans.length} Ödünç
                      </div>
                    </div>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "40px", fontSize: "13px", color: "#78350f" }}>
                    {item.loans.map((loan, loanIdx) => {
                      const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
                      return (
                        <li key={loanIdx} style={{ marginBottom: "4px" }}>
                          <><strong>{loan.borrower}</strong> (Teslim: {dueDate})</>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", padding: "12px", backgroundColor: "#f1f5f9", borderRadius: "8px" }}>
              <strong>{bulkDeleteData.items.reduce((sum, item) => sum + item.loans.length, 0)} ödünç kaydı</strong> seçilen kitaplarla birlikte silinecek.
            </div>
          </>
        )}
      </ConfirmCard>

      {/* Bilgilendirme Kartı */}
      <InfoCard
        isOpen={showInfoCard}
        title={infoCardData?.title || "Bilgi"}
        icon={infoCardData?.icon}
        type={infoCardData?.type || "info"}
        onClose={() => {
          setShowInfoCard(false);
          setInfoCardData(null);
        }}
      >
        <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
          {infoCardData?.message}
        </div>
      </InfoCard>
    </>
  );
};

export default BookList;
