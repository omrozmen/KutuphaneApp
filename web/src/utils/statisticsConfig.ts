// Merkezi istatistik yapılandırması
export type StatType =
  | "total-books"
  | "total-loans"
  | "available-books"
  | "low-stock-books"
  | "late-loans"
  | "active-borrowers"
  | "banned-students"
  | "due-soon-0-3"
  | "due-soon-4-7"
  | "due-soon-8-14"
  | "due-soon-15plus"
  | "total-borrowed"
  | "total-returned"
  | "stock-out"
  | "top-borrowed-books"
  | "top-borrowed-students"
  | "category-stats"
  | "class-stats"
  | "healthy-book-ratio"
  | "active-book-ratio"
  | "borrowed-ratio"
  | "avg-reading-duration"
  | "avg-return-duration"
  | "category-percentages";

export type StatLocation = "header" | "homepage" | "reports";

export interface StatDefinition {
  id: string;
  type: StatType;
  label: string;
  description?: string;
  locations: StatLocation[];
  icon?: string; // SVG path veya icon identifier
  color?: string;
  calculationFn: string; // Function name for calculation
  enabled: boolean;
  order: number;
}

// Varsayılan istatistik tanımları
export const defaultStats: StatDefinition[] = [
  {
    id: "stat-total-books",
    type: "total-books",
    label: "Toplam Kitap",
    description: "Sistemdeki toplam kitap sayısı",
    locations: ["header", "homepage", "reports"],
    icon: "book",
    color: "#667eea",
    calculationFn: "calculateTotalBooks",
    enabled: true,
    order: 1,
  },
  {
    id: "stat-total-loans",
    type: "total-loans",
    label: "Aktif Ödünç",
    description: "Aktif ödünç sayısı",
    locations: ["header", "homepage", "reports"],
    icon: "book-open",
    color: "#764ba2",
    calculationFn: "calculateTotalLoans",
    enabled: true,
    order: 2,
  },
  {
    id: "stat-available-books",
    type: "available-books",
    label: "Müsait Kitaplar",
    description: "Ödünç verilebilir kitap sayısı",
    locations: ["header", "homepage"],
    icon: "check-circle",
    color: "#10b981",
    calculationFn: "calculateAvailableBooks",
    enabled: true,
    order: 3,
  },
  {
    id: "stat-low-stock-books",
    type: "low-stock-books",
    label: "Azalan Adet",
    description: "Adet seviyesi düşük kitaplar (≤2)",
    locations: ["header", "homepage", "reports"],
    icon: "alert-triangle",
    color: "#f59e0b",
    calculationFn: "calculateLowStockBooks",
    enabled: true,
    order: 4,
  },
  {
    id: "stat-late-loans",
    type: "late-loans",
    label: "Geciken Ödünçler",
    description: "Teslim tarihi geçmiş ödünçler",
    locations: ["homepage", "reports"],
    icon: "clock",
    color: "#ef4444",
    calculationFn: "calculateLateLoans",
    enabled: true,
    order: 5,
  },
  {
    id: "stat-active-borrowers",
    type: "active-borrowers",
    label: "Aktif Öğrenciler",
    description: "Aktif ödünç alan öğrenci sayısı",
    locations: ["reports"],
    icon: "users",
    color: "#3b82f6",
    calculationFn: "calculateActiveBorrowers",
    enabled: true,
    order: 6,
  },
  {
    id: "stat-banned-students",
    type: "banned-students",
    label: "Cezalı Öğrenciler",
    description: "Ceza puanı limitini aşan öğrenciler",
    locations: ["homepage", "reports"],
    icon: "ban",
    color: "#dc2626",
    calculationFn: "calculateBannedStudents",
    enabled: true,
    order: 7,
  },
  {
    id: "stat-due-soon-0-3",
    type: "due-soon-0-3",
    label: "0-3 Gün İçinde",
    description: "0-3 gün içinde teslim edilecek ödünçler",
    locations: ["homepage", "reports"],
    icon: "calendar",
    color: "#ef4444",
    calculationFn: "calculateDueSoon0_3",
    enabled: true,
    order: 8,
  },
  {
    id: "stat-due-soon-4-7",
    type: "due-soon-4-7",
    label: "4-7 Gün İçinde",
    description: "4-7 gün içinde teslim edilecek ödünçler",
    locations: ["homepage", "reports"],
    icon: "calendar",
    color: "#f59e0b",
    calculationFn: "calculateDueSoon4_7",
    enabled: true,
    order: 9,
  },
  {
    id: "stat-due-soon-8-14",
    type: "due-soon-8-14",
    label: "8-14 Gün İçinde",
    description: "8-14 gün içinde teslim edilecek ödünçler",
    locations: ["homepage", "reports"],
    icon: "calendar",
    color: "#3b82f6",
    calculationFn: "calculateDueSoon8_14",
    enabled: true,
    order: 10,
  },
  {
    id: "stat-due-soon-15plus",
    type: "due-soon-15plus",
    label: "15+ Gün İçinde",
    description: "15+ gün içinde teslim edilecek ödünçler",
    locations: ["homepage", "reports"],
    icon: "calendar",
    color: "#10b981",
    calculationFn: "calculateDueSoon15plus",
    enabled: true,
    order: 11,
  },
  {
    id: "stat-total-borrowed",
    type: "total-borrowed",
    label: "Toplam Ödünç",
    description: "Tüm zamanların toplam ödünç sayısı",
    locations: ["reports"],
    icon: "trending-up",
    color: "#8b5cf6",
    calculationFn: "calculateTotalBorrowed",
    enabled: true,
    order: 12,
  },
  {
    id: "stat-total-returned",
    type: "total-returned",
    label: "İade",
    description: "Tüm zamanların İade sayısı",
    locations: ["reports"],
    icon: "trending-down",
    color: "#06b6d4",
    calculationFn: "calculateTotalReturned",
    enabled: true,
    order: 13,
  },
  {
    id: "stat-stock-out",
    type: "stock-out",
    label: "Tükenen Adet",
    description: "Mevcut olmayan kitaplar",
    locations: ["homepage", "reports"],
    icon: "x-circle",
    color: "#dc2626",
    calculationFn: "calculateStockOut",
    enabled: true,
    order: 14,
  },
  {
    id: "stat-healthy-ratio",
    type: "healthy-book-ratio",
    label: "Sağlam Kitap Oranı",
    description: "Sağlam durumda olan kitapların oranı",
    locations: ["homepage", "reports"],
    icon: "check-circle",
    color: "#10b981",
    calculationFn: "calculateHealthyRatio",
    enabled: true,
    order: 15,
  },
  {
    id: "stat-active-ratio",
    type: "active-book-ratio",
    label: "Aktif Kitap Oranı",
    description: "Mevcut (quantity > 0) kitap oranı",
    locations: ["homepage", "reports"],
    icon: "activity",
    color: "#3b82f6",
    calculationFn: "calculateActiveBookRatio",
    enabled: true,
    order: 16,
  },
  {
    id: "stat-borrowed-ratio",
    type: "borrowed-ratio",
    label: "Ödünçte Kitap Oranı",
    description: "Ödünçte olan kitapların oranı",
    locations: ["homepage", "reports"],
    icon: "book-open",
    color: "#f59e0b",
    calculationFn: "calculateBorrowedRatio",
    enabled: true,
    order: 17,
  },
  {
    id: "stat-avg-reading",
    type: "avg-reading-duration",
    label: "Ort. Okunma Süresi",
    description: "Ortalama kitap okunma süresi (gün)",
    locations: ["reports"],
    icon: "clock",
    color: "#8b5cf6",
    calculationFn: "calculateAvgReadingDuration",
    enabled: true,
    order: 18,
  },
  {
    id: "stat-avg-return",
    type: "avg-return-duration",
    label: "Ort. İade Süresi",
    description: "Ortalama kitap iade süresi (gün)",
    locations: ["reports"],
    icon: "calendar",
    color: "#06b6d4",
    calculationFn: "calculateAvgReturnDuration",
    enabled: true,
    order: 19,
  },
];

