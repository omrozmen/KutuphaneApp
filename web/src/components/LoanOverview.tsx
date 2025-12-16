import { useState, useEffect, useMemo, useRef, useCallback, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { LoanInfo, Book, StudentStat, StudentHistoryResponse } from "../api/types";
import { httpClient } from "../api/client";
import BookDetailModal from "./BookDetailModal";
import InfoCard from "./InfoCard";
import ConfirmCard from "./ConfirmCard";
import StudentDetailModal from "./StudentDetailModal"; // Changed from StudentDetailCard
import { formatStudentFullName } from "../utils/studentName";
import { searchIncludes } from "../utils/searchUtils";
import { normalizeStudentCounters } from "../utils/studentStats";

type Props = {
  loans: LoanInfo[];
  books?: Book[]; // Kitap künye bilgileri için
  students?: StudentStat[]; // Öğrenci listesi için
  onRefresh: () => void;
  personelName: string;
  resetSearch?: boolean;
  filterVariant?: "full" | "compact" | "search-only";
  onAddNotification?: (type: "info" | "success" | "warning" | "error", title: string, message: string) => void;
};

type LoanDeleteItem = {
  id: string;
  loan: LoanInfo;
};

const LoanOverview = ({ loans, books = [], students = [], onRefresh, personelName, resetSearch = false, filterVariant = "full", onAddNotification }: Props) => {
  // NOT: Dinamik ceza puanı hesaplama kaldırıldı
  // Ceza puanı sadece backend'deki değer olarak gösterilir
  // Teslim alındığında backend'de gecikme gün sayısı kadar ceza puanı eklenir ve kalıcı olur

  // Yardımcı tarih fonksiyonu - 00:00 bazlı
  const getDaysDiff = (dueDateStr: string | Date) => {
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Ad karşılaştırmalarında tutarlılık için normalize et
  const normalizePersonName = (value?: string | number | null): string => {
    if (value === undefined || value === null) return "";
    return value
      .toString()
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  };

  const buildStudentCandidateNames = (
    studentDisplayName: string,
    studentData?: StudentStat | null
  ): Set<string> => {
    const candidates = new Set<string>();
    const normalizedDisplay = normalizePersonName(studentDisplayName);
    if (normalizedDisplay) candidates.add(normalizedDisplay);

    if (studentData) {
      if (studentData.name) candidates.add(normalizePersonName(studentData.name));
      if (studentData.surname) candidates.add(normalizePersonName(studentData.surname));
      const combined = normalizePersonName(
        `${studentData.name ?? ""} ${studentData.surname ?? ""}`.trim()
      );
      if (combined) candidates.add(combined);
    }

    return candidates;
  };

  // Dinamik gecikmiş kitap sayısı hesaplama fonksiyonu
  const calculateDynamicLateCount = useMemo(() => {
    return (studentName: string, studentData?: StudentStat | null): number => {
      const candidates = buildStudentCandidateNames(studentName, studentData);
      if (candidates.size === 0) return 0;

      // DÜZELTME: Kitap künyesi olmasa bile loan kaydı varsa sayılmalı
      const validLoans = loans.filter((l) => {
        const borrower = normalizePersonName(l.borrower);
        return borrower && candidates.has(borrower);
      });

      return validLoans.filter(loan => {
        // Geciken kontrolü: gün farkı negatifse gecikmiştir
        return getDaysDiff(loan.dueDate) < 0;
      }).length;
    };
  }, [loans]);

  const getLoanItemId = (loan: LoanInfo) => {
    return `${loan.bookId}|||${loan.borrower}|||${loan.dueDate}`;
  };

  const [selectedStudent, setSelectedStudent] = useState<StudentStat | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedAuthor, setSelectedAuthor] = useState<string>("");
  const [selectedLoan, setSelectedLoan] = useState<LoanInfo | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showBookDetailModal, setShowBookDetailModal] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showBookCatalogModal, setShowBookCatalogModal] = useState(false);
  const [selectedBookForCatalog, setSelectedBookForCatalog] = useState<Book | null>(null);
  const [extendDays, setExtendDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkEditError, setBulkEditError] = useState<string | null>(null);
  const [actionModalError, setActionModalError] = useState<string | null>(null);
  const [borrowModalError, setBorrowModalError] = useState<string | null>(null);
  const [columnSort, setColumnSort] = useState<string | null>(null);
  const [columnSortDirection, setColumnSortDirection] = useState<"asc" | "desc">("asc");

  const quantityFilterOptions = useMemo(() => {
    const loanCountsByBook = new Map<string, number>();
    loans.forEach(loan => {
      const count = loanCountsByBook.get(loan.bookId) || 0;
      loanCountsByBook.set(loan.bookId, count + 1);
    });

    const allCounts = Array.from(loanCountsByBook.values());
    const totalCount = loanCountsByBook.size;
    const count1 = allCounts.filter(c => c === 1).length;
    const count2_3 = allCounts.filter(c => c >= 2 && c <= 3).length;
    const count4_7 = allCounts.filter(c => c >= 4 && c <= 7).length;
    const count8_14 = allCounts.filter(c => c >= 8 && c <= 14).length;
    const count15plus = allCounts.filter(c => c >= 15).length;

    return [
      { label: "Tümü", value: "", color: "#6b7280", bgColor: "#eff6ff", textColor: "#374151", borderColor: "#bfdbfe", count: totalCount },
      { label: "1 Adet", value: "1", color: "#ef4444", bgColor: "#fef2f2", textColor: "#991b1b", count: count1 },
      { label: "2-3 Adet", value: "2-3", color: "#f59e0b", bgColor: "#fffbeb", textColor: "#92400e", count: count2_3 },
      { label: "4-7 Adet", value: "4-7", color: "#3b82f6", bgColor: "#eff6ff", textColor: "#1e40af", count: count4_7 },
      { label: "8-14 Adet", value: "8-14", color: "#10b981", bgColor: "#f0fdf4", textColor: "#065f46", count: count8_14 },
      { label: "15+ Adet", value: "15plus", color: "#8b5cf6", bgColor: "#f5f3ff", textColor: "#6d28d9", count: count15plus },
    ];
  }, [loans]);
  const lateCount = useMemo(() => loans.filter(loan => getDaysDiff(loan.dueDate) < 0).length, [loans]);
  const [maxBorrowLimit, setMaxBorrowLimit] = useState(5);
  const [maxPenaltyPoints, setMaxPenaltyPoints] = useState(100);

  // Sistem ayarlarını yükle
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const response = await httpClient.get<{ maxBorrowLimit: number; maxPenaltyPoints: number }>("/system-settings");
        setMaxBorrowLimit(response.maxBorrowLimit ?? 5);
        setMaxPenaltyPoints(response.maxPenaltyPoints ?? 100);
      } catch (error) {
        console.error("Sistem ayarları yüklenemedi:", error);
      }
    };
    loadSystemSettings();
  }, []);
  const [selectionMode, setSelectionMode] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageInputValue, setPageInputValue] = useState<string>("");
  const [showBorrowInfo, setShowBorrowInfo] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [borrowBookSearchTerm, setBorrowBookSearchTerm] = useState("");
  const [borrowStudentSearchTerm, setBorrowStudentSearchTerm] = useState("");
  const [selectedBorrowBooks, setSelectedBorrowBooks] = useState<Book[]>([]);
  const [selectedBorrowStudent, setSelectedBorrowStudent] = useState<string>("");
  const [borrowDays, setBorrowDays] = useState(14);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<string | null>(null);
  const [bulkEditValue, setBulkEditValue] = useState<string>("");
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<string>>(new Set());
  const [extendingLoan, setExtendingLoan] = useState<LoanInfo | null>(null);
  const [showLoanDeleteConfirm, setShowLoanDeleteConfirm] = useState(false);
  const [loanDeleteData, setLoanDeleteData] = useState<{ items: LoanDeleteItem[]; selectedItems: Set<string> } | null>(null);
  const [loanDeleteLoading, setLoanDeleteLoading] = useState(false);

  // Bilgilendirme kartı state'leri
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [infoCardData, setInfoCardData] = useState<{ title: string; message: string; type: "info" | "success" | "warning" | "error"; icon?: string } | null>(null);

  const [studentHistory, setStudentHistory] = useState<StudentHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedStudent) {
      setStudentHistory(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }

    const borrowerName = `${selectedStudent.name} ${selectedStudent.surname}`.trim() || selectedStudent.name;
    const query: Record<string, string | number | undefined> = {
      studentNumber: selectedStudent.studentNumber,
      borrower: borrowerName || undefined,
    };

    // Eğer geçici nesne ise ve sadece isim varsa, sadece borrower ile ara
    if (selectedStudent.name && !selectedStudent.studentNumber) {
      query.studentNumber = undefined;
      query.borrower = selectedStudent.name;
    }

    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);

    httpClient
      .get<StudentHistoryResponse>("/statistics/student-history", query)
      .then((response) => {
        if (!cancelled) {
          setStudentHistory(response);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : "Geçmiş istatistikler yüklenemedi");
          setStudentHistory(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStudent]);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [loanToReturn, setLoanToReturn] = useState<LoanInfo | null>(null);
  const [returnLoading, setReturnLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // InfoCard helper fonksiyonu
  const showInfo = (title: string, message: string, type: "info" | "success" | "warning" | "error" = "info", icon?: string) => {
    setInfoCardData({ title, message, type, icon });
    setShowInfoCard(true);
  };

  const isSearchOnly = filterVariant === "search-only";
  const isCompact = filterVariant === "compact" || isSearchOnly;
  const filterFieldContainerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: "0 0 160px",
    minWidth: "160px",
    maxWidth: "160px",
  };
  const filterControlWrapperStyle: CSSProperties = {
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  };
  const filterSelectStyle: CSSProperties = {
    width: "100%",
    padding: "8px",
    borderRadius: "6px",
    border: "1px solid #e5e7eb",
    backgroundColor: "#fff",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    overflow: "hidden",
  };
  const hasUnavailableBorrowSelection = selectedBorrowBooks.some(
    (book) => book.quantity <= 0 || (book.healthyCount ?? 0) <= 0
  );
  const isBorrowSubmissionDisabled =
    loading || selectedBorrowBooks.length === 0 || !selectedBorrowStudent || hasUnavailableBorrowSelection;

  // Arama-kutusu modunda diğer filtreleri sıfırla
  useEffect(() => {
    if (isSearchOnly) {
      setSelectedCategory("");
      setStatusFilter("");
    }
  }, [isSearchOnly]);

  // Sekme değiştiğinde filtrelemeleri sıfırla
  useEffect(() => {
    if (resetSearch) {
      setSearchTerm("");
      setSelectedCategory("");
      setSelectedAuthor("");
      setStatusFilter("");
    }
  }, [resetSearch]);

  // Hata mesajlarını 5 saniye sonra otomatik temizle
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (bulkEditError) {
      const timer = setTimeout(() => {
        setBulkEditError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [bulkEditError]);

  useEffect(() => {
    if (actionModalError) {
      const timer = setTimeout(() => {
        setActionModalError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [actionModalError]);

  useEffect(() => {
    if (borrowModalError) {
      const timer = setTimeout(() => {
        setBorrowModalError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [borrowModalError]);

  // Tüm kategorileri çıkar
  const categories = useMemo(() => {
    const cats = new Set(loans.map(l => l.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [loans]);

  const authors = useMemo(() => {
    const auths = new Set(loans.map(l => l.author).filter(Boolean));
    return Array.from(auths).sort((a, b) => a.localeCompare(b, "tr"));
  }, [loans]);

  // Ödünç verme için mevcut kitaplar
  const availableBooksForBorrow = useMemo(() => {
    return books.filter(b => b.quantity > 0 && (b.healthyCount ?? 0) > 0);
  }, [books]);

  // Filtrelenmiş kitaplar (ödünç verme için)
  const filteredBorrowBooks = useMemo(() => {
    if (!borrowBookSearchTerm || !borrowBookSearchTerm.trim()) return availableBooksForBorrow;
    return availableBooksForBorrow.filter(
      (book) =>
        searchIncludes(book.title, borrowBookSearchTerm) ||
        searchIncludes(book.author, borrowBookSearchTerm) ||
        searchIncludes(book.category, borrowBookSearchTerm) ||
        searchIncludes(book.shelf, borrowBookSearchTerm) ||
        searchIncludes(book.publisher, borrowBookSearchTerm) ||
        searchIncludes(book.summary, borrowBookSearchTerm) ||
        searchIncludes(book.bookNumber, borrowBookSearchTerm) ||
        searchIncludes(book.year, borrowBookSearchTerm) ||
        searchIncludes(book.pageCount, borrowBookSearchTerm)
    );
  }, [availableBooksForBorrow, borrowBookSearchTerm]);

  // Filtrelenmiş öğrenciler (ödünç verme için)
  const filteredBorrowStudents = useMemo(() => {
    if (!borrowStudentSearchTerm || !borrowStudentSearchTerm.trim()) return students;
    return students.filter((student) =>
      searchIncludes(student.name, borrowStudentSearchTerm) ||
      searchIncludes(student.surname, borrowStudentSearchTerm) ||
      searchIncludes(`${student.name} ${student.surname}`.trim(), borrowStudentSearchTerm) ||
      searchIncludes(student.studentNumber, borrowStudentSearchTerm) ||
      searchIncludes(student.class, borrowStudentSearchTerm) ||
      searchIncludes(student.branch, borrowStudentSearchTerm) ||
      (student.class && student.branch && searchIncludes(`${student.class}-${student.branch}`, borrowStudentSearchTerm)) ||
      (student.class && student.branch && searchIncludes(`${student.class}${student.branch}`, borrowStudentSearchTerm))
    );
  }, [students, borrowStudentSearchTerm]);

  // Öğrencinin zaten aldığı kitapları filtrele ve sadece sağlam kitapları döndür
  const getAvailableBooks = (booksToCheck: Book[], studentName: string): Book[] => {
    const isBorrowable = (book: Book) => book.quantity > 0 && (book.healthyCount ?? 0) > 0;
    const studentData =
      students.find(
        (s) =>
          `${s.name} ${s.surname}`.trim() === studentName ||
          s.name === studentName ||
          s.surname === studentName
      ) ?? null;
    const candidates = buildStudentCandidateNames(studentName, studentData);
    return booksToCheck.filter(book => {
      // Öğrencinin bu kitabı zaten ödünç alıp almadığını kontrol et
      const alreadyBorrowed = loans.some(
        (loan) =>
          loan.bookId === book.id &&
          candidates.has(normalizePersonName(loan.borrower))
      );
      return !alreadyBorrowed && isBorrowable(book);
    });
  };

  // Aynı kitabı grupla (bookId'ye göre)
  const groupedLoans = useMemo(() => {
    const groups = new Map<string, LoanInfo[]>();
    loans.forEach(loan => {
      const key = loan.bookId;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(loan);
    });
    return groups;
  }, [loans]);

  // Gruplanmış ödünçler (her kitap için tek satır)
  const groupedLoanList = useMemo(() => {
    return Array.from(groupedLoans.entries()).map(([bookId, loanList]) => {
      // İlk ödünç kaydını temel al (tüm kayıtlar aynı kitap için)
      const firstLoan = loanList[0];
      // En erken bitiş tarihini bul
      const earliestDueDate = loanList.reduce((earliest, loan) =>
        new Date(loan.dueDate) < new Date(earliest.dueDate) ? loan : earliest
      );
      // En az kalan günü bul (DÜZELTME: getDaysDiff ile 00:00 bazlı)
      const minRemainingDays = Math.min(...loanList.map(l => getDaysDiff(l.dueDate)));

      // Gecikmiş var mı kontrol et (DÜZELTME: diff < 0)
      const hasLate = loanList.some(l => getDaysDiff(l.dueDate) < 0);

      // Yakında dolacak var mı kontrol et (gecikenler hariç)
      // DÜZELTME: 0-3 gün arası (bugün dahil)
      const hasWarning = loanList.some(l => {
        const days = getDaysDiff(l.dueDate);
        return !hasLate && days >= 0 && days <= 3;
      });

      // Öğrenci ad-soyadlarını bul
      const borrowerNames = loanList.map(loan => {
        const student = students.find(s =>
          s.name === loan.borrower ||
          `${s.name} ${s.surname}`.trim() === loan.borrower ||
          s.surname === loan.borrower
        );
        return student ? `${student.name} ${student.surname}`.trim() : loan.borrower;
      });

      return {
        bookId,
        title: firstLoan.title,
        author: firstLoan.author,
        category: firstLoan.category,
        loanCount: loanList.length,
        allLoans: loanList,
        earliestDueDate: earliestDueDate.dueDate,
        minRemainingDays,
        hasLate,
        hasWarning,
        borrowerNames,
      };
    });
  }, [groupedLoans, students]);

  // Filtrelenmiş ve sıralanmış ödünçler
  const filteredLoans = useMemo(() => {
    // Her zaman loans'tan başla - state güncellemelerini garantile
    let filtered = [...loans];

    // Metin araması - boş string kontrolü (tüm künye bilgileri dahil)
    if (searchTerm && searchTerm.trim()) {
      filtered = filtered.filter((loan) => {
        const diff = getDaysDiff(loan.dueDate);
        // Geciken kontrolü: gün farkı negatif
        const isLate = diff < 0;
        // Temel bilgiler
        const statusText = isLate
          ? "gecikmiş gecikme süresi doldu"
          : diff >= 0 && diff <= 3
            ? "yakında uyarı"
            : "normal";
        if (searchIncludes(loan.title, searchTerm) ||
          searchIncludes(loan.author, searchTerm) ||
          searchIncludes(loan.borrower, searchTerm) ||
          searchIncludes(loan.category, searchTerm) ||
          searchIncludes(loan.personel, searchTerm) ||
          searchIncludes(statusText, searchTerm)) {
          return true;
        }

        // Kitap künye bilgilerini kontrol et
        const book = books.find(b => b.id === loan.bookId);
        if (book) {
          if (searchIncludes(book.shelf, searchTerm) ||
            searchIncludes(book.publisher, searchTerm) ||
            searchIncludes(book.summary, searchTerm) ||
            searchIncludes(book.bookNumber, searchTerm) ||
            searchIncludes(book.year, searchTerm) ||
            searchIncludes(book.pageCount, searchTerm) ||
            searchIncludes(book.category, searchTerm)) {
            return true;
          }
        }

        return false;
      });
    }

    // Kategori filtresi (yalnızca tam filtrede)
    if (!isCompact && selectedCategory) {
      filtered = filtered.filter(loan => loan.category === selectedCategory);
    }

    // Durum filtresi (arama dışında kullanılmıyor) - adet aralıklarına göre
    if (statusFilter && !isSearchOnly) {
      if (statusFilter === "late") {
        // Gecikenler: diff < 0
        filtered = filtered.filter(loan => getDaysDiff(loan.dueDate) < 0);
      } else {
        // Adet aralıklarına göre filtrele
        const loanCountsByBook = new Map<string, number>();
        loans.forEach(l => {
          const count = loanCountsByBook.get(l.bookId) || 0;
          loanCountsByBook.set(l.bookId, count + 1);
        });

        if (statusFilter === "1") {
          filtered = filtered.filter(loan => loanCountsByBook.get(loan.bookId) === 1);
        } else if (statusFilter === "2-3") {
          filtered = filtered.filter(loan => {
            const count = loanCountsByBook.get(loan.bookId) || 0;
            return count >= 2 && count <= 3;
          });
        } else if (statusFilter === "4-7") {
          filtered = filtered.filter(loan => {
            const count = loanCountsByBook.get(loan.bookId) || 0;
            return count >= 4 && count <= 7;
          });
        } else if (statusFilter === "8-14") {
          filtered = filtered.filter(loan => {
            const count = loanCountsByBook.get(loan.bookId) || 0;
            return count >= 8 && count <= 14;
          });
        } else if (statusFilter === "15plus") {
          filtered = filtered.filter(loan => {
            const count = loanCountsByBook.get(loan.bookId) || 0;
            return count >= 15;
          });
        }
      }
    }

    // Varsayılan sıralama: en az kalan güne göre (gecikmişler önce)
    if (!isCompact) {
      filtered = [...filtered].sort((a, b) => {
        const diffA = getDaysDiff(a.dueDate);
        const diffB = getDaysDiff(b.dueDate);
        const aIsLate = diffA < 0;
        const bIsLate = diffB < 0;
        // Önce gecikmişleri göster
        if (aIsLate && !bIsLate) return -1;
        if (!aIsLate && bIsLate) return 1;
        // Sonra kalan güne göre sırala
        return diffA - diffB;
      });
    }

    return filtered;
  }, [loans, books, searchTerm, selectedCategory, statusFilter, isCompact, isSearchOnly]);

  // Gruplanmış ödünçleri filtrele
  const filteredGroupedLoans = useMemo(() => {
    let filtered = [...groupedLoanList];

    // Metin araması
    if (searchTerm && searchTerm.trim()) {
      filtered = filtered.filter((group) => {
        if (searchIncludes(group.title, searchTerm) ||
          searchIncludes(group.author, searchTerm) ||
          searchIncludes(group.category, searchTerm)) {
          return true;
        }

        // Öğrenci bilgilerini kontrol et
        if (group.allLoans && group.allLoans.some(loan => {
          if (searchIncludes(loan.borrower, searchTerm) ||
            searchIncludes(loan.personel, searchTerm)) {
            return true;
          }
          return false;
        })) {
          return true;
        }

        // Kitap künye bilgilerini kontrol et
        const book = books.find(b => b.id === group.bookId);
        if (book) {
          if (searchIncludes(book.shelf, searchTerm) ||
            searchIncludes(book.publisher, searchTerm) ||
            searchIncludes(book.summary, searchTerm) ||
            searchIncludes(book.bookNumber, searchTerm) ||
            searchIncludes(book.year, searchTerm) ||
            searchIncludes(book.pageCount, searchTerm) ||
            searchIncludes(book.category, searchTerm)) {
            return true;
          }
        }

        return false;
      });
    }

    // Kategori filtresi
    if (!isCompact && selectedCategory) {
      filtered = filtered.filter(group => group.category === selectedCategory);
    }

    // Yazar filtresi
    if (!isCompact && selectedAuthor) {
      filtered = filtered.filter(group => group.author === selectedAuthor);
    }

    // Durum filtresi (adet aralıklarına göre)
    if (statusFilter && !isSearchOnly) {
      if (statusFilter === "late") {
        filtered = filtered.filter(group => group.hasLate);
      } else if (statusFilter === "1") {
        filtered = filtered.filter(group => group.loanCount === 1);
      } else if (statusFilter === "2-3") {
        filtered = filtered.filter(group => group.loanCount >= 2 && group.loanCount <= 3);
      } else if (statusFilter === "4-7") {
        filtered = filtered.filter(group => group.loanCount >= 4 && group.loanCount <= 7);
      } else if (statusFilter === "8-14") {
        filtered = filtered.filter(group => group.loanCount >= 8 && group.loanCount <= 14);
      } else if (statusFilter === "15plus") {
        filtered = filtered.filter(group => group.loanCount >= 15);
      }
    }

    // Varsayılan sıralama: en az kalan güne göre (gecikmişler önce)
    if (!isCompact) {
      filtered = [...filtered].sort((a, b) => {
        if (a.hasLate && !b.hasLate) return -1;
        if (!a.hasLate && b.hasLate) return 1;
        return a.minRemainingDays - b.minRemainingDays;
      });
    }

    // Sütun başlığına tıklama sıralaması
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
          case "borrower":
            // İlk öğrenci adına göre sırala
            const borrowerA = a.borrowerNames && a.borrowerNames.length > 0
              ? a.borrowerNames[0].toLowerCase()
              : "";
            const borrowerB = b.borrowerNames && b.borrowerNames.length > 0
              ? b.borrowerNames[0].toLowerCase()
              : "";
            compare = borrowerA.localeCompare(borrowerB, "tr", { sensitivity: "base" });
            break;
          case "quantity":
            const bookA = books.find(book => book.id === a.bookId);
            const bookB = books.find(book => book.id === b.bookId);
            const availableQuantityA = bookA ? (bookA.totalQuantity || bookA.quantity || 0) - a.loanCount : 0;
            const availableQuantityB = bookB ? (bookB.totalQuantity || bookB.quantity || 0) - b.loanCount : 0;
            compare = availableQuantityA - availableQuantityB;
            break;
          case "earliestDueDate":
            compare = new Date(a.earliestDueDate).getTime() - new Date(b.earliestDueDate).getTime();
            break;
          default:
            compare = 0;
        }

        if (compare === 0 && columnSort !== "title") {
          compare = (a.title || "").localeCompare(b.title || "", "tr");
        }

        return columnSortDirection === "asc" ? compare : -compare;
      });
    }

    return filtered;
  }, [groupedLoanList, books, searchTerm, selectedCategory, selectedAuthor, statusFilter, columnSort, columnSortDirection, isCompact, isSearchOnly]);

  // Sayfalama hesapları
  const totalPages = Math.max(1, Math.ceil(filteredGroupedLoans.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedGroupedLoans = filteredGroupedLoans.slice(startIndex, startIndex + pageSize);

  // Filtreleme veya sıralama değiştiğinde ilk sayfaya dön
  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      setPage(1);
    }
  }, [searchTerm, selectedCategory, selectedAuthor, statusFilter, columnSort, columnSortDirection, totalPages, page]);

  // Sayfa numaraları oluştur
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage <= 4) {
        for (let i = 2; i <= 5; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push("...");
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
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

  const handleExtendLoan = async () => {
    if (!selectedLoan) return;

    setLoading(true);
    setActionModalError(null);
    try {
      // Önce mevcut kitabı geri al, sonra yeni süreyle tekrar ödünç ver
      // Bildirimler App.tsx'te veri değişikliklerinden otomatik olarak gönderilecek
      await httpClient.post(`/books/${selectedLoan.bookId}/return`, {
        borrower: selectedLoan.borrower,
        personelName,
      });

      // Yeni süreyle tekrar ödünç ver
      await httpClient.post(`/books/${selectedLoan.bookId}/borrow`, {
        borrower: selectedLoan.borrower,
        days: extendDays,
        personelName,
      });

      setShowActionModal(false);
      setSelectedLoan(null);
      setActionModalError(null);
      await onRefresh();
    } catch (err) {
      setActionModalError(err instanceof Error ? err.message : "Süre uzatma başarısız oldu");
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!selectedLoan) return;

    setLoanToReturn(selectedLoan);
    setShowReturnConfirm(true);
    setShowActionModal(false);
  };

  const executeReturn = async (loan: LoanInfo) => {
    setReturnLoading(true);
    try {
      await httpClient.post(`/books/${loan.bookId}/return`, {
        borrower: loan.borrower,
        personelName,
      });

      showInfo("Başarılı", `${loan.borrower} adlı öğrencinin kitabı teslim alındı`, "success", "✅");
      setShowActionModal(false);
      setSelectedLoan(null);
      setLoanToReturn(null);
      setShowReturnConfirm(false);
      await onRefresh();
    } catch (err) {
      showInfo("Hata", err instanceof Error ? err.message : "Teslim alma başarısız oldu", "error", "❌");
    } finally {
      setReturnLoading(false);
    }
  };

  const openLoanDeleteConfirm = () => {
    if (selectedBookIds.size === 0) {
      showInfo("Hata", "Önce bir kitap seçin", "error", "❌");
      return;
    }
    const loansToDelete = loans.filter((loan) => selectedBookIds.has(loan.bookId));
    if (loansToDelete.length === 0) {
      showInfo("Hata", "Seçilen kitaplara ait ödünç kaydı bulunamadı", "error", "❌");
      return;
    }

    const items: LoanDeleteItem[] = loansToDelete.map((loan) => ({
      id: getLoanItemId(loan),
      loan,
    }));

    setLoanDeleteData({
      items,
      selectedItems: new Set(items.map((item) => item.id)),
    });
    setShowLoanDeleteConfirm(true);
  };

  const cancelLoanDelete = () => {
    setShowLoanDeleteConfirm(false);
    setLoanDeleteData(null);
  };

  const confirmLoanDelete = async () => {
    if (!loanDeleteData) return;
    const selectedItems = loanDeleteData.items.filter((item) => loanDeleteData.selectedItems.has(item.id));
    if (selectedItems.length === 0) {
      showInfo("Hata", "Silmek için en az bir ödünç kaydı seçin", "error", "❌");
      return;
    }

    if (!personelName || personelName.trim() === "") {
      showInfo("Hata", "Personel adınızı girin", "error", "❌");
      return;
    }

    setShowLoanDeleteConfirm(false);
    setLoanDeleteData(null);
    await executeBulkDeleteLoans(selectedItems);
  };

  const executeBulkDeleteLoans = async (selectedItems: LoanDeleteItem[]) => {
    setLoanDeleteLoading(true);
    const deletedLoans: string[] = [];
    const errors: string[] = [];
    let successCount = 0;

    try {
      for (const item of selectedItems) {
        try {
          await httpClient.post(`/books/${item.loan.bookId}/return`, {
            borrower: item.loan.borrower,
            personelName: personelName.trim(),
          });
          deletedLoans.push(`${item.loan.title} - ${item.loan.borrower}`);
          successCount++;
        } catch (error: any) {
          const message = error instanceof Error ? error.message : error?.response?.data?.message;
          errors.push(`${item.loan.title} - ${item.loan.borrower}: ${message || "Silinemedi"}`);
        }
      }

      if (successCount > 0) {
        const message = successCount === 1
          ? `${deletedLoans[0]} silindi.`
          : `${successCount} ödünç kaydı silindi:\n${deletedLoans.map(l => `• ${l}`).join('\n')}`;
        const fullMessage = errors.length > 0
          ? `${message}\n\nHata alınan ödünçler:\n${errors.join('\n')}`
          : message;
        showInfo("Başarılı", fullMessage, "success", "✅");
        setSelectionMode(false);
        setSelectedBookIds(new Set());
        await onRefresh();
      } else if (errors.length > 0) {
        showInfo("Hata", errors.join('\n'), "error", "❌");
      }
    } finally {
      setLoanDeleteLoading(false);
    }
  };

  // Bilgi penceresi dışına tıklandığında kapat
  useEffect(() => {
    if (showBorrowInfo) {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-info-popover-borrow]') && !target.closest('[data-info-button-borrow]')) {
          setShowBorrowInfo(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showBorrowInfo]);

  return (
    <>
      <div className="card" style={{ position: "relative" }}>
        {/* Bilgi İkonu - Sağ Üst Köşe */}
        {!isSearchOnly && (
          <div style={{ position: "absolute", top: "16px", right: "16px", zIndex: 100 }}>
            <button
              data-info-button-borrow
              onClick={() => setShowBorrowInfo(!showBorrowInfo)}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "2px solid",
                borderColor: showBorrowInfo ? "#3b82f6" : "#fbbf24",
                background: showBorrowInfo ? "#eff6ff" : "#fef9e7",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                color: showBorrowInfo ? "#1d4ed8" : "#d97706",
                transition: "all 0.2s",
                fontWeight: 700,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                position: "relative",
                padding: 0,
              }}
              onMouseEnter={(e) => {
                if (!showBorrowInfo) {
                  e.currentTarget.style.backgroundColor = "#fef3c7";
                  e.currentTarget.style.borderColor = "#f59e0b";
                }
              }}
              onMouseLeave={(e) => {
                if (!showBorrowInfo) {
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
                stroke={showBorrowInfo ? "#1d4ed8" : "#d97706"}
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
            {showBorrowInfo && (
              <div
                data-info-popover-borrow
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
                        <line x1="8" y1="8" x2="16" y2="8"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                        <line x1="8" y1="16" x2="16" y2="16"></line>
                      </svg>
                      Ödünç Listesi İşlemleri
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                      <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px", flexShrink: 0 }}>
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                          <path d="M9 9l3 3 3-3"></path>
                        </svg>
                        <span><strong style={{ color: "#1e293b" }}>Ödünç Ver:</strong> "Ödünç Ver" butonuna tıklayarak yeni kitap ödünç verebilirsiniz.</span>
                      </p>
                      <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px", flexShrink: 0 }}>
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span><strong style={{ color: "#1e293b" }}>Teslim Al:</strong> Her ödünç kaydında "Teslim Al" butonu ile kitabı teslim alabilirsiniz. Geciken kitaplar teslim edildiğinde ceza puanı otomatik hesaplanır.</span>
                      </p>
                      <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px", flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span><strong style={{ color: "#1e293b" }}>Süre Uzat:</strong> "Süre Uzat" butonu ile ödünç süresini uzatabilirsiniz. Kitap önce teslim alınır, sonra yeni süreyle tekrar ödünç verilir.</span>
                      </p>
                      <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px", flexShrink: 0 }}>
                          <circle cx="11" cy="11" r="8"></circle>
                          <path d="M21 21l-4.35-4.35"></path>
                        </svg>
                        <span><strong style={{ color: "#1e293b" }}>Arama ve Filtreleme:</strong> Arama kutusu ile kitap, yazar, öğrenci, kategori veya Personel adına göre arama yapabilirsiniz.</span>
                      </p>
                      <div style={{ margin: "0 0 4px 0", padding: "10px 12px", borderRadius: "8px", backgroundColor: "#fef3c7", color: "#92400e", display: "flex", alignItems: "center", gap: "10px", fontWeight: 500 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="12" y1="16" x2="12" y2="12"></line>
                          <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                        Kitap müsait değilse veya sağlam nüshası yoksa, ödünç verme bölümünde listelenmeyecektir.
                      </div>
                      <p style={{ margin: 0, display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px", flexShrink: 0 }}>
                          <polyline points="9 11 12 14 22 4"></polyline>
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                        </svg>
                        <span><strong style={{ color: "#1e293b" }}>Seçim Modu:</strong> "Seç" butonu ile çoklu işlem yapabilirsiniz.</span>
                      </p>
                      <p style={{ margin: "8px 0 0 0", display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px", flexShrink: 0 }}>
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                          <line x1="12" y1="9" x2="12" y2="13"></line>
                          <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <span>
                          <strong style={{ color: "#ef4444" }}>Ceza Puanı:</strong>{" "}
                          Ceza puanı {maxPenaltyPoints} veya üzeri olan öğrenciler kitap alamaz. Geciken kitaplar teslim edildiğinde ceza puanı otomatik hesaplanır ve maksimum değer olarak kaydedilir.
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {isSearchOnly ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px", width: "100%" }}>
            <h2 style={{ margin: 0, textAlign: "center" }}>Ödünç Listesi</h2>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchTerm("");
                }
              }}
              placeholder="Kitap, yazar, öğrenci, kategori veya Personel ile ara..."
              style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
            />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px", width: "100%" }}>
            <h2 style={{ margin: 0, textAlign: "center" }}>Ödünç Listesi</h2>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchTerm("");
                  }
                }}
                placeholder="Kitap, yazar, öğrenci, kategori veya Personel ile ara..."
                style={{ flex: 1, minWidth: "200px", padding: "10px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
              />
              <button
                onClick={() => setShowBorrowModal(true)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#10b981",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "14px",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "6px", verticalAlign: "middle" }}>
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  <path d="M9 9l3 3 3-3"></path>
                </svg>
                Ödünç Ver
              </button>
              {!isSearchOnly && (
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
                    border: selectionMode ? "2px solid #2563eb" : "1px solid #e5e7eb",
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
              {showFilters ? "Filtreleme Seçeneklerini Gizle" : "Filtreleme Seçeneklerini Göster"}
            </button>
          </div>
        )}

        {/* Filtreleme ve Sıralama */}
        {isSearchOnly || !showFilters ? null : (
          <>
            {/* Renkli Filtre Butonları */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
                {quantityFilterOptions.map((filter) => (
                  <button
                    key={filter.value || "all"}
                    onClick={() => setStatusFilter(statusFilter === filter.value ? "" : filter.value)}
                    style={{
                      padding: "10px",
                      borderRadius: "8px",
                      border: statusFilter === filter.value ? (filter.value === "" ? `2px solid ${filter.bgColor}` : `2px solid ${filter.color}`) : "1px solid #e5e7eb",
                      background: statusFilter === filter.value ? filter.bgColor : "#fff",
                      cursor: "pointer",
                      fontWeight: 700,
                      color: statusFilter === filter.value ? filter.textColor : "#374151",
                      fontSize: "13px",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (statusFilter !== filter.value) {
                        e.currentTarget.style.backgroundColor = filter.bgColor;
                        e.currentTarget.style.borderColor = filter.color;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (statusFilter !== filter.value) {
                        e.currentTarget.style.backgroundColor = "#fff";
                        e.currentTarget.style.borderColor = "#e5e7eb";
                      }
                    }}
                  >
                    <div>{filter.label}</div>
                    <div style={{ fontSize: "11px", opacity: 0.8, marginTop: "2px" }}>
                      ({filter.count})
                    </div>
                  </button>
                ))}
                <button
                  key="late-filter"
                  onClick={() => setStatusFilter(statusFilter === "late" ? "" : "late")}
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    border: statusFilter === "late" ? "2px solid #fb923c" : "1px solid #e5e7eb",
                    background: statusFilter === "late" ? "rgba(251, 211, 184, 0.8)" : "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                    color: statusFilter === "late" ? "#c2410c" : "#374151",
                    fontSize: "13px",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (statusFilter !== "late") {
                      e.currentTarget.style.backgroundColor = "rgba(251, 211, 184, 0.8)";
                      e.currentTarget.style.borderColor = "#fb923c";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (statusFilter !== "late") {
                      e.currentTarget.style.backgroundColor = "#fff";
                      e.currentTarget.style.borderColor = "#e5e7eb";
                    }
                  }}
                >
                  <div>Gecikmiş</div>
                  <div style={{ fontSize: "11px", opacity: 0.8, marginTop: "2px" }}>
                    ({lateCount})
                  </div>
                </button>
              </div>
            </div>

            {/* Tam Filtreleme Modu */}
            {!isCompact && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", alignItems: "end", padding: "12px", backgroundColor: "#f8fafc", borderRadius: "8px", marginBottom: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Kategori</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                    title={selectedCategory || "Tümü"}
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
                    title={selectedAuthor || "Tümü"}
                  >
                    <option value="">Tümü</option>
                    {authors.map(author => (
                      <option key={author} value={author}>{author}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Adet Durumu</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", width: "100%" }}
                    title={statusFilter || "Tümü"}
                  >
                    {quantityFilterOptions.map((option) => (
                      <option key={option.value || "all"} value={option.value}>
                        {option.label} ({option.count})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  {(searchTerm || selectedCategory || selectedAuthor || statusFilter) && (
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedCategory("");
                        setSelectedAuthor("");
                        setStatusFilter("");
                        // Input'u da temizle
                        const input = document.querySelector('input[placeholder*="Kitap, yazar"]') as HTMLInputElement;
                        if (input) {
                          input.value = "";
                        }
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
            )}
          </>
        )}

        {selectionMode && selectedBookIds.size > 0 && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", padding: "12px", backgroundColor: "#f0f9ff", borderRadius: "8px", border: "1px solid #bae6fd", marginBottom: "16px" }}>
            <span style={{ fontWeight: 600, color: "#0369a1" }}>
              {selectedBookIds.size} kitap seçildi
            </span>
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
            <button
              onClick={openLoanDeleteConfirm}
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
          </div>
        )}

        <div style={{ marginBottom: "12px", fontSize: "14px", color: "#64748b" }}>
          Toplam <strong>{filteredGroupedLoans.length}</strong> kitap, <strong>{filteredLoans.length}</strong> ödünç kaydı gösteriliyor
        </div>

        {error && (
          <div style={{ padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px", marginBottom: "16px" }}>
            {error}
          </div>
        )}

        {filteredGroupedLoans.length === 0 ? (
          <p style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
            {searchTerm || selectedCategory || selectedAuthor || statusFilter
              ? "Arama kriterlerinize uygun ödünç kaydı bulunamadı."
              : "Şu an ödünçte kitap yok."}
          </p>
        ) : (
          <table className="book-table">
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
                  style={{ cursor: "pointer", userSelect: "none", width: "25%", minWidth: "180px", fontWeight: 600, fontSize: "14px" }}
                >
                  Kitap {columnSort === "title" && (columnSortDirection === "asc" ? "↑" : "↓")}
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
                  style={{ cursor: "pointer", userSelect: "none", width: "15%", minWidth: "120px", fontWeight: 600, fontSize: "14px" }}
                >
                  Yazar {columnSort === "author" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => {
                    if (columnSort === "borrower") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("borrower");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", width: "20%", minWidth: "150px", fontWeight: 600, fontSize: "14px" }}
                >
                  Öğrenci {columnSort === "borrower" && (columnSortDirection === "asc" ? "↑" : "↓")}
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
                  style={{ cursor: "pointer", userSelect: "none", width: "12%", minWidth: "100px", fontWeight: 600, fontSize: "14px" }}
                >
                  Adet {columnSort === "quantity" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th
                  onClick={() => {
                    if (columnSort === "earliestDueDate") {
                      setColumnSortDirection(columnSortDirection === "asc" ? "desc" : "asc");
                    } else {
                      setColumnSort("earliestDueDate");
                      setColumnSortDirection("asc");
                    }
                  }}
                  style={{ cursor: "pointer", userSelect: "none", width: "18%", minWidth: "150px", fontWeight: 600, fontSize: "14px" }}
                >
                  Teslim Tarihi {columnSort === "earliestDueDate" && (columnSortDirection === "asc" ? "↑" : "↓")}
                </th>
                {selectionMode && (
                  <th style={{ width: "30px", minWidth: "30px", maxWidth: "30px", textAlign: "center" }}>
                    <div
                      onClick={() => {
                        if (selectedBookIds.size === filteredGroupedLoans.length && filteredGroupedLoans.length > 0) {
                          setSelectedBookIds(new Set());
                        } else {
                          setSelectedBookIds(new Set(filteredGroupedLoans.map(g => g.bookId)));
                        }
                      }}
                      style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        border: selectedBookIds.size === filteredGroupedLoans.length && filteredGroupedLoans.length > 0 ? "2px solid #3b82f6" : "2px solid #cbd5e1",
                        background: selectedBookIds.size === filteredGroupedLoans.length && filteredGroupedLoans.length > 0 ? "#3b82f6" : "white",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                    >
                      {selectedBookIds.size === filteredGroupedLoans.length && filteredGroupedLoans.length > 0 && (
                        <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                      )}
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pagedGroupedLoans.map((group) => {
                const book = books.find(b => b.id === group.bookId);
                const availableQuantity = book ? (book.totalQuantity || book.quantity || 0) - group.loanCount : 0;
                const totalQuantity = book ? (book.totalQuantity || book.quantity || 0) : 0;
                const dueDate = new Date(group.earliestDueDate);

                return (
                  <tr
                    key={group.bookId}
                    style={{ cursor: selectionMode ? "default" : "pointer" }}
                    onClick={(e) => {
                      if (!selectionMode && !e.defaultPrevented) {
                        setSelectedBookId(group.bookId);
                        setShowBookDetailModal(true);
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (!selectionMode) {
                        e.currentTarget.style.backgroundColor = "#f0f9ff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <td style={{ width: "25%", minWidth: "180px" }}><strong>{group.title}</strong></td>
                    <td style={{ width: "15%", minWidth: "120px" }}>{group.author}</td>
                    <td style={{ width: "20%", minWidth: "150px" }}>
                      <div style={{ fontSize: "13px", color: "#1e293b", lineHeight: "1.4" }}>
                        {group.borrowerNames && group.borrowerNames.length > 0 ? (
                          group.borrowerNames.map((name, idx) => (
                            <div key={idx} style={{ marginBottom: idx < group.borrowerNames.length - 1 ? "4px" : "0" }}>
                              {name}
                            </div>
                          ))
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ width: "12%", minWidth: "100px" }}>
                      <span style={{
                        backgroundColor: availableQuantity <= 0 ? "#fee2e2" : availableQuantity <= 2 ? "#fef3c7" : "#d1fae5",
                        color: availableQuantity <= 0 ? "#dc2626" : availableQuantity <= 2 ? "#d97706" : "#059669",
                        padding: "4px 8px",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: 600
                      }}>
                        {availableQuantity} adet
                      </span>
                    </td>
                    <td style={{ width: "18%", minWidth: "150px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>
                        {dueDate.toLocaleDateString("tr-TR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </div>
                    </td>
                    {selectionMode && (
                      <td onClick={(e) => e.stopPropagation()} style={{ width: "30px", minWidth: "30px", maxWidth: "30px", textAlign: "center" }}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            const newSelected = new Set(selectedBookIds);
                            if (selectedBookIds.has(group.bookId)) {
                              newSelected.delete(group.bookId);
                            } else {
                              newSelected.add(group.bookId);
                            }
                            setSelectedBookIds(newSelected);
                          }}
                          style={{
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            border: selectedBookIds.has(group.bookId) ? "2px solid #3b82f6" : "2px solid #cbd5e1",
                            background: selectedBookIds.has(group.bookId) ? "#3b82f6" : "white",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s",
                          }}
                        >
                          {selectedBookIds.has(group.bookId) && (
                            <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Sayfalama */}
        {!isCompact && totalPages > 1 && (
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

              {getPageNumbers().map((pageNum, idx) => {
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
                      showInfo("Uyarı", `Lütfen 1 ile ${totalPages} arasında bir sayı girin.`, "warning", "⚠️");
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

            <div style={{ fontSize: "14px", color: "#64748b" }}>
              Sayfa {currentPage} / {totalPages} (Toplam {filteredGroupedLoans.length} kayıt)
            </div>
          </div>
        )}
      </div>

      {/* Kitap Detay Modalı */}
      {showBookDetailModal && selectedBookId && createPortal(
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
            cursor: "pointer",
          }}
          onClick={() => {
            setShowBookDetailModal(false);
            setSelectedBookId(null);
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              width: "800px",
              backgroundColor: "white",
              position: "relative",
              cursor: "default",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0 }}>Ödünç Listesi Detayı</h2>
              <button
                onClick={() => {
                  setShowBookDetailModal(false);
                  setSelectedBookId(null);
                }}
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

            {(() => {
              const bookLoans = loans.filter(l => l.bookId === selectedBookId);
              if (bookLoans.length === 0) return null;

              const firstLoan = bookLoans[0];
              const book = books.find(b => b.id === selectedBookId);
              const totalQuantity = book ? (book.totalQuantity || book.quantity || 0) : 0;
              const availableQuantity = totalQuantity - bookLoans.length;

              return (
                <div>
                  <div
                    onClick={() => {
                      if (book) {
                        setSelectedBookForCatalog(book);
                        setShowBookCatalogModal(true);
                      }
                    }}
                    style={{
                      marginBottom: "20px",
                      padding: "16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      cursor: book ? "pointer" : "default",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (book) {
                        e.currentTarget.style.backgroundColor = "#f0f9ff";
                        e.currentTarget.style.border = "1px solid #3b82f6";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (book) {
                        e.currentTarget.style.backgroundColor = "#f8fafc";
                        e.currentTarget.style.border = "none";
                      }
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "18px", marginBottom: "12px", color: "#1e293b" }}>{firstLoan.title}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Yazar</div>
                        <div style={{ fontWeight: 500, color: "#334155" }}>{firstLoan.author || "—"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Kategori</div>
                        <div style={{ fontWeight: 500, color: "#334155" }}>{firstLoan.category || "—"}</div>
                      </div>
                      {book && (
                        <>
                          {book.publisher && (
                            <div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Yayınevi</div>
                              <div style={{ fontWeight: 500, color: "#334155" }}>{book.publisher}</div>
                            </div>
                          )}
                          {book.year && (
                            <div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Yayın Yılı</div>
                              <div style={{ fontWeight: 500, color: "#334155" }}>{book.year}</div>
                            </div>
                          )}
                          {book.shelf && (
                            <div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Raf</div>
                              <div style={{ fontWeight: 500, color: "#334155" }}>{book.shelf}</div>
                            </div>
                          )}
                          {book.bookNumber && (
                            <div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Kitap Numarası</div>
                              <div style={{ fontWeight: 500, color: "#334155" }}>{book.bookNumber}</div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                        <div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Toplam Adet</div>
                          <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b" }}>{totalQuantity}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Ödünçte</div>
                          <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b" }}>{bookLoans.length} adet</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Mevcut</div>
                          <div style={{ fontWeight: 600, fontSize: "16px", color: availableQuantity <= 0 ? "#dc2626" : "#059669" }}>
                            {availableQuantity} adet
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <h3 style={{ marginBottom: "16px" }}>
                    Ödünç Verilen Öğrenciler ({bookLoans.length} adet):
                  </h3>
                  {bookLoans.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "#64748b" }}>
                      Bu kitap için ödünç kaydı bulunamadı.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {bookLoans
                        .sort((a, b) => {
                          // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
                          return getDaysDiff(a.dueDate) - getDaysDiff(b.dueDate);
                        })
                        .map((loan, index) => {
                          // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
                          const diff = getDaysDiff(loan.dueDate);
                          const isLate = diff < 0;
                          const remainingDays = diff;
                          const isWarning = !isLate && remainingDays >= 0 && remainingDays <= 3;
                          const student = students.find(s =>
                            s.name === loan.borrower ||
                            `${s.name} ${s.surname}`.trim() === loan.borrower ||
                            s.surname === loan.borrower
                          );

                          return (
                            <div
                              key={`${loan.bookId}-${loan.borrower}-${index}`}
                              onClick={() => {
                                // Öğrenci nesnesini bul veya oluştur
                                const foundStudent = students.find(s =>
                                  s.name === loan.borrower ||
                                  `${s.name} ${s.surname}`.trim() === loan.borrower ||
                                  s.surname === loan.borrower
                                );

                                if (foundStudent) {
                                  setSelectedStudent(foundStudent);
                                } else {
                                  // Eğer tam eşleşme bulunamazsa loan.borrower isminden geçici nesne oluştur
                                  setSelectedStudent({

                                    name: loan.borrower,
                                    surname: "",

                                    studentNumber: 0,
                                    class: 0,
                                    branch: "",
                                    borrowed: 0,
                                    returned: 0,
                                    late: 0,
                                    penaltyPoints: 0,
                                    isBanned: false
                                  });
                                }
                              }}
                              style={{
                                padding: "12px",
                                backgroundColor: "#f8fafc",
                                borderRadius: "8px",
                                border: "1px solid #e2e8f0",
                                cursor: "pointer",
                                transition: "all 0.2s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#f0f9ff";
                                e.currentTarget.style.borderColor = "#3b82f6";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "#f8fafc";
                                e.currentTarget.style.borderColor = "#e2e8f0";
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "16px", color: "#1e293b" }}>
                                    {loan.borrower}
                                  </div>
                                  {student && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                                      {student.studentNumber && (
                                        <div style={{ fontSize: "13px", color: "#64748b" }}>
                                          <strong>Numara:</strong> {student.studentNumber}
                                        </div>
                                      )}
                                      {(student.class || student.branch) && (
                                        <div style={{ fontSize: "13px", color: "#64748b" }}>
                                          <strong>Sınıf/Şube:</strong> {student.class ? `${student.class}` : "—"}{student.branch ? `/${student.branch}` : ""}
                                        </div>
                                      )}
                                      {(() => {
                                        const penaltyPoints = student.penaltyPoints || 0;
                                        return penaltyPoints > 0 && (
                                          <div style={{ fontSize: "13px", color: penaltyPoints >= maxPenaltyPoints ? "#ef4444" : "#f59e0b" }}>
                                            <strong>Ceza Puanı:</strong> {penaltyPoints}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                    <strong>Teslim Tarihi:</strong> {new Date(loan.dueDate).toLocaleDateString("tr-TR", {
                                      year: "numeric",
                                      month: "long",
                                      day: "numeric",
                                    })}
                                  </div>
                                  {loan.personel && (
                                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                                      <strong>Personel:</strong> {loan.personel}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }} onClick={(e) => e.stopPropagation()}>
                                  <div style={{
                                    padding: "4px 12px",
                                    borderRadius: "12px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    backgroundColor: isLate ? "#fee2e2" : isWarning ? "#fef3c7" : "#d1fae5",
                                    color: isLate ? "#dc2626" : isWarning ? "#d97706" : "#059669",
                                  }}>
                                    {isLate
                                      ? "Süresi Doldu"
                                      : remainingDays === 0
                                        ? "Bugün Son Gün"
                                        : `${remainingDays} gün kaldı`}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedLoan(loan);
                                      setShowActionModal(true);
                                    }}
                                    style={{
                                      padding: "6px 16px",
                                      fontSize: "12px",
                                      backgroundColor: "#3b82f6",
                                      color: "white",
                                      border: "none",
                                      borderRadius: "6px",
                                      cursor: "pointer",
                                      fontWeight: 600,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    İşlemler
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* İşlem Modal */}
      {showActionModal && selectedLoan && createPortal(
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
            zIndex: 10002,
            cursor: "pointer",
          }}
          onClick={() => {
            setShowActionModal(false);
            setSelectedLoan(null);
            setActionModalError(null);
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "500px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
              cursor: "default",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Başlık ve Kapat Butonu */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0 }}>İşlem Seçin</h2>
              <button
                onClick={() => {
                  setShowActionModal(false);
                  setSelectedLoan(null);
                  setActionModalError(null);
                }}
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
                  flexShrink: 0,
                  borderRadius: "6px",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#f1f5f9";
                  e.currentTarget.style.color = "#1e293b";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "#64748b";
                }}
              >
                ×
              </button>
            </div>

            {/* Kitap Bilgileri */}
            <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "16px", color: "#1e293b" }}>{selectedLoan.title}</div>
              <div style={{ fontSize: "14px", color: "#64748b", marginBottom: "4px" }}>
                Öğrenci: <strong style={{ color: "#334155" }}>{selectedLoan.borrower}</strong>
              </div>
              <div style={{ fontSize: "14px", color: "#64748b" }}>
                {(() => {
                  const diff = getDaysDiff(selectedLoan.dueDate);
                  return (
                    <span>
                      Kalan Gün: <strong style={{ color: diff <= 3 ? "#ef4444" : "#334155" }}>
                        {diff === 0 ? "Bugün Son Gün" : `${diff} gün`}
                      </strong>
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Hata Mesajı */}
            {actionModalError && (
              <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px", border: "1px solid #fecaca" }}>
                {actionModalError}
              </div>
            )}

            {/* İşlem Butonları */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Süre Uzatma Bölümü */}
              <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <label style={{ display: "block", marginBottom: "12px", fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                  Süre Uzatma (Gün)
                </label>
                <select
                  value={extendDays}
                  onChange={(e) => setExtendDays(parseInt(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "14px",
                    marginBottom: "12px",
                    backgroundColor: "#fff"
                  }}
                >
                  <option value={7}>7 Gün</option>
                  <option value={14}>14 Gün</option>
                  <option value={21}>21 Gün</option>
                  <option value={30}>30 Gün</option>
                </select>
                <button
                  onClick={handleExtendLoan}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: loading ? "#9ca3af" : "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) {
                      e.currentTarget.style.backgroundColor = "#2563eb";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading) {
                      e.currentTarget.style.backgroundColor = "#3b82f6";
                    }
                  }}
                >
                  {loading ? (
                    "İşleniyor..."
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      Süre Uzat
                    </>
                  )}
                </button>
              </div>

              {/* Teslim Al Butonu */}
              <button
                onClick={handleReturn}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: loading ? "#9ca3af" : "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#059669";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#10b981";
                  }
                }}
              >
                {loading ? (
                  "İşleniyor..."
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Teslim Al
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Ödünç Verme Modal */}
      {showBorrowModal && createPortal(
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
            zIndex: 10000,
          }}
          onClick={() => {
            setShowBorrowModal(false);
            setBorrowModalError(null);
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "800px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  <path d="M9 9l3 3 3-3"></path>
                </svg>
                Kitap Ödünç Verme
              </h2>
              <button
                onClick={() => {
                  setShowBorrowModal(false);
                  setSelectedBorrowBooks([]);
                  setSelectedBorrowStudent("");
                  setBorrowBookSearchTerm("");
                  setBorrowStudentSearchTerm("");
                  setBorrowModalError(null);
                }}
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

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Kitap Seçimi */}
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                  Kitap Ara ve Seç *
                </label>
                <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
                  Not: Sağlam kopyası olmayan kitaplar aramada listelenmez.
                </div>
                <input
                  type="text"
                  value={borrowBookSearchTerm}
                  onChange={(e) => setBorrowBookSearchTerm(e.target.value)}
                  placeholder="Kitap adı, yazar veya kategori ile ara..."
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                />
                {borrowBookSearchTerm && (
                  <div style={{
                    marginTop: "8px",
                    maxHeight: "300px",
                    overflowY: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "white",
                  }}>
                    {filteredBorrowBooks.length > 0 ? (
                      filteredBorrowBooks
                        .filter(book => !selectedBorrowBooks.some(selected => selected.id === book.id))
                        .map((book) => {
                          const healthyCount = book.healthyCount ?? 0;
                          const healthyColor = healthyCount > 1 ? "#059669" : healthyCount === 1 ? "#d97706" : "#dc2626";
                          const alreadyBorrowed = !!selectedBorrowStudent && (() => {
                            const studentData =
                              students.find(
                                (s) =>
                                  `${s.name} ${s.surname}`.trim() === selectedBorrowStudent ||
                                  s.name === selectedBorrowStudent ||
                                  s.surname === selectedBorrowStudent
                              ) ?? null;
                            const candidates = buildStudentCandidateNames(selectedBorrowStudent, studentData);
                            return loans.some(
                              (loan) =>
                                loan.bookId === book.id &&
                                candidates.has(normalizePersonName(loan.borrower))
                            );
                          })();

                          return (
                            <div
                              key={book.id}
                              onClick={() => {
                                if (!selectedBorrowBooks.some(selected => selected.id === book.id)) {
                                  setSelectedBorrowBooks([...selectedBorrowBooks, book]);
                                  setBorrowBookSearchTerm("");
                                }
                              }}
                              style={{
                                padding: "12px",
                                cursor: "pointer",
                                borderBottom: "1px solid #f3f4f6",
                                backgroundColor: alreadyBorrowed ? "#f3f4f6" : "white",
                                opacity: alreadyBorrowed ? 0.7 : 1,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = alreadyBorrowed ? "#e5e7eb" : "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = alreadyBorrowed ? "#f3f4f6" : "white";
                              }}
                            >
                              <div style={{ fontWeight: 600, marginBottom: "4px", color: alreadyBorrowed ? "#6b7280" : "#1f2937" }}>
                                {book.title}
                                {alreadyBorrowed && <span style={{ marginLeft: "8px", fontSize: "11px", color: "#dc2626", fontWeight: 600 }}>⚠️ Zaten ödünçte</span>}
                              </div>
                              <div style={{ fontSize: "14px", color: alreadyBorrowed ? "#9ca3af" : "#6b7280", marginBottom: "4px" }}>
                                {book.author} • {book.category}
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#475569",
                                  display: "flex",
                                  gap: "12px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span>Mevcut Adet: {book.quantity}</span>
                                <span style={{ color: healthyColor, fontWeight: 600 }}>
                                  Sağlam Mevcut: {healthyCount}
                                </span>
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
                        Arama sonucu bulunamadı
                      </div>
                    )}
                  </div>
                )}
                {selectedBorrowBooks.length > 0 && (
                  <div style={{
                    marginTop: "8px",
                    padding: "12px",
                    backgroundColor: "#eff6ff",
                    borderRadius: "8px",
                    border: "1px solid #3b82f6",
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "14px" }}>
                      Seçilen Kitaplar ({selectedBorrowBooks.length}):
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {selectedBorrowBooks.map((book) => {
                        const healthyCount = book.healthyCount ?? 0;
                        const healthyColor = healthyCount > 1 ? "#059669" : healthyCount === 1 ? "#d97706" : "#dc2626";
                        const isOutOfStock = book.quantity <= 0;
                        const showAvailabilityWarning = isOutOfStock || healthyCount <= 0;
                        // Öğrencinin bu kitabı zaten ödünç alıp almadığını kontrol et
                        const alreadyBorrowed = !!selectedBorrowStudent && (() => {
                          const studentData =
                            students.find(
                              (s) =>
                                `${s.name} ${s.surname}`.trim() === selectedBorrowStudent ||
                                s.name === selectedBorrowStudent ||
                                s.surname === selectedBorrowStudent
                            ) ?? null;
                          const candidates = buildStudentCandidateNames(selectedBorrowStudent, studentData);
                          return loans.some(
                            (loan) =>
                              loan.bookId === book.id &&
                              candidates.has(normalizePersonName(loan.borrower))
                          );
                        })();
                        const cardBackground = alreadyBorrowed || showAvailabilityWarning ? "#f3f4f6" : "white";
                        const cardBorder = alreadyBorrowed || showAvailabilityWarning ? "1px solid #9ca3af" : "1px solid #dbeafe";

                        return (
                          <div
                            key={book.id}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              padding: "8px",
                              backgroundColor: cardBackground,
                              borderRadius: "6px",
                              border: cardBorder,
                              opacity: alreadyBorrowed || showAvailabilityWarning ? 0.8 : 1,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{
                                  fontWeight: 600,
                                  fontSize: "13px",
                                  color: alreadyBorrowed ? "#6b7280" : "#1f2937"
                                }}>
                                  {book.title}
                                </div>
                                <div style={{ fontSize: "12px", color: alreadyBorrowed ? "#9ca3af" : "#6b7280" }}>
                                  {book.author} • {book.category}
                                </div>
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "#475569",
                                    display: "flex",
                                    gap: "12px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span>Mevcut Adet: {book.quantity}</span>
                                  <span style={{ color: healthyColor, fontWeight: 600 }}>
                                    Sağlam Mevcut: {healthyCount}
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedBorrowBooks(selectedBorrowBooks.filter(b => b.id !== book.id));
                                }}
                                style={{
                                  padding: "4px 12px",
                                  fontSize: "12px",
                                  backgroundColor: "#ef4444",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontWeight: 600,
                                  marginLeft: "8px",
                                }}
                              >
                                Kaldır
                              </button>
                            </div>
                            {alreadyBorrowed && (
                              <div style={{
                                padding: "6px 10px",
                                backgroundColor: "#fee2e2",
                                borderRadius: "4px",
                                fontSize: "12px",
                                color: "#dc2626",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}>
                                <span>⚠️</span>
                                <span>Bu öğrenci zaten bu kitabı ödünç almış!</span>
                              </div>
                            )}
                            {healthyCount <= 0 && (
                              <div style={{
                                padding: "6px 10px",
                                backgroundColor: "#fef2f2",
                                borderRadius: "4px",
                                fontSize: "12px",
                                color: "#dc2626",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}>
                                <span>⚠️</span>
                                <span>Sağlam kopya kalmadı, ödünç verilemez.</span>
                              </div>
                            )}
                            {showAvailabilityWarning && (
                              <div style={{
                                padding: "6px 10px",
                                backgroundColor: "#fef2f2",
                                borderRadius: "4px",
                                fontSize: "12px",
                                color: "#dc2626",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}>
                                <span>⚠️</span>
                                <span>
                                  {isOutOfStock
                                    ? "Mevcut adet 0 olduğu için ödünç verilemez."
                                    : "Sağlam kopya kalmadı, ödünç verilemez."}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedBorrowBooks([]);
                      }}
                      style={{
                        marginTop: "8px",
                        padding: "6px 12px",
                        fontSize: "12px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontWeight: 600,
                        width: "100%",
                      }}
                    >
                      Tümünü Kaldır
                    </button>
                  </div>
                )}
              </div>

              {/* Öğrenci Seçimi */}
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                  Öğrenci Ara ve Seç *
                </label>
                <input
                  type="text"
                  value={borrowStudentSearchTerm}
                  onChange={(e) => setBorrowStudentSearchTerm(e.target.value)}
                  placeholder="Öğrenci adı, numara, sınıf veya şube ile ara..."
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                />
                {borrowStudentSearchTerm && (
                  <div style={{
                    marginTop: "8px",
                    maxHeight: "300px",
                    overflowY: "auto",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "white",
                  }}>
                    {filteredBorrowStudents.length > 0 ? (
                      filteredBorrowStudents.map((student) => {
                        const studentFullName = formatStudentFullName(student);
                        const candidates = buildStudentCandidateNames(studentFullName, student);
                        const studentValidLoans = loans.filter(
                          (l) =>
                            candidates.has(normalizePersonName(l.borrower)) &&
                            books.some((b) => b.id === l.bookId)
                        );
                        const normalizedCounters = normalizeStudentCounters(
                          student,
                          studentValidLoans.length,
                        );
                        return (
                          <div
                            key={studentFullName}
                            onClick={() => {
                              setSelectedBorrowStudent(studentFullName);
                              setBorrowStudentSearchTerm("");
                            }}
                            style={{
                              padding: "12px",
                              cursor: "pointer",
                              borderBottom: "1px solid #f3f4f6",
                              backgroundColor: selectedBorrowStudent === studentFullName ? "#eff6ff" : "white",
                              transition: "background-color 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              if (selectedBorrowStudent !== studentFullName) {
                                e.currentTarget.style.backgroundColor = "#f9fafb";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (selectedBorrowStudent !== studentFullName) {
                                e.currentTarget.style.backgroundColor = "white";
                              }
                            }}
                          >
                            <div style={{ fontWeight: 600, color: "#1f2937", marginBottom: "6px" }}>
                              {student.name} {student.surname}
                            </div>
                            <div style={{ fontSize: "12px", color: "#6b7280", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                              <span>
                                <strong>Ödünç:</strong> {normalizedCounters.borrowed}
                              </span>
                              <span>
                                <strong>İade:</strong> {normalizedCounters.returned}
                              </span>
                              <span>
                                <strong>Geciken:</strong>{" "}
                                {(() => {
                                  const dynamicLateCount = calculateDynamicLateCount(studentFullName, student);
                                  return (
                                    <span style={{ color: dynamicLateCount > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                                      {dynamicLateCount}
                                    </span>
                                  );
                                })()}
                              </span>
                              <span>
                                <strong>Aktif Ödünç:</strong>{" "}
                                {studentValidLoans.length}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
                        Arama sonucu bulunamadı
                      </div>
                    )}
                  </div>
                )}
                {selectedBorrowStudent && (
                  <div style={{
                    marginTop: "8px",
                    padding: "16px",
                    backgroundColor: "#eff6ff",
                    borderRadius: "8px",
                    border: "1px solid #3b82f6",
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: "12px", fontSize: "16px", color: "#1f2937" }}>
                      Seçilen Öğrenci: {selectedBorrowStudent}
                    </div>
                    {(() => {
                      const studentData =
                        students.find(
                          (s) =>
                            `${s.name} ${s.surname}`.trim() === selectedBorrowStudent ||
                            s.name === selectedBorrowStudent ||
                            s.surname === selectedBorrowStudent
                        ) ?? null;
                      if (!studentData) return null;
                      const candidates = buildStudentCandidateNames(selectedBorrowStudent, studentData);
                      const studentValidLoans = loans.filter(
                        (l) =>
                          candidates.has(normalizePersonName(l.borrower)) &&
                          books.some((b) => b.id === l.bookId)
                      );
                      const activeLoansCount = studentValidLoans.length;
                      const normalizedCounters = normalizeStudentCounters(studentData, activeLoansCount);
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                            <div style={{ fontSize: "14px" }}>
                              <strong>Toplam Ödünç:</strong> {normalizedCounters.borrowed}
                            </div>
                            <div style={{ fontSize: "14px" }}>
                              <strong>İade:</strong> {normalizedCounters.returned}
                            </div>
                            <div style={{ fontSize: "14px" }}>
                              <strong>Geciken Kitap:</strong>{" "}
                              {(() => {
                                const dynamicLateCount = calculateDynamicLateCount(selectedBorrowStudent, studentData);
                                return (
                                  <span style={{ color: dynamicLateCount > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                                    {dynamicLateCount}
                                  </span>
                                );
                              })()}
                            </div>
                            <div style={{ fontSize: "14px" }}>
                              <strong>Aktif Ödünç:</strong>{" "}
                              {(() => {
                                // Aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
                                return (
                                  <>
                                    <span style={{ color: activeLoansCount > 0 ? "#3b82f6" : "#10b981", fontWeight: 600 }}>
                                      {activeLoansCount}
                                    </span>
                                    <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>
                                      / {maxBorrowLimit} (Limit)
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          {(() => {
                            const availableBooks = getAvailableBooks(selectedBorrowBooks, selectedBorrowStudent);
                            // Aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
                            const activeLoans = activeLoansCount;
                            const totalAfterBorrow = activeLoansCount + availableBooks.length;
                            const remainingSlots = maxBorrowLimit - activeLoansCount;
                            const alreadyBorrowedCount = selectedBorrowBooks.length - availableBooks.length;

                            if (totalAfterBorrow > maxBorrowLimit) {
                              return (
                                <div style={{
                                  padding: "8px",
                                  backgroundColor: "#fee2e2",
                                  borderRadius: "6px",
                                  color: "#dc2626",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  marginBottom: "8px",
                                }}>
                                  ⚠️ Bu işlem sonrası öğrenci {totalAfterBorrow} kitap alacak (Limit: {maxBorrowLimit}). Onay gerekecek!
                                  {alreadyBorrowedCount > 0 && (
                                    <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>
                                      ({alreadyBorrowedCount} kitap zaten ödünçte, verilemeyecek)
                                    </span>
                                  )}
                                </div>
                              );
                            } else if (remainingSlots > 0 && remainingSlots <= 2 && availableBooks.length > 0) {
                              return (
                                <div style={{
                                  padding: "8px",
                                  backgroundColor: "#fef3c7",
                                  borderRadius: "6px",
                                  color: "#92400e",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  marginBottom: "8px",
                                }}>
                                  ℹ️ Öğrencinin {remainingSlots} kitap daha alma hakkı var.
                                  {alreadyBorrowedCount > 0 && (
                                    <span style={{ display: "block", fontSize: "12px", marginTop: "4px" }}>
                                      ({alreadyBorrowedCount} kitap zaten ödünçte, verilemeyecek)
                                    </span>
                                  )}
                                </div>
                              );
                            } else if (alreadyBorrowedCount > 0) {
                              return (
                                <div style={{
                                  padding: "8px",
                                  backgroundColor: "#fee2e2",
                                  borderRadius: "6px",
                                  color: "#dc2626",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  marginBottom: "8px",
                                }}>
                                  ⚠️ Seçilen kitaplardan {alreadyBorrowedCount} tanesi öğrenci tarafından zaten ödünç alınmış. Bu kitaplar verilmeyecek.
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {(() => {
                            const dynamicLateCount = calculateDynamicLateCount(selectedBorrowStudent, studentData);
                            return dynamicLateCount > 0 && (
                              <div style={{
                                padding: "8px",
                                backgroundColor: "#fee2e2",
                                borderRadius: "6px",
                                color: "#dc2626",
                                fontSize: "13px",
                                fontWeight: 600,
                              }}>
                                ⚠️ Bu öğrencinin {dynamicLateCount} geciken kitabı var!
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                    <button
                      onClick={() => {
                        setSelectedBorrowStudent("");
                      }}
                      style={{
                        padding: "6px 16px",
                        fontSize: "13px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Seçimi Kaldır
                    </button>
                  </div>
                )}
              </div>

              {/* Süre Seçimi */}
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                  Ödünç Süresi (Gün) *
                </label>
                <select
                  value={borrowDays}
                  onChange={(e) => setBorrowDays(parseInt(e.target.value))}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                >
                  <option value={7}>7 Gün</option>
                  <option value={10}>10 Gün</option>
                  <option value={14}>14 Gün</option>
                  <option value={21}>21 Gün</option>
                  <option value={30}>30 Gün</option>
                </select>
              </div>

              {/* Hata Mesajı */}
              {borrowModalError && (
                <div style={{ padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px" }}>
                  {borrowModalError}
                </div>
              )}

              {hasUnavailableBorrowSelection && (
                <div style={{ padding: "10px", backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: "6px", fontWeight: 600 }}>
                  ⚠️ Mevcut adedi 0 olan veya sağlam kopyası kalmayan kitaplar seçimde. Lütfen bu kitapları kaldırın.
                </div>
              )}

              {/* Butonlar */}
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    setShowBorrowModal(false);
                    setSelectedBorrowBooks([]);
                    setSelectedBorrowStudent("");
                    setBorrowBookSearchTerm("");
                    setBorrowStudentSearchTerm("");
                    setBorrowModalError(null);
                  }}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
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
                  onClick={async () => {
                    if (selectedBorrowBooks.length === 0) {
                      setBorrowModalError("Lütfen en az bir kitap seçin");
                      return;
                    }
                    if (!selectedBorrowStudent) {
                      setBorrowModalError("Lütfen bir öğrenci seçin");
                      return;
                    }
                    if (borrowDays < 1) {
                      setBorrowModalError("Ödünç süresi en az 1 gün olmalıdır");
                      return;
                    }

                    if (hasUnavailableBorrowSelection) {
                      setBorrowModalError("Mevcut adedi 0 olan veya sağlam kopyası kalmayan kitaplar ödünç verilemez.");
                      return;
                    }

                    // Ceza puanı kontrolü (sadece backend'deki değer)
                    const studentData =
                      students.find(
                        (s) =>
                          `${s.name} ${s.surname}`.trim() === selectedBorrowStudent ||
                          s.name === selectedBorrowStudent ||
                          s.surname === selectedBorrowStudent
                      ) ?? null;
                    const penaltyPoints = studentData?.penaltyPoints || 0;
                    if (penaltyPoints >= maxPenaltyPoints) {
                      setBorrowModalError(`Bu öğrenci cezalı durumda (Ceza Puanı: ${penaltyPoints}). Kitap ödünç alamaz.`);
                      return;
                    }

                    // Öğrencinin zaten aldığı kitapları filtrele
                    const availableBooks = getAvailableBooks(selectedBorrowBooks, selectedBorrowStudent);
                    if (availableBooks.length === 0) {
                      setBorrowModalError("Seçilen kitapların hepsi öğrenci tarafından zaten ödünç alınmış!");
                      return;
                    }

                    // Aktif ödünç sayısını kontrol et
                    const candidates = buildStudentCandidateNames(selectedBorrowStudent, studentData);
                    const studentValidLoans = loans.filter(
                      (l) =>
                        candidates.has(normalizePersonName(l.borrower)) &&
                        books.some((b) => b.id === l.bookId)
                    );
                    const activeLoans = studentValidLoans.length;
                    const totalAfterBorrow = activeLoans + availableBooks.length;

                    // Kitap limitini aşacaksa onay iste
                    if (totalAfterBorrow > maxBorrowLimit) {
                      const confirmed = await new Promise<boolean>((resolve) => {
                        setInfoCardData({
                          title: "Kitap Limiti Uyarısı",
                          message: `Bu işlem sonrası öğrenci ${totalAfterBorrow} kitap alacak (Limit: ${maxBorrowLimit}). Devam etmek istiyor musunuz?`,
                          type: "warning",
                          icon: "⚠️"
                        });
                        setShowInfoCard(true);
                        (window as any).__borrowLimitConfirm = resolve;
                      });
                      if (!confirmed) return;
                    }

                    try {
                      setLoading(true);
                      setBorrowModalError(null);
                      // Sadece verilebilecek kitapları ödünç ver
                      for (const book of availableBooks) {
                        await httpClient.post(`/books/${book.id}/borrow`, {
                          borrower: selectedBorrowStudent,
                          days: borrowDays,
                          personelName: personelName.trim(),
                        });
                      }
                      setShowBorrowModal(false);
                      setSelectedBorrowBooks([]);
                      setSelectedBorrowStudent("");
                      setBorrowBookSearchTerm("");
                      setBorrowStudentSearchTerm("");
                      setBorrowModalError(null);
                      await onRefresh();
                    } catch (err) {
                      setBorrowModalError(err instanceof Error ? err.message : "Ödünç verme işlemi başarısız oldu");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={isBorrowSubmissionDisabled}
                  style={{
                    padding: "10px 20px",
                    fontSize: "14px",
                    backgroundColor: isBorrowSubmissionDisabled ? "#9ca3af" : "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: isBorrowSubmissionDisabled ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {loading ? "İşleniyor..." : "Ödünç Ver"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && createPortal(
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
            zIndex: 10003,
            cursor: "pointer",
          }}
          onClick={() => {
            setShowBulkEditModal(false);
            setBulkEditField(null);
            setBulkEditValue("");
            setSelectedLoanIds(new Set());
            setBulkEditError(null);
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: "800px",
              width: "90%",
              maxHeight: "90vh",
              overflow: "auto",
              backgroundColor: "white",
              position: "relative",
              cursor: "default",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0 }}>Seçilenleri Düzenle</h2>
              <button
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkEditField(null);
                  setBulkEditValue("");
                  setSelectedLoanIds(new Set());
                }}
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

            {!bulkEditField ? (
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                  Düzenlenecek Alanı Seçin
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    setBulkEditField(e.target.value);
                    setBulkEditValue("");
                    setSelectedLoanIds(new Set());
                  }}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", marginBottom: "24px" }}
                >
                  <option value="">-- Seçiniz --</option>
                  <option value="extendDays">Süre Uzatma (Gün)</option>
                  <option value="personel">Personel</option>
                </select>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div>
                    <strong style={{ fontSize: "16px" }}>
                      {bulkEditField === "extendDays" ? "Süre Uzatma" : "Personel"} Düzenleme
                    </strong>
                    <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
                      {selectedBookIds.size} kitap seçildi
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setBulkEditField(null);
                      setBulkEditValue("");
                      setSelectedLoanIds(new Set());
                      setBulkEditError(null);
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
                  {filteredGroupedLoans
                    .filter(group => selectedBookIds.has(group.bookId))
                    .map(group =>
                      group.allLoans.map((loan) => {
                        const loanId = `${loan.bookId}|||${loan.borrower}`;
                        const isSelected = selectedLoanIds.has(loanId);
                        const currentDisplayValue = bulkEditField === "extendDays" ? "7 gün" :
                          bulkEditField === "personel" ? (loan.personel || "") :
                            "";

                        return (
                          <div key={loanId} style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f8fafc", borderRadius: "6px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                            <div
                              onClick={() => {
                                const newSelected = new Set(selectedLoanIds);
                                if (isSelected) {
                                  newSelected.delete(loanId);
                                } else {
                                  newSelected.add(loanId);
                                }
                                setSelectedLoanIds(newSelected);
                              }}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "50%",
                                border: isSelected ? "2px solid #3b82f6" : "2px solid #cbd5e1",
                                background: isSelected ? "#3b82f6" : "white",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s",
                                flexShrink: 0,
                                marginTop: "2px",
                              }}
                            >
                              {isSelected && (
                                <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                              )}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div>
                                <strong>{loan.title}</strong>
                                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                                  Öğrenci: {loan.borrower}
                                </div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>
                                  Mevcut: {currentDisplayValue || "—"}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ).flat()}
                </div>

                <div style={{ marginTop: "24px", padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "14px" }}>
                    {bulkEditField === "extendDays" ? "Süre (Gün)" : "Personel Adı"} *
                  </label>
                  {bulkEditField === "extendDays" ? (
                    <select
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                    >
                      <option value="">— Seçiniz —</option>
                      <option value="7">7 gün</option>
                      <option value="10">10 gün</option>
                      <option value="14">14 gün</option>
                      <option value="21">21 gün</option>
                      <option value="30">30 gün</option>
                    </select>
                  ) : bulkEditField === "personel" ? (
                    <input
                      type="text"
                      value={bulkEditValue}
                      onChange={(e) => setBulkEditValue(e.target.value)}
                      placeholder="Personel adını girin (boş bırakabilirsiniz)"
                      style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
                    />
                  ) : null}
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                    Bu değer seçili olan {selectedLoanIds.size} ödünç kaydına uygulanacak
                  </p>
                </div>

                {/* Hata Mesajı */}
                {bulkEditError && (
                  <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px" }}>
                    {bulkEditError}
                  </div>
                )}

                <div style={{ marginTop: "24px", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => {
                      setShowBulkEditModal(false);
                      setBulkEditField(null);
                      setBulkEditValue("");
                      setSelectedLoanIds(new Set());
                    }}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "6px",
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    İptal
                  </button>
                  <button
                    onClick={async () => {
                      // Validasyon
                      const selectedCount = selectedLoanIds.size;

                      if (selectedCount === 0) {
                        setBulkEditError("Lütfen en az bir ödünç kaydı seçin");
                        return;
                      }

                      if (bulkEditField === "extendDays" && !bulkEditValue) {
                        setBulkEditError("Lütfen süre seçin");
                        return;
                      }

                      const confirmed = await new Promise<boolean>((resolve) => {
                        setInfoCardData({
                          title: "Toplu Düzenleme Onayı",
                          message: `${selectedCount} ödünç kaydının ${bulkEditField === "extendDays" ? "süresini uzatmak" : "Personel bilgisini güncellemek"} istediğinize emin misiniz?`,
                          type: "warning",
                          icon: "⚠️"
                        });
                        setShowInfoCard(true);
                        (window as any).__bulkEditConfirm = resolve;
                      });
                      if (!confirmed) return;

                      try {
                        setLoading(true);
                        setBulkEditError(null);

                        // Sadece seçili olan ödünç kayıtlarını işle
                        for (const loanId of selectedLoanIds) {
                          const [bookId, borrower] = loanId.split("|||");

                          if (bulkEditField === "extendDays") {
                            // Önce kitabı geri al, sonra yeni süreyle tekrar ödünç ver
                            await httpClient.post(`/books/${bookId}/return`, {
                              borrower: borrower,
                              personelName: personelName.trim(),
                            });

                            await httpClient.post(`/books/${bookId}/borrow`, {
                              borrower: borrower,
                              days: parseInt(bulkEditValue || "7"),
                              personelName: personelName.trim(),
                            });
                          } else if (bulkEditField === "personel") {
                            // Personel bilgisini güncelleme
                            const loan = loans.find(l => l.bookId === bookId && l.borrower === borrower);
                            if (loan) {
                              await httpClient.post(`/books/${bookId}/return`, {
                                borrower: borrower,
                                personelName: personelName.trim(),
                              });

                              await httpClient.post(`/books/${bookId}/borrow`, {
                                borrower: borrower,
                                days: (() => {
                                  const diff = Math.ceil((new Date(loan.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                  return diff > 0 ? diff : 7;
                                })(),
                                personelName: bulkEditValue?.trim() || personelName.trim(),
                              });
                            }
                          }
                        }

                        setShowBulkEditModal(false);
                        setBulkEditField(null);
                        setBulkEditValue("");
                        setSelectedLoanIds(new Set());
                        setBulkEditError(null);
                        setSelectionMode(false);
                        setSelectedBookIds(new Set());
                        await onRefresh();
                      } catch (err) {
                        setBulkEditError(err instanceof Error ? err.message : "Düzenleme işlemi başarısız oldu");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    style={{
                      padding: "10px 20px",
                      fontSize: "14px",
                      backgroundColor: loading ? "#9ca3af" : "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {loading ? "İşleniyor..." : "Güncelle"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div >,
        document.body
      )}

      {/* Süre Uzatma Modal */}
      {
        extendingLoan && createPortal(
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
              zIndex: 10002,
            }}
            onClick={() => setExtendingLoan(null)}
          >
            <div
              className="card"
              style={{
                maxWidth: "500px",
                width: "90%",
                maxHeight: "90vh",
                overflow: "auto",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <h2 style={{ margin: 0, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Süre Uzat
                </h2>
                <button
                  onClick={() => setExtendingLoan(null)}
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

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Kitap Bilgileri */}
                <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "16px" }}>{extendingLoan.title}</div>
                  <div style={{ fontSize: "14px", color: "#64748b" }}>
                    {extendingLoan.author} • {extendingLoan.category}
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                    Mevcut Teslim Tarihi: {new Date(extendingLoan.dueDate).toLocaleDateString("tr-TR")}
                  </div>
                </div>

                {/* Süre Seçimi */}
                <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>Yeni Süre Seçin</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <label style={{ fontSize: "14px", fontWeight: 600, color: "#64748b" }}>Uzatma Süresi (Gün)</label>
                    <select
                      value={extendDays}
                      onChange={(e) => setExtendDays(parseInt(e.target.value))}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px"
                      }}
                    >
                      <option value={7}>7 Gün</option>
                      <option value={14}>14 Gün</option>
                      <option value={21}>21 Gün</option>
                      <option value={30}>30 Gün</option>
                    </select>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      Yeni teslim tarihi: {new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000).toLocaleDateString("tr-TR")}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setExtendingLoan(null)}
                    style={{
                      padding: "10px 20px",
                      fontSize: "14px",
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
                    onClick={async () => {
                      if (!extendingLoan || !personelName) return;
                      try {
                        setLoading(true);
                        // Önce mevcut kitabı geri al, sonra yeni süreyle tekrar ödünç ver
                        await httpClient.post(`/books/${extendingLoan.bookId}/return`, {
                          borrower: extendingLoan.borrower,
                          personelName: personelName.trim(),
                        });

                        // Yeni süreyle tekrar ödünç ver
                        await httpClient.post(`/books/${extendingLoan.bookId}/borrow`, {
                          borrower: extendingLoan.borrower,
                          days: extendDays,
                          personelName: personelName.trim(),
                        });

                        setExtendingLoan(null);
                        if (onRefresh) {
                          await onRefresh();
                        }
                      } catch (err) {
                        showInfo("Hata", err instanceof Error ? err.message : "Süre uzatma başarısız oldu", "error", "❌");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading || !personelName}
                    style={{
                      padding: "10px 20px",
                      fontSize: "14px",
                      backgroundColor: loading || !personelName ? "#9ca3af" : "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: loading || !personelName ? "not-allowed" : "pointer",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    {loading ? (
                      "İşleniyor..."
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        Süre Uzat
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Kitap Künye Modalı */}
      {
        showBookCatalogModal && selectedBookForCatalog && (
          <BookDetailModal
            book={selectedBookForCatalog}
            books={books}
            loans={loans}
            students={students}
            personelName={personelName}
            onClose={() => {
              setShowBookCatalogModal(false);
              setSelectedBookForCatalog(null);
            }}
            onRefresh={onRefresh}
          />
        )
      }

      {/* Teslim Alma Onay Kartı */}
      <ConfirmCard
        isOpen={showReturnConfirm}
        title="Kitap Teslim Alma Onayı"
        icon="⚠️"
        onConfirm={async () => {
          if (loanToReturn) {
            await executeReturn(loanToReturn);
          }
        }}
        onCancel={() => {
          setShowReturnConfirm(false);
          setLoanToReturn(null);
        }}
        confirmText="Teslim Al"
        cancelText="İptal"
        confirmButtonColor="#10b981"
        loading={returnLoading}
      >
        {loanToReturn ? (
          <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
            <strong>{loanToReturn.borrower}</strong> adlı öğrencinin <strong>{loanToReturn.title}</strong> kitabını teslim almak istediğinize emin misiniz?
          </div>
        ) : null}
      </ConfirmCard>

      <ConfirmCard
        isOpen={showLoanDeleteConfirm}
        title="Toplu Ödünç Silme"
        icon="⚠️"
        onConfirm={confirmLoanDelete}
        onCancel={cancelLoanDelete}
        confirmText="Tamam, Sil"
        cancelText="İptal"
        confirmButtonColor="#ef4444"
        loading={loanDeleteLoading}
        disabled={loanDeleteData?.selectedItems.size === 0}
      >
        {loanDeleteData ? (
          <>
            <div style={{ fontSize: "14px", color: "#475569", marginBottom: "16px", lineHeight: "1.6" }}>
              <strong>Silinecekler içerisinde ödünç listesi olanlar var:</strong>
            </div>
            <div style={{ maxHeight: "400px", overflowY: "auto", marginBottom: "16px" }}>
              {loanDeleteData.items.map((item, idx) => {
                const dueDate = item.loan.dueDate ? new Date(item.loan.dueDate).toLocaleDateString("tr-TR") : "-";
                const isSelected = loanDeleteData.selectedItems.has(item.id);
                return (
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
                          const newSelected = new Set(loanDeleteData.selectedItems);
                          if (isSelected) {
                            newSelected.delete(item.id);
                          } else {
                            newSelected.add(item.id);
                          }
                          setLoanDeleteData({
                            ...loanDeleteData,
                            selectedItems: newSelected
                          });
                        }}
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "4px",
                          border: "2px solid #fbbf24",
                          backgroundColor: isSelected ? "#f59e0b" : "transparent",
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
                        {isSelected && <span>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 600 }}>
                          {item.loan.title} - {item.loan.borrower}
                        </div>
                      </div>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "40px", fontSize: "13px", color: "#78350f" }}>
                      <li style={{ marginBottom: "4px" }}>
                        Teslim: {dueDate}
                        {item.loan.personel && ` • Personel: ${item.loan.personel}`}
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: "13px", color: "#64748b", padding: "12px", backgroundColor: "#f1f5f9", borderRadius: "8px" }}>
              <strong>{loanDeleteData.selectedItems.size} ödünç kaydı</strong> silinecek.
            </div>
          </>
        ) : (
          <div style={{ fontSize: "14px", color: "#475569" }}>
            Silinecek kayıtlar hazırlanıyor...
          </div>
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
          // İptal edildiğinde callback'leri false yap
          if ((window as any).__borrowLimitConfirm) {
            (window as any).__borrowLimitConfirm(false);
            delete (window as any).__borrowLimitConfirm;
          }
          if ((window as any).__bulkEditConfirm) {
            (window as any).__bulkEditConfirm(false);
            delete (window as any).__bulkEditConfirm;
          }
        }}
        onConfirm={infoCardData?.type === "warning" ? () => {
          // Onay verildiğinde callback'leri true yap
          if ((window as any).__borrowLimitConfirm) {
            (window as any).__borrowLimitConfirm(true);
            delete (window as any).__borrowLimitConfirm;
          }
          if ((window as any).__bulkEditConfirm) {
            (window as any).__bulkEditConfirm(true);
            delete (window as any).__bulkEditConfirm;
          }
        } : undefined}
        confirmText="Onayla"
      >
        <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
          {infoCardData?.message}
        </div>
      </InfoCard>
      {/* Öğrenci Detay Modalı */}
      <StudentDetailModal
        isOpen={!!selectedStudent}
        onClose={() => {
          setSelectedStudent(null);
          setStudentHistory(null);
        }}
        student={selectedStudent}
        loans={loans}
        books={books}
        personelName={personelName}
        onRefresh={onRefresh}
        onBookClick={(book) => {
          // Kitap detay modalını aç (öğrenci modal üstünde)
          setSelectedBookId(book.id);
          setShowBookDetailModal(true);
        }}
        maxPenaltyPoints={maxPenaltyPoints}
        loading={historyLoading}
        studentHistory={studentHistory || undefined}
        historyEntries={studentHistory?.entries ?? []}
      />
    </>
  );
};

export default LoanOverview;

