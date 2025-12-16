import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Book, LoanInfo, BookStat, StudentStat } from "../api/types";
import { httpClient } from "../api/client";
import { searchGoogleBooks, addBooksToCsv } from "../api/googleBooks";
import BookList from "./BookList";
import LoanOverview from "./LoanOverview";
import StatsPanel from "./StatsPanel";
import SyncPanel from "./SyncPanel";
import StudentManagement from "./StudentManagement";
import LoanManagement from "./LoanManagement";
import BookAddView from "./BookAddView";
import ExcelUpload from "./ExcelUpload";
import { formatStudentFullName } from "../utils/studentName";
import StudentList from "./StudentList";
import BookDetailModal from "./BookDetailModal";
import DashboardCalendar from "./DashboardCalendar";
import LoanCard from "./LoanCard";
import LoanDetailModal from "./LoanDetailModal";
import SimpleLoanDetailCard from "./SimpleLoanDetailCard";
import { searchIncludes } from "../utils/searchUtils";
import { evaluateBorrowLimit, BorrowLimitCheckResult, evaluateBorrowSelection } from "../utils/borrowLimit";

type Props = {
  books: Book[];
  loans: LoanInfo[];
  bookStats: BookStat[];
  studentStats: StudentStat[];
  onRefresh: () => void;
  onSearch: (keyword: string) => void;
  onSyncStudents: () => Promise<number>;
  onSyncpersonel: () => Promise<number>;
  onSyncBooks: () => Promise<number>;
  onAddBook?: (data: {
    title: string;
    author: string;
    category: string;
    quantity: number;
    healthyCount?: number;
    damagedCount?: number;
    lostCount?: number;
    id?: string;
    shelf?: string;
    publisher?: string;
    summary?: string;
    bookNumber?: number;
    year?: number;
    pageCount?: number;
  }) => Promise<void>;
  onDeleteBook?: (id: string, options?: { silent?: boolean }) => Promise<void>;
  onBulkDeleteBooksSuccess?: (deletedCount: number, loanCount: number) => void;
  userRole: string;
  userName: string;
  onAddNotification?: (type: "info" | "success" | "warning" | "error", title: string, message: string) => void;
  onShowInfo?: (title: string, message: string, type: "info" | "success" | "warning" | "error", icon?: string) => void;
};

type TabType = "ana" | "katalog" | "ogrenci" | "odunc" | "odunc-islem" | "raporlar" | "senkronizasyon" | "kitap-ekle" | "veri-yukle";
type HomeModalType =
  | "active-loans"
  | "late-loans"
  | "due-soon"
  | "due-soon-14"
  | "due-soon-0-3"
  | "due-soon-4-7"
  | "due-soon-8-14"
  | "due-soon-15plus"
  | "top-borrowed"
  | "total-borrowed"
  | "total-books"
  | "total-students"
  | "due-soon-list"
  | "stock-low"
  | "stock-out"
  | "banned-students";

type QuickActionType = "quick-add-book" | "quick-borrow" | "quick-return" | "quick-stock";

type PendingQuickBorrowState = {
  books: Book[];
  student: string;
};