// İstatistik hesaplama fonksiyonları
export interface StatCalculationContext {
  books: any[];
  loans: any[];
  bookStats: any[];
  studentStats: any[];
  maxPenaltyPoints?: number; // Sistem ayarlarından gelen ceza puanı sınırı
}

export const calculateStat = (
  statType: StatType,
  context: StatCalculationContext
): number => {
  const { books, loans, bookStats, studentStats, maxPenaltyPoints = 100 } = context;

  switch (statType) {
    case "total-books":
      return books.length;
    case "total-loans":
      return loans.filter((l: any) => l.remainingDays > 0).length;
    case "available-books":
      // DÜZELTME: Toplam mevcut adet (quantity toplamı), kitap çeşidi değil
      return books.reduce((sum: number, b: any) => sum + (b.quantity || 0), 0);
    case "low-stock-books":
      return books.filter((b: any) => b.quantity > 0 && b.quantity <= 2).length;
    case "late-loans":
      // Gecikenler: Teslim tarihi bugünden önceki günlerde olanlar (remainingDays < 0)
      return loans.filter((l: any) => {
        if (l.remainingDays !== null && l.remainingDays < 0) {
          return true;
        }
        // Alternatif kontrol: Teslim tarihi bugünden önceyse gecikmiş sayılır
        const dueDate = new Date(l.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return dueDate.getTime() < today.getTime();
      }).length;
    case "active-borrowers":
      return new Set(loans.filter((l: any) => l.remainingDays > 0).map((l: any) => l.borrower)).size;
    case "banned-students":
      return studentStats.filter((s: any) => (s.penaltyPoints || 0) >= maxPenaltyPoints).length;
    case "due-soon-0-3":
      return loans.filter((l: any) => l.remainingDays > 0 && l.remainingDays <= 3).length;
    case "due-soon-4-7":
      return loans.filter((l: any) => l.remainingDays > 3 && l.remainingDays <= 7).length;
    case "due-soon-8-14":
      return loans.filter((l: any) => l.remainingDays > 7 && l.remainingDays <= 14).length;
    case "due-soon-15plus":
      return loans.filter((l: any) => l.remainingDays > 14).length;
    case "total-borrowed":
      return loans.length;
    case "total-returned":
      return bookStats.reduce((sum: number, b: any) => sum + (b.returned || 0), 0);
    case "stock-out":
      return books.filter((b: any) => b.quantity === 0).length;

    // Yeni istatistikler
    case "healthy-book-ratio":
      const totalQty = books.reduce((sum: number, b: any) => sum + (b.totalQuantity || 0), 0);
      const healthyQty = books.reduce((sum: number, b: any) => sum + (b.healthyCount || 0), 0);
      return totalQty > 0 ? Math.round((healthyQty / totalQty) * 100) : 0;

    case "active-book-ratio":
      const activeCount = books.filter((b: any) => (b.quantity || 0) > 0).length;
      return books.length > 0 ? Math.round((activeCount / books.length) * 100) : 0;

    case "borrowed-ratio":
      const totalAvailable = books.reduce((sum: number, b: any) => sum + (b.totalQuantity || 0), 0);
      const activeLoansCount = loans.filter((l: any) => l.remainingDays > 0).length;
      return totalAvailable > 0 ? Math.round((activeLoansCount / totalAvailable) * 100) : 0;

    case "avg-reading-duration":
      // Placeholder - gelecekte loan history API'sinden hesaplanacak
      // Şimdilik aktif ödünçlerin ortalama yaşını göster
      const activeLoanDurations = loans.filter((l: any) => l.remainingDays >= 0 && l.borrowedAt).map((loan: any) => {
        const borrowedDate = new Date(loan.borrowedAt);
        const now = new Date();
        return Math.floor((now.getTime() - borrowedDate.getTime()) / (1000 * 60 * 60 * 24));
      });
      return activeLoanDurations.length > 0
        ? Math.round(activeLoanDurations.reduce((sum: number, d: number) => sum + d, 0) / activeLoanDurations.length)
        : 0;

    case "avg-return-duration":
      // Placeholder - gelecekte loan history API'sinden hesaplanacak
      return 0;

    default:
      return 0;
  }
};

// localStorage'dan istatistikleri yükle
export const loadStatsFromStorage = (): StatDefinition[] => {
  const saved = localStorage.getItem("statistics-config");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return defaultStats;
    }
  }
  return defaultStats;
};

// İstatistikleri localStorage'a kaydet
export const saveStatsToStorage = (stats: StatDefinition[]) => {
  localStorage.setItem("statistics-config", JSON.stringify(stats));
};




