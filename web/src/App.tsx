import { useEffect, useState, useRef, useCallback } from "react";
import { httpClient } from "./api/client";
import { Book, BookStat, LoanInfo, LoanEntry, StudentStat, UserResponse, StudentHistoryResponse } from "./api/types";
import LoginPanel from "./components/LoginPanel";
import StudentView from "./components/StudentView";
import PersonelView from "./components/PersonelView";
import AdminPanel from "./components/AdminPanel";
import StudentProfile from "./components/StudentProfile";
import ProfileModal from "./components/ProfileModal";
import SettingsModal from "./components/SettingsModal";
import BookDetailModal from "./components/BookDetailModal";
import NotificationPanel, { Notification } from "./components/NotificationPanel";
import ConfirmCard from "./components/ConfirmCard";
import InfoCard from "./components/InfoCard";
import StudentDetailModal from "./components/StudentDetailModal";
import { createPortal } from "react-dom";
import "./App.css";
import { NotificationSettings, createDefaultNotificationSettings } from "./types/notification";

// Yardımcı tarih fonksiyonu - 00:00 bazlı
const getDaysDiff = (dueDateStr: string | Date) => {
  const dueDate = new Date(dueDateStr);
  dueDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

// Geciken kitap sayısını hesapla
const calculateLateBooksCount = (studentName: string, loans: LoanInfo[], books: Book[] = []): number => {
  const validLoans = books.length > 0
    ? loans.filter(l => l.borrower === studentName && books.some(b => b.id === l.bookId))
    : loans.filter(l => l.borrower === studentName);

  return validLoans.filter(loan => getDaysDiff(loan.dueDate) < 0).length;
};

const getBookTotalQuantity = (book: Book) => {
  if (typeof book.totalQuantity === "number" && !Number.isNaN(book.totalQuantity) && book.totalQuantity > 0) {
    return book.totalQuantity;
  }
  const available = typeof book.quantity === "number" && !Number.isNaN(book.quantity) ? book.quantity : 0;
  const loanCount = Array.isArray(book.loans) ? book.loans.length : 0;
  const computed = available + loanCount;
  return computed > 0 ? computed : Math.max(available, loanCount, 0);
};

const formatListWithLimit = (items: string[], limit: number = 5) => {
  if (items.length === 0) return "";
  if (items.length <= limit) return items.join(", ");
  const visible = items.slice(0, limit).join(", ");
  return `${visible} ve ${items.length - limit} diğer`;
};

const formatStudentName = (student: StudentStat) => `${student.name} ${student.surname || ""}`.trim();

const normalizeStudentName = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

const buildBookSnapshotKey = (book: Book) => {
  if (book.id) {
    return book.id;
  }
  const normalizedTitle = (book.title || "").toLowerCase().trim();
  const normalizedAuthor = (book.author || "").toLowerCase().trim();
  return `book:${normalizedTitle}__${normalizedAuthor}`;
};

const buildStudentSnapshotKey = (student: StudentStat) => {
  if (student.studentNumber) {
    return `student:${student.studentNumber}`;
  }
  const normalized = normalizeStudentName(`${student.name || ""} ${student.surname || ""}`.trim());
  return normalized ? `student-name:${normalized}` : "";
};

const buildLoanSnapshotKey = (loan: LoanInfo) => {
  const borrowerKey = normalizeStudentName(loan.borrower || "");
  const bookKey = loan.bookId || loan.title || "";
  if (!bookKey && !borrowerKey) {
    return "";
  }
  return `loan:${bookKey}__${borrowerKey}`;
};

const getNotificationSettingsStorageKey = (username?: string) => `kutuphane_notification_settings_${username || "default"}`;

// GLOBAL notification keys - tüm kullanıcılar aynı bildirimleri görür
const getNotificationsStorageKey = () => `kutuphane_notifications`;
const getNotificationsClearedAtKey = () => `kutuphane_notifications_cleared_at`;
const getNotificationsSnapshotKey = () => `kutuphane_notifications_snapshot`;
const getNotificationsBaselineKey = () => `kutuphane_notifications_baseline`;

const loadNotificationSettingsForUser = (username?: string): NotificationSettings => {
  const defaultSettings = createDefaultNotificationSettings();
  if (typeof window === "undefined") {
    return defaultSettings;
  }
  try {
    const saved = localStorage.getItem(getNotificationSettingsStorageKey(username));
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        notifications: parsed.notifications ?? defaultSettings.notifications,
        notificationTypes: {
          ...defaultSettings.notificationTypes,
          ...(parsed.notificationTypes || {}),
        },
      };
    }
  } catch (error) {
    console.error("Bildirim ayarları yüklenemedi:", error);
  }
  return defaultSettings;
};

const normalizeForMatch = (value: string) => {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_\-\/]+/g, " ");
};

const inferNotificationKind = (title: string): (keyof NotificationSettings["notificationTypes"] | "misc") => {
  const t = normalizeForMatch(title);
  console.log("🔍 inferNotificationKind çağrıldı:", title, "→ normalized:", t);

  if (t.includes("toplu ogrenci silme") || t.includes("toplu ogrenci")) return "studentBulkDelete";
  if (t.includes("ogrenci silindi")) return "studentDelete";
  if (t.includes("ogrenci eklendi") || t.includes("toplu ogrenci ekleme")) return "studentAdd";
  if (t.includes("ogrenci guncellendi")) return "studentUpdate";
  if (t.includes("toplu kitap silme") || t.includes("toplu kitap")) return "bookBulkDelete";
  if (t.includes("kitap silindi")) return "bookDelete";
  if (t.includes("kitap eklendi") || t.includes("toplu kitap ekleme")) return "bookAdd";
  if (t.includes("kitap guncellendi")) return "bookUpdate";

  // Ödünç verme - toplu ve tekli
  if (t.includes("odunc verildi") || t.includes("kitap odunc") || t.includes("toplu odunc verildi")) {
    console.log("✅ Ödünç verme bildirimi algılandı!");
    return "loanBorrow";
  }

  // Teslim al - TÜM varyantları kontrol et (toplu dahil)
  if (t.includes("teslim al") || t.includes("odunc silme") || t.includes("odunc kaldirildi")) {
    console.log("✅ Teslim al bildirimi algılandı!");
    return "loanReturn";
  }

  if (t.includes("teslim tarihi uzatildi") || t.includes("uzatildi") || t.includes("uzatma")) return "loanExtend";
  if (t.includes("teslim tarihi yaklasiyor")) return "dueSoon";
  if (t.includes("geciken odunc")) return "overdue";

  console.log("⚠️ Bilinmeyen başlık, misc döndürülüyor");
  return "misc";
};

const groupLoanTitlesByBorrower = (loans: LoanInfo[]) => {
  const map = new Map<string, string[]>();
  loans.forEach(loan => {
    if (!map.has(loan.borrower)) {
      map.set(loan.borrower, []);
    }
    map.get(loan.borrower)!.push(loan.title);
  });
  return map;
};

const formatLoanGroupSummary = (loanGroups: Map<string, string[]>) => {
  return Array.from(loanGroups.entries()).map(([borrower, titles]) => {
    const bookList = formatListWithLimit(titles, 3);
    return `${borrower} (${titles.length} kitap: ${bookList})`;
  }).join(" | ");
};