const PersonelView = ({
  books,
  loans,
  bookStats,
  studentStats,
  onRefresh,
  onSearch,
  onSyncStudents,
  onSyncpersonel,
  onSyncBooks,
  onAddBook,
  onDeleteBook,
  onBulkDeleteBooksSuccess,
  userRole,
  userName,
  onAddNotification,
  onShowInfo,
}: Props) => {
  // Yardımcı tarih fonksiyonu - 00:00 bazlı
  const getDaysDiff = (dueDateStr: string | Date) => {
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const [activeTab, setActiveTab] = useState<TabType>("ana");
  const [resetBookSearch, setResetBookSearch] = useState(false);
  const [resetLoanSearch, setResetLoanSearch] = useState(false);
  const [resetStudentSearch, setResetStudentSearch] = useState(false);
  const [homeModal, setHomeModal] = useState<HomeModalType | null>(null);
  const [selectedDueSoonBucket, setSelectedDueSoonBucket] = useState<"0-3" | "4-7" | "8-14" | "15+" | null>(null);
  const [selectedDueSoonLoan, setSelectedDueSoonLoan] = useState<LoanInfo | null>(null);
  const [selectedDueSoonBook, setSelectedDueSoonBook] = useState<Book | null>(null);
  const [selectedDueSoonStudent, setSelectedDueSoonStudent] = useState<StudentStat | null>(null);
  const [selectedSimpleLoan, setSelectedSimpleLoan] = useState<LoanInfo | null>(null);
  const [showSimpleReturnConfirm, setShowSimpleReturnConfirm] = useState(false);
  const [quickActionFeedback, setQuickActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [quickAction, setQuickAction] = useState<QuickActionType | null>(null);
  const [isMouseOverDueSoonCard, setIsMouseOverDueSoonCard] = useState(false);
  const dueSoonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 10 saniye timeout - sadece mouse kart dışındayken başlar
  useEffect(() => {
    // Timer'ı temizle
    if (dueSoonTimeoutRef.current) {
      clearTimeout(dueSoonTimeoutRef.current);
      dueSoonTimeoutRef.current = null;
    }

    // Eğer bir bucket seçiliyse ve mouse kart dışındaysa timer başlat
    if (selectedDueSoonBucket && !isMouseOverDueSoonCard) {
      dueSoonTimeoutRef.current = setTimeout(() => {
        setSelectedDueSoonBucket(null);
      }, 10000); // 10 saniye
    }

    return () => {
      if (dueSoonTimeoutRef.current) {
        clearTimeout(dueSoonTimeoutRef.current);
        dueSoonTimeoutRef.current = null;
      }
    };
  }, [selectedDueSoonBucket, isMouseOverDueSoonCard]);
  const [quickBookTitle, setQuickBookTitle] = useState("");
  const [quickBookAuthor, setQuickBookAuthor] = useState("");
  const [quickBookCategory, setQuickBookCategory] = useState("");
  const [quickBookQuantity, setQuickBookQuantity] = useState(1);
  const [quickBorrowBookId, setQuickBorrowBookId] = useState<string | null>(null);
  const [quickBorrowStudent, setQuickBorrowStudent] = useState("");
  const [quickReturnLoanId, setQuickReturnLoanId] = useState<string | null>(null);
  const [quickBorrowBookSearch, setQuickBorrowBookSearch] = useState("");
  const [quickBorrowStudentSearch, setQuickBorrowStudentSearch] = useState("");
  const [quickReturnSearch, setQuickReturnSearch] = useState("");
  const [quickBorrowDays, setQuickBorrowDays] = useState(14);
  const [lastQuickAction, setLastQuickAction] = useState<QuickActionType | null>(null);

  // Dashboard Calendar Interaction State
  const [selectedCalendarLoan, setSelectedCalendarLoan] = useState<LoanInfo | null>(null);
  const [showReturnConfirmation, setShowReturnConfirmation] = useState(false);

  const handleCalendarLoanClick = (loan: LoanInfo) => {
    setSelectedCalendarLoan(loan);
    setShowReturnConfirmation(false);
  };

  const handleQuickReturnFromCalendar = () => {
    if (!selectedCalendarLoan) return;
    setShowReturnConfirmation(true);
  };

  const processQuickReturn = async () => {
    if (!selectedCalendarLoan) return;

    try {
      await httpClient.post(`/books/${selectedCalendarLoan.bookId}/return`, {
        personelName: userName,
        borrower: selectedCalendarLoan.borrower,
      });
      setQuickActionFeedback({ type: "success", message: "Kitap başarıyla teslim alındı." });
      setShowReturnConfirmation(false);
      setSelectedCalendarLoan(null);
      await onRefresh();
    } catch (error) {
      console.error("Teslim alma hatası:", error);
      setQuickActionFeedback({ type: "error", message: "Teslim alma işlemi başarısız oldu." });
      setShowReturnConfirmation(false); // Hata durumunda da kapatalım
    }
  };

  const handleSimpleReturn = () => {
    if (!selectedSimpleLoan) return;
    setShowSimpleReturnConfirm(true);
  };

  const processSimpleReturn = async () => {
    if (!selectedSimpleLoan) return;

    try {
      await httpClient.post(`/books/${selectedSimpleLoan.bookId}/return`, {
        personelName: userName,
        borrower: selectedSimpleLoan.borrower,
      });
      setQuickActionFeedback({ type: "success", message: "Kitap başarıyla teslim alındı." });
      setShowSimpleReturnConfirm(false);
      setSelectedSimpleLoan(null);
      await onRefresh();
    } catch (error) {
      console.error("Teslim alma hatası:", error);
      setQuickActionFeedback({ type: "error", message: "Teslim alma işlemi başarısız oldu." });
      setShowSimpleReturnConfirm(false);
    }
  };


  const [stockFilter, setStockFilter] = useState<"low" | "out" | "all">("all");
  const [quickAddMethod, setQuickAddMethod] = useState<"api" | "file" | "manual" | null>(null);
  const [stockSearch, setStockSearch] = useState("");
  const [stockAdjustingId, setStockAdjustingId] = useState<string | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [stockSortColumn, setStockSortColumn] = useState<string | null>(null);
  const [stockSortDirection, setStockSortDirection] = useState<"asc" | "desc">("asc");
  const [googleBooksSearchQuery, setGoogleBooksSearchQuery] = useState("");
  const [googleBooksSearchType, setGoogleBooksSearchType] = useState<"title" | "author">("title");
  const [googleBooksResults, setGoogleBooksResults] = useState<any[]>([]);
  const [googleBooksLoading, setGoogleBooksLoading] = useState(false);
  const [googleBooksMessage, setGoogleBooksMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedGoogleBooks, setSelectedGoogleBooks] = useState<Set<number>>(new Set());
  const [quickFileUpload, setQuickFileUpload] = useState<File | null>(null);
  const [quickFileLoading, setQuickFileLoading] = useState(false);
  const [quickFileMessage, setQuickFileMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showCardSettings, setShowCardSettings] = useState(false);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [penaltyStudent, setPenaltyStudent] = useState<StudentStat | null>(null);
  const [penaltyError, setPenaltyError] = useState<string | null>(null);
  const [maxBorrowLimit, setMaxBorrowLimit] = useState(5);
  const [maxPenaltyPoints, setMaxPenaltyPoints] = useState(100);
  const [showQuickBorrowConfirmModal, setShowQuickBorrowConfirmModal] = useState(false);
  const [pendingQuickBorrow, setPendingQuickBorrow] = useState<PendingQuickBorrowState | null>(null);
  const isAdmin = userRole === "ADMIN";

  // Sistem ayarlarını yükle
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const response = await httpClient.get<{ maxBorrowLimit: number; maxPenaltyPoints: number }>("/system-settings");
        setMaxBorrowLimit(response.maxBorrowLimit);
        setMaxPenaltyPoints(response.maxPenaltyPoints);
      } catch (error) {
        console.error("Sistem ayarları yüklenemedi:", error);
      }
    };
    loadSystemSettings();
  }, []);

  // Üst kartların görünürlüğü için localStorage
  const getVisibleCards = () => {
    const saved = localStorage.getItem("homepage-visible-cards");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  };

  const [visibleCards, setVisibleCards] = useState<Record<string, boolean>>(() => {
    const saved = getVisibleCards();
    return saved || {
      "active-loans": true,
      "late-loans": true,
      "due-soon-list": true,
      "total-borrowed": true,
      "total-books": true,
      "total-book-quantity": true,
      "total-students": true,
      "due-soon-14": true,
      "stock-low": true,
      "stock-out": true,
      "top-borrowed": true,
      "banned-students": true,
    };
  });

  const saveVisibleCards = (cards: Record<string, boolean>) => {
    localStorage.setItem("homepage-visible-cards", JSON.stringify(cards));
    setVisibleCards(cards);
  };

  const toggleCardVisibility = (cardId: string) => {
    const newVisibleCards = { ...visibleCards, [cardId]: !visibleCards[cardId] };
    saveVisibleCards(newVisibleCards);
  };

  // Ana sayfa için önceden filtrelenmiş listeler ve tutarlı istatistikler
  const activeLoanList = useMemo(() => loans.filter(l => getDaysDiff(l.dueDate) >= 0), [loans]);

  const lateLoanList = useMemo(() =>
    loans.filter(l => getDaysDiff(l.dueDate) < 0).sort((a, b) => {
      // En gecikenden başlayarak sırala
      return getDaysDiff(a.dueDate) - getDaysDiff(b.dueDate);
    }), [loans]);

  const bucket0_3 = useMemo(() =>
    loans
      .filter(l => {
        const days = getDaysDiff(l.dueDate);
        return days >= 0 && days <= 3;
      })
      .sort((a, b) => getDaysDiff(a.dueDate) - getDaysDiff(b.dueDate)), [loans]);

  const bucket4_7 = useMemo(() =>
    loans
      .filter(l => {
        const days = getDaysDiff(l.dueDate);
        return days > 3 && days <= 7;
      })
      .sort((a, b) => getDaysDiff(a.dueDate) - getDaysDiff(b.dueDate)), [loans]);

  const bucket8_14 = useMemo(() =>
    loans
      .filter(l => {
        const days = getDaysDiff(l.dueDate);
        return days > 7 && days <= 14;
      })
      .sort((a, b) => getDaysDiff(a.dueDate) - getDaysDiff(b.dueDate)), [loans]);

  const bucket15plus = useMemo(() =>
    loans
      .filter(l => getDaysDiff(l.dueDate) > 14)
      .sort((a, b) => getDaysDiff(a.dueDate) - getDaysDiff(b.dueDate)), [loans]);

  // Ödünç sayımlarını loans üzerinden hesapla (bookStats ile tutarsızlık olmasın)
  const loanCountByBook = useMemo(() => {
    return loans.reduce((acc, loan) => {
      const key = `${loan.title}|||${loan.author}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [loans]);

  const topBorrowedEntries = useMemo(() => {
    return Object.entries(loanCountByBook)
      .map(([key, count]) => {
        const [title, author] = key.split("|||");
        return { title, author, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [loanCountByBook]);

  const topBorrowedBookEntities = useMemo(() => {
    return books
      .filter(b => topBorrowedEntries.some(tb => tb.title === b.title && tb.author === b.author))
      .map(b => {
        const match = topBorrowedEntries.find(tb => tb.title === b.title && tb.author === b.author);
        return { ...b, borrowed: match?.count ?? 0 };
      })
      .sort((a, b) => (b as any).borrowed - (a as any).borrowed);
  }, [books, topBorrowedEntries]);

  // Tutarlı istatistikler - loans üzerinden hesapla
  const totalBorrowedCount = loans.length; // Tüm ödünç kayıtları (modalda aynı liste)
  const activeLoansCount = activeLoanList.length; // kalan günü olanlar
  const lateLoansCount = lateLoanList.length;
  const dueSoonCount = bucket0_3.length;
  const dueSoon14Count = bucket0_3.length + bucket4_7.length + bucket8_14.length;
  const lowStockBooks = useMemo(() => books.filter(b => b.quantity > 0 && b.quantity <= 2), [books]);
  const outStockBooks = useMemo(() => books.filter(b => b.quantity === 0), [books]);

  // Sistem ayarlarını yükle (maxPenaltyPoints zaten yukarıda tanımlı)
  useEffect(() => {
    const loadSystemSettings = async () => {
      try {
        const response = await httpClient.get<{ maxBorrowLimit: number; maxPenaltyPoints: number }>("/system-settings");
        setMaxPenaltyPoints(response.maxPenaltyPoints);
      } catch (error) {
        console.error("Sistem ayarları yüklenemedi:", error);
      }
    };
    loadSystemSettings();
  }, []);

  const bannedStudents = useMemo(() => studentStats.filter(s => (s.penaltyPoints || 0) >= maxPenaltyPoints), [studentStats, maxPenaltyPoints]);
  const filteredStockBooks = useMemo(() => {
    const base =
      stockFilter === "low" ? lowStockBooks :
        stockFilter === "out" ? outStockBooks :
          stockFilter === "all" ? books :
            [...lowStockBooks, ...outStockBooks];

    // Önce filtreleme yap
    let filtered = [...base];
    if (stockSearch.trim()) {
      filtered = filtered.filter(b => {
        const q = b.quantity ?? 0;
        const tq = b.totalQuantity ?? 0;
        const loanCount = b.loans?.length ?? 0;
        return (
          searchIncludes(b.title, stockSearch) ||
          searchIncludes(b.author, stockSearch) ||
          searchIncludes(b.category, stockSearch) ||
          searchIncludes(b.shelf, stockSearch) ||
          searchIncludes(b.publisher, stockSearch) ||
          searchIncludes(b.summary, stockSearch) ||
          searchIncludes(b.bookNumber, stockSearch) ||
          searchIncludes(b.year, stockSearch) ||
          searchIncludes(b.pageCount, stockSearch) ||
          searchIncludes(q, stockSearch) ||
          searchIncludes(tq, stockSearch) ||
          searchIncludes(loanCount, stockSearch)
        );
      });
    }

    // Sıralama yap
    if (stockSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let compare = 0;

        switch (stockSortColumn) {
          case "title":
            compare = (a.title || "").localeCompare(b.title || "", "tr");
            break;
          case "author":
            compare = (a.author || "").localeCompare(b.author || "", "tr");
            break;
          case "category":
            compare = (a.category || "").localeCompare(b.category || "", "tr");
            break;
          case "quantity":
            compare = (a.quantity ?? 0) - (b.quantity ?? 0);
            break;
          case "loans":
            compare = (a.loans?.length ?? 0) - (b.loans?.length ?? 0);
            break;
          case "totalQuantity":
            compare = (a.totalQuantity ?? 0) - (b.totalQuantity ?? 0);
            break;
          default:
            compare = 0;
        }

        // Eğer eşitse, title'a göre ikincil sıralama yap
        if (compare === 0 && stockSortColumn !== "title") {
          compare = (a.title || "").localeCompare(b.title || "", "tr");
        }

        return stockSortDirection === "asc" ? compare : -compare;
      });
    } else {
      // Varsayılan alfabetik sıralama (sıralama kolonu seçilmediğinde)
      filtered = [...filtered].sort((a, b) => {
        const titleCompare = (a.title || "").localeCompare(b.title || "", "tr");
        if (titleCompare !== 0) return titleCompare;
        return (a.id || "").localeCompare(b.id || "", "tr");
      });
    }

    return filtered;
  }, [stockFilter, stockSearch, stockSortColumn, stockSortDirection, lowStockBooks, outStockBooks, books]);

  const handleStockAdjust = async (bookId: string, delta: number) => {
    if (!onAddBook) return;
    if (stockBusy) return; // Zaten bir işlem devam ediyorsa yeni işlem başlatma

    const book = books.find(b => b.id === bookId);
    if (!book) return;

    // Mevcut ödünç sayısını al
    const activeLoansCount = book.loans?.length ?? 0;

    // Yeni quantity hesapla
    const currentQty = book.quantity || 0;
    const nextQty = Math.max(0, currentQty + delta);

    // Backend totalQuantity bekliyor, quantity = totalQuantity - activeLoansCount formülüne göre
    // nextQty = newTotalQuantity - activeLoansCount
    // newTotalQuantity = nextQty + activeLoansCount
    const newTotalQuantity = nextQty + activeLoansCount;

    setStockBusy(true);
    setStockAdjustingId(bookId);
    try {
      await onAddBook({
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category,
        quantity: newTotalQuantity, // Backend bunu totalQuantity olarak kullanacak
      });
      await onRefresh();
    } catch (err) {
      console.error("Adet güncellenemedi", err);
      alert("Adet güncellenirken bir hata oluştu: " + (err instanceof Error ? err.message : "Bilinmeyen hata"));
    } finally {
      setStockBusy(false);
      setStockAdjustingId(null);
    }
  };
  const activeBorrowersCount = useMemo(() => new Set(loans.filter(l => getDaysDiff(l.dueDate) >= 0).map(l => l.borrower)).size, [loans]);
  const topBorrowedLead = topBorrowedEntries[0];

  // Hızlı işlemler için filtrelenmiş listeler
  const availableQuickBooks = useMemo(() => books.filter(b => b.quantity > 0), [books]);
  const filteredQuickBorrowBooks = useMemo(() => {
    if (!quickBorrowBookSearch.trim()) return availableQuickBooks;
    return availableQuickBooks.filter(book =>
      searchIncludes(book.title, quickBorrowBookSearch) ||
      searchIncludes(book.author, quickBorrowBookSearch) ||
      searchIncludes(book.category, quickBorrowBookSearch) ||
      searchIncludes(book.shelf, quickBorrowBookSearch) ||
      searchIncludes(book.publisher, quickBorrowBookSearch) ||
      searchIncludes(book.summary, quickBorrowBookSearch) ||
      searchIncludes(book.bookNumber, quickBorrowBookSearch) ||
      searchIncludes(book.year, quickBorrowBookSearch) ||
      searchIncludes(book.pageCount, quickBorrowBookSearch)
    );
  }, [availableQuickBooks, quickBorrowBookSearch]);

  const filteredQuickStudents = useMemo(() => {
    if (!quickBorrowStudentSearch.trim()) return studentStats;
    return studentStats.filter(student =>
      searchIncludes(student.name, quickBorrowStudentSearch) ||
      searchIncludes(student.studentNumber, quickBorrowStudentSearch) ||
      searchIncludes(student.class, quickBorrowStudentSearch) ||
      searchIncludes(student.branch, quickBorrowStudentSearch) ||
      (student.class && student.branch && searchIncludes(`${student.class}-${student.branch}`, quickBorrowStudentSearch)) ||
      (student.class && student.branch && searchIncludes(`${student.class}${student.branch}`, quickBorrowStudentSearch))
    );
  }, [studentStats, quickBorrowStudentSearch]);

  const filteredQuickReturnLoans = useMemo(() => {
    if (!quickReturnSearch.trim()) return [];
    return loans.filter(loan => {
      const diff = getDaysDiff(loan.dueDate);
      const isLate = diff < 0;
      const statusText =
        isLate
          ? "gecikmiş gecikme süresi doldu"
          : diff >= 0 && diff <= 3
            ? "yakında uyarı"
            : "normal";
      return (
        searchIncludes(loan.title, quickReturnSearch) ||
        searchIncludes(loan.author, quickReturnSearch) ||
        searchIncludes(loan.category, quickReturnSearch) ||
        searchIncludes(loan.borrower, quickReturnSearch) ||
        searchIncludes(loan.personel, quickReturnSearch) ||
        searchIncludes(statusText, quickReturnSearch)
      );
    });
  }, [loans, quickReturnSearch]);

  // Modal aç/kapa durumunda hızlı teslim filtrelerini sıfırla
  useEffect(() => {
    if (lastQuickAction === "quick-return" && quickAction !== "quick-return") {
      setQuickReturnLoanId(null);
      setQuickReturnSearch("");
    }
    setLastQuickAction(quickAction);
  }, [quickAction, lastQuickAction]);

  // Sekme değiştiğinde filtrelemeleri sıfırla
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    onSearch("");
    if (tab === "katalog") {
      setResetBookSearch(true);
      setTimeout(() => setResetBookSearch(false), 0);
    } else if (tab === "odunc") {
      setResetLoanSearch(true);
      setTimeout(() => setResetLoanSearch(false), 0);
    } else if (tab === "ogrenci") {
      setResetStudentSearch(true);
      setTimeout(() => setResetStudentSearch(false), 0);
    }
  };

  // Google Books API arama
  const handleGoogleBooksSearch = async () => {
    if (!googleBooksSearchQuery.trim()) {
      setGoogleBooksMessage({ type: "error", text: "Lütfen arama sorgusu girin" });
      return;
    }

    setGoogleBooksLoading(true);
    setGoogleBooksMessage(null);
    setGoogleBooksResults([]);
    setSelectedGoogleBooks(new Set());

    try {
      let query = "";
      if (googleBooksSearchType === "title") {
        query = `intitle:"${googleBooksSearchQuery}"`;
      } else {
        query = `inauthor:"${googleBooksSearchQuery}"`;
      }

      const results = await searchGoogleBooks(query);
      const limitedResults = results.slice(0, 3); // Maksimum 3 kitap
      setGoogleBooksResults(limitedResults);

      if (limitedResults.length === 0) {
        setGoogleBooksMessage({ type: "error", text: "Kitap bulunamadı. Lütfen farklı bir arama terimi deneyin." });
      } else {
        setGoogleBooksMessage({ type: "success", text: `${limitedResults.length} kitap bulundu` });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Arama sırasında hata oluştu";
      setGoogleBooksMessage({ type: "error", text: errorMessage });
      console.error("Arama hatası:", error);
    } finally {
      setGoogleBooksLoading(false);
    }
  };

  const toggleGoogleBookSelection = (index: number) => {
    const newSelected = new Set(selectedGoogleBooks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedGoogleBooks(newSelected);
  };

  const handleAddGoogleBooks = async () => {
    if (selectedGoogleBooks.size === 0) {
      setGoogleBooksMessage({ type: "error", text: "Lütfen en az bir kitap seçin" });
      return;
    }

    setGoogleBooksLoading(true);
    setGoogleBooksMessage(null);

    try {
      const toAdd = Array.from(selectedGoogleBooks)
        .map((idx) => googleBooksResults[idx])
        .filter(Boolean);

      const booksToSend = toAdd.map((book) => ({
        title: book.title,
        author: book.author,
        category: book.category,
        quantity: 1,
        shelf: "",
        publisher: book.publisher,
        summary: book.summary,
      }));

      const result = await addBooksToCsv(booksToSend, userName);
      setGoogleBooksMessage({
        type: "success",
        text: `${result.addedToCsv} kitap CSV'ye eklendi, ${result.importedToSystem} kitap sisteme aktarıldı`,
      });
      setSelectedGoogleBooks(new Set());
      setGoogleBooksSearchQuery("");
      setGoogleBooksResults([]);
      await onRefresh();
    } catch (error) {
      setGoogleBooksMessage({ type: "error", text: "Kitap ekleme sırasında hata oluştu" });
    } finally {
      setGoogleBooksLoading(false);
    }
  };

  // Dosya yükleme
  const handleQuickFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
      if (!validTypes.includes(file.type)) {
        setQuickFileMessage({ type: "error", text: "Lütfen geçerli bir dosya seçin (JPG, PNG, PDF)" });
        return;
      }
      setQuickFileUpload(file);
      setQuickFileMessage({ type: "success", text: `Dosya seçildi: ${file.name}` });
    }
  };

  const handleQuickFileUpload = async () => {
    if (!quickFileUpload) {
      setQuickFileMessage({ type: "error", text: "Lütfen bir dosya seçin" });
      return;
    }

    setQuickFileLoading(true);
    setQuickFileMessage(null);

    try {
      // TODO: Backend'e dosya yükleme endpoint'i eklendiğinde buraya API çağrısı yapılacak
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simüle edilmiş yükleme
      setQuickFileMessage({
        type: "success",
        text: "Dosya yükleme özelliği yakında eklenecek. Şimdilik manuel ekleme veya API kullanabilirsiniz.",
      });
      setQuickFileUpload(null);
      await onRefresh();
    } catch (error) {
      setQuickFileMessage({ type: "error", text: "Dosya yükleme başarısız oldu" });
    } finally {
      setQuickFileLoading(false);
    }
  };

  // Hızlı işlemler için handler'lar
  const handleQuickAddBook = async () => {
    if (!quickBookTitle.trim() || !quickBookAuthor.trim() || !onAddBook) return;
    try {
      await onAddBook({
        title: quickBookTitle.trim(),
        author: quickBookAuthor.trim(),
        category: quickBookCategory.trim() || "Genel",
        quantity: quickBookQuantity,
        healthyCount: quickBookQuantity,
        damagedCount: 0,
        lostCount: 0,
      });
      setQuickBookTitle("");
      setQuickBookAuthor("");
      setQuickBookCategory("");
      setQuickBookQuantity(1);
      setQuickAction(null);
      setQuickAddMethod(null);
      await onRefresh();
    } catch (error) {
      console.error("Kitap ekleme hatası:", error);
    }
  };

  // Öğrencinin zaten aldığı kitapları filtrele ve sadece sağlam kitapları döndür
  const getAvailableBooks = (booksToCheck: Book[], studentName: string): Book[] => {
    const isBorrowable = (book: Book) => book.quantity > 0 && (book.healthyCount ?? 0) > 0;
    if (!studentName) return booksToCheck.filter(isBorrowable);
    return booksToCheck.filter(book => {
      const alreadyBorrowed = loans.some(loan => loan.bookId === book.id && loan.borrower === studentName);
      return !alreadyBorrowed && isBorrowable(book);
    });
  };

  const handleQuickBorrow = async () => {
    if (!quickBorrowBookId || !quickBorrowStudent.trim()) return;

    const book = books.find(b => b.id === quickBorrowBookId);
    if (!book) {
      alert("Kitap bulunamadı!");
      return;
    }

    if ((book.healthyCount ?? 0) === 0) {
      alert("Sağlam kitap adedi mevcut değil!");
      return;
    }

    // Öğrenci bilgisini bul
    const normalizedBorrower = quickBorrowStudent.trim();
    const selectedStudentData = studentStats.find(s =>
      `${s.name} ${s.surname}`.trim() === normalizedBorrower ||
      s.name === normalizedBorrower ||
      s.surname === normalizedBorrower ||
      (s.studentNumber && `${s.studentNumber}` === normalizedBorrower)
    );

    if (!selectedStudentData) {
      alert("Geçerli bir öğrenci seçin");
      return;
    }

    const studentFullName = formatStudentFullName(selectedStudentData);
    if (!studentFullName) {
      onShowInfo?.("Hata", "Geçerli bir öğrenci seçin", "error", "❌");
      return;
    }

    // Öğrencinin zaten aldığı kitapları filtrele
    const availableBooks = getAvailableBooks([book], studentFullName);

    if (availableBooks.length === 0) {
      alert("Bu kitap öğrenci tarafından zaten ödünç alınmış!");
      return;
    }

    // Öğrencinin aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
    const studentValidLoans = loans.filter(l => {
      const borrower = l.borrower?.trim();
      return (
        (borrower === studentFullName || borrower === selectedStudentData.name) &&
        books.some(b => b.id === l.bookId)
      );
    });
    const activeLoans = studentValidLoans.length;
    const totalAfterBorrow = activeLoans + availableBooks.length;

    // Sistem ayarlarından kitap alma sınırını kontrol et
    if (totalAfterBorrow > maxBorrowLimit) {
      setPendingQuickBorrow({ books: availableBooks, student: studentFullName });
      setShowQuickBorrowConfirmModal(true);
      return;
    }

    // Sınır içindeyse direkt ödünç ver
    await executeQuickBorrow(availableBooks, selectedStudentData);
  };

  const confirmQuickBorrowAfterLimit = async () => {
    if (!pendingQuickBorrow) return;
    const studentData = studentStats.find((s) =>
      s.name === pendingQuickBorrow.student ||
      `${s.name} ${s.surname}`.trim() === pendingQuickBorrow.student ||
      s.surname === pendingQuickBorrow.student
    );
    if (!studentData) return;
    setShowQuickBorrowConfirmModal(false);
    await executeQuickBorrow(pendingQuickBorrow.books, studentData);
  };

  const executeQuickBorrow = async (booksToBorrow: Book[], studentData: StudentStat) => {
    const studentFullName = formatStudentFullName(studentData);
    if (!studentFullName) {
      onShowInfo?.("Hata", "Geçerli bir öğrenci seçin", "error", "❌");
      return;
    }
    const availableBooks = getAvailableBooks(booksToBorrow, studentFullName);

    if (availableBooks.length === 0) {
      alert("Seçilen kitapların hepsi öğrenci tarafından zaten ödünç alınmış!");
      return;
    }

    try {
      // Sadece verilebilecek kitapları ödünç ver
      for (const book of availableBooks) {
        await httpClient.post(`/books/${book.id}/borrow`, {
          borrower: studentFullName,
          days: quickBorrowDays,
          personelName: userName,
        });
      }

      // Başarılı olduğunda seçimleri temizle
      setQuickBorrowBookId(null);
      setQuickBorrowStudent("");
      setQuickBorrowBookSearch("");
      setQuickBorrowStudentSearch("");
      setQuickBorrowDays(14);
      setShowQuickBorrowConfirmModal(false);
      setPendingQuickBorrow(null);
      setQuickActionFeedback({ type: "success", message: "Kitap başarıyla ödünç verildi." });
      await onRefresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ödünç verme işlemi başarısız oldu.";
      console.error("Ödünç verme hatası:", error);

      // Eğer cezalı öğrenci hatası ise, öğrenci bilgisini al ve modal için hazırla
      if (errorMessage.includes("cezalı") || errorMessage.includes("Ceza Puanı") || errorMessage.includes("cezalı durumda")) {
        const student = studentStats.find(s =>
          s.name === studentData.name && s.surname === studentData.surname
        );
        if (student) {
          setPenaltyStudent(student);
          setPenaltyError(errorMessage);
          setShowPenaltyModal(true);
        } else {
          // Hata mesajından ceza puanını parse et: "Bu öğrenci cezalı durumda (Ceza Puanı: 50). Kitap ödünç alamaz."
          const penaltyMatch = errorMessage.match(/Ceza Puanı:\s*(\d+)/);
          const penaltyPoints = penaltyMatch ? parseInt(penaltyMatch[1]) : 0;

          // Eğer students listesinde bulunamazsa, temel bilgilerle oluştur
          setPenaltyStudent({
            name: studentData.name,
            surname: studentData.surname,
            borrowed: studentData.borrowed || 0,
            returned: studentData.returned || 0,
            late: studentData.late || 0,
            class: studentData.class,
            branch: studentData.branch,
            studentNumber: studentData.studentNumber,
            penaltyPoints: penaltyPoints,
            isBanned: penaltyPoints >= maxPenaltyPoints
          });
          setPenaltyError(errorMessage);
          setShowPenaltyModal(true);
        }
      } else {
        alert(errorMessage);
      }
    }
  };

  const handleQuickReturn = async () => {
    if (!quickReturnLoanId) return;
    try {
      const loan = loans.find(l => `${l.bookId}-${l.borrower}` === quickReturnLoanId);
      if (!loan) return;
      await httpClient.post(`/books/${loan.bookId}/return`, {
        personelName: userName,
        borrower: loan.borrower,
      });
      setQuickReturnLoanId(null);
      setQuickActionFeedback({ type: "success", message: "Kitap başarıyla teslim alındı." });
      await onRefresh();
    } catch (error) {
      console.error("Teslim alma hatası:", error);
      alert("Teslim alma işlemi başarısız oldu.");
    }
  };

  // Personel menü öğeleri (üst sekmeler)
  // SVG İkonlar
  const HomeIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  );

  const BookIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    </svg>
  );

  const AddBookIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
    </svg>
  );

  const StudentIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  );

  const LoanIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      <path d="M9 9l3 3 3-3"></path>
    </svg>
  );

  const LoanListIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      <line x1="8" y1="8" x2="16" y2="8"></line>
      <line x1="8" y1="12" x2="16" y2="12"></line>
      <line x1="8" y1="16" x2="16" y2="16"></line>
    </svg>
  );

  const ReportIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  );

  const UploadIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  );

  const SyncIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"></polyline>
      <polyline points="1 20 1 14 7 14"></polyline>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
  );

  const personelMenuItems = [
    { id: "ana" as TabType, label: "Ana Sayfa", icon: <HomeIcon />, title: "Ana Sayfa", description: "Genel Bakış" },
    { id: "katalog" as TabType, label: "Kitap Kataloğu", icon: <BookIcon />, title: "Kitap Kataloğu", description: "Tüm Kitaplar" },
    { id: "kitap-ekle" as TabType, label: "Kitap Ekle", icon: <AddBookIcon />, title: "Kitap Ekle", description: "Yeni Kitap" },
    { id: "ogrenci" as TabType, label: "Öğrenci Listesi", icon: <StudentIcon />, title: "Öğrenci Listesi", description: "Öğrenci İşlemleri" },
    { id: "odunc-islem" as TabType, label: "Ödünç İşlemleri", icon: <LoanIcon />, title: "Ödünç İşlemleri", description: "Ödünç Ver/Al" },
    { id: "odunc" as TabType, label: "Ödünç Listesi", icon: <LoanListIcon />, title: "Ödünç Listesi", description: "Tüm Ödünçler" },
    { id: "raporlar" as TabType, label: "Raporlar", icon: <ReportIcon />, title: "Raporlar", description: "İstatistikler" },
  ];

  // Sağ menü öğeleri (kartlar altına eklenecek)
  const sideMenuItems = [
    { id: "veri-yukle" as TabType, label: "Veri Yükle", icon: <UploadIcon />, title: "Veri Yükle", description: "Dosya Yükle" },
  ];

  // Admin menü öğeleri (senkronizasyon dahil)
  const adminMenuItems = [
    ...personelMenuItems,
    { id: "senkronizasyon" as TabType, label: "Senkronizasyon", icon: <SyncIcon />, title: "Senkronizasyon", description: "Veri Senkron" },
  ];

  const menuItems = isAdmin ? adminMenuItems : personelMenuItems;

  const renderContent = () => {
    switch (activeTab) {
      case "ana": {
        const topLate = lateLoanList.slice(0, 5);
        const topBorrowed = topBorrowedEntries.slice(0, 5);

        const cardDefinitions = [
          { id: "active-loans", label: "Aktif Ödünç", value: activeLoansCount, color: "#3b82f6", modal: "active-loans" as HomeModalType },
          { id: "late-loans", label: "Geciken Kitap", value: lateLoansCount, color: "#374151", modal: "late-loans" as HomeModalType },
          { id: "late-borrowers", label: "Geciken Öğrenci", value: new Set(lateLoanList.map(l => l.borrower)).size, color: "#111827", modal: "late-loans" as HomeModalType },
          { id: "total-borrowed", label: "Toplam Ödünç", value: totalBorrowedCount, color: "#10b981", modal: "total-borrowed" as HomeModalType },
          { id: "total-books", label: "Kitap Çeşidi", value: books.length, color: "#8b5cf6", modal: "total-books" as HomeModalType },
          { id: "total-book-quantity", label: "Toplam Kitap Adeti", value: books.reduce((sum, b) => sum + (b.quantity || 0), 0) + loans.filter(l => getDaysDiff(l.dueDate) >= 0).length, color: "#8b5cf6", modal: "total-books" as HomeModalType },
          { id: "total-students", label: "Toplam Öğrenci", value: studentStats.length, color: "#06b6d4", modal: "total-students" as HomeModalType },
          { id: "stock-low", label: "Azalan Adet (≤2)", value: lowStockBooks.length, color: "#f59e0b", modal: "stock-low" as HomeModalType },
          { id: "stock-out", label: "Tükenen Adet", value: outStockBooks.length, color: "#ef4444", modal: "stock-out" as HomeModalType },
          { id: "active-borrowers", label: "Aktif Öğrenci", value: activeBorrowersCount, color: "#2563eb", modal: "active-loans" as HomeModalType },
          { id: "banned-students", label: "Cezalı Öğrenciler", value: bannedStudents.length, color: "#dc2626", modal: "banned-students" as HomeModalType },
        ];

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Kart Ayarları Butonu */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "-16px" }}>
              <button
                onClick={() => setShowCardSettings(!showCardSettings)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  background: showCardSettings ? "linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #bfdbfe 100%)" : "#fff",
                  color: showCardSettings ? "#1e40af" : "#374151",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.2s",
                }}
              >
                {showCardSettings ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Ayarları Kaydet
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Kartları Düzenle
                  </>
                )}
              </button>
            </div>

            {/* Kart Ayarları Modal */}
            {showCardSettings && (
              <div className="card" style={{
                padding: "20px"
              }}>
                <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#1e293b", fontWeight: 700 }}>Kartları Düzenle</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                  {cardDefinitions.map((card) => (
                    <label
                      key={card.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "12px",
                        background: "rgba(255, 255, 255, 0.5)",
                        backdropFilter: "blur(10px)",
                        borderRadius: "8px",
                        border: "1px solid rgba(255, 255, 255, 0.3)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={visibleCards[card.id] ?? true}
                        onChange={() => toggleCardVisibility(card.id)}
                        style={{ width: "18px", height: "18px", cursor: "pointer" }}
                      />
                      <span style={{ fontWeight: 600, color: "#1e293b" }}>{card.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Özet Kartlar (Dinamik) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              {cardDefinitions.filter(card => visibleCards[card.id] !== false).map((card) => {
                // Renk kodunu RGB'ye çevir
                const hexToRgb = (hex: string) => {
                  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                  return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                  } : null;
                };
                const rgb = hexToRgb(card.color);
                const rgbaHover = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : "rgba(59, 130, 246, 0.15)";
                const rgbaBorder = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)` : "rgba(59, 130, 246, 0.4)";
                const rgbaShadow = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)` : "rgba(59, 130, 246, 0.3)";

                return (
                  <div
                    key={card.id}
                    className="card"
                    style={{
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      padding: "20px",
                      position: "relative",
                      overflow: "hidden",
                      borderColor: `rgba(${rgb?.r || 59}, ${rgb?.g || 130}, ${rgb?.b || 246}, 0.2)`
                    }}
                    onClick={() => setHomeModal(card.modal)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
                      e.currentTarget.style.boxShadow = `0 12px 32px ${rgbaShadow}`;
                      e.currentTarget.style.borderColor = rgbaBorder;
                      e.currentTarget.style.background = `linear-gradient(135deg, ${rgbaHover} 0%, rgba(255, 255, 255, 0.95) 100%)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0) scale(1)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
                      e.currentTarget.style.borderColor = `rgba(${rgb?.r || 59}, ${rgb?.g || 130}, ${rgb?.b || 246}, 0.2)`;
                      e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
                    }}
                  >
                    <div style={{ fontSize: "36px", fontWeight: 700, color: card.color, marginBottom: "8px", transition: "transform 0.4s ease" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "scale(1.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      {card.value}
                    </div>
                    <div style={{ color: "#1e293b", fontSize: "14px", fontWeight: 600 }}>{card.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Dashboard Calendar */}
            <DashboardCalendar
              loans={loans}
              books={books}
              onLoanClick={handleCalendarLoanClick}
            />

            {/* Teslim Tarihi Yaklaşanlar - 0-3 / 4-7 / 8-14 / 15+ (gecikenler hariç) */}
            <div
              className="card"
              style={{
                padding: "20px",
                marginTop: "24px"
              }}
              onMouseEnter={() => setIsMouseOverDueSoonCard(true)}
              onMouseLeave={() => setIsMouseOverDueSoonCard(false)}
            >
              <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#1e293b", fontWeight: 700 }}>Teslim Tarihi Yaklaşanlar</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px" }}>
                {[
                  { title: "0-3 Gün", color: "#ef4444", bucket: "0-3" as const, data: bucket0_3 },
                  { title: "4-7 Gün", color: "#f59e0b", bucket: "4-7" as const, data: bucket4_7 },
                  { title: "8-14 Gün", color: "#3b82f6", bucket: "8-14" as const, data: bucket8_14 },
                  { title: "15+ Gün", color: "#10b981", bucket: "15+" as const, data: bucket15plus },
                ].map((group, idx) => {
                  const isSelected = selectedDueSoonBucket === group.bucket;
                  // Her kart için arka plan ve yazı renkleri
                  const bgColor = group.color === "#ef4444" ? "#fef2f2" : // 0-3 Gün: açık kırmızı
                    group.color === "#f59e0b" ? "#fffbeb" : // 4-7 Gün: açık turuncu
                      group.color === "#3b82f6" ? "#eff6ff" : // 8-14 Gün: açık mavi
                        "#f0fdf4"; // 15+ Gün: açık yeşil

                  const textColor = group.color === "#ef4444" ? "#991b1b" : // 0-3 Gün: koyu kırmızı
                    group.color === "#f59e0b" ? "#92400e" : // 4-7 Gün: koyu turuncu
                      group.color === "#3b82f6" ? "#1e40af" : // 8-14 Gün: koyu mavi
                        "#065f46"; // 15+ Gün: koyu yeşil

                  return (
                    <div
                      key={group.title + idx}
                      className="card"
                      style={{
                        textAlign: "center",
                        cursor: "pointer",
                        transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                        padding: "20px",
                        border: isSelected ? `3px solid ${group.color}` : `2px solid ${group.color}`,
                        backgroundColor: bgColor,
                        transform: isSelected ? "translateY(-4px) scale(1.05)" : "scale(1)",
                        boxShadow: isSelected ? `0 12px 32px ${group.color}40` : "0 2px 4px rgba(0, 0, 0, 0.1)",
                        position: "relative",
                        overflow: "hidden",
                      }}
                      onClick={() => setSelectedDueSoonBucket(isSelected ? null : group.bucket)}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.transform = "translateY(-4px) scale(1.05)";
                          e.currentTarget.style.boxShadow = `0 12px 32px ${group.color}40`;
                          e.currentTarget.style.borderWidth = "3px";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.transform = "translateY(0) scale(1)";
                          e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
                          e.currentTarget.style.borderWidth = "2px";
                        }
                      }}
                    >
                      <div style={{ fontSize: "36px", fontWeight: 700, color: group.color, marginBottom: "8px" }}>
                        {group.data.length}
                      </div>
                      <div style={{ color: textColor, fontSize: "14px", fontWeight: 600 }}>{group.title}</div>
                    </div>
                  );
                })}
              </div>

              {/* Seçili karta ait istatistikler */}
              {selectedDueSoonBucket && (() => {
                const selectedData = selectedDueSoonBucket === "0-3" ? bucket0_3 :
                  selectedDueSoonBucket === "4-7" ? bucket4_7 :
                    selectedDueSoonBucket === "8-14" ? bucket8_14 :
                      bucket15plus;
                const selectedTitle = selectedDueSoonBucket === "0-3" ? "0-3 Gün" :
                  selectedDueSoonBucket === "4-7" ? "4-7 Gün" :
                    selectedDueSoonBucket === "8-14" ? "8-14 Gün" :
                      "15+ Gün";

                return (
                  <div style={{ marginTop: "24px", padding: "20px", background: "rgba(255, 255, 255, 0.5)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "2px solid rgba(255, 255, 255, 0.3)" }}>
                    <h4 style={{ marginTop: 0, marginBottom: "16px", color: "#1e293b", fontWeight: 700 }}>
                      {selectedTitle} İçin Detaylı Liste ({selectedData.length} kayıt)
                    </h4>
                    {selectedData.length === 0 ? (
                      <p style={{ color: "#64748b", margin: 0 }}>Bu kategoride ödünç bulunmuyor.</p>
                    ) : (
                      <div style={{ maxHeight: "600px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                        {selectedData.map((loan, idx) => {
                          const book = books.find(b => b.id === loan.bookId);
                          return (
                            <LoanCard
                              key={`${loan.bookId}-${loan.borrower}-${idx}`}
                              loan={loan}
                              book={book}
                              showReturnButton={false}
                              onClick={() => {
                                setSelectedSimpleLoan(loan);
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* İstatistiksel Gösterimler */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" }}>
              {/* Gecikenler - İstatistiksel */}
              <div
                className="card"
                style={{
                  cursor: "pointer",
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  padding: "20px",
                  position: "relative",
                  overflow: "hidden",
                  borderColor: "rgba(107, 114, 128, 0.3)"
                }}
                onClick={() => setHomeModal("late-loans")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(107, 114, 128, 0.3)";
                  e.currentTarget.style.borderColor = "rgba(107, 114, 128, 0.5)";
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(107, 114, 128, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0) scale(1)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
                  e.currentTarget.style.borderColor = "rgba(107, 114, 128, 0.3)";
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#1e293b", fontWeight: 700 }}>Gecikenler</h3>
                {lateLoanList.length === 0 ? (
                  <p style={{ margin: 0, color: "#64748b" }}>Geciken ödünç yok.</p>
                ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", padding: "12px", background: "rgba(107, 114, 128, 0.2)", backdropFilter: "blur(10px)", borderRadius: "8px", color: "white", border: "1px solid rgba(255, 255, 255, 0.2)" }}>
                      <span style={{ fontWeight: 700 }}>Toplam Geciken:</span>
                      <span style={{ fontSize: "24px", fontWeight: 800 }}>{lateLoanList.length}</span>
                    </div>
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {topLate.map((l, idx) => {
                        const daysLate = Math.floor((new Date().getTime() - new Date(l.dueDate).getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={`${l.bookId}-${idx}`} style={{ marginBottom: "8px", padding: "12px", background: "rgba(255, 255, 255, 0.5)", backdropFilter: "blur(10px)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.3)" }}>
                            <div style={{ fontWeight: 600, color: "#1e293b" }}>{l.title}</div>
                            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                              {l.borrower} • {daysLate} gün gecikmiş
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* En Çok Ödünç Alınanlar - İstatistiksel */}
              <div
                className="card"
                style={{
                  cursor: "pointer",
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  padding: "20px",
                  position: "relative",
                  overflow: "hidden",
                  borderColor: "rgba(14, 165, 233, 0.3)"
                }}
                onClick={() => setHomeModal("top-borrowed")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(14, 165, 233, 0.3)";
                  e.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.5)";
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0) scale(1)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
                  e.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.3)";
                  e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
                }}
              >
                <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#1e293b", fontWeight: 700 }}>En Çok Ödünç Alınanlar</h3>
                {topBorrowedEntries.length === 0 ? (
                  <p style={{ margin: 0, color: "#64748b" }}>Veri yok.</p>
                ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", padding: "12px", background: "rgba(14, 165, 233, 0.2)", backdropFilter: "blur(10px)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.3)" }}>
                      <span style={{ fontWeight: 600, color: "#0ea5e9" }}>Toplam Ödünç:</span>
                      <span style={{ fontSize: "24px", fontWeight: 700, color: "#0ea5e9" }}>{topBorrowedEntries.reduce((sum, b) => sum + b.count, 0)}</span>
                    </div>
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {topBorrowed.map((b, idx) => (
                        <div key={`${b.title}-${b.author}-${idx}`} style={{ marginBottom: "8px", padding: "12px", background: "rgba(255, 255, 255, 0.5)", backdropFilter: "blur(10px)", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.3)" }}>
                          <div style={{ fontWeight: 600, color: "#1e293b" }}>{b.title}</div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                            {b.author} • <strong style={{ color: "#0ea5e9" }}>{b.count} ödünç</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hızlı İşlemler - Mini Formlar */}
            <div className="card" style={{
              padding: "20px",
              background: "linear-gradient(135deg, rgba(239, 246, 255, 0.95) 0%, rgba(219, 234, 254, 0.95) 50%, rgba(191, 219, 254, 0.95) 100%)"
            }}>
              <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#1e293b", fontWeight: 700 }}>Hızlı İşlemler</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
                <div style={{ border: "2px solid rgba(59, 130, 246, 0.2)", borderRadius: "10px", padding: "12px", background: "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(10px)", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)" }}>
                  <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#1e293b" }}>Hızlı Kitap Ekle</p>
                  <button
                    onClick={() => setQuickAction("quick-add-book")}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #3b82f6", background: "#3b82f6", color: "white", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                      <line x1="12" y1="8" x2="12" y2="16"></line>
                      <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    Kitap Ekle
                  </button>
                </div>
                <div style={{ border: "2px solid rgba(59, 130, 246, 0.2)", borderRadius: "10px", padding: "12px", background: "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(10px)", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)" }}>
                  <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#1e293b" }}>Hızlı Ödünç Ver</p>
                  <button
                    onClick={() => setQuickAction("quick-borrow")}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #10b981", background: "#10b981", color: "white", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                      <path d="M9 9l3 3 3-3"></path>
                    </svg>
                    Ödünç Ver
                  </button>
                </div>
                <div style={{ border: "2px solid rgba(59, 130, 246, 0.2)", borderRadius: "10px", padding: "12px", background: "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(10px)", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)" }}>
                  <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#1e293b" }}>Hızlı Teslim Al</p>
                  <button
                    onClick={() => setQuickAction("quick-return")}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #f59e0b", background: "#f59e0b", color: "white", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Teslim Al
                  </button>
                </div>
                <div style={{ border: "2px solid rgba(59, 130, 246, 0.2)", borderRadius: "10px", padding: "12px", background: "rgba(255, 255, 255, 0.9)", backdropFilter: "blur(10px)", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)" }}>
                  <p style={{ margin: "0 0 8px 0", fontWeight: 600, color: "#1e293b" }}>Hızlı Adet Kontrol</p>
                  <button
                    onClick={() => setQuickAction("quick-stock")}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #6366f1", background: "#6366f1", color: "white", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                      <line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>
                    Adet Kontrol
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      }
      case "katalog":
        return (
          <BookList
            books={books}
            loans={loans}
            students={studentStats}
            personelName={userName}
            onRefresh={onRefresh}
            onSearch={onSearch}
            onAdd={onAddBook}
            onDelete={onDeleteBook}
            onBulkDeleteSuccess={onBulkDeleteBooksSuccess}
            canEdit={true}
            resetSearch={resetBookSearch}
          />
        );
      case "ogrenci":
        return (
          <StudentManagement
            students={studentStats}
            loans={loans}
            books={books}
            onRefresh={onRefresh}
            onSyncStudents={onSyncStudents}
            resetSearch={resetStudentSearch}
            personelName={userName}
            onAddNotification={onAddNotification}
          />
        );
      case "odunc-islem":
        return (
          <LoanManagement
            books={books}
            loans={loans}
            students={studentStats}
            onRefresh={onRefresh}
            personelName={userName}
            onAddNotification={onAddNotification}
          />
        );
      case "odunc":
        return (
          <LoanOverview
            loans={loans}
            books={books}
            students={studentStats}
            onRefresh={onRefresh}
            personelName={userName}
            resetSearch={resetLoanSearch}
            onAddNotification={onAddNotification}
          />
        );
      case "raporlar":
        return <StatsPanel books={books} bookStats={bookStats} students={studentStats} loans={loans} personelName={userName} />
      case "kitap-ekle":
        return <BookAddView onRefresh={onRefresh} personelName={userName} />;
      case "veri-yukle":
        return (
          <ExcelUpload
            onRefresh={onRefresh}
            bookCount={books.length}
            studentCount={studentStats.length}
            onNotify={onAddNotification}
          />
        );
      case "senkronizasyon":
        if (isAdmin) {
          return <SyncPanel onSyncStudents={onSyncStudents} onSyncpersonel={onSyncpersonel} onSyncBooks={onSyncBooks} />;
        }
        return null;
      default:
        return null;
    }
  };

  const renderHomeModalContent = () => {
    switch (homeModal) {
      case "active-loans":
        return <LoanOverview loans={activeLoanList} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "late-loans":
        return <LoanOverview loans={lateLoanList} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "due-soon":
        return <LoanOverview loans={bucket0_3} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "due-soon-0-3":
        return <LoanOverview loans={bucket0_3} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "due-soon-4-7":
        return <LoanOverview loans={bucket4_7} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "due-soon-8-14":
        return <LoanOverview loans={bucket8_14} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "due-soon-15plus":
        return <LoanOverview loans={bucket15plus} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "due-soon-14":
        return <LoanOverview loans={[...bucket0_3, ...bucket4_7, ...bucket8_14]} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "due-soon-list":
        return (
          <div>
            <h3 style={{ marginBottom: "16px" }}>Teslim Tarihi Yaklaşanlar (0-3 Gün)</h3>
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {bucket0_3.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>Yaklaşan teslim tarihi yok.</p>
              ) : (
                <table className="book-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Kitap</th>
                      <th>Öğrenci</th>
                      <th>Bitiş Tarihi</th>
                      <th>Kalan Gün</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket0_3.map((loan, idx) => (
                      <tr key={`${loan.bookId}-${idx}`}>
                        <td><strong>{loan.title}</strong></td>
                        <td>{loan.borrower}</td>
                        <td>{new Date(loan.dueDate).toLocaleDateString("tr-TR")}</td>
                        <td>
                          {(() => {
                            const diff = getDaysDiff(loan.dueDate);
                            return (
                              <span style={{ color: diff <= 1 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                                {diff} gün
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      case "banned-students":
        return <StudentList students={bannedStudents} books={books} loans={loans} resetSearch={false} filterVariant="search-only" personelName={userName} onAddNotification={onAddNotification} onShowInfo={onShowInfo} />;
      case "top-borrowed":
        return <BookList books={topBorrowedBookEntities} loans={loans} onRefresh={onRefresh} onSearch={() => { }} canEdit={false} resetSearch={false} filterVariant="search-only" />;
      case "total-borrowed":
        return <LoanOverview loans={loans} books={books} onRefresh={onRefresh} personelName={userName} resetSearch={false} filterVariant="search-only" onAddNotification={onAddNotification} />;
      case "total-books":
        return <BookList books={books} loans={loans} onRefresh={onRefresh} onSearch={() => { }} canEdit={false} resetSearch={false} filterVariant="search-only" />;
      case "total-students":
        return <StudentList students={studentStats} books={books} loans={loans} resetSearch={false} filterVariant="search-only" personelName={userName} onAddNotification={onAddNotification} onShowInfo={onShowInfo} />;
      case "stock-low":
        return (
          <div>
            <h3 style={{ marginBottom: "16px" }}>Azalan Adet (≤2)</h3>
            <BookList books={lowStockBooks} loans={loans} onRefresh={onRefresh} onSearch={() => { }} canEdit={true} resetSearch={false} filterVariant="search-only" />
          </div>
        );
      case "stock-out":
        return (
          <div>
            <h3 style={{ marginBottom: "16px" }}>Tükenen Adet</h3>
            <BookList books={outStockBooks} loans={loans} onRefresh={onRefresh} onSearch={() => { }} canEdit={true} resetSearch={false} filterVariant="search-only" />
          </div>
        );
      default:
        return null;
    }
  };

  const renderQuickActionModal = () => {
    if (!quickAction) return null;

    const closeQuickModal = () => {
      setQuickAction(null);
      setQuickReturnLoanId(null);
      setQuickReturnSearch("");
      setQuickAddMethod(null);
      setGoogleBooksSearchQuery("");
      setGoogleBooksResults([]);
      setSelectedGoogleBooks(new Set());
      setGoogleBooksMessage(null);
      setQuickFileUpload(null);
      setQuickFileMessage(null);
      setStockSortColumn(null);
      setStockSortDirection("asc");
      // Hızlı ödünç verme state'lerini temizle
      setQuickBorrowBookId(null);
      setQuickBorrowStudent("");
      setQuickBorrowBookSearch("");
      setQuickBorrowStudentSearch("");
      setQuickBorrowDays(14);
      setShowQuickBorrowConfirmModal(false);
      setPendingQuickBorrow(null);
      setQuickActionFeedback(null);
    };

    return createPortal(
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
        onClick={closeQuickModal}
      >
        <div
          className="card"
          style={{
            maxWidth: "800px",
            width: "90%",
            maxHeight: "90vh",
            overflowY: "auto",
            overflowX: "hidden",
            position: "relative"
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {quickActionFeedback ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                backgroundColor: quickActionFeedback.type === "success" ? "#d1fae5" : "#fee2e2",
                color: quickActionFeedback.type === "success" ? "#059669" : "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px"
              }}>
                {quickActionFeedback.type === "success" ? (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                )}
              </div>
              <h2 style={{ color: "#1f2937", marginBottom: "8px" }}>
                {quickActionFeedback.type === "success" ? "İşlem Başarılı!" : "Hata Oluştu"}
              </h2>
              <p style={{ color: "#6b7280", fontSize: "16px", marginBottom: "32px" }}>
                {quickActionFeedback.message}
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
                <button
                  onClick={() => setQuickActionFeedback(null)}
                  style={{
                    padding: "10px 24px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "14px",
                    boxShadow: "0 2px 4px rgba(59, 130, 246, 0.3)"
                  }}
                >
                  Yeni İşlem Yap
                </button>
                <button
                  onClick={closeQuickModal}
                  style={{
                    padding: "10px 24px",
                    backgroundColor: "#f3f4f6",
                    color: "#4b5563",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  Kapat
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ margin: 0 }}>
                  {quickAction === "quick-add-book" && "Hızlı Kitap Ekle"}
                  {quickAction === "quick-borrow" && "Hızlı Ödünç Ver"}
                  {quickAction === "quick-return" && "Hızlı Teslim Al"}
                  {quickAction === "quick-stock" && "Hızlı Adet Kontrol"}
                </h3>
                <button
                  onClick={closeQuickModal}
                  style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              {quickAction === "quick-add-book" && !quickAddMethod && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                  <div
                    onClick={() => setQuickAddMethod("api")}
                    style={{
                      padding: "24px",
                      borderRadius: "12px",
                      border: "2px solid #e5e7eb",
                      backgroundColor: "white",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      textAlign: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#93c5fd";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.backgroundColor = "white";
                    }}
                  >
                    <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔍</div>
                    <h3 style={{ margin: "0 0 8px 0", color: "#1f2937", fontSize: "18px" }}>Google Books API</h3>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
                      API üzerinden kitap arayıp ekleyin
                    </p>
                  </div>

                  <div
                    onClick={() => setQuickAddMethod("file")}
                    style={{
                      padding: "24px",
                      borderRadius: "12px",
                      border: "2px solid #e5e7eb",
                      backgroundColor: "white",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      textAlign: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#93c5fd";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.backgroundColor = "white";
                    }}
                  >
                    <div style={{ fontSize: "48px", marginBottom: "12px" }}>📄</div>
                    <h3 style={{ margin: "0 0 8px 0", color: "#1f2937", fontSize: "18px" }}>Dosya Yükle</h3>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
                      Görsel veya PDF dosyası yükleyin
                    </p>
                  </div>

                  <div
                    onClick={() => setQuickAddMethod("manual")}
                    style={{
                      padding: "24px",
                      borderRadius: "12px",
                      border: "2px solid #e5e7eb",
                      backgroundColor: "white",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      textAlign: "center",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#93c5fd";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.backgroundColor = "white";
                    }}
                  >
                    <div style={{ fontSize: "48px", marginBottom: "12px" }}>✍️</div>
                    <h3 style={{ margin: "0 0 8px 0", color: "#1f2937", fontSize: "18px" }}>Manuel Ekle</h3>
                    <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
                      Künye bilgilerini manuel olarak girin
                    </p>
                  </div>
                </div>
              )}

              {quickAction === "quick-add-book" && quickAddMethod && (
                <div>
                  <button
                    onClick={() => setQuickAddMethod(null)}
                    style={{
                      marginBottom: "16px",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid #e5e7eb",
                      background: "#f3f4f6",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    ← Geri
                  </button>
                  {quickAddMethod === "api" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: "120px" }}>
                          <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px" }}>Arama Türü</label>
                          <select
                            value={googleBooksSearchType}
                            onChange={(e) => setGoogleBooksSearchType(e.target.value as "title" | "author")}
                            style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                          >
                            <option value="title">Kitap Başlığı</option>
                            <option value="author">Yazar Adı</option>
                          </select>
                        </div>
                        <div style={{ flex: 2, minWidth: "200px" }}>
                          <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px" }}>Arama Sorgusu</label>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <input
                              type="text"
                              value={googleBooksSearchQuery}
                              onChange={(e) => setGoogleBooksSearchQuery(e.target.value)}
                              onKeyPress={(e) => e.key === "Enter" && handleGoogleBooksSearch()}
                              placeholder={googleBooksSearchType === "title" ? "Örn: Kara Kitap" : "Örn: Orhan Pamuk"}
                              style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                            />
                            <button
                              onClick={handleGoogleBooksSearch}
                              disabled={googleBooksLoading}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "#2563eb",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: googleBooksLoading ? "not-allowed" : "pointer",
                                fontWeight: 600,
                              }}
                            >
                              {googleBooksLoading ? "Aranıyor..." : "🔍"}
                            </button>
                          </div>
                        </div>
                      </div>

                      {googleBooksMessage && (
                        <div style={{
                          padding: "10px",
                          borderRadius: "6px",
                          backgroundColor: googleBooksMessage.type === "success" ? "#d1fae5" : "#fee2e2",
                          color: googleBooksMessage.type === "success" ? "#065f46" : "#991b1b",
                          fontSize: "14px",
                        }}>
                          {googleBooksMessage.text}
                        </div>
                      )}

                      {googleBooksResults.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "300px", overflowY: "auto" }}>
                          {googleBooksResults.map((book, index) => {
                            const isSelected = selectedGoogleBooks.has(index);
                            return (
                              <div
                                key={index}
                                onClick={() => toggleGoogleBookSelection(index)}
                                style={{
                                  padding: "12px",
                                  border: `2px solid ${isSelected ? "#2563eb" : "#e5e7eb"}`,
                                  borderRadius: "8px",
                                  cursor: "pointer",
                                  backgroundColor: isSelected ? "#eff6ff" : "white",
                                }}
                              >
                                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleGoogleBookSelection(index)}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ marginTop: "4px" }}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: "#1f2937", marginBottom: "4px" }}>{book.title}</div>
                                    <div style={{ fontSize: "13px", color: "#6b7280" }}>{book.author} • {book.category}</div>
                                    {book.publisher && (
                                      <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>Yayınevi: {book.publisher}</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {selectedGoogleBooks.size > 0 && (
                        <button
                          onClick={handleAddGoogleBooks}
                          disabled={googleBooksLoading}
                          style={{
                            width: "100%",
                            padding: "10px",
                            borderRadius: "6px",
                            border: "none",
                            background: googleBooksLoading ? "#94a3b8" : "#10b981",
                            color: "white",
                            cursor: googleBooksLoading ? "not-allowed" : "pointer",
                            fontWeight: 600,
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px" }}>
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                          {googleBooksLoading ? "Ekleniyor..." : ` Seçili Kitapları Ekle (${selectedGoogleBooks.size})`}
                        </button>
                      )}
                    </div>
                  )}
                  {quickAddMethod === "file" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, fontSize: "14px" }}>Dosya Seç</label>
                        <div style={{ padding: "16px", backgroundColor: "#f9fafb", borderRadius: "8px", border: "2px dashed #e5e7eb" }}>
                          <label
                            htmlFor="quick-file-upload"
                            style={{
                              display: "inline-block",
                              padding: "10px 20px",
                              backgroundColor: "#2563eb",
                              color: "white",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontWeight: 600,
                              fontSize: "14px",
                            }}
                          >
                            📎 Dosya Seç
                          </label>
                          <input
                            id="quick-file-upload"
                            type="file"
                            accept="image/jpeg,image/png,image/jpg,application/pdf"
                            onChange={handleQuickFileSelect}
                            style={{ display: "none" }}
                          />
                          {quickFileUpload && (
                            <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "white", borderRadius: "6px", border: "1px solid #e5e7eb" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>{quickFileUpload.name}</div>
                                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                                    {(quickFileUpload.size / 1024).toFixed(2)} KB
                                  </div>
                                </div>
                                <button
                                  onClick={() => setQuickFileUpload(null)}
                                  style={{
                                    padding: "4px 12px",
                                    backgroundColor: "#ef4444",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                  }}
                                >
                                  Kaldır
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "#fef3c7", borderRadius: "6px", border: "1px solid #fcd34d", fontSize: "13px", color: "#92400e" }}>
                          <strong>Kabul edilen formatlar:</strong> JPG, PNG, PDF
                        </div>
                      </div>

                      {quickFileMessage && (
                        <div style={{
                          padding: "10px",
                          borderRadius: "6px",
                          backgroundColor: quickFileMessage.type === "success" ? "#d1fae5" : "#fee2e2",
                          color: quickFileMessage.type === "success" ? "#065f46" : "#991b1b",
                          fontSize: "14px",
                        }}>
                          {quickFileMessage.text}
                        </div>
                      )}

                      {quickFileUpload && (
                        <button
                          onClick={handleQuickFileUpload}
                          disabled={quickFileLoading}
                          style={{
                            width: "100%",
                            padding: "10px",
                            borderRadius: "6px",
                            border: "none",
                            background: quickFileLoading ? "#94a3b8" : "#10b981",
                            color: "white",
                            cursor: quickFileLoading ? "not-allowed" : "pointer",
                            fontWeight: 600,
                          }}
                        >
                          {quickFileLoading ? "Yükleniyor..." : " Dosyayı Yükle"}
                        </button>
                      )}
                    </div>
                  )}
                  {quickAddMethod === "manual" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Kitap Adı *</label>
                        <input
                          type="text"
                          value={quickBookTitle}
                          onChange={(e) => setQuickBookTitle(e.target.value)}
                          placeholder="Kitap adı"
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Yazar *</label>
                        <input
                          type="text"
                          value={quickBookAuthor}
                          onChange={(e) => setQuickBookAuthor(e.target.value)}
                          placeholder="Yazar adı"
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Kategori</label>
                        <input
                          type="text"
                          value={quickBookCategory}
                          onChange={(e) => setQuickBookCategory(e.target.value)}
                          placeholder="Kategori (opsiyonel)"
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Adet</label>
                        <input
                          type="number"
                          value={quickBookQuantity}
                          onChange={(e) => setQuickBookQuantity(parseInt(e.target.value) || 1)}
                          min="1"
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        />
                      </div>
                      <button
                        onClick={handleQuickAddBook}
                        disabled={!quickBookTitle.trim() || !quickBookAuthor.trim()}
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: "6px",
                          border: "none",
                          background: quickBookTitle.trim() && quickBookAuthor.trim() ? "#3b82f6" : "#94a3b8",
                          color: "white",
                          cursor: quickBookTitle.trim() && quickBookAuthor.trim() ? "pointer" : "not-allowed",
                          fontWeight: 600,
                        }}

                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px" }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Kitap Ekle
                      </button>
                    </div>
                  )}
                </div>
              )}

              {quickAction === "quick-borrow" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Kitap Ara ve Seç *</label>
                    <input
                      type="text"
                      value={quickBorrowBookSearch}
                      onChange={(e) => setQuickBorrowBookSearch(e.target.value)}
                      placeholder="Kitap adı, yazar veya kategori ile ara..."
                      style={{ width: "100%", padding: "10px" }}
                    />
                    {quickBorrowBookSearch && (
                      <div style={{ marginTop: "8px", maxHeight: "260px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", background: "white" }}>
                        {filteredQuickBorrowBooks.length === 0 ? (
                          <div style={{ padding: "12px", textAlign: "center", color: "#6b7280" }}>Kayıt bulunamadı</div>
                        ) : (
                          filteredQuickBorrowBooks.map(book => (
                            <div
                              key={book.id}
                              onClick={() => {
                                setQuickBorrowBookId(book.id || null);
                                setQuickBorrowBookSearch(book.title || "");
                              }}
                              style={{
                                padding: "12px",
                                borderBottom: "1px solid #f3f4f6",
                                cursor: "pointer",
                                background: quickBorrowBookId === book.id ? "#eff6ff" : "white",
                              }}
                            >
                              <div style={{ fontWeight: 600, color: "#1f2937" }}>{book.title}</div>
                              <div style={{ fontSize: "13px", color: "#6b7280" }}>{book.author} • {book.category}</div>
                              <div style={{ fontSize: "12px", color: "#9ca3af" }}>Adet: {book.quantity}/{book.totalQuantity}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "14px" }}>
                      Öğrenci Ara ve Seç *
                    </label>
                    <input
                      type="text"
                      value={quickBorrowStudentSearch}
                      onChange={(e) => setQuickBorrowStudentSearch(e.target.value)}
                      placeholder="Öğrenci adı ile ara..."
                      style={{ width: "100%", padding: "10px" }}
                    />
                    {quickBorrowStudentSearch && (
                      <div style={{
                        marginTop: "8px",
                        maxHeight: "300px",
                        overflowY: "auto",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        backgroundColor: "white",
                      }}>
                        {filteredQuickStudents.length > 0 ? (
                          filteredQuickStudents.map((student) => {
                            const studentFullName = formatStudentFullName(student);
                            return (
                              <div
                                key={studentFullName}
                                onClick={() => {
                                  setQuickBorrowStudent(studentFullName);
                                  setQuickBorrowStudentSearch(""); // Dropdown'ı kapat
                                }}
                                style={{
                                  padding: "12px",
                                  cursor: "pointer",
                                  borderBottom: "1px solid #f3f4f6",
                                  backgroundColor: quickBorrowStudent === studentFullName ? "#eff6ff" : "white",
                                  transition: "background-color 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                  if (quickBorrowStudent !== studentFullName) {
                                    e.currentTarget.style.backgroundColor = "#f9fafb";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (quickBorrowStudent !== studentFullName) {
                                    e.currentTarget.style.backgroundColor = "white";
                                  }
                                }}
                              >
                                <div style={{ fontWeight: 600, color: "#1f2937", marginBottom: "6px" }}>
                                  {student.name} {student.surname}
                                </div>
                                <div style={{ fontSize: "12px", color: "#6b7280", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                                  <span>
                                    <strong>Ödünç:</strong> {student.borrowed}
                                  </span>
                                  <span>
                                    <strong>İade:</strong> {student.returned}
                                  </span>
                                  <span>
                                    <strong>Geciken:</strong>{" "}
                                    <span style={{ color: student.late > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                                      {student.late}
                                    </span>
                                  </span>
                                  <span>
                                    <strong>Aktif Ödünç:</strong> {(() => {
                                      // Aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
                                      const studentValidLoans = loans.filter(l =>
                                        (l.borrower === studentFullName || l.borrower === student.name) &&
                                        books.some(b => b.id === l.bookId)
                                      );
                                      return studentValidLoans.length;
                                    })()}
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
                    {quickBorrowStudent && (
                      <div style={{
                        marginTop: "8px",
                        padding: "16px",
                        backgroundColor: "#eff6ff",
                        borderRadius: "8px",
                        border: "1px solid #3b82f6",
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: "12px", fontSize: "16px", color: "#1f2937" }}>
                          Seçilen Öğrenci: {quickBorrowStudent}
                        </div>
                        {(() => {
                          const studentData = studentStats.find((s) =>
                            s.name === quickBorrowStudent ||
                            `${s.name} ${s.surname}`.trim() === quickBorrowStudent ||
                            s.surname === quickBorrowStudent
                          );
                          if (!studentData) return null;
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                                <div style={{ fontSize: "14px" }}>
                                  <strong>Toplam Ödünç:</strong> {studentData.borrowed}
                                </div>
                                <div style={{ fontSize: "14px" }}>
                                  <strong>İade:</strong> {studentData.returned}
                                </div>
                                <div style={{ fontSize: "14px" }}>
                                  <strong>Geciken Kitap:</strong>{" "}
                                  <span style={{ color: studentData.late > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                                    {studentData.late}
                                  </span>
                                </div>
                                <div style={{ fontSize: "14px" }}>
                                  <strong>Aktif Ödünç:</strong>{" "}
                                  {(() => {
                                    // Aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
                                    const studentValidLoans = loans.filter(l =>
                                      l.borrower === quickBorrowStudent && books.some(b => b.id === l.bookId)
                                    );
                                    const activeLoansCount = studentValidLoans.length;
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
                              {studentData.late > 0 && (
                                <div style={{
                                  padding: "8px",
                                  backgroundColor: "#fee2e2",
                                  borderRadius: "6px",
                                  color: "#dc2626",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                }}>
                                  ⚠️ Bu öğrencinin {studentData.late} geciken kitabı var!
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <button
                          onClick={() => {
                            setQuickBorrowStudent("");
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

                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Ödünç Süresi</label>
                    <select
                      value={quickBorrowDays}
                      onChange={(e) => setQuickBorrowDays(parseInt(e.target.value) || 14)}
                      style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    >
                      {[7, 10, 14, 21, 30].map(d => (
                        <option key={d} value={d}>{d} gün</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleQuickBorrow}
                    disabled={!quickBorrowBookId || !quickBorrowStudent.trim()}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "6px",
                      border: "none",
                      background: quickBorrowBookId && quickBorrowStudent.trim() ? "#10b981" : "#94a3b8",
                      color: "white",
                      cursor: quickBorrowBookId && quickBorrowStudent.trim() ? "pointer" : "not-allowed",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                      <path d="M9 9l3 3 3-3"></path>
                    </svg>
                    Ödünç Ver
                  </button>

                </div>
              )}

              {/* Onay Modalı - kitap limiti aşıldığında */}
              {showQuickBorrowConfirmModal && pendingQuickBorrow && createPortal(
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
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setShowQuickBorrowConfirmModal(false);
                      setPendingQuickBorrow(null);
                    }
                  }}
                >
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      padding: "24px",
                      maxWidth: "500px",
                      width: "90%",
                      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                      <h2 style={{ margin: 0, color: "#1e293b", fontSize: "20px", fontWeight: 600 }}>
                        ⚠️ Kitap Limiti Uyarısı
                      </h2>
                      <button
                        onClick={() => {
                          setShowQuickBorrowConfirmModal(false);
                          setPendingQuickBorrow(null);
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
                      const studentData = studentStats.find((s) =>
                        s.name === pendingQuickBorrow.student ||
                        `${s.name} ${s.surname}`.trim() === pendingQuickBorrow.student ||
                        s.surname === pendingQuickBorrow.student
                      );
                      if (!studentData) return null;

                      // Öğrencinin zaten aldığı kitapları filtrele
                      const studentFullName = formatStudentFullName(studentData);
                      const availableBooks = getAvailableBooks(pendingQuickBorrow.books, studentFullName);
                      // Aktif ödünç sayısını loans array'inden hesapla ve silinmiş kitapları filtrele
                      const studentValidLoans = loans.filter(l =>
                        l.borrower === pendingQuickBorrow.student && books.some(b => b.id === l.bookId)
                      );
                      const activeLoans = studentValidLoans.length;
                      const totalAfterBorrow = activeLoans + availableBooks.length;
                      const excess = totalAfterBorrow - maxBorrowLimit;
                      const alreadyBorrowedCount = pendingQuickBorrow.books.length - availableBooks.length;

                      return (
                        <>
                          <div style={{ marginBottom: "20px" }}>
                            <div style={{ fontSize: "14px", color: "#475569", marginBottom: "12px", lineHeight: "1.6" }}>
                              <strong>{pendingQuickBorrow.student}</strong> öğrencisi şu anda <strong>{activeLoans}</strong> kitap ödünç almış durumda.
                            </div>
                            {alreadyBorrowedCount > 0 && (
                              <div style={{
                                padding: "8px",
                                backgroundColor: "#fee2e2",
                                borderRadius: "6px",
                                color: "#dc2626",
                                fontSize: "13px",
                                fontWeight: 600,
                                marginBottom: "12px",
                              }}>
                                ⚠️ Seçilen kitaplardan <strong>{alreadyBorrowedCount}</strong> tanesi öğrenci tarafından zaten ödünç alınmış. Bu kitaplar verilmeyecek.
                              </div>
                            )}
                            <div style={{ fontSize: "14px", color: "#475569", marginBottom: "12px", lineHeight: "1.6" }}>
                              Verilebilecek <strong>{availableBooks.length}</strong> kitap eklendiğinde toplam <strong>{totalAfterBorrow}</strong> kitap olacak.
                            </div>
                            <div
                              style={{
                                padding: "12px",
                                backgroundColor: "#fef3c7",
                                borderRadius: "8px",
                                border: "1px solid #fbbf24",
                                marginBottom: "12px",
                              }}
                            >
                              <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 600, marginBottom: "4px" }}>
                                ⚠️ Limit Aşımı
                              </div>
                              <div style={{ fontSize: "13px", color: "#78350f" }}>
                                Bir öğrenci en fazla <strong>{maxBorrowLimit} kitap</strong> alabilir. Bu işlem sonrası öğrenci <strong>{excess} kitap fazla</strong> alacak.
                                {alreadyBorrowedCount > 0 && (
                                  <span style={{ display: "block", marginTop: "4px", fontSize: "12px" }}>
                                    Not: {alreadyBorrowedCount} kitap zaten ödünçte olduğu için verilmeyecek.
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "12px" }}>
                              <strong>Verilebilecek Kitaplar ({availableBooks.length}):</strong>
                              <ul style={{ marginTop: "8px", paddingLeft: "20px", fontSize: "12px" }}>
                                {availableBooks.map((book) => (
                                  <li key={book.id} style={{ marginBottom: "4px" }}>
                                    {book.title} - {book.author}
                                  </li>
                                ))}
                              </ul>
                              {alreadyBorrowedCount > 0 && (
                                <>
                                  <strong style={{ color: "#dc2626", marginTop: "12px", display: "block" }}>
                                    Zaten Ödünçte Olan Kitaplar ({alreadyBorrowedCount}):
                                  </strong>
                                  <ul style={{ marginTop: "8px", paddingLeft: "20px", fontSize: "12px", color: "#9ca3af" }}>
                                    {pendingQuickBorrow.books
                                      .filter(book => !availableBooks.some(ab => ab.id === book.id))
                                      .map((book) => (
                                        <li key={book.id} style={{ marginBottom: "4px", textDecoration: "line-through" }}>
                                          {book.title} - {book.author}
                                        </li>
                                      ))}
                                  </ul>
                                </>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                            <button
                              onClick={() => {
                                setShowQuickBorrowConfirmModal(false);
                                setPendingQuickBorrow(null);
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
                              onClick={confirmQuickBorrowAfterLimit}
                              disabled={availableBooks.length === 0}
                              style={{
                                padding: "10px 20px",
                                fontSize: "14px",
                                backgroundColor: availableBooks.length === 0 ? "#94a3b8" : "#ef4444",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: availableBooks.length === 0 ? "not-allowed" : "pointer",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px",
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                <path d="M9 9l3 3 3-3"></path>
                              </svg>
                              Yine de Ödünç Ver ({availableBooks.length} kitap)
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>,
                document.body
              )}

              {quickAction === "quick-return" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600 }}>Ödünç Ara ve Seç</label>
                    <input
                      type="text"
                      value={quickReturnSearch}
                      onChange={(e) => {
                        setQuickReturnSearch(e.target.value);
                        if (quickReturnLoanId) {
                          setQuickReturnLoanId(null); // Arama yapıldığında seçimi temizle
                        }
                      }}
                      placeholder="Kitap adı, yazar veya öğrenci ile ara..."
                      style={{ width: "100%", padding: "10px" }}
                    />
                    {quickReturnLoanId ? (
                      // Seçilen kayıt bilgilerini göster
                      (() => {
                        const selectedLoan = loans.find(l => `${l.bookId}-${l.borrower}` === quickReturnLoanId);
                        if (!selectedLoan) return null;
                        // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
                        const diff = getDaysDiff(selectedLoan.dueDate);
                        const isLate = diff < 0;
                        const statusText = isLate
                          ? `Gecikmiş (${Math.abs(diff)} gün)`
                          : diff === 0
                            ? "Bugün Son Gün"
                            : `${diff} gün kaldı`;
                        return (
                          <div style={{ marginTop: "8px", padding: "16px", border: "2px solid #3b82f6", borderRadius: "8px", background: "#eff6ff" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: "#1f2937", fontSize: "16px", marginBottom: "8px" }}>{selectedLoan.title}</div>
                                <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                                  <strong>Yazar:</strong> {selectedLoan.author}
                                </div>
                                <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                                  <strong>Öğrenci:</strong> {selectedLoan.borrower}
                                </div>
                                <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                                  <strong>Kategori:</strong> {selectedLoan.category}
                                </div>
                                <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "4px" }}>
                                  <strong>Bitiş Tarihi:</strong> {new Date(selectedLoan.dueDate).toLocaleDateString("tr-TR", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })}
                                </div>
                                <div style={{ fontSize: "14px", color: isLate ? "#dc2626" : "#f59e0b", fontWeight: 700 }}>
                                  <strong>Durum:</strong> {statusText}
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setQuickReturnLoanId(null);
                                  setQuickReturnSearch("");
                                }}
                                style={{
                                  padding: "4px 12px",
                                  backgroundColor: "#ef4444",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : quickReturnSearch.trim().length > 0 ? (
                      // Arama sonuçlarını göster
                      <div style={{ marginTop: "8px", maxHeight: "260px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "8px", background: "white" }}>
                        {filteredQuickReturnLoans.length === 0 ? (
                          <div style={{ padding: "12px", textAlign: "center", color: "#6b7280" }}>Arama kriterlerinize uygun kayıt bulunamadı</div>
                        ) : (
                          filteredQuickReturnLoans.map((loan, idx) => {
                            // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
                            const diff = getDaysDiff(loan.dueDate);
                            const isLate = diff < 0;
                            const statusText = isLate
                              ? `Gecikmiş (${Math.abs(diff)} gün)`
                              : diff === 0
                                ? "Bugün Son Gün"
                                : `${diff} gün kaldı`;
                            return (
                              <div
                                key={`${loan.bookId}-${loan.borrower}-${idx}`}
                                onClick={() => {
                                  setQuickReturnLoanId(`${loan.bookId}-${loan.borrower}`);
                                  setQuickReturnSearch(`${loan.title} - ${loan.borrower}`);
                                }}
                                style={{
                                  padding: "12px",
                                  borderBottom: "1px solid #f3f4f6",
                                  cursor: "pointer",
                                  background: "white",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "#f9fafb";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "white";
                                }}
                              >
                                <div style={{ fontWeight: 600, color: "#1f2937" }}>{loan.title}</div>
                                <div style={{ fontSize: "13px", color: "#6b7280" }}>{loan.borrower} • {loan.author}</div>
                                <div style={{ fontSize: "12px", color: isLate ? "#dc2626" : "#f59e0b", fontWeight: 600 }}>
                                  {statusText}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                  <button
                    onClick={handleQuickReturn}
                    disabled={!quickReturnLoanId}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "6px",
                      border: "none",
                      background: quickReturnLoanId ? "#f59e0b" : "#94a3b8",
                      color: "white",
                      cursor: quickReturnLoanId ? "pointer" : "not-allowed",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Teslim Al
                  </button>
                </div>
              )}

              {quickAction === "quick-stock" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "70vh", overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
                    <button
                      onClick={() => setStockFilter("low")}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "8px",
                        border: stockFilter === "low" ? "2px solid #f59e0b" : "1px solid #e5e7eb",
                        background: stockFilter === "low" ? "#fffbeb" : "#fff",
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "#d97706",
                      }}
                    >
                      ≤2 Adet ({lowStockBooks.length})
                    </button>
                    <button
                      onClick={() => setStockFilter("out")}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "8px",
                        border: stockFilter === "out" ? "2px solid #ef4444" : "1px solid #e5e7eb",
                        background: stockFilter === "out" ? "#fef2f2" : "#fff",
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "#b91c1c",
                      }}
                    >
                      Tükenen ({outStockBooks.length})
                    </button>
                    <button
                      onClick={() => setStockFilter("all")}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "8px",
                        border: stockFilter === "all" ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                        background: stockFilter === "all" ? "#eff6ff" : "#fff",
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "#1d4ed8",
                      }}
                    >
                      Tümü ({books.length})
                    </button>
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <input
                      type="text"
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      placeholder="Adet listesinde ara (kitap, yazar, kategori)"
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                    />
                  </div>
                  <div style={{ flex: 1, overflow: "auto", maxHeight: "calc(70vh - 140px)" }}>
                    {filteredStockBooks.length === 0 ? (
                      <p style={{ color: "#94a3b8", margin: 0 }}>Kayıt bulunamadı.</p>
                    ) : (
                      <table className="book-table" style={{ width: "100%" }}>
                        <thead>
                          <tr>
                            <th
                              onClick={() => {
                                if (stockSortColumn === "title") {
                                  setStockSortDirection(stockSortDirection === "asc" ? "desc" : "asc");
                                } else {
                                  setStockSortColumn("title");
                                  setStockSortDirection("asc");
                                }
                              }}
                              style={{ cursor: "pointer", userSelect: "none" }}
                            >
                              Kitap {stockSortColumn === "title" && (stockSortDirection === "asc" ? "↑" : "↓")}
                            </th>
                            <th
                              onClick={() => {
                                if (stockSortColumn === "author") {
                                  setStockSortDirection(stockSortDirection === "asc" ? "desc" : "asc");
                                } else {
                                  setStockSortColumn("author");
                                  setStockSortDirection("asc");
                                }
                              }}
                              style={{ cursor: "pointer", userSelect: "none" }}
                            >
                              Yazar {stockSortColumn === "author" && (stockSortDirection === "asc" ? "↑" : "↓")}
                            </th>
                            <th
                              onClick={() => {
                                if (stockSortColumn === "category") {
                                  setStockSortDirection(stockSortDirection === "asc" ? "desc" : "asc");
                                } else {
                                  setStockSortColumn("category");
                                  setStockSortDirection("asc");
                                }
                              }}
                              style={{ cursor: "pointer", userSelect: "none" }}
                            >
                              Kategori {stockSortColumn === "category" && (stockSortDirection === "asc" ? "↑" : "↓")}
                            </th>
                            <th
                              onClick={() => {
                                if (stockSortColumn === "quantity") {
                                  setStockSortDirection(stockSortDirection === "asc" ? "desc" : "asc");
                                } else {
                                  setStockSortColumn("quantity");
                                  setStockSortDirection("asc");
                                }
                              }}
                              style={{ cursor: "pointer", userSelect: "none" }}
                            >
                              Adet {stockSortColumn === "quantity" && (stockSortDirection === "asc" ? "↑" : "↓")}
                            </th>
                            <th
                              onClick={() => {
                                if (stockSortColumn === "loans") {
                                  setStockSortDirection(stockSortDirection === "asc" ? "desc" : "asc");
                                } else {
                                  setStockSortColumn("loans");
                                  setStockSortDirection("asc");
                                }
                              }}
                              style={{ cursor: "pointer", userSelect: "none" }}
                            >
                              Ödünçte {stockSortColumn === "loans" && (stockSortDirection === "asc" ? "↑" : "↓")}
                            </th>
                            <th
                              onClick={() => {
                                if (stockSortColumn === "totalQuantity") {
                                  setStockSortDirection(stockSortDirection === "asc" ? "desc" : "asc");
                                } else {
                                  setStockSortColumn("totalQuantity");
                                  setStockSortDirection("asc");
                                }
                              }}
                              style={{ cursor: "pointer", userSelect: "none" }}
                            >
                              Toplam {stockSortColumn === "totalQuantity" && (stockSortDirection === "asc" ? "↑" : "↓")}
                            </th>
                            <th>Adet İşlem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStockBooks.map((b) => (
                            <tr key={b.id || b.title}>
                              <td>{b.title}</td>
                              <td>{b.author}</td>
                              <td>{b.category}</td>
                              <td style={{ fontWeight: 700, color: b.quantity === 0 ? "#b91c1c" : "#d97706" }}>{b.quantity}</td>
                              <td>{b.loans?.length ?? 0}</td>
                              <td>{b.totalQuantity}</td>
                              <td>
                                <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!stockBusy && (b.quantity || 0) > 0 && stockAdjustingId !== b.id) {
                                        handleStockAdjust(b.id!, -1);
                                      }
                                    }}
                                    disabled={stockBusy || (b.quantity || 0) <= 0 || stockAdjustingId === b.id}
                                    style={{
                                      width: "32px",
                                      height: "32px",
                                      padding: 0,
                                      borderRadius: "999px",
                                      border: "1px solid #e5e7eb",
                                      background: stockBusy || (b.quantity || 0) <= 0 || stockAdjustingId === b.id ? "#f3f4f6" : "#fff",
                                      cursor: stockBusy || (b.quantity || 0) <= 0 || stockAdjustingId === b.id ? "not-allowed" : "pointer",
                                      fontWeight: 700,
                                      fontSize: "18px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      lineHeight: 1,
                                      color: stockBusy || (b.quantity || 0) <= 0 || stockAdjustingId === b.id ? "#9ca3af" : "#374151",
                                    }}
                                  >
                                    {stockAdjustingId === b.id ? "..." : "-"}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!stockBusy && stockAdjustingId !== b.id) {
                                        handleStockAdjust(b.id!, 1);
                                      }
                                    }}
                                    disabled={stockBusy || stockAdjustingId === b.id}
                                    style={{
                                      width: "32px",
                                      height: "32px",
                                      padding: 0,
                                      borderRadius: "999px",
                                      border: "1px solid #e5e7eb",
                                      background: stockBusy || stockAdjustingId === b.id ? "#f3f4f6" : "#fff",
                                      cursor: stockBusy || stockAdjustingId === b.id ? "not-allowed" : "pointer",
                                      fontWeight: 700,
                                      fontSize: "18px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      lineHeight: 1,
                                      color: stockBusy || stockAdjustingId === b.id ? "#9ca3af" : "#374151",
                                    }}
                                  >
                                    {stockAdjustingId === b.id ? "..." : "+"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div >,
      document.body
    );
  };

  return (
    <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", color: "#1e293b" }}>
      {/* Sol tarafta scroll menü kartları - tek kart içinde */}
      <div
        style={{
          width: "280px",
          position: "sticky",
          top: "24px",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
        }}
      >
        <div className="card" style={{ padding: "16px", background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 50%, #93c5fd 100%)", border: "1px solid rgba(59, 130, 246, 0.3)", boxShadow: "0 8px 24px rgba(30, 64, 175, 0.15)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Ana menü öğeleri */}
            {menuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                style={{
                  backgroundColor: activeTab === item.id ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.5)",
                  backdropFilter: "blur(10px)",
                  color: activeTab === item.id ? "#1e40af" : "#475569",
                  padding: "16px 20px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  boxShadow: activeTab === item.id ? "0 6px 16px rgba(30, 64, 175, 0.2)" : "0 4px 6px rgba(0, 0, 0, 0.05)",
                  transition: "all 0.3s ease",
                  border: activeTab === item.id ? "2px solid rgba(59, 130, 246, 0.4)" : "2px solid rgba(59, 130, 246, 0.2)",
                  fontWeight: activeTab === item.id ? 700 : 600,
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== item.id) {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.6)";
                    e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.3)";
                    e.currentTarget.style.color = "#1e40af";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(30, 64, 175, 0.15)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== item.id) {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
                    e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.2)";
                    e.currentTarget.style.color = "#475569";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.05)";
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "32px",
                    height: "32px",
                    color: activeTab === item.id ? "#1e40af" : "#475569",
                    transition: "all 0.3s ease"
                  }}>
                    {item.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: activeTab === item.id ? 700 : 600, fontSize: "15px", color: activeTab === item.id ? "#1e40af" : "#475569" }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "2px", color: activeTab === item.id ? "#334155" : "#64748b" }}>
                      {item.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Veri Yükle sekmesi - sadece sağ menüde */}
            {sideMenuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                style={{
                  backgroundColor: activeTab === item.id ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.5)",
                  backdropFilter: "blur(10px)",
                  color: activeTab === item.id ? "#1e40af" : "#475569",
                  padding: "16px 20px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  boxShadow: activeTab === item.id ? "0 6px 16px rgba(30, 64, 175, 0.2)" : "0 4px 6px rgba(0, 0, 0, 0.05)",
                  transition: "all 0.3s ease",
                  border: activeTab === item.id ? "2px solid rgba(59, 130, 246, 0.4)" : "2px solid rgba(59, 130, 246, 0.2)",
                  fontWeight: activeTab === item.id ? 700 : 600,
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== item.id) {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.6)";
                    e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.3)";
                    e.currentTarget.style.color = "#1e40af";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(30, 64, 175, 0.15)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== item.id) {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
                    e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.2)";
                    e.currentTarget.style.color = "#475569";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.05)";
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "32px",
                    height: "32px",
                    color: activeTab === item.id ? "#1e40af" : "#475569",
                    transition: "all 0.3s ease"
                  }}>
                    {item.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: activeTab === item.id ? 700 : 600, fontSize: "15px", color: activeTab === item.id ? "#1e40af" : "#475569" }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "2px", color: activeTab === item.id ? "#334155" : "#64748b" }}>
                      {item.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ana içerik alanı */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {renderContent()}
      </div>

      {/* Ana sayfa modalı */}
      {homeModal && createPortal(
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
          onClick={() => setHomeModal(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: "1200px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              overflowX: "hidden",
              position: "relative"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px" }}>
              <h2 style={{ margin: 0, flex: 1 }}>
                {homeModal === "active-loans" && "Aktif Ödünçler"}
                {homeModal === "late-loans" && "Geciken Ödünçler"}
                {homeModal === "due-soon" && "Teslim Tarihi Yaklaşanlar"}
                {homeModal === "due-soon-0-3" && "Teslim Tarihi Yaklaşanlar"}
                {homeModal === "due-soon-4-7" && "Teslim Tarihi Yaklaşanlar"}
                {homeModal === "due-soon-8-14" && "Teslim Tarihi Yaklaşanlar"}
                {homeModal === "due-soon-15plus" && "Teslim Tarihi Yaklaşanlar"}
                {homeModal === "due-soon-list" && "Teslim Tarihi Yaklaşanlar"}
                {homeModal === "top-borrowed" && "En Çok Ödünç Alınan Kitaplar"}
                {homeModal === "total-borrowed" && `Tüm Ödünçler (${totalBorrowedCount} kayıt)`}
                {homeModal === "total-books" && `Tüm Kitaplar (${books.length} kitap)`}
                {homeModal === "total-students" && `Tüm Öğrenciler (${studentStats.length} öğrenci)`}
                {homeModal === "stock-low" && `Azalan Adet (≤2) - ${lowStockBooks.length} kitap`}
                {homeModal === "stock-out" && `Tükenen Adet - ${outStockBooks.length} kitap`}
                {homeModal === "banned-students" && `Cezalı Öğrenciler (${bannedStudents.length} öğrenci)`}
              </h2>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  onClick={() => {
                    const targetTab =
                      homeModal === "total-students" || homeModal === "banned-students"
                        ? "ogrenci"
                        : homeModal === "total-books" || homeModal === "top-borrowed" || homeModal === "stock-low" || homeModal === "stock-out"
                          ? "katalog"
                          : "odunc";
                    setHomeModal(null);
                    handleTabChange(targetTab as TabType);
                  }}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #e5e7eb", background: "#2563eb", color: "white", cursor: "pointer", fontWeight: 600 }}
                >
                  Sayfaya Git
                </button>
                <button
                  onClick={() => setHomeModal(null)}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                  Kapat
                </button>
              </div>
            </div>
            {renderHomeModalContent()}
          </div>
        </div>,
        document.body
      )}

      {/* Hızlı işlemler modalı */}
      {renderQuickActionModal()}

      {/* Kitap Detay Modal - Teslim Tarihi Yaklaşanlar */}
      {selectedDueSoonBook && (
        <BookDetailModal
          book={selectedDueSoonBook}
          students={studentStats}
          loans={loans}
          books={books}
          personelName={userName}
          onClose={() => setSelectedDueSoonBook(null)}
          onRefresh={onRefresh}
          onAddNotification={onAddNotification}
        />
      )}

      {/* Basit Ödünç Detay Kartı - Teslim Tarihi Yaklaşanlar */}
      <SimpleLoanDetailCard
        loan={selectedSimpleLoan}
        books={books}
        onClose={() => setSelectedSimpleLoan(null)}
        onReturn={handleSimpleReturn}
      />

      {/* Öğrenci Detay Modal - Teslim Tarihi Yaklaşanlar */}
      {selectedDueSoonStudent && createPortal(
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setSelectedDueSoonStudent(null)}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)",
              borderRadius: "20px",
              padding: "32px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 25px -5px rgba(30, 64, 175, 0.3)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              animation: "slideUp 0.3s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0, color: "white", fontSize: "24px", fontWeight: 800 }}>Öğrenci Detayları</h2>
              <button
                onClick={() => setSelectedDueSoonStudent(null)}
                style={{
                  background: "rgba(255, 255, 255, 0.15)",
                  border: "2px solid rgba(255, 255, 255, 0.3)",
                  borderRadius: "10px",
                  cursor: "pointer",
                  padding: "8px",
                  color: "white",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ padding: "20px", background: "rgba(255, 255, 255, 0.15)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
                  <div style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "50%",
                    background: "rgba(255, 255, 255, 0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "white"
                  }}>
                    {selectedDueSoonStudent.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: "white", fontSize: "20px", fontWeight: 700 }}>{selectedDueSoonStudent.name}</h3>
                    {selectedDueSoonStudent.studentNumber && (
                      <p style={{ margin: "4px 0 0 0", color: "rgba(255, 255, 255, 0.9)", fontSize: "14px" }}>
                        Öğrenci No: {selectedDueSoonStudent.studentNumber}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.15)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.2)" }}>
                  <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.8)", marginBottom: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Ödünç Alınan</div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "white" }}>{selectedDueSoonStudent.borrowed || 0}</div>
                </div>
                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.15)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.2)" }}>
                  <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.8)", marginBottom: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>İade Edilen</div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "white" }}>{selectedDueSoonStudent.returned || 0}</div>
                </div>
                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.15)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.2)" }}>
                  <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.8)", marginBottom: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Aktif Ödünç</div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "white" }}>{(selectedDueSoonStudent.borrowed || 0) - (selectedDueSoonStudent.returned || 0)}</div>
                </div>
                <div style={{ padding: "16px", background: "rgba(255, 255, 255, 0.15)", backdropFilter: "blur(10px)", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.2)" }}>
                  <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.8)", marginBottom: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Ceza Puanı</div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: (selectedDueSoonStudent.penaltyPoints || 0) >= maxPenaltyPoints ? "#ef4444" : (selectedDueSoonStudent.penaltyPoints || 0) > 0 ? "#f59e0b" : "#10b981" }}>
                    {selectedDueSoonStudent.penaltyPoints || 0}
                  </div>
                </div>
              </div>

              {/* Bu öğrencinin ödünçleri */}
              {(() => {
                const studentLoans = loans.filter(l => l.borrower === selectedDueSoonStudent.name);
                if (studentLoans.length === 0) return null;

                return (
                  <div style={{ marginTop: "8px" }}>
                    <h4 style={{ margin: "0 0 16px 0", color: "white", fontSize: "18px", fontWeight: 700 }}>Aktif Ödünçler</h4>
                    <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
                      {studentLoans.map((loan, idx) => {
                        const loanBook = books.find(b => b.id === loan.bookId);
                        return (
                          <div
                            key={`${loan.bookId}-${idx}`}
                            style={{
                              padding: "16px",
                              background: "rgba(255, 255, 255, 0.15)",
                              backdropFilter: "blur(10px)",
                              borderRadius: "12px",
                              border: "1px solid rgba(255, 255, 255, 0.2)"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: "white", fontSize: "16px", marginBottom: "4px" }}>
                                  {loan.title}
                                </div>
                                {loanBook && (
                                  <div style={{ fontSize: "13px", color: "rgba(255, 255, 255, 0.8)", marginBottom: "4px" }}>
                                    {loanBook.author} {loanBook.category && `• ${loanBook.category}`}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "rgba(255, 255, 255, 0.9)" }}>
                              <span>
                                <strong>Bitiş:</strong> {new Date(loan.dueDate).toLocaleDateString("tr-TR")}
                              </span>
                              {(() => {
                                const diff = getDaysDiff(loan.dueDate);
                                return (
                                  <span style={{
                                    color: diff <= 3 ? "#ef4444" : diff <= 7 ? "#f59e0b" : "#10b981",
                                    fontWeight: 600
                                  }}>
                                    <strong>Kalan:</strong> {diff === 0 ? "Bugün Son Gün" : `${diff} gün`}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Ceza Puanı Düzenleme Modal */}
      {showPenaltyModal && penaltyStudent && createPortal(
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
          }}
          onClick={() => {
            setShowPenaltyModal(false);
            setPenaltyStudent(null);
            setPenaltyError(null);
          }}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ margin: 0, color: "#1e293b" }}>Ceza Puanı Düzenle</h2>
              <button
                onClick={() => {
                  setShowPenaltyModal(false);
                  setPenaltyStudent(null);
                  setPenaltyError(null);
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

            {penaltyError && (
              <div style={{ padding: "12px", backgroundColor: "#fee2e2", color: "#dc2626", borderRadius: "8px", marginBottom: "16px" }}>
                {penaltyError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Öğrenci Bilgileri */}
              <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "16px" }}>{penaltyStudent.name}</div>
                <div style={{ fontSize: "14px", color: "#64748b" }}>
                  {penaltyStudent.class && penaltyStudent.branch
                    ? `${penaltyStudent.class}-${penaltyStudent.branch}`
                    : penaltyStudent.class
                      ? `${penaltyStudent.class}. Sınıf`
                      : ""}
                  {penaltyStudent.studentNumber && ` • No: ${penaltyStudent.studentNumber}`}
                </div>
              </div>

              {/* Ceza Puanı */}
              <div style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "18px", fontWeight: 600, color: "#1e293b" }}>⚖️ Ceza Puanı</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "#64748b", fontSize: "14px", display: "block", marginBottom: "4px" }}>Mevcut Ceza Puanı</strong>
                      <p style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: (penaltyStudent.penaltyPoints || 0) >= maxPenaltyPoints ? "#ef4444" : (penaltyStudent.penaltyPoints || 0) > 0 ? "#f59e0b" : "#10b981" }}>
                        {penaltyStudent.penaltyPoints || 0}
                      </p>
                    </div>
                    {(penaltyStudent.penaltyPoints || 0) >= maxPenaltyPoints && (
                      <div style={{
                        padding: "12px 20px",
                        backgroundColor: "#fee2e2",
                        borderRadius: "8px",
                        border: "2px solid #ef4444",
                        color: "#dc2626",
                        fontWeight: 600
                      }}>
                        ⚠️ Ceza Durumunda - Kitap Alamaz
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="number"
                      id="penalty-points-personel-modal-input"
                      min="0"
                      defaultValue={penaltyStudent.penaltyPoints || 0}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        fontSize: "14px"
                      }}
                      placeholder="Ceza puanı"
                    />
                    <button
                      onClick={async () => {
                        const input = document.getElementById("penalty-points-personel-modal-input") as HTMLInputElement;
                        if (!input) return;
                        const newPenaltyPoints = parseInt(input.value) || 0;
                        if (newPenaltyPoints < 0) {
                          onShowInfo?.("Hata", "Ceza puanı negatif olamaz.", "error", "❌");
                          return;
                        }
                        try {
                          await httpClient.put(`/admin/students/${encodeURIComponent(penaltyStudent.name)}/penalty`, {
                            penaltyPoints: newPenaltyPoints
                          });
                          setPenaltyStudent({ ...penaltyStudent, penaltyPoints: newPenaltyPoints, isBanned: newPenaltyPoints >= maxPenaltyPoints });
                          setShowPenaltyModal(false);
                          setPenaltyStudent(null);
                          setPenaltyError(null);
                          if (onRefresh) {
                            await onRefresh();
                          }
                          onShowInfo?.("Başarılı", "Ceza puanı başarıyla güncellendi.", "success", "✅");
                        } catch (err) {
                          onShowInfo?.("Hata", err instanceof Error ? err.message : "Ceza puanı güncellenirken bir hata oluştu", "error", "❌");
                        }
                      }}
                      style={{
                        padding: "10px 20px",
                        fontSize: "14px",
                        backgroundColor: "#3b82f6",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Güncelle
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Calendar Detail Modal */}
      {selectedCalendarLoan && createPortal(
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
            zIndex: 10005,
          }}
          onClick={() => setSelectedCalendarLoan(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: "500px",
              width: "90%",
              padding: "24px",
              animation: "slideIn 0.3s ease-out",
              backgroundColor: "white",
              position: "relative"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedCalendarLoan(null)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: "#9ca3af"
              }}
            >
              &times;
            </button>

            <h3 style={{ margin: "0 0 20px 0", fontSize: "20px", fontWeight: 700, color: "#1e293b", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
              Ödünç Detayı
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", gap: "16px" }}>
                <div style={{ width: "80px", height: "120px", backgroundColor: "#f1f5f9", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", flexShrink: 0 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>KİTAP</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
                    {books.find(b => b.id === selectedCalendarLoan.bookId)?.title || selectedCalendarLoan.title}
                  </div>
                  <div style={{ fontSize: "13px", color: "#64748b" }}>
                    {books.find(b => b.id === selectedCalendarLoan.bookId)?.author}
                  </div>
                </div>
              </div>

              <div style={{ padding: "16px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>
                    {selectedCalendarLoan.borrower.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>ÖĞRENCİ</div>
                    <div style={{ fontWeight: 600, color: "#334155" }}>{selectedCalendarLoan.borrower}</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>TESLİM TARİHİ</div>
                    <div style={{ fontWeight: 600 }} className={new Date(selectedCalendarLoan.dueDate) < new Date() ? "text-red-600" : "text-gray-700"}>
                      {new Date(selectedCalendarLoan.dueDate).toLocaleDateString("tr-TR")}
                      {new Date(selectedCalendarLoan.dueDate) < new Date() && <span style={{ marginLeft: "8px", padding: "2px 6px", backgroundColor: "#fee2e2", color: "#ef4444", borderRadius: "4px", fontSize: "11px" }}>GECİKTİ</span>}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleQuickReturnFromCalendar}
                style={{
                  width: "100%",
                  padding: "12px",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "15px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2563eb"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#3b82f6"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4"></polyline>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                Teslim Al
              </button>

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Return Confirmation Modal */}
      {showReturnConfirmation && selectedCalendarLoan && createPortal(
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
            zIndex: 10010, // Detail modal'dan daha yüksek olmalı
          }}
          onClick={() => setShowReturnConfirmation(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "400px",
              width: "90%",
              padding: "24px",
              animation: "slideIn 0.3s ease-out",
              backgroundColor: "white",
              borderRadius: "12px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "#eff6ff", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
              </div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>
                Teslim Almayı Onayla
              </h3>
              <p style={{ margin: 0, color: "#64748b", lineHeight: "1.5" }}>
                <strong style={{ color: "#334155" }}>{selectedCalendarLoan.borrower}</strong> adlı öğrencinin
                <br />
                <strong style={{ color: "#334155" }}>{books.find(b => b.id === selectedCalendarLoan.bookId)?.title || selectedCalendarLoan.title}</strong>
                <br />
                kitabını teslim almak istiyor musunuz?
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowReturnConfirmation(false)}
                style={{
                  flex: 1,
                  padding: "10px",
                  backgroundColor: "white",
                  color: "#64748b",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f1f5f9"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
              >
                Vazgeç
              </button>
              <button
                onClick={processQuickReturn}
                style={{
                  flex: 1,
                  padding: "10px",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2563eb"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#3b82f6"}
              >
                Onayla
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Simple Return Confirmation Modal */}
      {showSimpleReturnConfirm && selectedSimpleLoan && createPortal(
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
            zIndex: 10010,
          }}
          onClick={() => setShowSimpleReturnConfirm(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: "400px",
              width: "90%",
              padding: "24px",
              animation: "slideIn 0.3s ease-out",
              backgroundColor: "white",
              borderRadius: "12px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "#eff6ff", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
              </div>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>
                Teslim Almayı Onayla
              </h3>
              <p style={{ margin: 0, color: "#64748b", lineHeight: "1.5" }}>
                <strong style={{ color: "#334155" }}>{selectedSimpleLoan.borrower}</strong> adlı öğrencinin
                <br />
                <strong style={{ color: "#334155" }}>{books.find(b => b.id === selectedSimpleLoan.bookId)?.title || selectedSimpleLoan.title}</strong>
                <br />
                kitabını teslim almak istiyor musunuz?
              </p>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setShowSimpleReturnConfirm(false)}
                style={{
                  flex: 1,
                  padding: "10px",
                  backgroundColor: "white",
                  color: "#64748b",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f1f5f9"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
              >
                Vazgeç
              </button>
              <button
                onClick={processSimpleReturn}
                style={{
                  flex: 1,
                  padding: "10px",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2563eb"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#3b82f6"}
              >
                Onayla
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}


    </div>
  );
};

export default PersonelView;