const App = () => {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<LoanInfo[]>([]);
  const [bookStats, setBookStats] = useState<BookStat[]>([]);
  const [studentStats, setStudentStats] = useState<StudentStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showMainContent, setShowMainContent] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [globalSearchKeyword, setGlobalSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<{
    books: Book[];
    students: StudentStat[];
    loans: LoanInfo[];
  }>({ books: [], students: [], loans: [] });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedSearchBook, setSelectedSearchBook] = useState<Book | null>(null);
  const [selectedSearchStudent, setSelectedSearchStudent] = useState<StudentStat | null>(null);
  const [searchFilter, setSearchFilter] = useState<'all' | 'books' | 'students' | 'loans'>('all');
  const [showStudentDetailModal, setShowStudentDetailModal] = useState(false);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<StudentStat | null>(null);
  const [extendingLoan, setExtendingLoan] = useState<LoanInfo | null>(null);
  const [extendDays, setExtendDays] = useState(7);
  const [selectedBookForDetail, setSelectedBookForDetail] = useState<Book | null>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const autoRecordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [maxPenaltyPoints, setMaxPenaltyPoints] = useState(100);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => createDefaultNotificationSettings());
  const previousBooksRef = useRef<Book[]>([]);
  const previousLoansRef = useRef<LoanInfo[]>([]);
  const previousStudentStatsRef = useRef<StudentStat[]>([]);
  const hasInitializedBooksRef = useRef(false);
  const hasInitializedStudentsRef = useRef(false);
  const hasInitializedLoansRef = useRef(false);
  const processedOverdueLoansRef = useRef<Set<string>>(new Set()); // Geciken ödünçler için bildirim gönderildi mi kontrolü
  const lastNotificationClearAtRef = useRef<number | null>(null);
  const notificationSnapshotRef = useRef<{ books: Set<string>; students: Set<string>; loans: Set<string>; applied: boolean } | null>(null);
  const notificationBaselineRef = useRef<{ overdueLoanKeys: Set<string>; applied: boolean } | null>(null);
  const bookDeletionAccumulatorRef = useRef<{ books: Book[]; loans: LoanInfo[] }>({ books: [], loans: [] });
  const bookDeletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentDeletionAccumulatorRef = useRef<{ students: StudentStat[]; loans: LoanInfo[] }>({ students: [], loans: [] });
  const studentDeletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationsBootstrappedRef = useRef<{ username: string | null; done: boolean }>({ username: null, done: false });

  // Onay kartı state'leri
  const [showBookDeleteConfirm, setShowBookDeleteConfirm] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<{ book: Book; bookId: string; loans: LoanEntry[]; silent?: boolean } | null>(null);
  const [deleteBookLoading, setDeleteBookLoading] = useState(false);

  // Search Context Student Detail handling
  const [studentHistory, setStudentHistory] = useState<StudentHistoryResponse | null>(null);
  const [studentHistoryLoading, setStudentHistoryLoading] = useState(false);

  useEffect(() => {
    if (!selectedStudentForDetail) {
      setStudentHistory(null);
      setStudentHistoryLoading(false);
      return;
    }

    const borrowerName = `${selectedStudentForDetail.name} ${selectedStudentForDetail.surname}`.trim() || selectedStudentForDetail.name;
    const query: Record<string, string | number | undefined> = {
      studentNumber: selectedStudentForDetail.studentNumber,
      borrower: borrowerName || undefined,
    };

    let cancelled = false;
    setStudentHistoryLoading(true);

    httpClient
      .get<StudentHistoryResponse>("/statistics/student-history", query)
      .then((response) => {
        if (!cancelled) {
          setStudentHistory(response);
          // Update the selected student with latest stats if needed
          /* Optional: sync stats back to the modal if backend returns newer aggregate data */
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Geçmiş istatistikler yüklenemedi:", error);
          setStudentHistory(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStudentHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStudentForDetail]);


  // Bilgilendirme kartı state'leri
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [infoCardData, setInfoCardData] = useState<{ title: string; message: string; type: "info" | "success" | "warning" | "error"; icon?: string } | null>(null);

  // InfoCard helper fonksiyonu
  const showInfo = (title: string, message: string, type: "info" | "success" | "warning" | "error" = "info", icon?: string) => {
    setInfoCardData({ title, message, type, icon });
    setShowInfoCard(true);
  };

  const clearBookDeletionTimer = () => {
    if (bookDeletionTimerRef.current) {
      clearTimeout(bookDeletionTimerRef.current);
      bookDeletionTimerRef.current = null;
    }
  };

  const clearStudentDeletionTimer = () => {
    if (studentDeletionTimerRef.current) {
      clearTimeout(studentDeletionTimerRef.current);
      studentDeletionTimerRef.current = null;
    }
  };

  const notifyLoanCascade = (source: string, loansToNotify: LoanInfo[], settings: NotificationSettings) => {
    if (loansToNotify.length === 0) return;

    // Ödünç cascade bildirimleri (kitap/öğrenci silme sonucu) her zaman gösterilmeli
    // çünkü kullanıcının bilmesi gereken önemli bir durum
    // loanReturn ayarı sadece manuel iade işlemleri için geçerli
    // bypassSettings: true ile ayar kontrolünden geç
    const summary = formatLoanGroupSummary(groupLoanTitlesByBorrower(loansToNotify));
    addNotification("info", `${source} - Ödünç Kaldırıldı`, `${loansToNotify.length} ödünç kaydı otomatik silindi: ${summary}`, undefined, true);
  };

  const flushBookDeletionNotifications = (settings: NotificationSettings) => {
    const accumulator = bookDeletionAccumulatorRef.current;
    const booksToNotify = accumulator.books;
    const loansToNotify = accumulator.loans;
    if (booksToNotify.length === 0 && loansToNotify.length === 0) {
      return;
    }
    bookDeletionAccumulatorRef.current = { books: [], loans: [] };
    clearBookDeletionTimer();

    const bookDeleteEnabled = settings.notificationTypes?.bookDelete !== false;
    const bulkDeleteEnabled = settings.notificationTypes?.bookBulkDelete !== false;
    // Kitap silme bildirimi - ödünç varsa da yoksa da her zaman gönder
    if (booksToNotify.length > 0 && (bookDeleteEnabled || bulkDeleteEnabled)) {
      const details = booksToNotify.map(book => `${book.title} kitabından ${getBookTotalQuantity(book)} adet`);
      const totalQuantity = booksToNotify.reduce((sum, book) => sum + getBookTotalQuantity(book), 0);
      const title = booksToNotify.length === 1 ? "Kitap Silindi" : "Toplu Kitap Silme";
      const message = `${booksToNotify.length} kitap silindi (Toplam ${totalQuantity} adet). ${formatListWithLimit(details, 5)}`;
      addNotification("warning", title, message);
    }

    // Ödünç kayıtları bildirimi - ayrı bir bildirim olarak gönder
    if (loansToNotify.length > 0) {
      notifyLoanCascade("Kitap Silme", loansToNotify, settings);
    }
  };

  const enqueueBookDeletionNotification = (booksChunk: Book[], loansChunk: LoanInfo[], settings: NotificationSettings) => {
    const accumulator = bookDeletionAccumulatorRef.current;
    accumulator.books = accumulator.books.concat(booksChunk);
    accumulator.loans = accumulator.loans.concat(loansChunk);
    if (bookDeletionTimerRef.current) {
      clearTimeout(bookDeletionTimerRef.current);
    }
    bookDeletionTimerRef.current = setTimeout(() => flushBookDeletionNotifications(settings), 400);
  };

  const flushStudentDeletionNotifications = (settings: NotificationSettings) => {
    const accumulator = studentDeletionAccumulatorRef.current;
    const studentsToNotify = accumulator.students;
    const loansToNotify = accumulator.loans;
    if (studentsToNotify.length === 0 && loansToNotify.length === 0) {
      return;
    }
    studentDeletionAccumulatorRef.current = { students: [], loans: [] };
    clearStudentDeletionTimer();

    const studentDeleteEnabled = settings.notificationTypes?.studentDelete !== false;
    const studentBulkDeleteEnabled = settings.notificationTypes?.studentBulkDelete !== false;

    // Öğrenci silme bildirimi - ödünç varsa da yoksa da her zaman gönder (kitap silme bildirimindeki gibi)
    if (studentsToNotify.length > 0 && (studentDeleteEnabled || studentBulkDeleteEnabled)) {
      const details = studentsToNotify.map(student => formatStudentName(student));
      const title = studentsToNotify.length === 1 ? "Öğrenci Silindi" : "Toplu Öğrenci Silme";
      const message = `${studentsToNotify.length} öğrenci silindi. ${formatListWithLimit(details, 5)}`;
      addNotification("warning", title, message);
    }

    // Ödünç kayıtları bildirimi - ayrı bir bildirim olarak gönder
    if (loansToNotify.length > 0) {
      notifyLoanCascade("Öğrenci Silme", loansToNotify, settings);
    }
  };

  const enqueueStudentDeletionNotification = (studentsChunk: StudentStat[], loansChunk: LoanInfo[], settings: NotificationSettings) => {
    const accumulator = studentDeletionAccumulatorRef.current;
    accumulator.students = accumulator.students.concat(studentsChunk);
    accumulator.loans = accumulator.loans.concat(loansChunk);
    if (studentDeletionTimerRef.current) {
      clearTimeout(studentDeletionTimerRef.current);
    }
    studentDeletionTimerRef.current = setTimeout(() => flushStudentDeletionNotifications(settings), 400);
  };

  useEffect(() => {
    // Sadece login olmuşsa ve geçiş animasyonu tamamlandıysa verileri yükle
    if (user && showMainContent) {
      if (user.role === "STUDENT") {
        // Öğrenciler için sadece kitapları yükle
        fetchBooks();
      } else {
        // Personel/Admin için tüm verileri yükle
        refreshAll();
      }
    }
  }, [user, showMainContent]);

  // Arama alanı dışına tıklandığında kapat
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isModal = target.closest('[style*="z-index: 10005"]') ||
        target.closest('[style*="z-index: 10000"]') ||
        target.closest('.card') ||
        selectedSearchBook !== null ||
        selectedSearchStudent !== null;
      if (showSearch && !target.closest('.search-container') && !target.closest('.search-preview') && !isModal) {
        setShowSearch(false);
        setGlobalSearchKeyword("");
        setSearchResults({ books: [], students: [], loans: [] });
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSearch, selectedSearchBook, selectedSearchStudent]);

  useEffect(() => {
    return () => {
      clearBookDeletionTimer();
      clearStudentDeletionTimer();
    };
  }, []);

  // Search açıldığında input'a focus
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Status mesajını otomatik temizle
  const setStatusWithTimeout = (message: string | null, duration: number = 3000) => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    setStatus(message);
    if (message) {
      statusTimeoutRef.current = setTimeout(() => {
        setStatus(null);
      }, duration);
    }
  };

  const refreshAll = async () => {
    // Öğrenciler için sadece kitapları yükle
    if (user?.role === "STUDENT") {
      setLoading(true);
      try {
        await fetchBooks();
        // Gereksiz bildiri kaldırıldı
      } catch (error) {
        setStatusWithTimeout((error as Error).message, 5000);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Personel/Admin için tüm verileri yükle
    setLoading(true);
    try {
      await Promise.all([fetchBooks(), fetchLoans(), fetchStats()]);
      // Gereksiz bildiri kaldırıldı
    } catch (error) {
      setStatusWithTimeout((error as Error).message, 5000);
    } finally {
      setLoading(false);
    }
  };

  const fetchBooks = async (keyword?: string) => {
    // Backend'den tüm kitapları al, frontend'de filtrele (Türkçe karakter desteği için)
    const allBooks = await httpClient.get<Book[]>("/books");
    if (keyword && keyword.trim()) {
      const { searchIncludes } = await import("./utils/searchUtils");
      const filtered = allBooks.filter(book =>
        searchIncludes(book.title, keyword) ||
        searchIncludes(book.author, keyword) ||
        searchIncludes(book.category, keyword) ||
        searchIncludes(book.shelf, keyword) ||
        searchIncludes(book.publisher, keyword) ||
        searchIncludes(book.summary, keyword) ||
        searchIncludes(book.bookNumber, keyword) ||
        searchIncludes(book.year, keyword) ||
        searchIncludes(book.pageCount, keyword)
      );
      setBooks(filtered);
    } else {
      setBooks(allBooks);
    }
  };

  const handleSearch = async (keyword: string) => {
    setSearchKeyword(keyword);
    await fetchBooks(keyword);
  };

  const handleGlobalSearch = async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults({ books: [], students: [], loans: [] });
      return;
    }

    setLoading(true);
    try {
      const { searchIncludes } = await import("./utils/searchUtils");

      // Tüm veritabanında arama - backend'den tüm verileri al, frontend'de filtrele
      const [allBooks, studentsData, loansData] = await Promise.all([
        httpClient.get<Book[]>("/books"), // Tüm kitapları al
        httpClient.get<StudentStat[]>("/statistics/all-students"),
        httpClient.get<LoanInfo[]>("/books/loans")
      ]);

      // Kitaplarda detaylı arama (tüm alanlar)
      const filteredBooks = allBooks.filter(book =>
        searchIncludes(book.title, keyword) ||
        searchIncludes(book.author, keyword) ||
        searchIncludes(book.category, keyword) ||
        searchIncludes(book.shelf, keyword) ||
        searchIncludes(book.publisher, keyword) ||
        searchIncludes(book.summary, keyword) ||
        searchIncludes(book.bookNumber, keyword) ||
        searchIncludes(book.year, keyword) ||
        searchIncludes(book.pageCount, keyword) ||
        searchIncludes(book.quantity, keyword) ||
        searchIncludes(book.totalQuantity, keyword)
      );

      // Öğrencilerde detaylı arama
      const filteredStudents = studentsData.filter(s =>
        searchIncludes(s.name, keyword) ||
        searchIncludes(s.studentNumber, keyword) ||
        searchIncludes(s.class, keyword) ||
        searchIncludes(s.branch, keyword) ||
        (s.class && s.branch && searchIncludes(`${s.class}-${s.branch}`, keyword)) ||
        (s.class && s.branch && searchIncludes(`${s.class}${s.branch}`, keyword)) ||
        searchIncludes(s.borrowed, keyword) ||
        searchIncludes(s.returned, keyword) ||
        searchIncludes(s.late, keyword)
      );

      // Ödünçlerde detaylı arama
      const filteredLoans = loansData.filter(l => {
        // Temel bilgiler
        if (searchIncludes(l.title, keyword) ||
          searchIncludes(l.author, keyword) ||
          searchIncludes(l.borrower, keyword) ||
          searchIncludes(l.category, keyword) ||
          searchIncludes(l.personel, keyword)) {
          return true;
        }

        // Kitap künye bilgilerini kontrol et
        const book = allBooks.find(b => b.id === l.bookId);
        if (book) {
          if (searchIncludes(book.shelf, keyword) ||
            searchIncludes(book.publisher, keyword) ||
            searchIncludes(book.summary, keyword) ||
            searchIncludes(book.bookNumber, keyword) ||
            searchIncludes(book.year, keyword) ||
            searchIncludes(book.pageCount, keyword) ||
            searchIncludes(book.category, keyword)) {
            return true;
          }
        }

        return false;
      });

      setSearchResults({
        books: filteredBooks,
        students: filteredStudents,
        loans: filteredLoans
      });
    } catch (error) {
      setStatusWithTimeout((error as Error).message, 5000);
    } finally {
      setLoading(false);
    }
  };

  const fetchLoans = async () => {
    // Öğrenciler ödünç bilgilerine erişemez
    if (user?.role === "STUDENT") {
      return;
    }
    const data = await httpClient.get<LoanInfo[]>("/books/loans");
    setLoans(data);
  };

  const fetchStats = async () => {
    // Öğrenciler istatistiklere erişemez
    if (user?.role === "STUDENT") {
      return;
    }
    const [booksResponse, studentsResponse] = await Promise.all([
      httpClient.get<BookStat[]>("/statistics/top-books?limit=1000"),
      httpClient.get<StudentStat[]>("/statistics/all-students") // Tüm öğrencileri getir
    ]);
    setBookStats(booksResponse);
    setStudentStats(studentsResponse);
  };

  // Otomatik kayıt timer'ını başlat
  const startAutoRecordTimer = async (username: string, overrideSettings?: { enabled: boolean; interval: number }) => {
    // Önce mevcut timer'ı temizle
    if (autoRecordTimerRef.current) {
      clearInterval(autoRecordTimerRef.current);
      autoRecordTimerRef.current = null;
    }

    try {
      // Ayarları al (override varsa onu kullan, yoksa API'den çek)
      let settings: { autoRecordEnabled: boolean; autoRecordIntervalMinutes: number };

      if (overrideSettings) {
        settings = {
          autoRecordEnabled: overrideSettings.enabled,
          autoRecordIntervalMinutes: overrideSettings.interval
        };
      } else {
        settings = await httpClient.get<{ autoRecordEnabled: boolean; autoRecordIntervalMinutes: number }>(
          `/record-types/${username}/auto-record-settings`
        );
      }

      if (settings.autoRecordEnabled && settings.autoRecordIntervalMinutes > 0) {
        const intervalMs = settings.autoRecordIntervalMinutes * 60 * 1000; // dakika -> milisaniye

        // İlk kaydı hemen yap
        try {
          // Response tipini any olarak alıyoruz çünkü backend dönüş tipi değişti
          const response: any = await httpClient.post("/record-types/sync", { username });

          if (response.success === false || (response.errors && response.errors.length > 0)) {
            console.error("Otomatik kayıt (ilk) sırasında hatalar oluştu:", response.errors || response.message);
          } else {
            console.log(`Otomatik kayıt (manuel/ilk) yapıldı: ${new Date().toLocaleString()}`);
            if (response.files && response.files.length > 0) {
              console.log("Oluşturulan dosyalar:", response.files);
            }
          }
        } catch (error) {
          console.error("İlk otomatik kayıt hatası:", error);
        }

        // Timer'ı başlat
        autoRecordTimerRef.current = setInterval(async () => {
          try {
            const response: any = await httpClient.post("/record-types/sync", { username });

            if (response.success === false || (response.errors && response.errors.length > 0)) {
              console.error("Otomatik kayıt sırasında hatalar oluştu:", response.errors || response.message);
            } else {
              console.log(`Otomatik kayıt yapıldı: ${new Date().toLocaleString()}`);
            }
          } catch (error) {
            console.error("Otomatik kayıt hatası:", error);
          }
        }, intervalMs);

        console.log(`Otomatik kayıt timer başlatıldı: ${settings.autoRecordIntervalMinutes} dakika aralıklarla`);
      } else {
        console.log("Otomatik kayıt kapalı veya geçersiz aralık");
      }
    } catch (error) {
      console.error("Otomatik kayıt ayarları yüklenemedi:", error);
    }
  };

  // Otomatik kayıt timer'ını durdur
  const stopAutoRecordTimer = () => {
    if (autoRecordTimerRef.current) {
      clearInterval(autoRecordTimerRef.current);
      autoRecordTimerRef.current = null;
      console.log("Otomatik kayıt timer durduruldu");
    }
  };

  // Sistem ayarlarını yükle
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

  useEffect(() => {
    if (user) {
      setNotificationSettings(loadNotificationSettingsForUser(user.username));
    } else {
      setNotificationSettings(createDefaultNotificationSettings());
    }
  }, [user]);

  useEffect(() => {
    if (!notificationSettings.notifications) {
      setShowNotificationPanel(false);
    }
  }, [notificationSettings.notifications]);

  // Bildirimleri localStorage'dan yükle (GLOBAL - tüm kullanıcılar için)
  useEffect(() => {
    const listKey = getNotificationsStorageKey();
    const clearedKey = getNotificationsClearedAtKey();
    const snapshotKey = getNotificationsSnapshotKey();

    const savedNotifications = localStorage.getItem(listKey);
    if (savedNotifications) {
      try {
        const parsed = JSON.parse(savedNotifications);
        const loadedNotifications = parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp),
        }));
        setNotifications(loadedNotifications);
      } catch (error) {
        console.error("Bildirimler yüklenemedi:", error);
      }
    }

    const clearedAt = localStorage.getItem(clearedKey);
    if (clearedAt) {
      const parsedClear = Number(clearedAt);
      lastNotificationClearAtRef.current = Number.isFinite(parsedClear) ? parsedClear : null;
    }

    const snapshotRaw = localStorage.getItem(snapshotKey);
    if (snapshotRaw) {
      try {
        const parsedSnapshot = JSON.parse(snapshotRaw);
        notificationSnapshotRef.current = {
          books: new Set(Array.isArray(parsedSnapshot.books) ? parsedSnapshot.books : []),
          students: new Set(Array.isArray(parsedSnapshot.students) ? parsedSnapshot.students : []),
          loans: new Set(Array.isArray(parsedSnapshot.loans) ? parsedSnapshot.loans : []),
          applied: true, // ✅ DÜZELTME: Snapshot'ı hemen uygula
        };
        console.log(`[Bildirim] Snapshot yüklendi ve uygulandı:`, {
          kitaplar: parsedSnapshot.books?.length || 0,
          öğrenciler: parsedSnapshot.students?.length || 0,
          ödünçler: parsedSnapshot.loans?.length || 0,
        });
      } catch (error) {
        console.error("Bildirim anlık görüntüsü yüklenemedi:", error);
        notificationSnapshotRef.current = null;
      }
    }

    const baselineRaw = localStorage.getItem(getNotificationsBaselineKey());
    if (baselineRaw) {
      try {
        const parsedBaseline = JSON.parse(baselineRaw);
        const overdueKeys = Array.isArray(parsedBaseline.overdueLoanKeys) ? parsedBaseline.overdueLoanKeys : [];
        notificationBaselineRef.current = {
          overdueLoanKeys: new Set(overdueKeys),
          applied: true, // ✅ DÜZELTME: Baseline'ı hemen uygula
        };
        // ✅ DÜZELTME: Geciken ödünçleri processed olarak işaretle
        processedOverdueLoansRef.current = new Set(overdueKeys);
        console.log(`[Bildirim] Baseline yüklendi ve uygulandı: ${overdueKeys.length} geciken ödünç işaretlendi`);
      } catch (error) {
        console.error("Bildirim baseline yüklenemedi:", error);
        notificationBaselineRef.current = null;
      }
    } else {
      notificationBaselineRef.current = null;
    }
  }, []); // Sadece mount'ta çalışır

  // Kitapları, ödünçleri ve öğrencileri izle ve bildirim oluştur
  useEffect(() => {
    if (!user || user.role === "STUDENT") {
      previousBooksRef.current = books;
      previousLoansRef.current = loans;
      previousStudentStatsRef.current = studentStats;
      return;
    }

    const settings = notificationSettings;
    // Ana anahtar kontrolü kaldırıldı - bypassSettings mekanizması kullanılıyor
    // Böylece önemli bildirimler (teslim al, cascade) ayarlardan bağımsız oluşturulabilir

    // İlk veri yüklemesi: sayfa yenileyince "Toplu Kitap/Öğrenci Ekleme" gibi bildirimler üretmesin.
    const bootstrap = notificationsBootstrappedRef.current;
    if (!bootstrap.done) {
      // İlk yüklemede snapshot yoksa, mevcut durumu snapshot olarak kaydet
      // Böylece sayfa yenilendiğinde toplu ekleme bildirimleri tekrar gelmeyecek
      const existingSnapshot = notificationSnapshotRef.current;
      if (!existingSnapshot) {
        const bookSnapshotKeys = books.map(buildBookSnapshotKey).filter(Boolean);
        const studentSnapshotKeys = studentStats.map(buildStudentSnapshotKey).filter(Boolean);
        const loanSnapshotKeys = loans.map(buildLoanSnapshotKey).filter(Boolean);
        notificationSnapshotRef.current = {
          books: new Set(bookSnapshotKeys),
          students: new Set(studentSnapshotKeys),
          loans: new Set(loanSnapshotKeys),
          applied: true, // Hemen uygula, bir sonraki render'da kontrol etmeye gerek yok
        };
        localStorage.setItem(getNotificationsSnapshotKey(), JSON.stringify({
          books: bookSnapshotKeys,
          students: studentSnapshotKeys,
          loans: loanSnapshotKeys,
        }));
        console.log(`[Bildirim] İlk snapshot oluşturuldu (snapshot yoktu)`);
      }
      previousBooksRef.current = books;
      previousLoansRef.current = loans;
      previousStudentStatsRef.current = studentStats;
      hasInitializedBooksRef.current = true;
      hasInitializedLoansRef.current = true;
      hasInitializedStudentsRef.current = true;
      bootstrap.done = true;
      return;
    }

    // Snapshot zaten applied=true olarak yüklendiyse (clearAll sonrası), bir şey yapma
    const snapshot = notificationSnapshotRef.current;
    const baseline = notificationBaselineRef.current;

    // Eğer snapshot veya baseline applied ise, initialization'ı tamamla
    if ((snapshot?.applied || baseline?.applied) && !hasInitializedBooksRef.current) {
      // ✅ CRITICAL FIX: previousRefs'i CURRENT data'ya set et
      // Böylece mevcut tüm veriler "önceki" olarak işaretlenmiş olur
      // ve sadece gerçekten YENİ eklenen veriler bildirim üretir
      previousBooksRef.current = books;
      previousLoansRef.current = loans;
      previousStudentStatsRef.current = studentStats;
      hasInitializedBooksRef.current = true;
      hasInitializedLoansRef.current = true;
      hasInitializedStudentsRef.current = true;
      console.log(`[Bildirim] ✅ Snapshot/baseline uygulandı, mevcut veriler baseline olarak işaretlendi:`, {
        kitaplar: books.length,
        öğrenciler: studentStats.length,
        ödünçler: loans.length,
      });
      return;
    }

    const canCheckBooks = hasInitializedBooksRef.current;
    const canCheckStudents = hasInitializedStudentsRef.current;
    const canCheckLoans = hasInitializedLoansRef.current;
    const isInitialLoanNotificationRun = !hasInitializedLoansRef.current;
    const shouldSkipInitialLoanNotifications =
      isInitialLoanNotificationRun && lastNotificationClearAtRef.current !== null;
    const cascadedLoanKeys = new Set<string>();
    const currentLoanKeySet = new Set(loans.map(l => `${l.bookId}_${l.borrower}`));

    // Kitap değişikliklerini kontrol et
    if (canCheckBooks) {
      const previousBookIds = new Set(previousBooksRef.current.map(b => b.id));
      const currentBookIds = new Set(books.map(b => b.id));

      // Snapshot kontrolü: Eğer snapshot varsa ve uygulanmışsa, snapshot'ta olan kitaplar için bildirim üretme
      const snapshot = notificationSnapshotRef.current;
      const snapshotBookKeys = snapshot?.applied ? snapshot.books : new Set<string>();

      console.log(`[Bildirim-Kitap] Snapshot durumu:`, {
        snapshotVar: snapshot ? 'mevcut' : 'yok',
        applied: snapshot?.applied,
        snapshotKeyCount: snapshotBookKeys.size,
        öncekiKitaplar: previousBookIds.size,
        mevcutKitaplar: currentBookIds.size,
      });

      // Yeni kitaplar - snapshot'ta olmayan ve önceki listede olmayan kitaplar
      const newBooks = books.filter(b => {
        if (previousBookIds.has(b.id)) return false;
        const bookKey = buildBookSnapshotKey(b);
        const inSnapshot = snapshotBookKeys.has(bookKey);
        if (inSnapshot) {
          console.log(`[Bildirim-Kitap] "${b.title}" snapshot'ta VAR, bildirim oluşturulmayacak`);
        }
        return !inSnapshot;
      });

      console.log(`[Bildirim-Kitap] Yeni kitaplar tespit edildi: ${newBooks.length} adet`);

      if (newBooks.length > 0 && settings.notificationTypes?.bookAdd) {
        if (newBooks.length === 1) {
          // Tek kitap ekleme
          const book = newBooks[0];
          addNotification("success", "Kitap Eklendi", `${book.title} kitabı eklendi.`);
        } else {
          // Toplu kitap ekleme - tüm kitapları ve adetlerini göster
          const bookDetails = newBooks.map(book => {
            const quantity = book.totalQuantity ?? book.quantity ?? 1;
            return `${book.title} (${quantity} adet)`;
          }).join(", ");
          const totalQuantity = newBooks.reduce((sum, book) => {
            const qty = book.totalQuantity ?? book.quantity ?? 1;
            return sum + qty;
          }, 0);
          addNotification("success", "Toplu Kitap Ekleme", `${newBooks.length} çeşit kitap eklendi (Toplam ${totalQuantity} adet): ${bookDetails}`);
        }
      }

      // Silinen kitaplar - TEK BİLDİRİ ŞEKLİNDE
      const deletedBooks = previousBooksRef.current.filter(b => !currentBookIds.has(b.id));
      if (deletedBooks.length > 0) {
        // Silinen kitapların bağlantılı ödünç kayıtlarını kontrol et
        const deletedBookIds = new Set(deletedBooks.map(b => b.id));
        const deletedLoans = previousLoansRef.current.filter(l =>
          deletedBookIds.has(l.bookId) && !currentLoanKeySet.has(`${l.bookId}_${l.borrower}`)
        );
        deletedLoans.forEach(loan => cascadedLoanKeys.add(`${loan.bookId}_${loan.borrower}`));

        const bookDeleteEnabled = settings.notificationTypes?.bookDelete !== false;
        const bulkDeleteEnabled = settings.notificationTypes?.bookBulkDelete !== false;
        const cascadeEnabled = settings.notificationTypes?.loanReturn !== false;
        if ((bookDeleteEnabled || bulkDeleteEnabled || cascadeEnabled) && deletedBooks.length > 0) {
          enqueueBookDeletionNotification(deletedBooks, deletedLoans, settings);
        }
      }

      // Güncellenen kitaplar (başlık, yazar veya kategori değişmişse)
      books.forEach(book => {
        const previousBook = previousBooksRef.current.find(b => b.id === book.id);
        if (previousBook && (
          previousBook.title !== book.title ||
          previousBook.author !== book.author ||
          previousBook.category !== book.category
        )) {
          if (settings.notificationTypes?.bookUpdate) {
            addNotification("info", "Kitap Güncellendi", `${book.title} kitabı güncellendi.`);
          }
        }
      });
    }

    // Öğrenci değişikliklerini kontrol et
    if (canCheckStudents) {
      const previousStudentKeys = new Set(previousStudentStatsRef.current.map(s => `${s.name}_${s.studentNumber || ''}`));
      const currentStudentKeys = new Set(studentStats.map(s => `${s.name}_${s.studentNumber || ''}`));

      // Snapshot kontrolü: Eğer snapshot varsa ve uygulanmışsa, snapshot'ta olan öğrenciler için bildirim üretme
      const snapshot = notificationSnapshotRef.current;
      const snapshotStudentKeys = snapshot?.applied ? snapshot.students : new Set<string>();

      console.log(`[Bildirim-Öğrenci] Snapshot durumu:`, {
        snapshotVar: snapshot ? 'mevcut' : 'yok',
        applied: snapshot?.applied,
        snapshotKeyCount: snapshotStudentKeys.size,
        öncekiÖğrenciler: previousStudentKeys.size,
        mevcutÖğrenciler: currentStudentKeys.size,
      });

      // Yeni öğrenciler - snapshot'ta olmayan ve önceki listede olmayan öğrenciler
      const newStudents = studentStats.filter(s => {
        const studentKey = `${s.name}_${s.studentNumber || ''}`;
        if (previousStudentKeys.has(studentKey)) return false;
        const snapshotKey = buildStudentSnapshotKey(s);
        const inSnapshot = snapshotStudentKeys.has(snapshotKey);
        if (inSnapshot) {
          console.log(`[Bildirim-Öğrenci] "${s.name}" snapshot'ta VAR, bildirim oluşturulmayacak`);
        }
        return !inSnapshot;
      });

      console.log(`[Bildirim-Öğrenci] Yeni öğrenciler tespit edildi: ${newStudents.length} adet`);

      if (newStudents.length > 0 && settings.notificationTypes?.studentAdd) {
        if (newStudents.length === 1) {
          // Tek öğrenci ekleme
          const student = newStudents[0];
          addNotification("success", "Öğrenci Eklendi", `${student.name} ${student.surname || ''}`.trim() + " öğrencisi eklendi.");
        } else {
          // Toplu öğrenci ekleme
          const studentNames = newStudents.map(s => formatStudentName(s));
          addNotification("success", "Toplu Öğrenci Ekleme", `${newStudents.length} öğrenci eklendi: ${formatListWithLimit(studentNames, 6)}`);
        }
      }

      // Silinen öğrenciler - TEK BİLDİRİ ŞEKLİNDE
      const deletedStudents = previousStudentStatsRef.current.filter(s => !currentStudentKeys.has(`${s.name}_${s.studentNumber || ''}`));
      if (deletedStudents.length > 0) {
        const deletedStudentNames = deletedStudents.map(student => formatStudentName(student));
        // Öğrenci isimlerini normalize ederek eşleştirme yap
        const deletedStudentBorrowerNames = new Set<string>();
        deletedStudents.forEach(student => {
          const fullName = formatStudentName(student);
          if (fullName) {
            deletedStudentBorrowerNames.add(normalizeStudentName(fullName));
          }
          if (student.name) {
            deletedStudentBorrowerNames.add(normalizeStudentName(student.name));
          }
          if (student.surname) {
            deletedStudentBorrowerNames.add(normalizeStudentName(`${student.name} ${student.surname}`.trim()));
          }
        });

        // Normalize edilmiş isimlerle ödünç kayıtlarını eşleştir
        // NOT: Öğrenci silme işleminde backend ödünç kayıtlarını her zaman silmediği için,
        // burada currentLoanKeySet kontrolünü kaldırıyoruz ve tüm bağlı ödünçleri bildirime dahil ediyoruz.
        const relatedLoans = previousLoansRef.current.filter(loan => {
          if (!loan.borrower) return false;
          const normalizedBorrower = normalizeStudentName(loan.borrower);
          return deletedStudentBorrowerNames.has(normalizedBorrower);
        });
        relatedLoans.forEach(loan => cascadedLoanKeys.add(`${loan.bookId}_${loan.borrower}`));

        const studentDeleteEnabled = settings.notificationTypes?.studentDelete !== false;
        const studentBulkDeleteEnabled = settings.notificationTypes?.studentBulkDelete !== false;
        const cascadeEnabled = settings.notificationTypes?.loanReturn !== false;
        if ((studentDeleteEnabled || studentBulkDeleteEnabled || cascadeEnabled) && deletedStudents.length > 0) {
          enqueueStudentDeletionNotification(deletedStudents, relatedLoans, settings);
        }
      }

      // Güncellenen öğrenciler
      studentStats.forEach(student => {
        const previousStudent = previousStudentStatsRef.current.find(s =>
          s.name === student.name && s.studentNumber === student.studentNumber
        );
        if (previousStudent && (
          previousStudent.name !== student.name ||
          previousStudent.surname !== student.surname ||
          previousStudent.class !== student.class ||
          previousStudent.branch !== student.branch
        )) {
          if (settings.notificationTypes?.studentUpdate) {
            addNotification("info", "Öğrenci Güncellendi", `${student.name} ${student.surname || ''}`.trim() + " öğrencisi güncellendi.");
          }
        }
      });
    }

    // Ödünç değişikliklerini kontrol et - VERİ ÜZERİNDEN KONTROL
    if (canCheckLoans) {
      const previousLoanKeys = new Set(previousLoansRef.current.map(l => `${l.bookId}_${l.borrower}`));

      // Snapshot kontrolü: Eğer snapshot varsa ve uygulanmışsa, snapshot'ta olan ödünçler için bildirim üretme
      const snapshot = notificationSnapshotRef.current;
      const snapshotLoanKeys = snapshot?.applied ? snapshot.loans : new Set<string>();

      // Yeni ödünçler (ödünç verme) - snapshot'ta olmayan ve önceki listede olmayan ödünçler
      const newLoans = loans.filter(l => {
        const loanKey = `${l.bookId}_${l.borrower}`;
        if (previousLoanKeys.has(loanKey)) return false;
        const snapshotKey = buildLoanSnapshotKey(l);
        return !snapshotLoanKeys.has(snapshotKey);
      });
      if (newLoans.length > 0 && settings.notificationTypes?.loanBorrow) {
        const loansByStudent = new Map<string, Array<{ bookTitle: string; days: number }>>();
        newLoans.forEach(loan => {
          const dueDate = new Date(loan.dueDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          dueDate.setHours(0, 0, 0, 0);
          const days = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (!loansByStudent.has(loan.borrower)) {
            loansByStudent.set(loan.borrower, []);
          }
          loansByStudent.get(loan.borrower)!.push({ bookTitle: loan.title, days });
        });

        if (newLoans.length === 1) {
          const loan = newLoans[0];
          const daysInfo = loansByStudent.get(loan.borrower)?.[0]?.days ?? null;
          addNotification(
            "success",
            "Kitap Ödünç Verildi",
            `${loan.title} kitabı ${loan.borrower} öğrencisine${daysInfo !== null ? ` ${daysInfo} gün` : ""} süreyle ödünç verildi.`
          );
        } else {
          const summary = Array.from(loansByStudent.entries()).map(([student, loanList]) => {
            const bookTitles = loanList.map(item => item.bookTitle);
            return `${student} (${loanList.length} kitap: ${formatListWithLimit(bookTitles, 4)})`;
          }).join(" | ");
          addNotification(
            "success",
            "Toplu Ödünç İşlemi",
            `Toplam ${newLoans.length} ödünç kaydı (${loansByStudent.size} öğrenci) oluşturuldu: ${summary}`
          );
        }
      }

      // Silinen ödünçler (teslim alma) - Uzatma işlemlerini filtrele
      const deletedLoans = previousLoansRef.current.filter(l => !currentLoanKeySet.has(`${l.bookId}_${l.borrower}`));

      // Uzatma işlemlerini tespit et: Silinen ödünç var ve aynı kitap+öğrenci için yeni ödünç var
      const extendedLoans: Array<{ deleted: LoanInfo; new: LoanInfo }> = [];
      const actualDeletedLoans: LoanInfo[] = [];

      deletedLoans.forEach(deletedLoan => {
        const loanKey = `${deletedLoan.bookId}_${deletedLoan.borrower}`;
        if (cascadedLoanKeys.has(loanKey)) {
          return; // Bu kayıt zaten kitap/öğrenci silme bildiriminde ele alındı
        }
        const newLoan = loans.find(l => l.bookId === deletedLoan.bookId && l.borrower === deletedLoan.borrower);
        if (newLoan) {
          // Bu bir uzatma işlemi
          extendedLoans.push({ deleted: deletedLoan, new: newLoan });
        } else {
          // Bu gerçek bir teslim alma veya ödünç silme işlemi
          actualDeletedLoans.push(deletedLoan);
        }
      });

      // Uzatma bildirimleri
      if (extendedLoans.length > 0 && settings.notificationTypes?.loanExtend) {
        if (extendedLoans.length === 1) {
          const { deleted, new: newLoan } = extendedLoans[0];
          const oldDueDate = new Date(deleted.dueDate);
          const newDueDate = new Date(newLoan.dueDate);
          const extendDays = Math.ceil((newDueDate.getTime() - oldDueDate.getTime()) / (1000 * 60 * 60 * 24));
          addNotification("info", "Teslim Tarihi Uzatıldı", `${newLoan.title} kitabı için ${newLoan.borrower} öğrencisinin teslim tarihi ${extendDays} gün uzatıldı.`);
        } else {
          const extendSummaries = extendedLoans.map(({ deleted, new: newLoan }) => {
            const oldDueDate = new Date(deleted.dueDate);
            const newDueDate = new Date(newLoan.dueDate);
            const extendDays = Math.ceil((newDueDate.getTime() - oldDueDate.getTime()) / (1000 * 60 * 60 * 24));
            return `${newLoan.title} → ${newLoan.borrower} (+${extendDays} gün)`;
          });
          addNotification(
            "info",
            "Toplu Teslim Tarihi Uzatma",
            `Toplam ${extendedLoans.length} ödünç kaydının teslim tarihi uzatıldı: ${formatListWithLimit(extendSummaries, 5)}`
          );
        }
      }

      // Teslim alma bildirimleri (uzatma olmayanlar)
      // Ayar kontrolünden geç - önemli bilgi
      console.log("🚀 Teslim al kontrolü - actualDeletedLoans:", actualDeletedLoans.length);
      if (actualDeletedLoans.length > 0) {
        console.log("📦 Teslim al bildirimi oluşturuluyor, loans:", actualDeletedLoans);
        const loansByStudent = groupLoanTitlesByBorrower(actualDeletedLoans);
        if (actualDeletedLoans.length === 1) {
          const loan = actualDeletedLoans[0];
          console.log("📌 TEK teslim al bildirimi:", loan.title);
          addNotification("success", "Kitap Teslim Alındı", `${loan.title} kitabı ${loan.borrower} öğrencisinden teslim alındı.`, undefined, true);
        } else {
          console.log("📌 TOPLU teslim al bildirimi:", actualDeletedLoans.length, "adet");
          addNotification(
            "success",
            "Toplu Ödünç Silme",
            `Toplam ${actualDeletedLoans.length} ödünç kaydı (${loansByStudent.size} öğrenci) listeden kaldırıldı: ${formatLoanGroupSummary(loansByStudent)}`,
            undefined,
            true
          );
        }
      } else {
        console.log("⚠️ Teslim al bildirimi oluşturulmadı - actualDeletedLoans boş");
      }

      // Teslim tarihi kontrolü - Geciken ödünçler için bildirim
      loans.forEach(loan => {
        const diff = getDaysDiff(loan.dueDate);
        const loanKey = `${loan.bookId}_${loan.borrower}`;
        const previousLoan = previousLoansRef.current.find(l => l.bookId === loan.bookId && l.borrower === loan.borrower);
        const previousDiff = previousLoan ? getDaysDiff(previousLoan.dueDate) : null;

        // Geciken ödünçler (diff < 0)
        if (diff < 0) {
          // İlk yüklemede kullanıcı "Tümünü temizle" yaptıysa tekrar bildirim üretme
          if ((isInitialLoanNotificationRun && shouldSkipInitialLoanNotifications) === false) {
            // İlk yüklemede veya önceki durum gecikmemişse bildirim gönder
            // Ayrıca daha önce bildirim gönderilmemişse gönder
            if (isInitialLoanNotificationRun || previousDiff === null || previousDiff >= 0) {
              if (!processedOverdueLoansRef.current.has(loanKey) && settings.notificationTypes?.overdue) {
                addNotification("error", "Geciken Ödünç", `${loan.title} kitabı ${loan.borrower} tarafından gecikti.`);
                processedOverdueLoansRef.current.add(loanKey);
              }
            }
          }
        } else {
          // Gecikme durumu düzeldiyse, işaretlemeyi kaldır
          processedOverdueLoansRef.current.delete(loanKey);
        }

        // Yaklaşan teslim tarihleri (0-3 gün içinde)
        if (diff >= 0 && diff <= 3) {
          // Önceki durum 3 günden fazlaysa veya yoksa bildirim gönder
          if ((isInitialLoanNotificationRun && shouldSkipInitialLoanNotifications) === false && (previousDiff === null || previousDiff > 3)) {
            if (settings.notificationTypes?.dueSoon) {
              addNotification("warning", "Teslim Tarihi Yaklaşıyor", `${loan.title} kitabı ${loan.borrower} tarafından ${diff === 0 ? "bugün" : diff === 1 ? "yarın" : `${diff} gün içinde`} teslim edilmeli.`);
            }
          }
        }
      });

      // Artık mevcut olmayan ödünçleri temizle (teslim edilmiş)
      const currentLoanKeysSet = new Set(loans.map(l => `${l.bookId}_${l.borrower}`));
      processedOverdueLoansRef.current.forEach(key => {
        if (!currentLoanKeysSet.has(key)) {
          processedOverdueLoansRef.current.delete(key);
        }
      });
    }

    // Referansları güncelle ve ilk yükleme bayraklarını işaretle
    previousBooksRef.current = books;
    previousLoansRef.current = loans;
    previousStudentStatsRef.current = studentStats;
    hasInitializedBooksRef.current = true;
    hasInitializedStudentsRef.current = true;
    hasInitializedLoansRef.current = true;
  }, [books, loans, studentStats, user, notificationSettings]);

  // Bildirimleri localStorage'a kaydet (GLOBAL - tüm kullanıcılar için)
  const saveNotifications = (updater: Notification[] | ((prev: Notification[]) => Notification[])) => {
    setNotifications((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const key = getNotificationsStorageKey();
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };

  // Bildirim oluştur
  const addNotification = (
    type: "info" | "success" | "warning" | "error",
    title: string,
    message: string,
    kind?: keyof NotificationSettings["notificationTypes"] | "misc",
    bypassSettings?: boolean // Özel durumlar için ayar kontrolünü atla
  ) => {
    console.log("🔔 addNotification çağrıldı:", { title, type, kind, bypassSettings, notifications: notificationSettings.notifications });

    if (!bypassSettings && !notificationSettings.notifications) {
      console.log("❌ Ana anahtar kapalı, bildirim oluşturulmadı");
      return;
    }
    const resolvedKind = kind ?? inferNotificationKind(title);
    console.log("📋 Resolved kind:", resolvedKind);

    // Sadece tanımlı (checkbox'lı) türler bildirim paneline düşsün
    if (resolvedKind === "misc") {
      console.log("❌ misc kind, bildirim oluşturulmadı");
      return;
    }
    // bypassSettings true ise ayar kontrolünü atla
    if (!bypassSettings && notificationSettings.notificationTypes?.[resolvedKind] === false) {
      console.log("❌ Bildirim türü kapalı:", resolvedKind);
      return;
    }

    console.log("✅ Bildirim oluşturuluyor:", title);
    const notification: Notification = {
      id: `notif_${Date.now()}_${Math.random()}`,
      type,
      title,
      message,
      timestamp: new Date(),
      read: false,
      kind: resolvedKind,
    };

    saveNotifications((prev) => [notification, ...prev].slice(0, 100)); // En fazla 100 bildirim
  };

  // Bildirimi okundu işaretle
  const markNotificationAsRead = (id: string) => {
    saveNotifications((prev) => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  // Tüm bildirimleri okundu işaretle
  const markAllNotificationsAsRead = () => {
    saveNotifications((prev) => prev.map(n => ({ ...n, read: true })));
  };

  // Tüm bildirimleri temizle
  const clearAllNotifications = () => {
    saveNotifications([]);
    const now = Date.now();
    lastNotificationClearAtRef.current = now;
    localStorage.setItem(getNotificationsClearedAtKey(), String(now));

    const bookSnapshotKeys = books.map(buildBookSnapshotKey).filter(Boolean);
    const studentSnapshotKeys = studentStats.map(buildStudentSnapshotKey).filter(Boolean);
    const loanSnapshotKeys = loans.map(buildLoanSnapshotKey).filter(Boolean);
    localStorage.setItem(getNotificationsSnapshotKey(), JSON.stringify({
      books: bookSnapshotKeys,
      students: studentSnapshotKeys,
      loans: loanSnapshotKeys,
    }));

    // Baseline kaydet: mevcut geciken ödünçler bir daha "yeni" sayılmasın
    const currentOverdueKeys = loans
      .filter(l => getDaysDiff(l.dueDate) < 0)
      .map(l => `${l.bookId}_${l.borrower}`)
      .filter(Boolean);
    localStorage.setItem(getNotificationsBaselineKey(), JSON.stringify({
      overdueLoanKeys: currentOverdueKeys,
      savedAt: now,
    }));
    notificationBaselineRef.current = {
      overdueLoanKeys: new Set(currentOverdueKeys),
      applied: true,
    };
    notificationSnapshotRef.current = {
      books: new Set(bookSnapshotKeys),
      students: new Set(studentSnapshotKeys),
      loans: new Set(loanSnapshotKeys),
      applied: true,
    };
    processedOverdueLoansRef.current = new Set(currentOverdueKeys);
    previousBooksRef.current = books;
    previousLoansRef.current = loans;
    previousStudentStatsRef.current = studentStats;
    hasInitializedBooksRef.current = true;
    hasInitializedLoansRef.current = true;
    hasInitializedStudentsRef.current = true;
    processedOverdueLoansRef.current.clear();
    currentOverdueKeys.forEach(k => processedOverdueLoansRef.current.add(k));
  };

  const handleNotificationSettingsChange = useCallback((settings: NotificationSettings) => {
    setNotificationSettings(settings);
    if (user) {
      localStorage.setItem(getNotificationSettingsStorageKey(user.username), JSON.stringify(settings));
    }
  }, [user]);

  // Sayfa yüklendiğinde localStorage'dan kullanıcı bilgisini yükle ve doğrula
  useEffect(() => {
    const savedUser = localStorage.getItem('kutuphane_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        // Backend'den session'ı doğrula
        httpClient.get<UserResponse>("/auth/verify")
          .then(async (verifiedUser) => {
            setUser(verifiedUser);
            setShowMainContent(true);
            // localStorage'ı güncelle
            localStorage.setItem('kutuphane_user', JSON.stringify(verifiedUser));
            // Otomatik kayıt timer'ını başlat
            await startAutoRecordTimer(verifiedUser.username);
          })
          .catch(() => {
            // Session geçersiz, localStorage'ı temizle
            localStorage.removeItem('kutuphane_user');
            setUser(null);
            stopAutoRecordTimer();
          });
      } catch (error) {
        console.error("Kullanıcı bilgisi yüklenemedi:", error);
        localStorage.removeItem('kutuphane_user');
        stopAutoRecordTimer();
      }
    }

    // Component unmount olduğunda timer'ı temizle
    return () => {
      stopAutoRecordTimer();
    };
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setLoading(true);
    try {
      const response: any = await httpClient.post("/auth/login", { username, password });
      const userData: UserResponse = response;

      // Normal login flow - kurtarma kodu kullanılsa bile ana sayfaya git
      localStorage.setItem('kutuphane_user', JSON.stringify(userData));

      // Eski klasörleri temizle
      try {
        await httpClient.post("/filesystem/cleanup-old-folders", { username: userData.username });
      } catch (cleanupError) {
        // Sessizce devam et
      }

      // Kayıt tiplerini güncelle
      try {
        await httpClient.post("/record-types/sync", { username: userData.username });
      } catch (syncError) {
        console.error("Kayıt tipleri güncellenemedi:", syncError);
      }

      document.cookie = `kutuphane_session=${username}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
      setIsTransitioning(true);

      setTimeout(() => {
        setUser(userData);
        setStatusWithTimeout(`${userData.username} olarak giriş yapıldı`, 3000);

        // Kurtarma kodu ile giriş yapıldıysa profil modalını aç ve bildirim göster
        if (userData.usedRecoveryCode) {
          setTimeout(() => {
            setShowProfileModal(true);
            showInfo(
              "Kurtarma Kodu ile Giriş Yapıldı",
              "Güvenliğiniz için şifrenizi profil ayarlarından değiştirebilirsiniz",
              "warning",
              "⚠️"
            );
          }, 1200); // Profil modalını biraz gecikmeli aç
        }

        setTimeout(async () => {
          setIsTransitioning(false);
          setShowMainContent(true);
          await refreshAll();
          await startAutoRecordTimer(userData.username);
        }, 500);
      }, 800);
    } catch (error) {
      setLoading(false);
      setIsTransitioning(false);
      throw error;
    }
  };

  const handleLogout = async () => {
    setIsTransitioning(true);
    setShowMainContent(false);
    // Otomatik kayıt timer'ını durdur
    stopAutoRecordTimer();
    // Backend'den logout yap
    try {
      await httpClient.post("/auth/logout");
    } catch (error) {
      // Logout hatası kritik değil
      console.error("Logout hatası:", error);
    }
    // localStorage'dan kullanıcı bilgisini temizle
    localStorage.removeItem('kutuphane_user');
    setTimeout(() => {
      setUser(null);
      setBooks([]);
      setLoans([]);
      setBookStats([]);
      setStudentStats([]);
      setStatusWithTimeout("Çıkış yapıldı", 2000);
      setIsTransitioning(false);
    }, 500);
  };

  const handleProfileLogout = async () => {
    setShowProfileModal(false);
    await handleLogout();
  };

  const syncStudents = async () => {
    // Öğrenciler senkronizasyon yapamaz
    if (user?.role === "STUDENT") {
      throw new Error("Öğrenciler senkronizasyon yapamaz");
    }
    const result = await httpClient.post<{ updatedCount: number }>("/admin/sync/students");
    await refreshAll();
    return result.updatedCount;
  };

  const syncpersonel = async () => {
    // Öğrenciler senkronizasyon yapamaz
    if (user?.role === "STUDENT") {
      throw new Error("Öğrenciler senkronizasyon yapamaz");
    }
    const result = await httpClient.post<{ updatedCount: number }>("/admin/sync/personel");
    return result.updatedCount;
  };

  const syncBooks = async () => {
    // Öğrenciler senkronizasyon yapamaz
    if (user?.role === "STUDENT") {
      throw new Error("Öğrenciler senkronizasyon yapamaz");
    }
    const result = await httpClient.post<{ updatedCount: number }>("/admin/sync/books");
    await refreshAll();
    return result.updatedCount;
  };

  const handleAddBook = async (data: {
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
    year?: number;
    pageCount?: number;
    bookNumber?: number;
  }) => {
    // Öğrenciler işlem yapamaz
    if (user?.role === "STUDENT") {
      setStatusWithTimeout("Öğrenciler kitap ekleyemez veya düzenleyemez", 3000);
      return;
    }

    if (data.id) {
      // Düzenleme - PUT request
      await httpClient.put<Book>(`/books/${data.id}`, {
        title: data.title,
        author: data.author,
        category: data.category,
        totalQuantity: data.quantity,
        healthyCount: data.healthyCount,
        damagedCount: data.damagedCount,
        lostCount: data.lostCount,
        shelf: data.shelf,
        publisher: data.publisher,
        summary: data.summary,
        bookNumber: data.bookNumber,
        year: data.year,
        pageCount: data.pageCount,
        personelName: user?.username || "",
      });
      // Ek alanlar için CSV güncellemesi yapılabilir (gelecekte)
      setStatusWithTimeout("Kitap başarıyla güncellendi", 3000);
      if (notificationSettings.notificationTypes?.bookUpdate !== false) {
        addNotification("success", "Kitap Güncellendi", `${data.title} kitabı başarıyla güncellendi.`);
      }
    } else {
      // Yeni ekleme - POST request
      await httpClient.post<Book>("/books", {
        title: data.title,
        author: data.author,
        category: data.category,
        quantity: data.quantity,
        healthyCount: data.healthyCount,
        damagedCount: data.damagedCount,
        lostCount: data.lostCount,
        shelf: data.shelf,
        publisher: data.publisher,
        summary: data.summary,
        bookNumber: data.bookNumber,
        year: data.year,
        pageCount: data.pageCount,
        personelName: user?.username || "",
      });
      setStatusWithTimeout("Kitap başarıyla eklendi", 3000);
      if (notificationSettings.notificationTypes?.bookAdd !== false) {
        addNotification("success", "Kitap Eklendi", `${data.title} kitabı başarıyla eklendi.`);
      }
    }
    await refreshAll();
  };

  const buildBookDeleteMessage = (book: Book | null, loansForBook: LoanEntry[]) => {
    const title = book?.title || "Bu kitap";
    if (loansForBook.length === 0) {
      return `${title} kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`;
    }
    const borrowerLines = loansForBook.map(loan => {
      const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
      return `• ${loan.borrower} (Teslim: ${dueDate})`;
    });
    return [
      `${title} kitabı şu öğrencilerde ödünç görünüyor:`,
      ...borrowerLines,
      "",
      `${loansForBook.length} ödünç kaydı bu işlemle birlikte silinecek. Onaylıyor musunuz?`
    ].join("\n");
  };

  const handleBulkDeleteBooksSuccess = (deletedCount: number, loanCount: number) => {
    if (deletedCount === 0) return;
    const summary = loanCount > 0
      ? `${deletedCount} kitap ve ${loanCount} ödünç kaydı silindi`
      : `${deletedCount} kitap silindi`;
    showInfo("Başarılı", summary, "success", "✅");
  };

  const handleDeleteBook = async (
    id: string,
    options?: { silent?: boolean; skipConfirm?: boolean; deferRefresh?: boolean; suppressErrorInfo?: boolean }
  ) => {
    // Öğrenciler işlem yapamaz
    if (user?.role === "STUDENT") {
      showInfo("Hata", "Öğrenciler kitap silemez", "error", "❌");
      return;
    }

    let latestBook: Book | null = null;
    try {
      latestBook = await httpClient.get<Book>(`/books/${id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kitap bilgileri alınamadı.";
      showInfo("Hata", message, "error", "❌");
      return;
    }

    const loansForBook = Array.isArray(latestBook.loans) ? latestBook.loans : [];
    if (!options?.skipConfirm && loansForBook.length > 0) {
      // Ödünç varsa onay kartını göster
      setBookToDelete({ book: latestBook, bookId: id, loans: loansForBook, silent: options?.silent });
      setShowBookDeleteConfirm(true);
      return;
    }

    // Ödünç yoksa direkt sil
    await executeBookDelete(id, latestBook, options);
  };

  const executeBookDelete = async (
    id: string,
    book: Book,
    options?: { silent?: boolean; deferRefresh?: boolean; suppressErrorInfo?: boolean }
  ) => {
    setDeleteBookLoading(true);
    try {
      await httpClient.delete(`/books/${id}?personelName=${encodeURIComponent(user?.username || "")}`);
      const statusMessage = book.loans && book.loans.length > 0
        ? `${book.title} kitabı ve ${book.loans.length} ödünç kaydı silindi`
        : `${book.title} kitabı silindi`;
      if (!options?.silent) {
        showInfo("Başarılı", statusMessage, "success", "✅");
      }
      if (!options?.deferRefresh) {
        await refreshAll();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kitap silinirken bir hata oluştu.";
      if (options?.suppressErrorInfo) {
        throw new Error(message);
      }
      showInfo("Hata", message, "error", "❌");
    } finally {
      setDeleteBookLoading(false);
    }
  };

  // Login olmadan hiçbir şey gösterilmez
  if (!user) {
    return (
      <div className={`app-shell ${isTransitioning ? 'transitioning' : ''}`}>
        <header className="login-page-header">
          <div>
            <h1>Kütüphane Yönetim Sistemi</h1>
            <p>Lütfen giriş yapın</p>
          </div>
        </header>
        <LoginPanel onLogin={handleLogin} busy={loading} />
        {status && <p className="status-bar">{status}</p>}
        {isTransitioning && (
          <div className="transition-overlay">
            <div className="transition-content">
              <div className="transition-spinner" aria-hidden="true"></div>
              <div className="transition-progress" aria-hidden="true">
                <div className="transition-progress-bar"></div>
              </div>
              <p>Giriş yapılıyor...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Öğrenci görünümü kaldırıldı - sadece personel ve admin login olabilir
  if (user.role === "STUDENT") {
    handleLogout();
    return (
      <div className={`app-shell ${isTransitioning ? 'transitioning' : ''}`}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <div>
            <h1>Kütüphane Yönetim Sistemi</h1>
            <p style={{ color: "#dc2626", fontSize: "14px" }}>
              Öğrenciler login olamaz. Sadece personel ve yöneticiler login olabilir.
            </p>
          </div>
        </header>
        <LoginPanel onLogin={handleLogin} busy={loading} />
        {status && <p className="status-bar">{status}</p>}
      </div>
    );
  }

  // Personel/Admin görünümü - tüm özellikler
  const roleDisplayName = user.role === "personel" ? "Personel" : user.role === "ADMIN" ? "Yönetici" : user.role;
  const isAdminUser = user.role === "ADMIN" || user.role === "Admin";
  const canShowNotificationButton = notificationSettings.notifications && !isAdminUser;

  // İstatistikler
  const totalBookTypes = books.length; // Kitap çeşidi sayısı
  const totalBookQuantity = books.reduce((sum, b) => sum + (b.quantity || 0), 0) + loans.filter(l => l.remainingDays > 0).length; // Toplam kitap adeti = mevcut Adet + aktif ödünç
  const totalStudents = studentStats.length; // Toplam öğrenci sayısı
  const activeLoans = loans.filter(l => l.remainingDays > 0).length; // Aktif ödünç
  const availableBooks = books.reduce((sum, b) => sum + (b.quantity || 0), 0); // Müsait kitap - toplam mevcut adet

  // Yeni istatistikler - Oranlar
  const totalBooksQuantity = books.reduce((sum, b) => sum + (b.totalQuantity || 0), 0);
  const healthyBookCount = books.reduce((sum, b) => sum + (b.healthyCount || 0), 0);
  const healthyBookRatio = totalBooksQuantity > 0 ? ((healthyBookCount / totalBooksQuantity) * 100).toFixed(1) : "0";

  const activeBooksCount = books.filter(b => (b.quantity || 0) > 0).length;
  const activeBookRatio = books.length > 0 ? ((activeBooksCount / books.length) * 100).toFixed(1) : "0";

  const borrowedRatio = totalBooksQuantity > 0 ? ((activeLoans / totalBooksQuantity) * 100).toFixed(1) : "0";

  return (
    <div className={`app-shell ${showMainContent ? 'show-content' : ''} ${isTransitioning ? 'transitioning' : ''}`}>
      <header className="main-header">
        <div className="header-top">
          <div className="header-left">
            <h1>Kütüphane Yönetim Paneli</h1>
            <div className="user-info">
              <button
                type="button"
                className={`user-avatar ${showProfileModal ? "active" : ""}`}
                onClick={() => setShowProfileModal((prev) => !prev)}
                title="Profil kartını aç"
              >
                <span>{user.username.charAt(0).toUpperCase()}</span>
              </button>
              <div className="user-details">
                <p className="user-name">
                  <strong>{user.username}</strong>
                </p>
                <p className="user-role">{roleDisplayName}</p>
              </div>
            </div>
          </div>
          <div className="header-right">
            <div className="header-actions">
              {/* Global Search */}
              <div className={`search-container ${showSearch ? 'expanded' : ''}`}>
                {showSearch ? (
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="search-input-expanded"
                    placeholder="Kitaplar, öğrenciler, ödünçlerde ara..."
                    value={globalSearchKeyword}
                    onChange={(e) => {
                      setGlobalSearchKeyword(e.target.value);
                      handleGlobalSearch(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setShowSearch(false);
                        setGlobalSearchKeyword("");
                        setSearchResults({ books: [], students: [], loans: [] });
                      }
                    }}
                  />
                ) : (
                  <button
                    className="icon-button search-button"
                    onClick={() => {
                      setShowSearch(true);
                      setSearchFilter('all');
                    }}
                    title="Ara"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                  </button>
                )}
              </div>
              {canShowNotificationButton && (
                <button
                  className="icon-button"
                  onClick={() => setShowNotificationPanel(true)}
                  title="Bildirimler"
                  style={{ position: "relative" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                  </svg>
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      background: "#ef4444",
                      color: "white",
                      borderRadius: "10px",
                      padding: "2px 6px",
                      fontSize: "10px",
                      fontWeight: 700,
                      minWidth: "18px",
                      textAlign: "center",
                      lineHeight: "14px"
                    }}>
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </button>
              )}
              <button
                className="icon-button"
                onClick={() => setShowSettingsModal(true)}
                title="Ayarlar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* İstatistik Kartları */}
        <div className="header-stats">
          <div className="stat-card stat-card-books">
            <div className="stat-icon" style={{ background: "rgba(255, 255, 255, 0.2)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{totalBookTypes}</div>
              <div className="stat-label">Kitap Çeşidi</div>
            </div>
          </div>

          <div className="stat-card stat-card-quantity">
            <div className="stat-icon" style={{ background: "rgba(255, 255, 255, 0.2)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                <path d="M9 9h6"></path>
                <path d="M9 13h6"></path>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{totalBookQuantity}</div>
              <div className="stat-label">Toplam Kitap Adeti</div>
            </div>
          </div>

          <div className="stat-card stat-card-students">
            <div className="stat-icon" style={{ background: "rgba(255, 255, 255, 0.2)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{totalStudents}</div>
              <div className="stat-label">Toplam Öğrenci</div>
            </div>
          </div>

          <div className="stat-card stat-card-loans">
            <div className="stat-icon" style={{ background: "rgba(255, 255, 255, 0.2)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{activeLoans}</div>
              <div className="stat-label">Aktif Ödünç</div>
            </div>
          </div>

          <div className="stat-card stat-card-available">
            <div className="stat-icon" style={{ background: "rgba(255, 255, 255, 0.2)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
            </div>
            <div className="stat-content">
              <div className="stat-value">{availableBooks}</div>
              <div className="stat-label">Müsait Kitap</div>
            </div>
          </div>
        </div>
      </header>
      {showProfileModal && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onLogout={() => {
            setShowProfileModal(false);
            handleLogout();
          }}
        />
      )}
      {showSettingsModal && (
        <SettingsModal
          user={user}
          onClose={() => setShowSettingsModal(false)}
          onAutoRecordSettingsChanged={(settings) => {
            if (user?.role === "ADMIN" || user?.role === "PERSONEL") {
              startAutoRecordTimer(user.username, settings);
            }
          }}
          notificationSettings={notificationSettings}
          onNotificationSettingsChange={handleNotificationSettingsChange}
          onShowInfo={showInfo}
        />
      )}
      {showNotificationPanel && canShowNotificationButton && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowNotificationPanel(false)}
          onMarkAsRead={markNotificationAsRead}
          onMarkAllAsRead={markAllNotificationsAsRead}
          onClearAll={clearAllNotifications}
          notificationSettings={notificationSettings}
        />
      )}
      {/* Search Book Detail Modal */}
      {selectedSearchBook && (
        <BookDetailModal
          book={selectedSearchBook}
          students={studentStats}
          loans={loans}
          books={books}
          personelName={user.username}
          onClose={() => setSelectedSearchBook(null)}
          onRefresh={refreshAll}
          onAddNotification={addNotification}
        />
      )}
      {/* Search Student Detail Modal - Removed legacy inline portal */}


      {/* Öğrenci Detay Modal - StudentList'teki gibi tam künye */}
      {/* Öğrenci Detay Modal - Search ve diğer yerlerden tetiklenen */}
      <StudentDetailModal
        isOpen={!!selectedStudentForDetail}
        onClose={() => {
          setShowStudentDetailModal(false);
          setSelectedStudentForDetail(null);
        }}
        student={selectedStudentForDetail}
        loans={loans}
        books={books}
        personelName={user?.username || ""}
        onRefresh={refreshAll}
        onBookClick={setSelectedBookForDetail}
        maxPenaltyPoints={maxPenaltyPoints}
        loading={studentDetailLoading || studentHistoryLoading}
        studentHistory={studentHistory}
        historyEntries={studentHistory?.entries ?? []}
      // Admin değilse düzenleme yetkisi yok
      // Modal içinde showEditButton={!!onEdit} olduğu için onEdit göndermezsek buton çıkmaz
      />
      {/* Kitap Detay Modal - Search'ten */}
      {
        selectedBookForDetail && (
          <BookDetailModal
            book={selectedBookForDetail}
            students={studentStats}
            loans={loans}
            books={books}
            personelName={user?.username || ""}
            onClose={() => setSelectedBookForDetail(null)}
            onRefresh={refreshAll}
            onAddNotification={addNotification}
          />
        )
      }
      {/* Global Search Preview */}
      {
        showSearch && globalSearchKeyword.trim() && (
          <div className="search-preview">
            <div className="search-preview-header">
              <h3>Arama Sonuçları: "{globalSearchKeyword}"</h3>
              <div className="search-preview-header-right">
                <div className="search-preview-filter-buttons">
                  <button
                    className={`search-filter-btn ${searchFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setSearchFilter('all')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    Tümü
                  </button>
                  <button
                    className={`search-filter-btn ${searchFilter === 'books' ? 'active' : ''}`}
                    onClick={() => setSearchFilter('books')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    Kitaplar ({searchResults.books.length})
                  </button>
                  <button
                    className={`search-filter-btn ${searchFilter === 'students' ? 'active' : ''}`}
                    onClick={() => setSearchFilter('students')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Öğrenciler ({searchResults.students.length})
                  </button>
                  <button
                    className={`search-filter-btn ${searchFilter === 'loans' ? 'active' : ''}`}
                    onClick={() => setSearchFilter('loans')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                      <path d="M9 9l3 3 3-3"></path>
                    </svg>
                    Ödünçler ({searchResults.loans.length})
                  </button>
                </div>
              </div>
            </div>
            <div className="search-preview-content">
              {searchResults.books.length === 0 && searchResults.students.length === 0 && searchResults.loans.length === 0 ? (
                <div className="search-preview-empty">
                  <p>Arama sonucu bulunamadı.</p>
                </div>
              ) : (
                <>
                  {searchResults.books.length > 0 && (searchFilter === 'all' || searchFilter === 'books') && (
                    <div className="search-preview-section">
                      <h4>Kitaplar ({searchResults.books.length})</h4>
                      <div className="search-preview-list">
                        {searchResults.books.slice(0, 10).map((book) => (
                          <div
                            key={book.id}
                            className="search-preview-card"
                          >
                            <button
                              className="search-preview-detail-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSearchBook(book);
                              }}
                              title="Kitap künyesine git"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                              </svg>
                              Detaylı Görüntüle
                            </button>
                            <div className="search-preview-card-content">
                              <div className="search-preview-card-header">
                                <div className="search-preview-card-icon" style={{ background: "rgba(59, 130, 246, 0.1)" }}>
                                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                  </svg>
                                </div>
                                <div className="search-preview-card-title-section">
                                  <h3 className="search-preview-card-title">{book.title}</h3>
                                  <p className="search-preview-card-subtitle">{book.author}</p>
                                </div>
                              </div>
                              <div className="search-preview-card-info">
                                <div className="search-preview-card-info-item">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                  </svg>
                                  <span>{book.category}</span>
                                </div>
                                <div className="search-preview-card-info-item" style={{
                                  backgroundColor: book.quantity > 0 ? "rgba(59, 130, 246, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                  color: book.quantity > 0 ? "#1e40af" : "#dc2626",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontWeight: 600
                                }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                                  </svg>
                                  <span>Mevcut: <strong>{book.quantity}</strong></span>
                                </div>
                                <div className="search-preview-card-info-item" style={{
                                  backgroundColor: (book.healthyCount ?? 0) > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                  color: (book.healthyCount ?? 0) > 0 ? "#065f46" : "#dc2626",
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontWeight: 600
                                }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9 11l3 3L22 4"></path>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                  </svg>
                                  <span>Sağlam: <strong>{book.healthyCount ?? 0}</strong></span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {searchResults.books.length > 10 && (
                          <div className="search-preview-more">+{searchResults.books.length - 10} daha fazla</div>
                        )}
                      </div>
                    </div>
                  )}
                  {searchResults.students.length > 0 && (searchFilter === 'all' || searchFilter === 'students') && (
                    <div className="search-preview-section">
                      <h4>Öğrenciler ({searchResults.students.length})</h4>
                      <div className="search-preview-list">
                        {searchResults.students.slice(0, 10).map((student, idx) => (
                          <div
                            key={idx}
                            className="search-preview-card"
                          >
                            <button
                              className="search-preview-detail-button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStudentForDetail(student);
                                setShowStudentDetailModal(true);
                              }}
                              title="Öğrenci künyesine git"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                              </svg>
                              Detaylı Görüntüle
                            </button>
                            <div className="search-preview-card-content">
                              <div className="search-preview-card-header">
                                <div className="search-preview-card-icon" style={{ background: "rgba(16, 185, 129, 0.1)" }}>
                                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                  </svg>
                                </div>
                                <div className="search-preview-card-title-section">
                                  <h3 className="search-preview-card-title">{`${student.name} ${student.surname}`.trim()}</h3>
                                  <p className="search-preview-card-subtitle">
                                    {student.class && `Sınıf ${student.class}`}
                                    {student.class && student.branch && " • "}
                                    {student.branch && student.branch}
                                  </p>
                                </div>
                              </div>
                              <div className="search-preview-card-info">
                                <div className="search-preview-card-info-item">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                    <path d="M9 9l3 3 3-3"></path>
                                  </svg>
                                  <span>Ödünç: <strong className="search-preview-card-info-value">{student.borrowed || 0}</strong></span>
                                </div>
                                <div className="search-preview-card-info-item">
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                  </svg>
                                  <span>Geciken: <strong className={`search-preview-card-info-value ${(student.late || 0) > 0 ? 'search-preview-card-info-value-late' : 'search-preview-card-info-value-normal'}`}>{student.late || 0}</strong></span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {searchResults.students.length > 10 && (
                          <div className="search-preview-more">+{searchResults.students.length - 10} daha fazla</div>
                        )}
                      </div>
                    </div>
                  )}
                  {searchResults.loans.length > 0 && (searchFilter === 'all' || searchFilter === 'loans') && (
                    <div className="search-preview-section">
                      <h4>Ödünçler ({searchResults.loans.length})</h4>
                      <div className="search-preview-list">
                        {searchResults.loans.slice(0, 10).map((loan, idx) => {
                          const loanBook = books.find(b => b.title === loan.title && b.author === loan.author);
                          return (
                            <div
                              key={idx}
                              className="search-preview-card"
                            >
                              <button
                                className="search-preview-detail-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (loanBook) {
                                    setSelectedSearchBook(loanBook);
                                  }
                                }}
                                title="Kitap künyesine git"
                                disabled={!loanBook}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                  <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                Detaylı Görüntüle
                              </button>
                              <div className="search-preview-card-content">
                                <div className="search-preview-card-header">
                                  <div className="search-preview-card-icon" style={{ background: "rgba(245, 158, 11, 0.1)" }}>
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                      <path d="M9 9l3 3 3-3"></path>
                                    </svg>
                                  </div>
                                  <div className="search-preview-card-title-section">
                                    <h3 className="search-preview-card-title">{loan.title}</h3>
                                    <p className="search-preview-card-subtitle">{loan.author}</p>
                                  </div>
                                </div>
                                <div className="search-preview-card-info">
                                  <div className="search-preview-card-info-item">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                      <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                    <span>{loan.borrower}</span>
                                  </div>
                                  {loan.remainingDays !== null && (
                                    <div
                                      className="search-preview-card-info-item"
                                      style={{ color: loan.remainingDays < 0 ? '#dc2626' : loan.remainingDays <= 3 ? '#f59e0b' : '#10b981' }}
                                    >
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                      </svg>
                                      <span>
                                        {loan.remainingDays > 0 ? `${loan.remainingDays} gün kaldı` : `${Math.abs(loan.remainingDays)} gün gecikmiş`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {searchResults.loans.length > 10 && (
                          <div className="search-preview-more">+{searchResults.loans.length - 10} daha fazla</div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )
      }
      <div className={`main-content ${showMainContent ? 'fade-in' : ''}`}>
        {user.role === "ADMIN" || user.role === "Admin" ? (
          <AdminPanel />
        ) : (
          <PersonelView
            books={books}
            loans={loans}
            bookStats={bookStats}
            studentStats={studentStats}
            onRefresh={refreshAll}
            onSearch={handleSearch}
            onSyncStudents={syncStudents}
            onSyncpersonel={syncpersonel}
            onSyncBooks={syncBooks}
            onAddBook={handleAddBook}
            onDeleteBook={handleDeleteBook}
            onBulkDeleteBooksSuccess={handleBulkDeleteBooksSuccess}
            userRole={user.role}
            userName={user.username}
            onAddNotification={addNotification}
            onShowInfo={showInfo}
          />
        )}
      </div>
      {status && <p className="status-bar">{status}</p>}
      {
        isTransitioning && (
          <div className="transition-overlay">
            <div className="transition-content">
              <div className="transition-spinner" aria-hidden="true"></div>
              <div className="transition-progress" aria-hidden="true">
                <div className="transition-progress-bar"></div>
              </div>
              <p>Yönlendiriliyor...</p>
            </div>
          </div>
        )
      }

      {/* Kitap Silme Onay Kartı */}
      <ConfirmCard
        isOpen={showBookDeleteConfirm}
        title="Kitap Silme Onayı"
        icon="⚠️"
        onConfirm={async () => {
          if (!bookToDelete) return;
          const targetBook = bookToDelete.book;
          const targetBookId = bookToDelete.bookId || targetBook.id;
          const targetSilent = bookToDelete.silent;
          setShowBookDeleteConfirm(false);
          setBookToDelete(null);
          await executeBookDelete(targetBookId, targetBook, { silent: targetSilent });
        }}
        onCancel={() => {
          setShowBookDeleteConfirm(false);
          setBookToDelete(null);
        }}
        confirmText="Sil"
        cancelText="İptal"
        confirmButtonColor="#ef4444"
        loading={deleteBookLoading}
      >
        {bookToDelete && (
          <>
            {bookToDelete.loans.length > 0 ? (
              <>
                <div style={{ fontSize: "14px", color: "#475569", marginBottom: "16px", lineHeight: "1.6" }}>
                  <strong>{bookToDelete.book.title}</strong> kitabı şu öğrencilerde ödünç görünüyor:
                </div>
                <div style={{ maxHeight: "360px", overflowY: "auto", marginBottom: "16px" }}>
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "#fef3c7",
                      borderRadius: "8px",
                      border: "1px solid #fbbf24",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                      <div className="selection-checkbox selected" style={{ pointerEvents: "none" }}>
                        <span>✓</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 600 }}>
                          {bookToDelete.book.title} - {bookToDelete.loans.length} Ödünç
                        </div>
                        {bookToDelete.book.author && (
                          <div style={{ fontSize: "12px", color: "#475569" }}>{bookToDelete.book.author}</div>
                        )}
                      </div>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "#78350f" }}>
                      {bookToDelete.loans.map((loan, index) => {
                        const dueDate = loan.dueDate ? new Date(loan.dueDate).toLocaleDateString("tr-TR") : "-";
                        return (
                          <li key={`loan-${index}`} style={{ marginBottom: "6px" }}>
                            <strong>{loan.borrower}</strong> (Teslim: {dueDate})
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
                <div style={{ fontSize: "13px", color: "#64748b", padding: "12px", backgroundColor: "#f1f5f9", borderRadius: "8px" }}>
                  <strong>{bookToDelete.loans.length} ödünç kaydı</strong> bu işlemle birlikte silinecek.
                </div>
              </>
            ) : (
              <div style={{ fontSize: "14px", color: "#475569", lineHeight: "1.6" }}>
                <strong>{bookToDelete.book.title}</strong> kitabını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
              </div>
            )}
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
    </div >
  );
};

export default App;
