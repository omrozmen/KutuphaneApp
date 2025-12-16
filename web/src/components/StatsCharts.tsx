import { useEffect, useRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Book, BookStat, LoanInfo, StudentStat } from "../api/types";
import { httpClient } from "../api/client";
import LoanOverview from "./LoanOverview";
import BookList from "./BookList";
import StudentList from "./StudentList";
import { searchIncludes } from "../utils/searchUtils";

// Kart görünürlüğü için localStorage key
const REPORTS_VISIBLE_CARDS_KEY = "reports-visible-cards";

type Props = {
  books: Book[];
  bookStats: BookStat[];
  students: StudentStat[];
  loans: LoanInfo[];
  personelName: string;
};

// Pie Chart Component
const PieChart = ({ data, title, colors, onSliceClick }: { data: Array<{ label: string; value: number }>; title: string; colors: string[]; onSliceClick?: (label: string) => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 20;

    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return;

    let currentAngle = -Math.PI / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw pie slices
    data.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = colors[index % colors.length];
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label lines and text removed for closed cards

      currentAngle += sliceAngle;
    });
  }, [data, colors]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSliceClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 2 - 20;

    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > radius) return;

    const angle = Math.atan2(dy, dx);
    let normalizedAngle = angle + Math.PI / 2;
    if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;

    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) return;

    let currentAngle = 0;
    for (const item of data) {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      if (normalizedAngle >= currentAngle && normalizedAngle < currentAngle + sliceAngle) {
        onSliceClick(item.label);
        return;
      }
      currentAngle += sliceAngle;
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h4 style={{ marginBottom: "16px", color: "#1f2937" }}>{title}</h4>
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        style={{ maxWidth: "100%", height: "auto", cursor: onSliceClick ? "pointer" : "default" }}
        onClick={handleClick}
      />
    </div>
  );
};

// Bar Chart Component
const BarChart = ({ data, title, color, maxValue, onBarClick, colors }: { data: Array<{ label: string; value: number }>; title: string; color: string; maxValue: number; onBarClick?: (label: string) => void; colors?: string[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const barWidth = chartWidth / data.length - 10;
    const maxBarHeight = chartHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    // Draw bars
    data.forEach((item, index) => {
      const barHeight = maxValue > 0 ? (item.value / maxValue) * maxBarHeight : 0;
      const x = padding + index * (chartWidth / data.length);
      const y = height - padding - barHeight;

      // Bar - farklı renkler kullan
      ctx.fillStyle = colors && colors[index] ? colors[index] : color;
      ctx.fillRect(x, y, barWidth, barHeight);

      // Value labels and axis labels removed for closed cards
    });

    // Y-axis
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Y-axis labels removed for closed cards
  }, [data, color, maxValue, colors]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onBarClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const barWidth = chartWidth / data.length - 10;

    if (x < padding || x > width - padding || y < padding || y > height - padding) return;

    const barIndex = Math.floor((x - padding) / (chartWidth / data.length));
    if (barIndex >= 0 && barIndex < data.length) {
      onBarClick(data[barIndex].label);
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h4 style={{ marginBottom: "16px", color: "#1f2937" }}>{title}</h4>
      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        style={{ maxWidth: "100%", height: "auto", cursor: onBarClick ? "pointer" : "default" }}
        onClick={handleClick}
      />
    </div>
  );
};



// Multi Line Chart Component (for multiple categories - shows all categories as one line)
const MultiLineChart = ({ data, title, colors }: { data: Array<{ label: string; value: number }>; title: string; colors: string[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxValue = Math.max(...data.map(d => d.value), 1);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding + (chartHeight / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw line connecting all categories
    ctx.strokeStyle = colors[0] || "#3b82f6";
    ctx.lineWidth = 3;
    ctx.beginPath();

    data.forEach((item, index) => {
      const x = padding + (chartWidth / (data.length - 1 || 1)) * index;
      const y = height - padding - (item.value / maxValue) * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw points for each category
    data.forEach((item, index) => {
      const x = padding + (chartWidth / (data.length - 1 || 1)) * index;
      const y = height - padding - (item.value / maxValue) * chartHeight;

      ctx.fillStyle = colors[index % colors.length] || "#3b82f6";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Axes
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
  }, [data, colors]);

  return (
    <div style={{ textAlign: "center" }}>
      <h4 style={{ marginBottom: "16px", color: "#1f2937" }}>{title}</h4>
      <canvas ref={canvasRef} width={600} height={300} style={{ maxWidth: "100%", height: "auto" }} />
    </div>
  );
};

// Line Chart Component
const LineChart = ({ data, title, color }: { data: Array<{ label: string; value: number }>; title: string; color: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxValue = Math.max(...data.map(d => d.value), 1);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    const gridSteps = 5;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding + (chartHeight / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw line
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    data.forEach((item, index) => {
      const x = padding + (chartWidth / (data.length - 1 || 1)) * index;
      const y = height - padding - (item.value / maxValue) * chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw points
    data.forEach((item, index) => {
      const x = padding + (chartWidth / (data.length - 1 || 1)) * index;
      const y = height - padding - (item.value / maxValue) * chartHeight;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();

      // Value labels removed for closed cards
    });

    // Axes
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Labels removed for closed cards
  }, [data, color]);

  return (
    <div style={{ textAlign: "center" }}>
      <h4 style={{ marginBottom: "16px", color: "#1f2937" }}>{title}</h4>
      <canvas ref={canvasRef} width={600} height={300} style={{ maxWidth: "100%", height: "auto" }} />
    </div>
  );
};

const StatsCharts = ({ books, bookStats, students, loans, personelName }: Props) => {
  const [detailModal, setDetailModal] = useState<{
    type: "active-loans" | "total-borrowed" | "total-returned" | "late-books" | "total-books" | "total-students" | "category" | "loan-status" | "class-stats" | "top-books" | "top-students" | "category-comparison" | "category-trend" | "borrow-return-comparison" | "late-borrowers" | "stock-low" | "stock-out" | "stock-status" | "active-borrowers" | "banned-students" | "due-soon-0-3" | "due-soon-4-7" | "due-soon-8-14" | "due-soon-15plus" | "book-ratios" | "healthy-books" | "damaged-books" | "lost-books" | "popular-books" | "long-books" | "short-books" | "page-stats" | "least-read-books" | "avg-duration-by-category" | "late-rate-by-category" | "least-read-categories";
    category?: string;
    statusType?: string;
    classValue?: string;
  } | null>(null);

  const [maxPenaltyPoints, setMaxPenaltyPoints] = useState(100);

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

  // Modal içi filtreleme state'leri
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const [modalCategoryFilter, setModalCategoryFilter] = useState("");
  const [modalAuthorFilter, setModalAuthorFilter] = useState("");
  const [modalSortOption, setModalSortOption] = useState("none");
  const [modalClassFilter, setModalClassFilter] = useState("");

  // Kart düzenleme state'leri
  const [showCardSettings, setShowCardSettings] = useState(false);

  // Grafik kartı tıklama için filtreleme state
  const [chartFilter, setChartFilter] = useState<{
    chartId: string;
    filterType: string;
    filterValue: any;
  } | null>(null);

  // Kart görünürlüğü için localStorage
  const getVisibleCards = () => {
    const saved = localStorage.getItem(REPORTS_VISIBLE_CARDS_KEY);
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
      "late-borrowers": true,
      "total-borrowed": true,
      "total-returned": true,
      "total-books": true,
      "total-book-quantity": true,
      "total-students": true,
      "stock-low": true,
      "stock-out": true,
      "active-borrowers": true,
      "banned-students": true,
      "due-soon-0-3": true,
      "due-soon-4-7": true,
      "due-soon-8-14": true,
      "due-soon-15plus": true,
    };
  });

  // Grafik görünürlüğü state
  const [visibleCharts, setVisibleCharts] = useState<Record<string, boolean>>({
    "class-book-ratio": true,
    "book-ratios": true,
    "avg-duration": true,
    "late-rate": true,
    "category-trend": true,
    "due-soon-timeline": true,
    "stock-distribution": true,
    "book-status": true,
  });

  const [showChartSettings, setShowChartSettings] = useState(false);

  const saveVisibleCards = (cards: Record<string, boolean>) => {
    localStorage.setItem(REPORTS_VISIBLE_CARDS_KEY, JSON.stringify(cards));
    setVisibleCards(cards);
  };

  const toggleCardVisibility = (cardId: string) => {
    const newVisibleCards = { ...visibleCards, [cardId]: !visibleCards[cardId] };
    saveVisibleCards(newVisibleCards);
  };

  // Modal açıldığında varsayılan sıralamayı ayarla
  useEffect(() => {
    if (detailModal?.type === "top-students" || detailModal?.type === "top-books") {
      setModalSortOption("borrowed-desc");
    } else if (detailModal?.type) {
      setModalSortOption("none");
    }
  }, [detailModal?.type]);

  // En çok ödünç alınan kitaplar (top 5 for closed card)
  const topBooks = useMemo(() => [...bookStats]
    .filter(b => b.borrowed > 0)
    .sort((a, b) => b.borrowed - a.borrowed)
    .slice(0, 5), [bookStats]);

  // En çok ödünç alan öğrenciler (top 5 for closed card)
  const topStudents = useMemo(() => [...students]
    .filter(s => s.borrowed > 0)
    .sort((a, b) => b.borrowed - a.borrowed)
    .slice(0, 5), [students]);

  // Kategori dağılımı - loans üzerinden hesapla (tutarlılık için)
  const categoryStats = useMemo(() => {
    // Önce loans üzerinden kategori bazında ödünç sayılarını hesapla
    const statsFromLoans = loans.reduce((acc, loan) => {
      const book = books.find(b => b.id === loan.bookId);
      if (book && book.category) {
        acc[book.category] = (acc[book.category] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    // bookStats'tan da kontrol et (tutarlılık için)
    const statsFromBookStats = bookStats.reduce((acc, book) => {
      if (book.category) {
        acc[book.category] = (acc[book.category] || 0) + book.borrowed;
      }
      return acc;
    }, {} as Record<string, number>);

    // Her iki kaynaktan gelen değerleri birleştir (loans öncelikli)
    const allCategories = new Set([...Object.keys(statsFromLoans), ...Object.keys(statsFromBookStats)]);
    const combinedStats: Record<string, number> = {};

    allCategories.forEach(category => {
      // loans'tan gelen değer daha güvenilir (gerçek zamanlı)
      combinedStats[category] = Math.max(
        statsFromLoans[category] || 0,
        statsFromBookStats[category] || 0
      );
    });

    return Object.entries(combinedStats)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [bookStats, loans, books]);

  // Sınıf bazında istatistikler
  const classStats = useMemo(() => {
    const stats = students.reduce((acc, student) => {
      if (student.class) {
        const key = `${student.class}. Sınıf`;
        acc[key] = (acc[key] || 0) + student.borrowed;
      }
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(stats)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [students]);

  // Tutarlı istatistikler - loans üzerinden hesapla (bookStats ile tutarlılık için)
  // DÜZELTME: Tüm tarih hesaplamaları 00:00 bazlı yapılmalı (Date.now() yerine)
  const getDaysDiff = (dueDateStr: string) => {
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Aktif Ödünç (Zamanı gelmemiş veya bugün): Gecikmemiş olanlar
  const activeLoanList = useMemo(() => loans.filter(l => getDaysDiff(l.dueDate) >= 0), [loans]);

  // Gecikenler: Teslim tarihi geçmiş (dünden önce)
  const lateLoanList = useMemo(() =>
    loans.filter(l => getDaysDiff(l.dueDate) < 0).sort((a, b) => {
      return getDaysDiff(a.dueDate) - getDaysDiff(b.dueDate); // En çok geciken en üstte
    }), [loans]);

  const bucket0_3 = useMemo(() =>
    activeLoanList.filter(l => {
      const days = l.remainingDays;
      return days >= 0 && days <= 3;
    }).sort((a, b) => a.remainingDays - b.remainingDays), [activeLoanList]);

  const bucket4_7 = useMemo(() =>
    activeLoanList.filter(l => {
      const days = l.remainingDays;
      return days > 3 && days <= 7;
    }).sort((a, b) => a.remainingDays - b.remainingDays), [activeLoanList]);

  const bucket8_14 = useMemo(() =>
    activeLoanList.filter(l => {
      const days = l.remainingDays;
      return days > 7 && days <= 14;
    }).sort((a, b) => a.remainingDays - b.remainingDays), [activeLoanList]);

  const bucket15plus = useMemo(() =>
    activeLoanList.filter(l => {
      return l.remainingDays > 14;
    }).sort((a, b) => a.remainingDays - b.remainingDays), [activeLoanList]);

  // Ödünç Listesi dağılımı - loans üzerinden hesapla (tutarlılık için)
  const loanStatusStats = useMemo(() => {
    const totalReturned = bookStats.reduce((sum, b) => sum + b.returned, 0);
    const activeLoansCount = activeLoanList.length;
    const lateLoansCount = lateLoanList.length;

    return [
      { label: "İade Edilmiş", value: totalReturned },
      { label: "Aktif Ödünç", value: activeLoansCount },
      { label: "Gecikmiş", value: lateLoansCount },
    ].filter(item => item.value > 0);
  }, [bookStats, activeLoanList, lateLoanList]);

  // Kategori bazında ödünç/iade karşılaştırması - loans ve bookStats'tan hesapla
  const categoryComparison = useMemo(() => {
    // loans üzerinden ödünç sayılarını hesapla
    const statsFromLoans = loans.reduce((acc, loan) => {
      const book = books.find(b => b.id === loan.bookId);
      if (book && book.category) {
        if (!acc[book.category]) {
          acc[book.category] = { borrowed: 0, returned: 0 };
        }
        acc[book.category].borrowed += 1;
      }
      return acc;
    }, {} as Record<string, { borrowed: number; returned: number }>);

    // bookStats'tan da al (tutarlılık için)
    const statsFromBookStats = bookStats.reduce((acc, book) => {
      if (book.category) {
        if (!acc[book.category]) {
          acc[book.category] = { borrowed: 0, returned: 0 };
        }
        acc[book.category].borrowed += book.borrowed;
        acc[book.category].returned += book.returned;
      }
      return acc;
    }, {} as Record<string, { borrowed: number; returned: number }>);

    // Her iki kaynağı birleştir (loans öncelikli)
    const allCategories = new Set([...Object.keys(statsFromLoans), ...Object.keys(statsFromBookStats)]);
    const combinedStats: Record<string, { borrowed: number; returned: number }> = {};

    allCategories.forEach(category => {
      combinedStats[category] = {
        borrowed: Math.max(statsFromLoans[category]?.borrowed || 0, statsFromBookStats[category]?.borrowed || 0),
        returned: Math.max(statsFromLoans[category]?.returned || 0, statsFromBookStats[category]?.returned || 0),
      };
    });

    return Object.entries(combinedStats)
      .map(([label, values]) => ({
        label,
        borrowed: values.borrowed,
        returned: values.returned,
      }))
      .sort((a, b) => b.borrowed - a.borrowed)
      .slice(0, 8);
  }, [bookStats, loans, books]);

  const maxCategoryValue = Math.max(...categoryStats.map(c => c.value), 1);
  const maxClassValue = Math.max(...classStats.map(c => c.value), 1);
  const maxBookValue = Math.max(...topBooks.map(b => b.borrowed), 1);

  // Veri tutarlılığı için: bookStats ve loans'u karşılaştır
  const totalBorrowedFromLoans = loans.length;
  const totalBorrowedFromStats = bookStats.reduce((sum, b) => sum + b.borrowed, 0);
  const totalReturnedFromStats = bookStats.reduce((sum, b) => sum + b.returned, 0);
  // Öğrenci kartlarından toplam iade sayısı (daha doğru)
  const totalReturnedFromStudents = students.reduce((sum, s) => sum + (s.returned || 0), 0);

  // Geciken kitaplar - hem bookStats hem de loans üzerinden kontrol
  const lateBooksFromStats = bookStats.filter((b) => b.late > 0).length;
  const lateBooksFromLoans = lateLoanList.length;
  // loans üzerinden hesaplanan değer daha güvenilir (gerçek zamanlı)
  const lateBooks = lateBooksFromLoans;

  // Tutarlı değerler kullan - loans üzerinden hesaplanan değerler daha güvenilir
  const totalBorrowed = totalBorrowedFromLoans; // loans üzerinden (tüm ödünç kayıtları)
  const totalReturned = totalReturnedFromStudents; // Öğrenci kartlarından (gerçek iade sayısı)
  const totalReturnedFromBooks = totalReturnedFromStats; // Kitap bazlı iade sayısı (modal için)
  const activeLoans = activeLoanList.length; // loans üzerinden (kalan günü > 0 olanlar)

  // Veri tutarlılık kontrolü (console'da uyarı için - production'da kaldırılabilir)
  if (import.meta.env.DEV) {
    const activeLoansFromStats = totalBorrowedFromStats - totalReturnedFromStats;
    if (Math.abs(activeLoans - activeLoansFromStats) > 5) {
      console.warn('Veri tutarsızlığı tespit edildi:', {
        activeLoansFromLoans: activeLoans,
        activeLoansFromStats,
        difference: Math.abs(activeLoans - activeLoansFromStats)
      });
    }
  }

  // Diğer istatistikler
  const lateBorrowersCount = new Set(lateLoanList.map(l => l.borrower)).size;
  const lowStockBooks = books.filter(b => b.quantity > 0 && b.quantity <= 2);
  const outStockBooks = books.filter(b => b.quantity === 0);
  const activeBorrowersCount = new Set(activeLoanList.map(l => l.borrower)).size;
  const bannedStudents = students.filter(s => (s.penaltyPoints || 0) >= maxPenaltyPoints);

  // Çeşitli renk paleti
  const pieColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#14b8a6", "#a855f7", "#e11d48"];
  const chartColors = {
    primary: "#3b82f6",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
    purple: "#8b5cf6",
    pink: "#ec4899",
    cyan: "#06b6d4",
    green: "#84cc16",
    orange: "#f97316",
    teal: "#14b8a6",
    violet: "#a855f7",
    rose: "#e11d48",
  };

  // Kart tanımları
  const cardDefinitions = [
    { id: "active-loans", label: "Aktif Ödünç", value: activeLoans, color: chartColors.primary, modal: "active-loans" as const },
    { id: "late-loans", label: "Geciken Kitap", value: lateBooks, color: "#374151", modal: "late-books" as const },
    { id: "late-borrowers", label: "Geciken Öğrenci", value: lateBorrowersCount, color: "#111827", modal: "late-borrowers" as const },
    { id: "total-borrowed", label: "Toplam Ödünç", value: totalBorrowed, color: chartColors.success, modal: "total-borrowed" as const },
    { id: "total-returned", label: "İade", value: totalReturned, color: chartColors.success, modal: "total-returned" as const },
    { id: "total-books", label: "Kitap Çeşidi", value: books.length, color: chartColors.purple, modal: "total-books" as const },
    { id: "total-book-quantity", label: "Toplam Kitap Adeti", value: books.reduce((sum, b) => sum + (b.totalQuantity || 0), 0), color: chartColors.purple, modal: "total-books" as const },
    { id: "available-books", label: "Müsait Kitap", value: books.reduce((sum, b) => sum + (b.quantity || 0), 0), color: chartColors.cyan, modal: "total-books" as const },
    { id: "total-students", label: "Toplam Öğrenci", value: students.length, color: chartColors.cyan, modal: "total-students" as const },
    { id: "stock-low", label: "Azalan Adet (≤2)", value: lowStockBooks.length, color: chartColors.warning, modal: "stock-low" as const },
    { id: "stock-out", label: "Tükenen Adet", value: outStockBooks.length, color: chartColors.danger, modal: "stock-out" as const },
    { id: "active-borrowers", label: "Aktif Öğrenci", value: activeBorrowersCount, color: "#2563eb", modal: "active-loans" as const },
    { id: "banned-students", label: "Cezalı Öğrenciler", value: bannedStudents.length, color: "#dc2626", modal: "banned-students" as const },
    { id: "due-soon-0-3", label: "0-3 Gün Kalan", value: bucket0_3.length, color: chartColors.danger, modal: "due-soon-0-3" as const },
    { id: "due-soon-4-7", label: "4-7 Gün Kalan", value: bucket4_7.length, color: chartColors.warning, modal: "due-soon-4-7" as const },
    { id: "due-soon-8-14", label: "8-14 Gün Kalan", value: bucket8_14.length, color: chartColors.primary, modal: "due-soon-8-14" as const },
    { id: "due-soon-15plus", label: "15+ Gün Kalan", value: bucket15plus.length, color: chartColors.success, modal: "due-soon-15plus" as const },
  ];

  // Yeni istatistik hesaplamaları
  const totalBooksQty = books.reduce((sum, b) => sum + (b.totalQuantity || 0), 0);
  const healthyBooksQty = books.reduce((sum, b) => sum + (b.healthyCount || 0), 0);
  const healthyRatio = totalBooksQty > 0 ? ((healthyBooksQty / totalBooksQty) * 100).toFixed(1) : "0";



  // Ortalama süreler için hesaplama
  const avgReadingDurationValue = useMemo(() => {
    // LoanInfo doesn't have borrowedAt, so use a simple placeholder calculation
    // In the future, this should fetch from loan history API
    return 0; // Placeholder - will be calculated from loan history in future
  }, [activeLoanList]);

  // Sınıf Bazlı Öğrenci Aktivitesi - Yeni Grafik için
  const studentActivityByClass = useMemo(() => {
    const classData: Record<string, { students: number; activeStudents: number; totalBorrowed: number }> = {};

    students.forEach(student => {
      if (student.class) {
        const key = `${student.class}. Sınıf`;
        if (!classData[key]) {
          classData[key] = { students: 0, activeStudents: 0, totalBorrowed: 0 };
        }
        classData[key].students += 1;
        classData[key].totalBorrowed += student.borrowed || 0;

        // Aktif öğrenci: Şu anda kitap ödünç almış
        const activeLoans = (student.borrowed || 0) - (student.returned || 0);
        if (activeLoans > 0) {
          classData[key].activeStudents += 1;
        }
      }
    });

    return Object.entries(classData)
      .map(([label, data]) => ({
        label,
        value: data.activeStudents, // Primary metric: Active students
        totalStudents: data.students,
        booksPerStudent: data.students > 0 ? (data.totalBorrowed / data.students).toFixed(1) : "0",
        totalBorrowed: data.totalBorrowed
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [students]);

  // Öğrenci Aktivite ve İade Oranları
  const studentActivityReturnRate = useMemo(() => {
    const activeCount = students.filter(s => (s.borrowed || 0) - (s.returned || 0) > 0).length;
    const totalStudents = students.length;
    const totalBorrowed = students.reduce((sum, s) => sum + (s.borrowed || 0), 0);
    const totalReturned = students.reduce((sum, s) => sum + (s.returned || 0), 0);

    return {
      activeStudents: activeCount,
      inactiveStudents: totalStudents - activeCount,
      totalStudents,
      activityRate: totalStudents > 0 ? ((activeCount / totalStudents) * 100).toFixed(1) : "0",
      returnRate: totalBorrowed > 0 ? ((totalReturned / totalBorrowed) * 100).toFixed(1) : "0",
      totalBorrowed,
      totalReturned
    };
  }, [students]);

  // Kategori Bazlı Okuma Sıklığı (Okuma süresi proxy'si olarak)
  const categoryReadingFrequency = useMemo(() => {
    const catData: Record<string, { borrowed: number; uniqueStudents: Set<string> }> = {};

    loans.forEach(loan => {
      const book = books.find(b => b.id === loan.bookId);
      if (book && book.category) {
        if (!catData[book.category]) {
          catData[book.category] = { borrowed: 0, uniqueStudents: new Set() };
        }
        catData[book.category].borrowed += 1;
        catData[book.category].uniqueStudents.add(loan.borrower);
      }
    });

    const totalBorrowed = loans.length;
    return Object.entries(catData)
      .map(([label, data]) => ({
        label,
        value: data.borrowed, // Total borrows for this category
        uniqueStudents: data.uniqueStudents.size,
        percentage: totalBorrowed > 0 ? ((data.borrowed / totalBorrowed) * 100).toFixed(1) : "0"
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8); // Top 8 categories
  }, [loans, books]);

  // En Az Okunan Kategoriler (Yüzde olarak)
  const leastReadCategories = useMemo(() => {
    const catData: Record<string, number> = {};

    loans.forEach(loan => {
      const book = books.find(b => b.id === loan.bookId);
      if (book && book.category) {
        catData[book.category] = (catData[book.category] || 0) + 1;
      }
    });

    const totalLoans = loans.length;
    return Object.entries(catData)
      .map(([label, value]) => ({
        label,
        value,
        percentage: totalLoans > 0 ? ((value / totalLoans) * 100).toFixed(1) : "0"
      }))
      .sort((a, b) => a.value - b.value) // En az okunan önce
      .slice(0, 10);
  }, [loans, books]);

  // Sınıf-Kategori Matrisi: Hangi sınıf hangi kategoriyi okuyor (yüzdesel)
  const classCategoryMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};

    // Her öğrencinin okumalarını sınıf ve kategoriye göre topla
    students.forEach(student => {
      if (!student.class) return;

      const classKey = `${student.class}. Sınıf`;
      if (!matrix[classKey]) {
        matrix[classKey] = {};
      }

      // Bu öğrencinin ödünçlerini bul
      loans.forEach(loan => {
        if (loan.borrower === student.name) {
          const book = books.find(b => b.id === loan.bookId);
          if (book && book.category) {
            matrix[classKey][book.category] = (matrix[classKey][book.category] || 0) + 1;
          }
        }
      });
    });

    // Her sınıf için kategori dağılımını yüzdeye çevir
    return Object.entries(matrix).map(([className, categories]) => {
      const total = Object.values(categories).reduce((sum, count) => sum + count, 0);
      const categoryPercentages = Object.entries(categories).map(([category, count]) => ({
        category,
        percentage: total > 0 ? ((count / total) * 100).toFixed(1) : "0",
        count
      })).sort((a, b) => Number(b.percentage) - Number(a.percentage));

      return {
        className,
        categories: categoryPercentages,
        total
      };
    }).filter(item => item.total > 0);
  }, [students, loans, books]);


  // Kategori Bazlı Ortalama Süre (Aktif Ödünçler Üzerinden Tahmini)
  const avgDurationByCategory = useMemo(() => {
    const catData: Record<string, { totalDays: number; count: number }> = {};
    const DEFAULT_LOAN_DAYS = 15;

    activeLoanList.forEach(loan => {
      const book = books.find(b => b.id === loan.bookId);
      if (book && book.category) {
        if (!catData[book.category]) catData[book.category] = { totalDays: 0, count: 0 };

        const daysRemaining = getDaysDiff(loan.dueDate);
        // Tahmini geçen süre: 15 - kalan gün. (Eksi ise 15 + gecikme)
        const daysOut = DEFAULT_LOAN_DAYS - daysRemaining;
        // En az 1 gün diyelim
        const effectiveDays = Math.max(1, daysOut);

        catData[book.category].totalDays += effectiveDays;
        catData[book.category].count += 1;
      }
    });

    return Object.entries(catData).map(([label, data]) => ({
      label,
      value: data.count > 0 ? parseFloat((data.totalDays / data.count).toFixed(1)) : 0
    })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [activeLoanList, books]);

  // Kategori Bazlı Gecikme Oranı (Geçmiş Veriler: BookStat)
  const lateRateByCategory = useMemo(() => {
    const catData: Record<string, { late: number; total: number }> = {};

    bookStats.forEach(stat => {
      if (stat.category) {
        if (!catData[stat.category]) catData[stat.category] = { late: 0, total: 0 };
        catData[stat.category].late += stat.late;
        catData[stat.category].total += stat.borrowed;
      }
    });

    return Object.entries(catData).map(([label, data]) => ({
      label,
      value: data.total > 0 ? parseFloat(((data.late / data.total) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [bookStats]);

  // Yeni istatistik kartları için değerler

  // ========== DOLAŞIM BAZLI ORANLAR (Birbirini Tamamlar) ==========
  const totalCirculation = totalBorrowed + totalReturned; // Toplam dolaşım (Aktif + İade)

  // Aktif Ödünç Oranı (Dolaşımdaki aktif olanların oranı - Gecikenler dahil)
  const activeCirculationRatio = totalCirculation > 0
    ? ((totalBorrowed / totalCirculation) * 100).toFixed(1)
    : "0";

  // İade Oranı (Dolaşımdaki iade edilenlerin oranı)
  const returnCirculationRatio = totalCirculation > 0
    ? ((totalReturned / totalCirculation) * 100).toFixed(1)
    : "0";

  // Tamamlanma Oranı (İade / Toplam İşlem) - İade Oranı ile aynı
  const completionRate = returnCirculationRatio;

  // ========== STOK BAZLI ORANLAR (Birbirini Tamamlar) ==========
  const availableBooks = books.reduce((sum, b) => sum + (b.quantity || 0), 0);

  // Rafta Kitap Oranı (Şu an rafta olanlar)
  const availableRatio = totalBooksQty > 0
    ? ((availableBooks / totalBooksQty) * 100).toFixed(1)
    : "0";

  // Ödünçte Kitap Oranı (Şu an ödünçte olanlar - Gecikenler dahil) - STOK BAZLI
  const borrowedStockRatio = totalBooksQty > 0
    ? ((totalBorrowed / totalBooksQty) * 100).toFixed(1)
    : "0";

  // ========== ÖĞRENCİ BAZLI İSTATİSTİKLER ==========

  // Tüm aktif ödünç alanlar (Gecikenler dahil)
  const allActiveBorrowersCount = new Set(loans.map(l => l.borrower)).size;

  // Aktif Öğrenci Oranı (Kitabı olan öğrenciler)
  const activeStudentRatio = students.length > 0
    ? ((allActiveBorrowersCount / students.length) * 100).toFixed(1)
    : "0";

  // Geciken Öğrenci Oranı
  const lateStudentRatio = students.length > 0
    ? ((lateBorrowersCount / students.length) * 100).toFixed(1)
    : "0";

  // Zamanında İade Oranı (Geçmiş iadeler üzerinden)
  // StudentStat.late -> Toplam gecikme sayısı olarak varsayılıyor
  // StudentStat.returned -> Toplam iade sayısı
  const totalLateReturns = students.reduce((sum, s) => sum + (s.late || 0), 0);
  const onTimeReturnRatio = totalReturned > 0
    ? (((totalReturned - totalLateReturns) / totalReturned) * 100).toFixed(1)
    : "0";

  // ========== KİTAP BAZLI İSTATİSTİKLER ==========

  // Popüler Kitap Oranı (5+ kez ödünç alınmış)
  const popularBooks = bookStats.filter(b => b.borrowed >= 5).length;
  const popularBookRatio = books.length > 0
    ? ((popularBooks / books.length) * 100).toFixed(1)
    : "0";

  // Gecikme Oranı (Mevcut ödünçler içinde gecikenler)
  const lateLoanRatio = loans.length > 0
    ? ((lateLoanList.length / loans.length) * 100).toFixed(1)
    : "0";

  // Hasarlı Kitap Oranı
  const damagedBooksQty = books.reduce((sum, b) => sum + (b.damagedCount || 0), 0);
  const damagedBookRatio = totalBooksQty > 0
    ? ((damagedBooksQty / totalBooksQty) * 100).toFixed(1)
    : "0";

  // Kayıp Kitap Oranı
  const lostBooksQty = books.reduce((sum, b) => sum + (b.lostCount || 0), 0);
  const lostBookRatio = totalBooksQty > 0
    ? ((lostBooksQty / totalBooksQty) * 100).toFixed(1)
    : "0";

  // ========== SAYFA SAYISI İSTATİSTİKLERİ ==========

  // Ortalama Sayfa Sayısı
  const booksWithPages = books.filter(b => b.pageCount && b.pageCount > 0);
  const avgPageCount = booksWithPages.length > 0
    ? Math.round(booksWithPages.reduce((sum, b) => sum + (b.pageCount || 0), 0) / booksWithPages.length)
    : 0;

  // 200+ Sayfa Kitap Oranı
  const longBooks = books.filter(b => (b.pageCount || 0) >= 200).length;
  const longBookRatio = books.length > 0
    ? ((longBooks / books.length) * 100).toFixed(1)
    : "0";

  // 100'den az Sayfa Kitap Oranı
  const shortBooks = books.filter(b => (b.pageCount || 0) > 0 && (b.pageCount || 0) < 100).length;
  const shortBookRatio = books.length > 0
    ? ((shortBooks / books.length) * 100).toFixed(1)
    : "0";

  // ========== GÖRÜNÜM DÜZELTMELERİ ==========

  // En Çok Okunan Kategori - BÜYÜK yüzde, küçük kategori
  const topCategoryPercent = totalBorrowed > 0 && categoryReadingFrequency.length > 0
    ? ((categoryReadingFrequency[0].value / totalBorrowed) * 100).toFixed(0)
    : "0";
  const topReadingCategory = categoryReadingFrequency.length > 0
    ? `%${topCategoryPercent}`  // Sadece yüzde, kategori ismi sublabel'da
    : "-";
  const topCategoryName = categoryReadingFrequency.length > 0
    ? categoryReadingFrequency[0].label
    : "";

  // Öğrenci Başı Ortalama Kitap
  const avgBooksPerStudent = students.length > 0 ? (totalBorrowed / students.length).toFixed(1) : "0";

  // En Aktif Sınıf - En yüksek aktif öğrenci oranına sahip sınıf
  const mostActiveClassData = studentActivityByClass.length > 0
    ? studentActivityByClass.reduce((max, curr) => {
      const currRatio = curr.totalStudents > 0 ? (curr.value / curr.totalStudents) : 0;
      const maxRatio = max.totalStudents > 0 ? (max.value / max.totalStudents) : 0;
      return currRatio > maxRatio ? curr : max;
    })
    : null;
  const mostActiveClassPercent = mostActiveClassData && mostActiveClassData.totalStudents > 0
    ? ((mostActiveClassData.value / mostActiveClassData.totalStudents) * 100).toFixed(0)
    : "0";
  const mostActiveClass = mostActiveClassData
    ? `%${mostActiveClassPercent}`  // Sadece yüzde, sınıf ismi sublabel'da
    : "-";
  const mostActiveClassName = mostActiveClassData
    ? mostActiveClassData.label
    : "";

  // En Kalabalık Sınıf - En fazla öğrenciye sahip sınıf yüzdesi
  const mostPopulatedClassData = studentActivityByClass.length > 0
    ? studentActivityByClass.reduce((max, curr) => {
      return curr.totalStudents > max.totalStudents ? curr : max;
    })
    : null;
  const mostPopulatedClassPercent = mostPopulatedClassData && students.length > 0
    ? ((mostPopulatedClassData.totalStudents / students.length) * 100).toFixed(0)
    : "0";
  const mostPopulatedClass = mostPopulatedClassData
    ? `%${mostPopulatedClassPercent}`  // Sadece yüzde
    : "-";
  const mostPopulatedClassName = mostPopulatedClassData
    ? mostPopulatedClassData.label
    : "";

  // Debug: Book count investigation
  if (import.meta.env.DEV) {
    console.log('[StatsCharts] Book count:', books.length);
    console.log('[StatsCharts] Complementary Ratios Check:');
    console.log('  Dolaşım: Aktif %' + activeCirculationRatio + ' + İade %' + returnCirculationRatio + ' = %' + (Number(activeCirculationRatio) + Number(returnCirculationRatio)).toFixed(1));
    console.log('  Stok: Rafta %' + availableRatio + ' + Ödünçte %' + borrowedStockRatio + ' = %' + (Number(availableRatio) + Number(borrowedStockRatio)).toFixed(1));
  }

  // Yeni kartları mevcut kartlara ekle
  const extendedCardDefinitions = [
    ...cardDefinitions,
    // Dolaşım Bazlı Oranlar (birbirini tamamlar)
    { id: "active-circulation-ratio", label: "Aktif Ödünç Oranı", value: `%${activeCirculationRatio}`, color: chartColors.primary, modal: "active-loans" as const },
    { id: "return-circulation-ratio", label: "İade Oranı (Dolaşım)", value: `%${returnCirculationRatio}`, color: chartColors.success, modal: "total-returned" as const },
    { id: "completion-rate", label: "Tamamlanma Oranı", value: `%${completionRate}`, color: chartColors.success, modal: "total-returned" as const },

    // Stok Bazlı Oranlar (birbirini tamamlar)
    { id: "available-ratio", label: "Rafta Kitap Oranı", value: `%${availableRatio}`, color: chartColors.cyan, modal: "total-books" as const },
    { id: "borrowed-stock-ratio", label: "Ödünçte Kitap Oranı", value: `%${borrowedStockRatio}`, color: chartColors.warning, modal: "active-loans" as const },

    // Öğrenci Bazlı İstatistikler
    { id: "active-student-ratio", label: "Aktif Öğrenci Oranı", value: `%${activeStudentRatio}`, color: chartColors.primary, modal: "active-loans" as const },
    { id: "late-student-ratio", label: "Geciken Öğrenci Oranı", value: `%${lateStudentRatio}`, color: chartColors.danger, modal: "late-borrowers" as const },
    { id: "on-time-return-ratio", label: "Zamanında İade Oranı", value: `%${onTimeReturnRatio}`, color: chartColors.success, modal: "active-loans" as const },

    // Kitap Bazlı İstatistikler
    { id: "healthy-ratio", label: "Sağlam Kitap Oranı", value: `%${healthyRatio}`, color: chartColors.success, modal: "healthy-books" as const },
    { id: "damaged-ratio", label: "Hasarlı Kitap Oranı", value: `%${damagedBookRatio}`, color: chartColors.warning, modal: "damaged-books" as const },
    { id: "lost-ratio", label: "Kayıp Kitap Oranı", value: `%${lostBookRatio}`, color: chartColors.danger, modal: "lost-books" as const },
    { id: "popular-book-ratio", label: "Popüler Kitap Oranı", value: `%${popularBookRatio}`, color: chartColors.purple, modal: "popular-books" as const },
    { id: "late-loan-ratio", label: "Gecikme Oranı", value: `%${lateLoanRatio}`, color: chartColors.danger, modal: "late-books" as const },

    // Sayı Kartları (User Request)
    { id: "healthy-count", label: "Sağlam Kitap Sayısı", value: books.reduce((sum, b) => sum + (b.healthyCount || 0), 0), color: chartColors.success, modal: "healthy-books" as const },
    { id: "damaged-count", label: "Hasarlı Kitap Sayısı", value: damagedBooksQty, color: chartColors.warning, modal: "damaged-books" as const },
    { id: "lost-count", label: "Kayıp Kitap Sayısı", value: lostBooksQty, color: chartColors.danger, modal: "lost-books" as const },
    { id: "popular-count", label: "Popüler Kitap Sayısı", value: popularBooks, color: chartColors.purple, modal: "popular-books" as const },

    // Sayfa İstatistikleri
    { id: "avg-page-count", label: "Ortalama Sayfa Sayısı", value: avgPageCount, color: chartColors.cyan, modal: "page-stats" as const },
    { id: "long-book-ratio", label: "Uzun Kitap Oranı (200+)", value: `%${longBookRatio}`, color: chartColors.purple, modal: "long-books" as const },
    { id: "short-book-ratio", label: "Kısa Kitap Oranı (<100)", value: `%${shortBookRatio}`, color: chartColors.cyan, modal: "short-books" as const },

    // Diğer İstatistikler
    { id: "avg-reading", label: "Ort. Okunma Süresi", value: `${avgReadingDurationValue} gün`, color: chartColors.purple, modal: "active-loans" as const },
    { id: "top-category", label: "En Çok Okunan Kategori", value: topReadingCategory, sublabel: topCategoryName, color: chartColors.pink, modal: "category" as const },
    { id: "least-read-books", label: "En Az Okunanlar", value: bookStats.filter(b => b.borrowed > 0 && b.borrowed <= 2).length, color: chartColors.rose, modal: "least-read-books" as const },
    { id: "books-per-student", label: "Öğrenci Başı Ort. Kitap", value: avgBooksPerStudent, color: chartColors.teal, modal: "total-students" as const },
    { id: "most-active-class", label: "En Aktif Sınıf", value: mostActiveClass, sublabel: mostActiveClassName, color: chartColors.orange, modal: "class-stats" as const },
    { id: "most-populated-class", label: "En Kalabalık Sınıf", value: mostPopulatedClass, sublabel: mostPopulatedClassName, color: chartColors.teal, modal: "class-stats" as const },
    { id: "least-read-categories", label: "En Az Okunan Kategori", value: leastReadCategories.length > 0 ? `%${leastReadCategories[0].percentage}` : "-", sublabel: leastReadCategories.length > 0 ? leastReadCategories[0].label : "", color: chartColors.rose, modal: "least-read-categories" as const },
  ];

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      {/* Kart Ayarları Butonu */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "-16px", gap: "12px" }}>
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
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: "6px",
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

        {/* Grafikleri Düzenle Butonu */}
        <button
          onClick={() => setShowChartSettings(!showChartSettings)}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            background: showChartSettings ? "linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)" : "#fff",
            color: showChartSettings ? "#92400e" : "#374151",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 600,
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {showChartSettings ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Grafikleri Kaydet
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              Grafikleri Düzenle
            </>
          )}
        </button>
      </div>

      {/* Kart Ayarları Modal */}
      {showCardSettings && (
        <div className="card" style={{ padding: "20px", background: "#f8fafc", border: "2px solid #e5e7eb" }}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#1f2937" }}>Kartları Düzenle</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            {extendedCardDefinitions.map((card) => (
              <label
                key={card.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px",
                  background: "white",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = card.color;
                  e.currentTarget.style.boxShadow = `0 2px 8px ${card.color}33`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <input
                  type="checkbox"
                  checked={visibleCards[card.id] ?? true}
                  onChange={() => toggleCardVisibility(card.id)}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <span style={{ fontWeight: 600, color: "#334155" }}>{card.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Grafik Ayarları Modal */}
      {showChartSettings && (
        <div className="card" style={{ padding: "20px", background: "#fffbeb", border: "2px solid #fbbf24" }}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#1f2937" }}>Grafikleri Düzenle</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            {[
              { id: "class-book-ratio", label: "Sınıf Bazında Kitap Oranı", color: "#10b981" },
              { id: "book-ratios", label: "Kitap ve Ödünç Oranları", color: "#8b5cf6" },
              { id: "avg-duration", label: "Ortalama Okunma Süresi", color: "#8b5cf6" },
              { id: "late-rate", label: "Kategori Gecikme Oranı", color: "#ef4444" },
              { id: "category-trend", label: "Popüler Kategori Trendi", color: "#f59e0b" },
              { id: "due-soon-timeline", label: "Teslim Tarihi Yaklaşanlar", color: "#f59e0b" },
              { id: "stock-distribution", label: "Adet Durumu Dağılımı", color: "#ef4444" },
              { id: "book-status", label: "Kitap Durumu Dağılımı", color: "#3b82f6" },
            ].map((chart) => (
              <label
                key={chart.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "2px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = chart.color;
                  e.currentTarget.style.boxShadow = `0 2px 8px ${chart.color}33`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e5e7eb";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <input
                  type="checkbox"
                  checked={visibleCharts[chart.id] ?? true}
                  onChange={() => setVisibleCharts(prev => ({ ...prev, [chart.id]: !prev[chart.id] }))}
                  style={{ width: "18px", height: "18px", cursor: "pointer" }}
                />
                <span style={{ fontWeight: 600, color: "#334155" }}>{chart.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Özet İstatistikler - Dinamik Kartlar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        {extendedCardDefinitions.filter(card => visibleCards[card.id] !== false).map((card) => (
          <div
            key={card.id}
            className="card"
            style={{
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              padding: "20px",
              border: `2px solid ${card.color}33`,
              position: "relative",
              overflow: "hidden",
            }}
            onClick={() => setDetailModal({ type: card.modal })}
            onMouseEnter={(e) => {
              const hexToRgb = (hex: string) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? {
                  r: parseInt(result[1], 16),
                  g: parseInt(result[2], 16),
                  b: parseInt(result[3], 16)
                } : { r: 59, g: 130, b: 246 };
              };
              const rgb = hexToRgb(card.color);
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = `0 12px 32px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
              e.currentTarget.style.borderColor = card.color;
              e.currentTarget.style.background = `linear-gradient(135deg, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = `${card.color}33`;
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <div style={{ fontSize: "36px", fontWeight: 700, color: card.color, marginBottom: "8px" }}>
              {card.value}
            </div>
            <div style={{ color: "#64748b", fontSize: "14px", fontWeight: 500 }}>{card.label}</div>
            {(card as any).sublabel && (
              <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 400, marginTop: "4px" }}>
                {(card as any).sublabel}
              </div>
            )}
          </div>
        ))}
      </div>



      {/* Grafikler - İlk Satır - Çizgi Grafikleri */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" }}>
        {/* Sınıflara Göre Öğrenci Başı Kitap Oranı - Percentage Based */}
        {studentActivityByClass.length > 0 && (
          <div className="card" style={{
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            borderColor: "rgba(16, 185, 129, 0.2)",
            minHeight: "400px"
          }}>
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                Sınıf Bazında Kitap Oranı
              </h3>
              <p style={{ fontSize: "12px", color: "#64748b" }}>Her sınıfın toplam içindeki kitap yüzdesi</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {studentActivityByClass
                .sort((a, b) => parseFloat(b.booksPerStudent) - parseFloat(a.booksPerStudent))
                .map((item, index) => {
                  const totalBooks = studentActivityByClass.reduce((sum, c) => sum + (parseFloat(c.booksPerStudent) * c.value), 0);
                  const classBooks = parseFloat(item.booksPerStudent) * item.value;
                  const percentage = totalBooks > 0 ? Math.round((classBooks / totalBooks) * 100) : 0;

                  // Her sınıf için farklı renk
                  const colors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#14b8a6", "#84cc16", "#f97316", "#6366f1", "#a855f7"];
                  const color = colors[index % colors.length];

                  return (
                    <div
                      key={index}
                      style={{
                        padding: "8px 12px",
                        background: "#f8fafc",
                        borderRadius: "8px",
                        borderLeft: `4px solid ${color}`,
                        transition: "all 0.2s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateX(2px)";
                        e.currentTarget.style.backgroundColor = "#f1f5f9";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateX(0)";
                        e.currentTarget.style.backgroundColor = "#f8fafc";
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{item.label}</div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color }}>{percentage}%</div>
                      </div>
                      <div style={{
                        height: "3px",
                        backgroundColor: "#e2e8f0",
                        borderRadius: "2px",
                        overflow: "hidden"
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${percentage}%`,
                          background: color,
                          borderRadius: "2px",
                          transition: "width 0.5s ease"
                        }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}


        {/* Kitap Oranları - Percentage Bars */}
        <div
          className="card"
          style={{
            cursor: "pointer",
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            borderColor: "rgba(139, 92, 246, 0.2)",
            minHeight: "400px"
          }}
          onClick={() => setDetailModal({ type: "book-ratios" })}
        >
          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
              Kitap ve Ödünç Oranları
            </h3>
            <p style={{ fontSize: "12px", color: "#64748b" }}>Kitap durumu ve ödünç yüzdeleri</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[
              { label: "Sağlam Kitap", value: Number(healthyRatio), color: "#10b981" },
              { label: "Aktif Ödünç", value: Number(activeCirculationRatio), color: "#3b82f6" },
              { label: "Ödünçte (Stok)", value: Number(borrowedStockRatio), color: "#8b5cf6" },
              { label: "Tamamlanma", value: Number(completionRate), color: "#f59e0b" }
            ].map((item, index) => (
              <div
                key={index}
                style={{
                  padding: "8px 12px",
                  background: "#f8fafc",
                  borderRadius: "8px",
                  borderLeft: `4px solid ${item.color}`,
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateX(2px)";
                  e.currentTarget.style.backgroundColor = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateX(0)";
                  e.currentTarget.style.backgroundColor = "#f8fafc";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{item.label}</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: item.color }}>{item.value}%</div>
                </div>
                <div style={{
                  height: "3px",
                  backgroundColor: "#e2e8f0",
                  borderRadius: "2px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    height: "100%",
                    width: `${item.value}%`,
                    background: item.color,
                    borderRadius: "2px",
                    transition: "width 0.5s ease"
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grafikler - İkinci Satır */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "24px" }}>
        {/* Sınıf-Kategori Okuma Matrisi - Yeni Görselleştirme */}
        {classCategoryMatrix.length > 0 && (
          <div
            className="card"
            style={{
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              borderColor: "rgba(59, 130, 246, 0.2)",
              padding: "24px"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(59, 130, 246, 0.3)";
              e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.5)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.2)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <h4 style={{ marginTop: 0, marginBottom: "20px", color: "#1f2937" }}>Sınıflara Göre Kategori Tercihleri</h4>
            <div style={{ display: "grid", gap: "16px" }}>
              {classCategoryMatrix.map((classData, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "16px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0"
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "12px", color: "#1e293b", fontSize: "15px" }}>
                    {classData.className} ({classData.total} kitap)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {classData.categories.slice(0, 3).map((cat, catIdx) => (
                      <div key={catIdx} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ minWidth: "120px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>
                          {cat.category}
                        </div>
                        <div style={{ flex: 1, height: "24px", backgroundColor: "#e2e8f0", borderRadius: "12px", overflow: "hidden", position: "relative" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${cat.percentage}%`,
                              background: `linear-gradient(90deg, ${pieColors[catIdx % pieColors.length]} 0%, ${pieColors[(catIdx + 1) % pieColors.length]} 100%)`,
                              transition: "width 0.3s ease",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              paddingRight: "8px"
                            }}
                          >
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "white" }}>%{cat.percentage}</span>
                          </div>
                        </div>
                        <div style={{ minWidth: "40px", textAlign: "right", fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                          {cat.count}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sınıf Bazında Ödünç - Bar Chart */}



      </div>

      {/* Grafikler - Üçüncü Satır */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "24px" }}>
        {/* Kategori Okuma Sıklığı - Compact */}
        {categoryReadingFrequency.length > 0 && (
          <div className="card" style={{
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            borderColor: "rgba(139, 92, 246, 0.2)",
            minHeight: "400px"
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(139, 92, 246, 0.3)";
              e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.5)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.2)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                Kategori Okuma Sıklığı
              </h3>
              <p style={{ fontSize: "12px", color: "#64748b" }}>En çok ödünç alınan top 5 kategori</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {categoryReadingFrequency.slice(0, 5).map((cat, index) => {
                const colors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
                const color = colors[index % colors.length];

                return (
                  <div
                    key={index}
                    style={{
                      padding: "10px 12px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      borderLeft: `4px solid ${color}`,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onClick={() => setDetailModal({ type: "category", category: cat.label })}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateX(2px)";
                      e.currentTarget.style.backgroundColor = "#f1f5f9";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateX(0)";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{cat.label}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                        <span style={{ fontSize: "18px", fontWeight: 700, color }}>{cat.value}</span>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>(%{cat.percentage})</span>
                      </div>
                    </div>
                    <div style={{
                      height: "4px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "2px",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${cat.percentage}%`,
                        background: color,
                        borderRadius: "2px",
                        transition: "width 0.5s ease"
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Öğrenci Aktivite ve İade Oranı - Yeni Grafik */}
        <div className="card" style={{
          transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          borderColor: "rgba(16, 185, 129, 0.2)"
        }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
            e.currentTarget.style.boxShadow = "0 12px 32px rgba(16, 185, 129, 0.3)";
            e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.5)";
            e.currentTarget.style.background = "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
            e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.2)";
            e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
          }}
        >
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
              Öğrenci Aktivite & İade Oranları
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b" }}>Öğrenci aktivitesi ve iade durumu göstergeleri</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            {/* Aktivite Oranı */}
            <div style={{
              padding: "20px",
              background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
              borderRadius: "12px",
              border: "2px solid #3b82f6",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e40af", marginBottom: "12px" }}>
                A Aktivite Oranı
              </div>
              <div style={{ fontSize: "48px", fontWeight: 700, color: "#3b82f6", marginBottom: "4px" }}>
                %{studentActivityReturnRate.activityRate}
              </div>
              <div style={{ fontSize: "12px", color: "#1e40af" }}>
                {studentActivityReturnRate.activeStudents}/{studentActivityReturnRate.totalStudents} aktif
              </div>
            </div>

            {/* İade Oranı */}
            <div style={{
              padding: "20px",
              background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
              borderRadius: "12px",
              border: "2px solid #10b981",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#065f46", marginBottom: "12px" }}>
                R İade Oranı
              </div>
              <div style={{ fontSize: "48px", fontWeight: 700, color: "#10b981", marginBottom: "4px" }}>
                %{studentActivityReturnRate.returnRate}
              </div>
              <div style={{ fontSize: "12px", color: "#065f46" }}>
                {studentActivityReturnRate.totalReturned}/{studentActivityReturnRate.totalBorrowed} iade
              </div>
            </div>
          </div>

          {/* Progress Bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>Aktif Öğrenciler</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#3b82f6" }}>{studentActivityReturnRate.activeStudents}</span>
              </div>
              <div style={{ position: "relative", height: "10px", backgroundColor: "#e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                <div style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: "100%",
                  width: `${studentActivityReturnRate.activityRate}%`,
                  background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)",
                  borderRadius: "5px",
                  transition: "width 0.5s ease"
                }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>İade Edilen Kitaplar</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#10b981" }}>{studentActivityReturnRate.totalReturned}</span>
              </div>
              <div style={{ position: "relative", height: "10px", backgroundColor: "#e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                <div style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: "100%",
                  width: `${studentActivityReturnRate.returnRate}%`,
                  background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                  borderRadius: "5px",
                  transition: "width 0.5s ease"
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Yeni Grafikler - Dördüncü Satır */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "24px" }}>
        {/* Teslim Tarihi Yaklaşanlar - Horizontal Timeline */}
        {bucket0_3.length > 0 || bucket4_7.length > 0 || bucket8_14.length > 0 || bucket15plus.length > 0 ? (
          <div className="card" style={{
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            borderColor: "rgba(245, 158, 11, 0.2)"
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(245, 158, 11, 0.3)";
              e.currentTarget.style.borderColor = "rgba(245, 158, 11, 0.5)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = "rgba(245, 158, 11, 0.2)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <div style={{ marginBottom: "20px" }}>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
                Teslim Tarihi Yaklaşanlar Dağılımı
              </h3>
              <p style={{ fontSize: "13px", color: "#64748b" }}>Teslim tarihine kalan gün sayısına göre ödünçler</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* 0-3 Gün */}
              <div
                style={{ cursor: "pointer", transition: "all 0.3s ease" }}
                onClick={() => setDetailModal({ type: "due-soon-0-3" })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: "#ef4444"
                    }} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>0-3 Gün (Acil)</span>
                  </div>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "#ef4444" }}>{bucket0_3.length}</span>
                </div>
                <div style={{
                  position: "relative",
                  height: "12px",
                  backgroundColor: "#fee2e2",
                  borderRadius: "6px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${bucket0_3.length > 0 ? Math.min((bucket0_3.length / Math.max(bucket0_3.length, bucket4_7.length, bucket8_14.length, bucket15plus.length, 1)) * 100, 100) : 0}%`,
                    background: "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)",
                    borderRadius: "6px",
                    transition: "width 0.5s ease"
                  }} />
                </div>
              </div>

              {/* 4-7 Gün */}
              <div
                style={{ cursor: "pointer", transition: "all 0.3s ease" }}
                onClick={() => setDetailModal({ type: "due-soon-4-7" })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: "#f59e0b"
                    }} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>4-7 Gün (Yakın)</span>
                  </div>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "#f59e0b" }}>{bucket4_7.length}</span>
                </div>
                <div style={{
                  position: "relative",
                  height: "12px",
                  backgroundColor: "#fef3c7",
                  borderRadius: "6px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${bucket4_7.length > 0 ? Math.min((bucket4_7.length / Math.max(bucket0_3.length, bucket4_7.length, bucket8_14.length, bucket15plus.length, 1)) * 100, 100) : 0}%`,
                    background: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
                    borderRadius: "6px",
                    transition: "width 0.5s ease"
                  }} />
                </div>
              </div>

              {/* 8-14 Gün */}
              <div
                style={{ cursor: "pointer", transition: "all 0.3s ease" }}
                onClick={() => setDetailModal({ type: "due-soon-8-14" })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: "#3b82f6"
                    }} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>8-14 Gün (Normal)</span>
                  </div>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "#3b82f6" }}>{bucket8_14.length}</span>
                </div>
                <div style={{
                  position: "relative",
                  height: "12px",
                  backgroundColor: "#dbeafe",
                  borderRadius: "6px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${bucket8_14.length > 0 ? Math.min((bucket8_14.length / Math.max(bucket0_3.length, bucket4_7.length, bucket8_14.length, bucket15plus.length, 1)) * 100, 100) : 0}%`,
                    background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)",
                    borderRadius: "6px",
                    transition: "width 0.5s ease"
                  }} />
                </div>
              </div>

              {/* 15+ Gün */}
              <div
                style={{ cursor: "pointer", transition: "all 0.3s ease" }}
                onClick={() => setDetailModal({ type: "due-soon-15plus" })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: "#10b981"
                    }} />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>15+ Gün (Uzak)</span>
                  </div>
                  <span style={{ fontSize: "18px", fontWeight: 700, color: "#10b981" }}>{bucket15plus.length}</span>
                </div>
                <div style={{
                  position: "relative",
                  height: "12px",
                  backgroundColor: "#d1fae5",
                  borderRadius: "6px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    height: "100%",
                    width: `${bucket15plus.length > 0 ? Math.min((bucket15plus.length / Math.max(bucket0_3.length, bucket4_7.length, bucket8_14.length, bucket15plus.length, 1)) * 100, 100) : 0}%`,
                    background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                    borderRadius: "6px",
                    transition: "width 0.5s ease"
                  }} />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Popüler Kategori Trendi - Yeni Çizgi Grafiği */}
        {visibleCharts["category-trend"] !== false && categoryReadingFrequency.length > 0 && (
          <div
            className="card"
            style={{
              cursor: "pointer",
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              borderColor: "rgba(251, 146, 60, 0.2)"
            }}
            onClick={() => setDetailModal({ type: "category-trend" })}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(251, 146, 60, 0.3)";
              e.currentTarget.style.borderColor = "rgba(251, 146, 60, 0.5)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(251, 146, 60, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = "rgba(251, 146, 60, 0.2)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <LineChart
              data={categoryReadingFrequency.slice(0, 8)}
              title="Popüler Kategori Trendi"
              color="#fb923c"
            />
            <div style={{ textAlign: "center", fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
              *En çok ödünç alınan kategorilerin trendi
            </div>
          </div>
        )}
      </div>


      {/* Yeni İstatistik Grafikleri - Kullanıcı İsteği */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "24px" }}>

        {/* Kategori Bazında Ortalama Okunma Süresi - Compact Bars */}
        {visibleCharts["avg-duration"] !== false && avgDurationByCategory.length > 0 && (
          <div
            className="card"
            style={{
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              borderColor: "rgba(139, 92, 246, 0.2)",
              minHeight: "400px"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(139, 92, 246, 0.3)";
              e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.5)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.2)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                Kategori Bazında Ort. Okunma Süresi
              </h3>
              <p style={{ fontSize: "12px", color: "#64748b" }}>Aktif ödünçlerdeki ortalama gün sayısı (Tıklayarak detay görüntüleyin)</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {avgDurationByCategory.slice(0, 10).map((cat, index) => {
                const daysNum = parseFloat(cat.value.toString());
                const maxDays = Math.max(...avgDurationByCategory.map(c => parseFloat(c.value.toString())));
                const barWidth = maxDays > 0 ? (daysNum / maxDays) * 100 : 0;

                // Her kategori için farklı renk
                const categoryColors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#14b8a6", "#84cc16", "#f97316"];
                const color = categoryColors[index % categoryColors.length];

                return (
                  <div
                    key={index}
                    style={{
                      padding: "8px 12px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      borderLeft: `4px solid ${color}`,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onClick={() => setDetailModal({ type: "category", category: cat.label })}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateX(4px) scale(1.02)";
                      e.currentTarget.style.backgroundColor = "#f1f5f9";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateX(0) scale(1)";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{cat.label}</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color }}>{cat.value} gün</div>
                    </div>
                    <div style={{
                      height: "3px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "2px",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${barWidth}%`,
                        background: color,
                        borderRadius: "2px",
                        transition: "width 0.5s ease"
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Kategori Bazında Gecikme Oranı - Compact Percentage Bars */}
        {visibleCharts["late-rate"] !== false && lateRateByCategory.length > 0 && (
          <div className="card" style={{
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            borderColor: "rgba(239, 68, 68, 0.2)",
            minHeight: "400px"
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(239, 68, 68, 0.3)";
              e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.5)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.2)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                Kategori Gecikme Oranı
              </h3>
              <p style={{ fontSize: "12px", color: "#64748b" }}>Kategorilere göre gecikme yüzdeleri (Tıklayarak detay görüntüleyin)</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {lateRateByCategory.slice(0, 8).map((cat, index) => {
                const rateNum = parseFloat(cat.value.toString());

                let color = "#10b981";
                if (rateNum >= 30) color = "#ef4444";
                else if (rateNum >= 15) color = "#f59e0b";
                else color = "#3b82f6";

                return (
                  <div
                    key={index}
                    style={{
                      padding: "8px 12px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      borderLeft: `4px solid ${color}`,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                    onClick={() => setDetailModal({ type: "category", category: cat.label })}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateX(4px) scale(1.02)";
                      e.currentTarget.style.backgroundColor = "#f1f5f9";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateX(0) scale(1)";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{cat.label}</div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color }}>%{cat.value}</div>
                    </div>
                    <div style={{
                      height: "3px",
                      backgroundColor: "#e2e8f0",
                      borderRadius: "2px",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${rateNum}%`,
                        background: color,
                        borderRadius: "2px",
                        transition: "width 0.5s ease"
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}




        {/* Kitap Durumu (Sağlam/Hasarlı/Kayıp) - Gauge Chart */}
        {visibleCharts["book-status"] !== false && (
          <div className="card" style={{
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            borderColor: "rgba(59, 130, 246, 0.2)",
            minHeight: "400px"
          }}>
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                Kitap Durumu Dağılımı
              </h3>
              <p style={{ fontSize: "12px", color: "#64748b" }}>Sağlıklı, hasarlı ve kayıp kitap oranları</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {/* Sağlam Kitaplar */}
              <div
                style={{
                  padding: "16px",
                  background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
                  borderRadius: "10px",
                  border: "2px solid #10b981",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onClick={() => setDetailModal({ type: "healthy-books" })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#065f46", marginBottom: "8px" }}>
                  Sağlıklı
                </div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "#10b981", marginBottom: "4px" }}>
                  {books.filter(b => (b.healthyCount || 0) > 0).length}
                </div>
                <div style={{ fontSize: "10px", color: "#065f46" }}>kitap</div>
              </div>

              {/* Hasarlı Kitaplar */}
              <div
                style={{
                  padding: "16px",
                  background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                  borderRadius: "10px",
                  border: "2px solid #f59e0b",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onClick={() => setDetailModal({ type: "damaged-books" })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(245, 158, 11, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#92400e", marginBottom: "8px" }}>
                  Hasarlı
                </div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "#f59e0b", marginBottom: "4px" }}>
                  {books.filter(b => (b.damagedCount || 0) > 0).length}
                </div>
                <div style={{ fontSize: "10px", color: "#92400e" }}>kitap</div>
              </div>

              {/* Kayıp Kitaplar */}
              <div
                style={{
                  padding: "16px",
                  background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
                  borderRadius: "10px",
                  border: "2px solid #ef4444",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onClick={() => setDetailModal({ type: "lost-books" })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.03)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(239, 68, 68, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "none";
                }}            >
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#991b1b", marginBottom: "8px" }}>
                  Kayıp
                </div>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "#ef4444", marginBottom: "4px" }}>
                  {books.filter(b => (b.lostCount || 0) > 0).length}
                </div>
                <div style={{ fontSize: "10px", color: "#991b1b" }}>kitap</div>
              </div>
            </div>

            {/* Toplam Özet Bar */}
            <div style={{ marginTop: "16px", padding: "10px", background: "#f8fafc", borderRadius: "8px" }}>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "6px", textAlign: "center" }}>Toplam Kitap Dağılımı</div>
              <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{
                  flex: books.filter(b => (b.healthyCount || 0) > 0).length,
                  background: "#10b981"
                }} />
                <div style={{
                  flex: books.filter(b => (b.damagedCount || 0) > 0).length,
                  background: "#f59e0b"
                }} />
                <div style={{
                  flex: books.filter(b => (b.lostCount || 0) > 0).length,
                  background: "#ef4444"
                }} />
              </div>
            </div>
          </div>
        )}

        {/* Alt Sıra - Stok ve Durum Dağılımları */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: "24px" }}>
          {/* Adet Durumu Dağılımı - Taşındı */}
          {visibleCharts["stock-distribution"] !== false && (lowStockBooks.length > 0 || outStockBooks.length > 0) ? (
            <div className="card" style={{
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              borderColor: "rgba(239, 68, 68, 0.2)"
            }}>
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
                  Adet Durumu Dağılımı
                </h3>
                <p style={{ fontSize: "13px", color: "#64748b" }}>Kitap stok durumu özetlenmesi</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                {/* Azalan Adet */}
                <div
                  style={{
                    padding: "20px",
                    background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                    borderRadius: "12px",
                    border: "2px solid #f59e0b",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                  onClick={() => setDetailModal({ type: "stock-low" })}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px) scale(1.05)";
                    e.currentTarget.style.boxShadow = "0 8px 16px rgba(245, 158, 11, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0) scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#92400e", marginBottom: "12px" }}>
                    Azalan Adet
                  </div>
                  <div style={{ fontSize: "48px", fontWeight: 700, color: "#f59e0b", marginBottom: "8px" }}>
                    {lowStockBooks.length}
                  </div>
                  <div style={{ fontSize: "12px", color: "#92400e" }}>≤2 adet</div>
                  <div style={{
                    marginTop: "12px",
                    height: "4px",
                    backgroundColor: "#fde68a",
                    borderRadius: "2px",
                    overflow: "hidden"
                  }}>
                    <div style={{
                      height: "100%",
                      width: "70%",
                      background: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)",
                      borderRadius: "2px"
                    }} />
                  </div>
                </div>

                {/* Tükenen Adet */}
                <div
                  style={{
                    padding: "20px",
                    background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
                    borderRadius: "12px",
                    border: "2px solid #ef4444",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                  onClick={() => setDetailModal({ type: "stock-out" })}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px) scale(1.05)";
                    e.currentTarget.style.boxShadow = "0 8px 16px rgba(239, 68, 68, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0) scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#991b1b", marginBottom: "12px" }}>
                    Tükenen Adet
                  </div>
                  <div style={{ fontSize: "48px", fontWeight: 700, color: "#ef4444", marginBottom: "8px" }}>
                    {outStockBooks.length}
                  </div>
                  <div style={{ fontSize: "12px", color: "#991b1b" }}>0 adet</div>
                  <div style={{
                    marginTop: "12px",
                    height: "4px",
                    backgroundColor: "#fecaca",
                    borderRadius: "2px",
                    overflow: "hidden"
                  }}>
                    <div style={{
                      height: "100%",
                      width: "100%",
                      background: "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)",
                      borderRadius: "2px"
                    }} />
                  </div>
                </div>

                {/* Yeterli Adet */}
                <div
                  style={{
                    padding: "20px",
                    background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
                    borderRadius: "12px",
                    border: "2px solid #10b981",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                  onClick={() => setDetailModal({ type: "stock-status" })}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px) scale(1.05)";
                    e.currentTarget.style.boxShadow = "0 8px 16px rgba(16, 185, 129, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0) scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#065f46", marginBottom: "12px" }}>
                    Yeterli Adet
                  </div>
                  <div style={{ fontSize: "48px", fontWeight: 700, color: "#10b981", marginBottom: "8px" }}>
                    {books.filter(b => b.quantity > 2).length}
                  </div>
                  <div style={{ fontSize: "12px", color: "#065f46" }}>&gt;2 adet</div>
                  <div style={{
                    marginTop: "12px",
                    height: "4px",
                    backgroundColor: "#a7f3d0",
                    borderRadius: "2px",
                    overflow: "hidden"
                  }}>
                    <div style={{
                      height: "100%",
                      width: "100%",
                      background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                      borderRadius: "2px"
                    }} />
                  </div>
                </div>
              </div>

              {/* Toplam Özet */}
              <div style={{
                marginTop: "20px",
                padding: "12px",
                backgroundColor: "#f8fafc",
                borderRadius: "8px",
                textAlign: "center"
              }}>
                <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600 }}>
                  Toplam Kitap: <span style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>{books.length}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>


      </div>


      {/* Kategori Bazlı Ödünç/İade Karşılaştırması */}
      {categoryComparison.length > 0 && (
        <div
          className="card"
          style={{ cursor: "pointer" }}
          onClick={() => setDetailModal({ type: "borrow-return-comparison" })}
        >
          <h3 style={{ marginTop: 0, marginBottom: "20px" }}>Kategori Bazında Ödünç/İade Karşılaştırması - Tıklayın</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {categoryComparison.slice(0, 6).map((cat, index) => {
              const total = cat.borrowed + cat.returned;
              const borrowedPercent = total > 0 ? (cat.borrowed / total) * 100 : 0;
              const returnedPercent = total > 0 ? (cat.returned / total) * 100 : 0;

              return (
                <div
                  key={index}
                  style={{
                    padding: "16px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "12px", color: "#1f2937" }}>{cat.label}</div>
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>Ödünç</span>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#3b82f6" }}>{cat.borrowed}</span>
                    </div>
                    <div
                      style={{
                        height: "8px",
                        backgroundColor: "#e2e8f0",
                        borderRadius: "4px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${borrowedPercent}%`,
                          backgroundColor: "#3b82f6",
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>İade</span>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#10b981" }}>{cat.returned}</span>
                    </div>
                    <div
                      style={{
                        height: "8px",
                        backgroundColor: "#e2e8f0",
                        borderRadius: "4px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${returnedPercent}%`,
                          backgroundColor: "#10b981",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )
      }



      {/* En Çok Ödünç Alınan Kitaplar - Liste */}
      {
        topBooks.length > 0 && (
          <div
            className="card"
            style={{
              cursor: "pointer",
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              borderColor: "rgba(139, 92, 246, 0.2)"
            }}
            onClick={() => setDetailModal({ type: "top-books" })}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(139, 92, 246, 0.3)";
              e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.5)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.2)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <h3 style={{ marginTop: 0 }}>En Çok Ödünç Alınan Kitaplar (Detaylı Liste) - Tıklayın</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {topBooks.map((book, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px",
                    backgroundColor: index < 3 ? "#f0f9ff" : "#f8fafc",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        backgroundColor: index < 3 ? "#3b82f6" : "#cbd5e1",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{book.title}</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>{book.author} • {book.category}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "24px", textAlign: "right" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#3b82f6" }}>{book.borrowed}</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>Ödünç</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: "#10b981" }}>{book.returned}</div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>İade</div>
                    </div>
                    {book.late > 0 && (
                      <div>
                        <div style={{ fontWeight: 700, color: "#ef4444" }}>{book.late}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Gecikme</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }

      {/* En Aktif Öğrenciler - Liste */}
      {
        topStudents.length > 0 && (
          <div
            className="card"
            style={{
              cursor: "pointer",
              transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              borderColor: "rgba(16, 185, 129, 0.2)"
            }}
            onClick={() => setDetailModal({ type: "top-students" })}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 12px 32px rgba(16, 185, 129, 0.3)";
              e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.5)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(255, 255, 255, 0.95) 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(1)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(30, 64, 175, 0.15)";
              e.currentTarget.style.borderColor = "rgba(16, 185, 129, 0.2)";
              e.currentTarget.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 50%, rgba(241, 245, 249, 0.95) 100%)";
            }}
          >
            <h3 style={{ marginTop: 0 }}>En Aktif Öğrenciler (Detaylı Liste) - Tıklayın</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {topStudents.map((student, index) => {
                const activeLoans = student.borrowed - student.returned;
                return (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px",
                      backgroundColor: index < 3 ? "#f0fdf4" : "#f8fafc",
                      borderRadius: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          backgroundColor: index < 3 ? "#10b981" : "#cbd5e1",
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "14px",
                        }}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{student.name}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          {student.class && student.branch ? `${student.class}-${student.branch}` : student.class ? `${student.class}. Sınıf` : ""}
                          {student.studentNumber && ` • No: ${student.studentNumber}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "24px", textAlign: "right" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#3b82f6" }}>{student.borrowed}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Toplam Ödünç</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#10b981" }}>{student.returned}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>İade</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: activeLoans > 0 ? "#f59e0b" : "#10b981" }}>{activeLoans}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Aktif</div>
                      </div>
                      {student.late > 0 && (
                        <div>
                          <div style={{ fontWeight: 700, color: "#ef4444" }}>{student.late}</div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>Gecikme</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      }

      {/* Detaylı Görünüm Modalı */}
      {
        detailModal && createPortal(
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
            onClick={() => setDetailModal(null)}
          >
            <div
              className="card"
              style={{
                maxWidth: "1200px",
                width: "90%",
                maxHeight: "90vh",
                overflowY: "auto",
                overflowX: "hidden",
                position: "relative",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px" }}>
                <h2 style={{ margin: 0, flex: 1 }}>
                  {detailModal.type === "active-loans" && "Aktif Ödünçler"}
                  {detailModal.type === "total-borrowed" && "Toplam Ödünç Detayları"}
                  {detailModal.type === "total-returned" && "İade Detayları"}
                  {detailModal.type === "late-books" && "Geciken Kitaplar"}
                  {detailModal.type === "late-borrowers" && "Geciken Öğrenciler"}
                  {detailModal.type === "total-books" && "Tüm Kitaplar"}
                  {detailModal.type === "total-students" && "Tüm Öğrenciler"}
                  {detailModal.type === "category" && "Kategorilere Göre Kitaplar"}
                  {detailModal.type === "loan-status" && "Ödünç Listesi Detayları"}
                  {detailModal.type === "class-stats" && "Sınıf Bazında Ödünç Detayları"}
                  {detailModal.type === "top-books" && "En Çok Ödünç Alınan Kitaplar"}
                  {detailModal.type === "top-students" && "En Aktif Öğrenciler"}
                  {detailModal.type === "category-comparison" && "Kategori Karşılaştırması"}
                  {detailModal.type === "category-trend" && "Kategori Bazında Ödünç Trendi"}
                  {detailModal.type === "borrow-return-comparison" && "Ödünç/İade Karşılaştırması"}
                  {detailModal.type === "stock-low" && "Azalan Adet Kitaplar (≤2)"}
                  {detailModal.type === "stock-out" && "Tükenen Adet Kitaplar"}
                  {detailModal.type === "active-borrowers" && "Aktif Öğrenciler"}
                  {detailModal.type === "banned-students" && "Cezalı Öğrenciler"}
                  {detailModal.type === "due-soon-0-3" && "0-3 Gün İçinde Teslim Edilecekler"}
                  {detailModal.type === "due-soon-4-7" && "4-7 Gün İçinde Teslim Edilecekler"}
                  {detailModal.type === "due-soon-8-14" && "8-14 Gün İçinde Teslim Edilecekler"}
                  {detailModal.type === "due-soon-15plus" && "15+ Gün İçinde Teslim Edilecekler"}
                  {detailModal.type === "book-ratios" && "Kitap ve Ödünç Oranları"}
                </h2>
                <button
                  onClick={() => {
                    setDetailModal(null);
                    setModalSearchTerm("");
                    setModalCategoryFilter("");
                    setModalAuthorFilter("");
                    setModalClassFilter("");
                    setModalSortOption("none");
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Kapat
                </button>
              </div>

              {detailModal.type === "active-loans" && (
                <LoanOverview loans={activeLoanList} books={books} onRefresh={() => { }} personelName={personelName} resetSearch={false} />
              )}

              {detailModal.type === "total-books" && (
                <BookList books={books} loans={loans} onRefresh={() => { }} onSearch={() => { }} />
              )}

              {detailModal.type === "category" && (
                <div>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "12px", fontWeight: 600, fontSize: "16px" }}>
                      Kategori Seçin:
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <button
                        onClick={() => setDetailModal({ type: "category", category: "" })}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "8px",
                          border: !detailModal.category ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                          background: !detailModal.category ? "#3b82f6" : "#fff",
                          color: !detailModal.category ? "white" : "#374151",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: "14px",
                          transition: "all 0.2s",
                        }}
                      >
                        Tüm Kategoriler
                      </button>
                      {categoryStats.map((cat) => (
                        <button
                          key={cat.label}
                          onClick={() => setDetailModal({ type: "category", category: cat.label })}
                          style={{
                            padding: "10px 16px",
                            borderRadius: "8px",
                            border: detailModal.category === cat.label ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                            background: detailModal.category === cat.label ? "#3b82f6" : "#fff",
                            color: detailModal.category === cat.label ? "white" : "#374151",
                            cursor: "pointer",
                            fontWeight: 600,
                            fontSize: "14px",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            if (detailModal.category !== cat.label) {
                              e.currentTarget.style.borderColor = "#3b82f6";
                              e.currentTarget.style.background = "#eff6ff";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (detailModal.category !== cat.label) {
                              e.currentTarget.style.borderColor = "#e5e7eb";
                              e.currentTarget.style.background = "#fff";
                            }
                          }}
                        >
                          {cat.label} ({cat.value})
                        </button>
                      ))}
                    </div>
                  </div>
                  {detailModal.category && (
                    <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: "200px" }}>
                        <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
                          Arama:
                        </label>
                        <input
                          type="text"
                          value={modalSearchTerm}
                          onChange={(e) => setModalSearchTerm(e.target.value)}
                          placeholder="Kitap veya yazar ile ara..."
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        />
                      </div>
                      <div style={{ minWidth: "150px" }}>
                        <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
                          Sıralama:
                        </label>
                        <select
                          value={modalSortOption}
                          onChange={(e) => setModalSortOption(e.target.value)}
                          style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        >
                          <option value="none">Sıralama Yok</option>
                          <option value="title-asc">Kitap (A-Z)</option>
                          <option value="title-desc">Kitap (Z-A)</option>
                          <option value="author-asc">Yazar (A-Z)</option>
                          <option value="author-desc">Yazar (Z-A)</option>
                          <option value="quantity-desc">Adet (Çok-Az)</option>
                          <option value="quantity-asc">Adet (Az-Çok)</option>
                        </select>
                      </div>
                      {(modalSearchTerm || modalSortOption !== "none") && (
                        <div style={{ display: "flex", alignItems: "flex-end" }}>
                          <button
                            onClick={() => {
                              setModalSearchTerm("");
                              setModalSortOption("none");
                            }}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                          >
                            Filtreleri Temizle
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {detailModal.category ? (
                    <BookList
                      books={books
                        .filter((b) => b.category === detailModal.category)
                        .filter(book => {
                          if (modalSearchTerm) {
                            return searchIncludes(book.title, modalSearchTerm) ||
                              searchIncludes(book.author, modalSearchTerm) ||
                              searchIncludes(book.category, modalSearchTerm) ||
                              searchIncludes(book.shelf, modalSearchTerm) ||
                              searchIncludes(book.publisher, modalSearchTerm);
                          }
                          return true;
                        })
                        .sort((a, b) => {
                          if (modalSortOption === "none") return 0;
                          if (modalSortOption === "title-asc") return a.title.localeCompare(b.title, "tr");
                          if (modalSortOption === "title-desc") return b.title.localeCompare(a.title, "tr");
                          if (modalSortOption === "author-asc") return a.author.localeCompare(b.author, "tr");
                          if (modalSortOption === "author-desc") return b.author.localeCompare(a.author, "tr");
                          if (modalSortOption === "quantity-desc") return b.totalQuantity - a.totalQuantity;
                          if (modalSortOption === "quantity-asc") return a.totalQuantity - b.totalQuantity;
                          return 0;
                        })}
                      loans={loans.filter(loan => {
                        // Sadece seçili kategoriye ait kitapların ödünçlerini göster
                        const book = books.find(b => b.id === loan.bookId);
                        return book && book.category === detailModal.category;
                      })}
                      onRefresh={() => { }}
                      onSearch={() => { }}
                    />
                  ) : (
                    <div style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                      Lütfen bir kategori seçin veya grafikten bir kategoriye tıklayın
                    </div>
                  )}
                </div>
              )}

              {detailModal.type === "total-students" && (
                <div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Öğrenci adı veya numara ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    <select
                      value={modalClassFilter}
                      onChange={(e) => setModalClassFilter(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "120px" }}
                    >
                      <option value="">Tüm Sınıflar</option>
                      {Array.from(new Set(students.filter(s => s.class).map(s => s.class))).sort().map(cls => (
                        <option key={cls} value={cls?.toString()}>{cls}. Sınıf</option>
                      ))}
                    </select>
                    <select
                      value={modalSortOption}
                      onChange={(e) => setModalSortOption(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "150px" }}
                    >
                      <option value="none">Sıralama Yok</option>
                      <option value="name-asc">Ad (A-Z)</option>
                      <option value="name-desc">Ad (Z-A)</option>
                      <option value="borrowed-desc">Ödünç (Çok-Az)</option>
                      <option value="borrowed-asc">Ödünç (Az-Çok)</option>
                      <option value="returned-desc">İade (Çok-Az)</option>
                      <option value="returned-asc">İade (Az-Çok)</option>
                      <option value="active-desc">Aktif Ödünç (Çok-Az)</option>
                      <option value="active-asc">Aktif Ödünç (Az-Çok)</option>
                      <option value="class-asc">Sınıf (Küçük-Büyük)</option>
                      <option value="class-desc">Sınıf (Büyük-Küçük)</option>
                    </select>
                    {(modalSearchTerm || modalClassFilter || modalSortOption !== "none") && (
                      <button
                        onClick={() => {
                          setModalSearchTerm("");
                          setModalClassFilter("");
                          setModalSortOption("none");
                        }}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {students
                      .filter(student => {
                        if (modalSearchTerm) {
                          if (!searchIncludes(student.name, modalSearchTerm) &&
                            !searchIncludes(student.studentNumber, modalSearchTerm) &&
                            !searchIncludes(student.class, modalSearchTerm) &&
                            !searchIncludes(student.branch, modalSearchTerm)) {
                            return false;
                          }
                        }
                        if (modalClassFilter && student.class?.toString() !== modalClassFilter) {
                          return false;
                        }
                        return true;
                      })
                      .sort((a, b) => {
                        if (modalSortOption === "none") {
                          // Varsayılan sıralama: en çok ödünç alan öğrenciler
                          if (detailModal.type === "top-students") return b.borrowed - a.borrowed;
                          return 0;
                        }
                        if (modalSortOption === "name-asc") return a.name.localeCompare(b.name, "tr");
                        if (modalSortOption === "name-desc") return b.name.localeCompare(a.name, "tr");
                        if (modalSortOption === "borrowed-desc") return b.borrowed - a.borrowed;
                        if (modalSortOption === "borrowed-asc") return a.borrowed - b.borrowed;
                        if (modalSortOption === "returned-desc") return b.returned - a.returned;
                        if (modalSortOption === "returned-asc") return a.returned - b.returned;
                        if (modalSortOption === "active-desc") return (b.borrowed - b.returned) - (a.borrowed - a.returned);
                        if (modalSortOption === "active-asc") return (a.borrowed - a.returned) - (b.borrowed - b.returned);
                        if (modalSortOption === "class-asc") return (a.class || 0) - (b.class || 0);
                        if (modalSortOption === "class-desc") return (b.class || 0) - (a.class || 0);
                        return 0;
                      })
                      .map((student, index) => {
                        const activeLoans = student.borrowed - student.returned;
                        return (
                          <div
                            key={index}
                            style={{
                              padding: "16px",
                              backgroundColor: "#f8fafc",
                              borderRadius: "12px",
                              border: "1px solid #e2e8f0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-2px)";
                              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
                              e.currentTarget.style.borderColor = "#3b82f6";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow = "none";
                              e.currentTarget.style.borderColor = "#e2e8f0";
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b" }}>{student.name}</div>
                              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                                {student.class && student.branch
                                  ? `${student.class}-${student.branch}`
                                  : student.class
                                    ? `${student.class}. Sınıf`
                                    : ""}
                                {student.studentNumber && ` • No: ${student.studentNumber}`}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "32px", textAlign: "right" }}>
                              <div>
                                <div style={{ fontWeight: 700, color: "#3b82f6", fontSize: "20px" }}>{student.borrowed}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>Toplam Ödünç</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: "#10b981", fontSize: "20px" }}>{student.returned}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>İade</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: activeLoans > 0 ? "#f59e0b" : "#10b981", fontSize: "20px" }}>
                                  {activeLoans}
                                </div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>Aktif</div>
                              </div>
                              {student.late > 0 && (
                                <div>
                                  <div style={{ fontWeight: 700, color: "#ef4444", fontSize: "20px" }}>{student.late}</div>
                                  <div style={{ fontSize: "12px", color: "#64748b" }}>Gecikme</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {detailModal.type === "loan-status" && (
                <div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <select
                      value={detailModal.statusType || ""}
                      onChange={(e) => setDetailModal({ ...detailModal, statusType: e.target.value })}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "200px" }}
                    >
                      <option value="">Tüm Durumlar</option>
                      <option value="ok">Normal (3+ gün kaldı)</option>
                      <option value="warning">Yakında Dolacak (1-3 gün)</option>
                      <option value="late">Gecikmiş (Süresi Doldu)</option>
                    </select>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Kitap, yazar veya öğrenci ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    {(detailModal.statusType || modalSearchTerm) && (
                      <button
                        onClick={() => {
                          setDetailModal({ ...detailModal, statusType: "" });
                          setModalSearchTerm("");
                        }}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                  <LoanOverview
                    loans={loans.filter(loan => {
                      const diff = getDaysDiff(loan.dueDate);
                      if (detailModal.statusType === "ok") return diff > 3;
                      if (detailModal.statusType === "warning") return diff >= 0 && diff <= 3;
                      if (detailModal.statusType === "late") {
                        // DÜZELTME: getDaysDiff kullanarak tutarlı hesaplama
                        return diff < 0;
                      }
                      return true;
                    }).filter(loan => {
                      if (!modalSearchTerm) return true;
                      return searchIncludes(loan.title, modalSearchTerm) ||
                        searchIncludes(loan.author, modalSearchTerm) ||
                        searchIncludes(loan.borrower, modalSearchTerm) ||
                        searchIncludes(loan.category, modalSearchTerm) ||
                        searchIncludes(loan.personel, modalSearchTerm);
                    })}
                    books={books}
                    onRefresh={() => { }}
                    personelName={personelName}
                    resetSearch={false}
                  />
                </div>
              )}

              {detailModal.type === "class-stats" && (
                <div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <select
                      value={detailModal.classValue || ""}
                      onChange={(e) => setDetailModal({ ...detailModal, classValue: e.target.value })}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "200px" }}
                    >
                      <option value="">Tüm Sınıflar</option>
                      {classStats.map((cls) => (
                        <option key={cls.label} value={cls.label}>
                          {cls.label} ({cls.value} ödünç)
                        </option>
                      ))}
                    </select>
                    {detailModal.classValue && (
                      <button
                        onClick={() => setDetailModal({ ...detailModal, classValue: "" })}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreyi Temizle
                      </button>
                    )}
                  </div>
                  {detailModal.classValue ? (
                    <StudentList
                      students={students.filter(s => {
                        const classValue = detailModal.classValue || "";
                        const classNum = classValue.replace(". Sınıf", "").trim();
                        return s.class?.toString() === classNum;
                      })}
                      books={books}
                      loans={loans}
                      resetSearch={false}
                    />
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                      {classStats.map((cls, index) => (
                        <div
                          key={cls.label}
                          className="card"
                          style={{
                            cursor: "pointer",
                            textAlign: "center",
                            padding: "20px",
                            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                            borderRadius: "12px",
                            boxShadow: "0 4px 6px rgba(16, 185, 129, 0.2)",
                            color: "white",
                            transition: "all 0.2s",
                          }}
                          onClick={() => setDetailModal({ ...detailModal, classValue: cls.label })}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-4px) scale(1.02)";
                            e.currentTarget.style.boxShadow = "0 8px 16px rgba(16, 185, 129, 0.3)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0) scale(1)";
                            e.currentTarget.style.boxShadow = "0 4px 6px rgba(16, 185, 129, 0.2)";
                          }}
                        >
                          <div style={{ fontSize: "36px", fontWeight: 700, marginBottom: "8px" }}>
                            {cls.value}
                          </div>
                          <div style={{ fontSize: "14px", fontWeight: 500, opacity: 0.95 }}>{cls.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailModal.type === "category-comparison" && (
                <div>
                  {!detailModal.category ? (
                    <div>
                      <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        <input
                          type="text"
                          value={modalSearchTerm}
                          onChange={(e) => setModalSearchTerm(e.target.value)}
                          placeholder="Kategori ile ara..."
                          style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        />
                        {modalSearchTerm && (
                          <button
                            onClick={() => setModalSearchTerm("")}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                          >
                            Filtreleri Temizle
                          </button>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
                        {categoryComparison
                          .filter((cat) => {
                            if (!modalSearchTerm) return true;
                            return searchIncludes(cat.label, modalSearchTerm);
                          })
                          .map((cat, index) => {
                            const total = cat.borrowed + cat.returned;
                            const borrowedPercent = total > 0 ? (cat.borrowed / total) * 100 : 0;
                            const returnedPercent = total > 0 ? (cat.returned / total) * 100 : 0;

                            return (
                              <div
                                key={index}
                                className="card"
                                style={{
                                  cursor: "pointer",
                                  padding: "20px",
                                  border: "2px solid #e2e8f0",
                                  borderRadius: "12px",
                                  backgroundColor: "#ffffff",
                                  transition: "all 0.2s",
                                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
                                }}
                                onClick={() => setDetailModal({ ...detailModal, category: cat.label })}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = "translateY(-4px)";
                                  e.currentTarget.style.borderColor = "#3b82f6";
                                  e.currentTarget.style.boxShadow = "0 8px 16px rgba(59, 130, 246, 0.2)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = "translateY(0)";
                                  e.currentTarget.style.borderColor = "#e2e8f0";
                                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.05)";
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: "16px", color: "#1f2937", fontSize: "18px" }}>
                                  {cat.label}
                                </div>
                                <div style={{ marginBottom: "12px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                    <span style={{ fontSize: "14px", color: "#64748b", fontWeight: 600 }}>Ödünç</span>
                                    <span style={{ fontSize: "20px", fontWeight: 700, color: "#3b82f6" }}>{cat.borrowed}</span>
                                  </div>
                                  <div
                                    style={{
                                      height: "12px",
                                      backgroundColor: "#e2e8f0",
                                      borderRadius: "6px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${borrowedPercent}%`,
                                        background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)",
                                        transition: "width 0.3s ease",
                                      }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                    <span style={{ fontSize: "14px", color: "#64748b", fontWeight: 600 }}>İade</span>
                                    <span style={{ fontSize: "20px", fontWeight: 700, color: "#10b981" }}>{cat.returned}</span>
                                  </div>
                                  <div
                                    style={{
                                      height: "12px",
                                      backgroundColor: "#e2e8f0",
                                      borderRadius: "6px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${returnedPercent}%`,
                                        background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                                        transition: "width 0.3s ease",
                                      }}
                                    />
                                  </div>
                                </div>
                                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                                  <span style={{ fontSize: "14px", color: "#64748b" }}>Toplam: <strong style={{ fontSize: "16px", color: "#1f2937" }}>{total}</strong></span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          onClick={() => setDetailModal({ ...detailModal, category: "" })}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: "#64748b",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          ← Geri
                        </button>
                        <div style={{ flex: 1 }}>
                          <strong style={{ fontSize: "16px" }}>{detailModal.category} Kategorisi - Kitap Listesi</strong>
                        </div>
                      </div>
                      <BookList
                        books={books.filter(b => {
                          if (b.category !== detailModal.category) return false;
                          return true;
                        })}
                        loans={loans}
                        onRefresh={() => { }}
                        onSearch={() => { }}
                        resetSearch={false}
                      />
                    </div>
                  )}
                </div>
              )}

              {detailModal.type === "borrow-return-comparison" && (
                <div>
                  {!detailModal.category ? (
                    <div>
                      <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                        <input
                          type="text"
                          value={modalSearchTerm}
                          onChange={(e) => setModalSearchTerm(e.target.value)}
                          placeholder="Kategori ile ara..."
                          style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        />
                        {modalSearchTerm && (
                          <button
                            onClick={() => setModalSearchTerm("")}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#ef4444",
                              color: "white",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                          >
                            Filtreleri Temizle
                          </button>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
                        {categoryComparison
                          .filter((cat) => {
                            if (!modalSearchTerm) return true;
                            return searchIncludes(cat.label, modalSearchTerm);
                          })
                          .map((cat, index) => {
                            const total = cat.borrowed + cat.returned;
                            const borrowedPercent = total > 0 ? (cat.borrowed / total) * 100 : 0;
                            const returnedPercent = total > 0 ? (cat.returned / total) * 100 : 0;

                            return (
                              <div
                                key={index}
                                className="card"
                                style={{
                                  cursor: "pointer",
                                  padding: "20px",
                                  border: "2px solid #e2e8f0",
                                  borderRadius: "12px",
                                  backgroundColor: "#ffffff",
                                  transition: "all 0.2s",
                                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
                                }}
                                onClick={() => setDetailModal({ ...detailModal, category: cat.label })}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = "translateY(-4px)";
                                  e.currentTarget.style.borderColor = "#3b82f6";
                                  e.currentTarget.style.boxShadow = "0 8px 16px rgba(59, 130, 246, 0.2)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = "translateY(0)";
                                  e.currentTarget.style.borderColor = "#e2e8f0";
                                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.05)";
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: "16px", color: "#1f2937", fontSize: "18px" }}>
                                  {cat.label}
                                </div>
                                <div style={{ marginBottom: "12px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                    <span style={{ fontSize: "14px", color: "#64748b", fontWeight: 600 }}>Ödünç</span>
                                    <span style={{ fontSize: "20px", fontWeight: 700, color: "#3b82f6" }}>{cat.borrowed}</span>
                                  </div>
                                  <div
                                    style={{
                                      height: "12px",
                                      backgroundColor: "#e2e8f0",
                                      borderRadius: "6px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${borrowedPercent}%`,
                                        background: "linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)",
                                        transition: "width 0.3s ease",
                                      }}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                    <span style={{ fontSize: "14px", color: "#64748b", fontWeight: 600 }}>İade</span>
                                    <span style={{ fontSize: "20px", fontWeight: 700, color: "#10b981" }}>{cat.returned}</span>
                                  </div>
                                  <div
                                    style={{
                                      height: "12px",
                                      backgroundColor: "#e2e8f0",
                                      borderRadius: "6px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${returnedPercent}%`,
                                        background: "linear-gradient(90deg, #10b981 0%, #059669 100%)",
                                        transition: "width 0.3s ease",
                                      }}
                                    />
                                  </div>
                                </div>
                                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                                  <span style={{ fontSize: "14px", color: "#64748b" }}>Toplam: <strong style={{ fontSize: "16px", color: "#1f2937" }}>{total}</strong></span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                        <button
                          onClick={() => setDetailModal({ ...detailModal, category: "" })}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: "#64748b",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          ← Geri
                        </button>
                        <div style={{ flex: 1 }}>
                          <strong style={{ fontSize: "16px" }}>{detailModal.category} Kategorisi - Kitap Listesi</strong>
                        </div>
                      </div>
                      <BookList
                        books={books.filter(b => b.category === detailModal.category)}
                        loans={loans}
                        onRefresh={() => { }}
                        onSearch={() => { }}
                        resetSearch={false}
                      />
                    </div>
                  )}
                </div>
              )}

              {detailModal.type === "top-books" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#eff6ff", borderRadius: "8px", border: "1px solid #3b82f6" }}>
                    <div style={{ fontWeight: 600, color: "#1e40af", marginBottom: "4px" }}>Toplam Ödünç Sayısı</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "#3b82f6" }}>
                      {bookStats.reduce((sum, b) => sum + (b.borrowed || 0), 0)}
                    </div>
                  </div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Kitap adı, yazar veya kategori ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    <select
                      value={modalCategoryFilter}
                      onChange={(e) => setModalCategoryFilter(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "150px" }}
                    >
                      <option value="">Tüm Kategoriler</option>
                      {Array.from(new Set(bookStats.filter(b => b.category).map(b => b.category))).sort().map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <select
                      value={modalSortOption}
                      onChange={(e) => setModalSortOption(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "150px" }}
                    >
                      <option value="borrowed-desc">Ödünç (Yüksek → Düşük)</option>
                      <option value="borrowed-asc">Ödünç (Düşük → Yüksek)</option>
                      <option value="returned-desc">İade (Yüksek → Düşük)</option>
                      <option value="returned-asc">İade (Düşük → Yüksek)</option>
                      <option value="title-asc">Kitap Adı (A → Z)</option>
                      <option value="title-desc">Kitap Adı (Z → A)</option>
                    </select>
                    {(modalSearchTerm || modalCategoryFilter || modalSortOption !== "borrowed-desc") && (
                      <button
                        onClick={() => {
                          setModalSearchTerm("");
                          setModalCategoryFilter("");
                          setModalSortOption("borrowed-desc");
                        }}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[...bookStats]
                      .filter(book => book.borrowed > 0)
                      .filter(book => {
                        if (modalSearchTerm) {
                          if (!searchIncludes(book.title, modalSearchTerm) &&
                            !searchIncludes(book.author, modalSearchTerm) &&
                            !searchIncludes(book.category, modalSearchTerm)) {
                            return false;
                          }
                        }
                        if (modalCategoryFilter && book.category !== modalCategoryFilter) {
                          return false;
                        }
                        return true;
                      })
                      .sort((a, b) => {
                        if (modalSortOption === "borrowed-desc") return b.borrowed - a.borrowed;
                        if (modalSortOption === "borrowed-asc") return a.borrowed - b.borrowed;
                        if (modalSortOption === "returned-desc") return b.returned - a.returned;
                        if (modalSortOption === "returned-asc") return a.returned - b.returned;
                        if (modalSortOption === "title-asc") return a.title.localeCompare(b.title, "tr");
                        if (modalSortOption === "title-desc") return b.title.localeCompare(a.title, "tr");
                        return b.borrowed - a.borrowed;
                      })
                      //SLICE REMOVED for "Tüm Liste"
                      .map((book, index) => {
                        const activeLoans = book.borrowed - book.returned;
                        return (
                          <div
                            key={index}
                            style={{
                              padding: "16px",
                              backgroundColor: index < 3 ? "#eff6ff" : "#f8fafc",
                              borderRadius: "12px",
                              border: index < 3 ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              boxShadow: index < 3 ? "0 2px 8px rgba(59, 130, 246, 0.15)" : "none",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                              <div
                                style={{
                                  width: "40px",
                                  height: "40px",
                                  borderRadius: "50%",
                                  backgroundColor: index < 3 ? "#3b82f6" : "#cbd5e1",
                                  color: "white",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: "16px",
                                }}
                              >
                                {index + 1}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b" }}>{book.title}</div>
                                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                                  {book.author} • {book.category}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "32px", textAlign: "right" }}>
                              <div>
                                <div style={{ fontWeight: 700, color: "#3b82f6", fontSize: "20px" }}>{book.borrowed}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>Toplam Ödünç</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: "#10b981", fontSize: "20px" }}>{book.returned}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>İade</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: activeLoans > 0 ? "#f59e0b" : "#10b981", fontSize: "20px" }}>
                                  {activeLoans}
                                </div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>Aktif</div>
                              </div>
                              {book.late > 0 && (
                                <div>
                                  <div style={{ fontWeight: 700, color: "#ef4444", fontSize: "20px" }}>{book.late}</div>
                                  <div style={{ fontSize: "12px", color: "#64748b" }}>Gecikme</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {detailModal.type === "top-students" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px solid #10b981" }}>
                    <div style={{ fontWeight: 600, color: "#065f46", marginBottom: "4px" }}>Aktif Öğrenci Sayısı</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "#10b981" }}>
                      {new Set(loans.filter(l => getDaysDiff(l.dueDate) >= 0).map(l => l.borrower)).size}
                    </div>
                  </div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Öğrenci adı veya numara ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    <select
                      value={modalClassFilter}
                      onChange={(e) => setModalClassFilter(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "120px" }}
                    >
                      <option value="">Tüm Sınıflar</option>
                      {Array.from(new Set(students.filter(s => s.class).map(s => s.class))).sort().map(cls => (
                        <option key={cls} value={cls?.toString()}>{cls}. Sınıf</option>
                      ))}
                    </select>
                    <select
                      value={modalSortOption}
                      onChange={(e) => setModalSortOption(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "150px" }}
                    >
                      <option value="none">Varsayılan (En Aktif)</option>
                      <option value="name-asc">Ad (A-Z)</option>
                      <option value="name-desc">Ad (Z-A)</option>
                      <option value="borrowed-desc">Ödünç (Çok-Az)</option>
                      <option value="borrowed-asc">Ödünç (Az-Çok)</option>
                      <option value="returned-desc">İade (Çok-Az)</option>
                      <option value="returned-asc">İade (Az-Çok)</option>
                      <option value="active-desc">Aktif Ödünç (Çok-Az)</option>
                      <option value="active-asc">Aktif Ödünç (Az-Çok)</option>
                      <option value="class-asc">Sınıf (Küçük-Büyük)</option>
                      <option value="class-desc">Sınıf (Büyük-Küçük)</option>
                    </select>
                    {(modalSearchTerm || modalClassFilter || (modalSortOption !== "none" && modalSortOption !== "borrowed-desc")) && (
                      <button
                        onClick={() => {
                          setModalSearchTerm("");
                          setModalClassFilter("");
                          setModalSortOption("borrowed-desc");
                        }}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {students
                      .filter(student => {
                        if (modalSearchTerm) {
                          if (!searchIncludes(student.name, modalSearchTerm) &&
                            !searchIncludes(student.studentNumber, modalSearchTerm) &&
                            !searchIncludes(student.class, modalSearchTerm) &&
                            !searchIncludes(student.branch, modalSearchTerm)) {
                            return false;
                          }
                        }
                        if (modalClassFilter && student.class?.toString() !== modalClassFilter) {
                          return false;
                        }
                        return true;
                      })
                      .sort((a, b) => {
                        // Varsayılan sıralama borrowed-desc olmalı (en aktif)
                        const sortKey = modalSortOption === "none" ? "borrowed-desc" : modalSortOption;

                        if (sortKey === "borrowed-desc") return b.borrowed - a.borrowed;
                        if (sortKey === "borrowed-asc") return a.borrowed - b.borrowed;
                        if (sortKey === "name-asc") return a.name.localeCompare(b.name, "tr");
                        if (sortKey === "name-desc") return b.name.localeCompare(a.name, "tr");
                        if (sortKey === "returned-desc") return b.returned - a.returned;
                        if (sortKey === "returned-asc") return a.returned - b.returned;
                        if (sortKey === "active-desc") return (b.borrowed - b.returned) - (a.borrowed - a.returned);
                        if (sortKey === "active-asc") return (a.borrowed - a.returned) - (b.borrowed - b.returned);
                        if (sortKey === "class-asc") return (a.class || 0) - (b.class || 0);
                        if (sortKey === "class-desc") return (b.class || 0) - (a.class || 0);
                        return b.borrowed - a.borrowed; // Fallback
                      })
                      .map((student, index) => {
                        const activeLoans = student.borrowed - student.returned;
                        return (
                          <div
                            key={index}
                            style={{
                              padding: "16px",
                              backgroundColor: "#f8fafc",
                              borderRadius: "12px",
                              border: "1px solid #e2e8f0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = "translateY(-2px)";
                              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
                              e.currentTarget.style.borderColor = "#3b82f6";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow = "none";
                              e.currentTarget.style.borderColor = "#e2e8f0";
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b" }}>{student.name}</div>
                              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                                {student.class && student.branch
                                  ? `${student.class}-${student.branch}`
                                  : student.class
                                    ? `${student.class}. Sınıf`
                                    : ""}
                                {student.studentNumber && ` • No: ${student.studentNumber}`}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "32px", textAlign: "right" }}>
                              <div>
                                <div style={{ fontWeight: 700, color: "#3b82f6", fontSize: "20px" }}>{student.borrowed}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>Toplam Ödünç</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: "#10b981", fontSize: "20px" }}>{student.returned}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>İade</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: activeLoans > 0 ? "#f59e0b" : "#10b981", fontSize: "20px" }}>
                                  {activeLoans}
                                </div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>Aktif</div>
                              </div>
                              {student.late > 0 && (
                                <div>
                                  <div style={{ fontWeight: 700, color: "#ef4444", fontSize: "20px" }}>{student.late}</div>
                                  <div style={{ fontSize: "12px", color: "#64748b" }}>Gecikme</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {detailModal.type === "category-trend" && (
                <div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Kategori ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    {(modalSearchTerm) && (
                      <button
                        onClick={() => setModalSearchTerm("")}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
                    {categoryStats
                      .filter(cat => {
                        if (modalSearchTerm) {
                          return searchIncludes(cat.label, modalSearchTerm);
                        }
                        return true;
                      })
                      .map((cat, index) => {
                        const categoryBooks = books.filter(b => b.category === cat.label);
                        const categoryLoans = loans.filter(l => {
                          const book = books.find(b => b.id === l.bookId);
                          return book && book.category === cat.label;
                        });
                        return (
                          <div
                            key={index}
                            className="card"
                            style={{
                              cursor: "pointer",
                              transition: "transform 0.2s",
                              padding: "20px",
                            }}
                            onClick={() => setDetailModal({ type: "category", category: cat.label })}
                            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.02)"}
                            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                          >
                            <div style={{ fontWeight: 600, fontSize: "18px", color: "#1e293b", marginBottom: "12px" }}>
                              {cat.label}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                              <div>
                                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Toplam Ödünç</div>
                                <div style={{ fontSize: "24px", fontWeight: 700, color: "#3b82f6" }}>{cat.value}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Kitap Sayısı</div>
                                <div style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>{categoryBooks.length}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Aktif Ödünç</div>
                                <div style={{ fontSize: "18px", fontWeight: 600, color: "#10b981" }}>{categoryLoans.filter(l => getDaysDiff(l.dueDate) >= 0).length}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {detailModal.type === "late-borrowers" && (
                <div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Öğrenci adı ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    {(modalSearchTerm) && (
                      <button
                        onClick={() => setModalSearchTerm("")}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                  <LoanOverview
                    loans={lateLoanList.filter(loan => {
                      if (!modalSearchTerm) return true;
                      return searchIncludes(loan.borrower, modalSearchTerm) ||
                        searchIncludes(loan.title, modalSearchTerm) ||
                        searchIncludes(loan.author, modalSearchTerm);
                    })}
                    books={books}
                    onRefresh={() => { }}
                    personelName={personelName}
                    resetSearch={false}
                  />
                </div>
              )}

              {detailModal.type === "stock-low" && (
                <BookList
                  books={lowStockBooks}
                  loans={loans}
                  onRefresh={() => { }}
                  onSearch={() => { }}
                />
              )}

              {detailModal.type === "stock-out" && (
                <BookList
                  books={outStockBooks}
                  loans={loans}
                  onRefresh={() => { }}
                  onSearch={() => { }}
                />
              )}

              {detailModal.type === "stock-status" && (
                <div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Kitap adı, yazar veya kategori ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    <select
                      value={modalCategoryFilter}
                      onChange={(e) => setModalCategoryFilter(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "150px" }}
                    >
                      <option value="">Tüm Kategoriler</option>
                      {Array.from(new Set(books.filter(b => b.category).map(b => b.category))).sort().map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    {(modalSearchTerm || modalCategoryFilter) && (
                      <button
                        onClick={() => {
                          setModalSearchTerm("");
                          setModalCategoryFilter("");
                        }}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => setModalSortOption(modalSortOption === "stock-0" ? "none" : "stock-0")}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: modalSortOption === "stock-0" ? "2px solid #ef4444" : "1px solid #e5e7eb",
                        background: modalSortOption === "stock-0" ? "#fef2f2" : "#fff",
                        color: modalSortOption === "stock-0" ? "#991b1b" : "#374151",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      0 Adet ({outStockBooks.length})
                    </button>
                    <button
                      onClick={() => setModalSortOption(modalSortOption === "stock-low" ? "none" : "stock-low")}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: modalSortOption === "stock-low" ? "2px solid #f59e0b" : "1px solid #e5e7eb",
                        background: modalSortOption === "stock-low" ? "#fffbeb" : "#fff",
                        color: modalSortOption === "stock-low" ? "#92400e" : "#374151",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      &lt;2 Adet ({lowStockBooks.length})
                    </button>
                    <button
                      onClick={() => setModalSortOption(modalSortOption === "stock-2" ? "none" : "stock-2")}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: modalSortOption === "stock-2" ? "2px solid #3b82f6" : "1px solid #e5e7eb",
                        background: modalSortOption === "stock-2" ? "#eff6ff" : "#fff",
                        color: modalSortOption === "stock-2" ? "#1e40af" : "#374151",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      2 Adet ({books.filter(b => b.quantity === 2).length})
                    </button>
                    <button
                      onClick={() => setModalSortOption(modalSortOption === "stock-3-5" ? "none" : "stock-3-5")}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: modalSortOption === "stock-3-5" ? "2px solid #10b981" : "1px solid #e5e7eb",
                        background: modalSortOption === "stock-3-5" ? "#f0fdf4" : "#fff",
                        color: modalSortOption === "stock-3-5" ? "#065f46" : "#374151",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      3-5 Adet ({books.filter(b => b.quantity >= 3 && b.quantity <= 5).length})
                    </button>
                    <button
                      onClick={() => setModalSortOption(modalSortOption === "stock-6plus" ? "none" : "stock-6plus")}
                      style={{
                        padding: "8px 16px",
                        borderRadius: "6px",
                        border: modalSortOption === "stock-6plus" ? "2px solid #10b981" : "1px solid #e5e7eb",
                        background: modalSortOption === "stock-6plus" ? "#f0fdf4" : "#fff",
                        color: modalSortOption === "stock-6plus" ? "#065f46" : "#374151",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      6+ Adet ({books.filter(b => b.quantity >= 6).length})
                    </button>
                  </div>
                  <BookList
                    books={books.filter(book => {
                      if (modalSearchTerm) {
                        if (!searchIncludes(book.title, modalSearchTerm) &&
                          !searchIncludes(book.author || "", modalSearchTerm) &&
                          !searchIncludes(book.category || "", modalSearchTerm)) {
                          return false;
                        }
                      }
                      if (modalCategoryFilter && book.category !== modalCategoryFilter) {
                        return false;
                      }
                      if (modalSortOption === "stock-0" && book.quantity !== 0) return false;
                      if (modalSortOption === "stock-low" && (book.quantity === 0 || book.quantity > 2)) return false;
                      if (modalSortOption === "stock-2" && book.quantity !== 2) return false;
                      if (modalSortOption === "stock-3-5" && (book.quantity < 3 || book.quantity > 5)) return false;
                      if (modalSortOption === "stock-6plus" && book.quantity < 6) return false;
                      return true;
                    })}
                    loans={loans}
                    onRefresh={() => { }}
                    onSearch={() => { }}
                  />
                </div>
              )}

              {detailModal.type === "active-borrowers" && (
                <div>
                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Öğrenci adı ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    {(modalSearchTerm) && (
                      <button
                        onClick={() => setModalSearchTerm("")}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>
                  <StudentList
                    students={students.filter(s => {
                      const studentLoans = loans.filter(l => l.borrower === s.name && getDaysDiff(l.dueDate) >= 0);
                      if (studentLoans.length === 0) return false;
                      if (modalSearchTerm) {
                        return searchIncludes(s.name, modalSearchTerm) ||
                          searchIncludes(s.studentNumber, modalSearchTerm) ||
                          searchIncludes(s.class, modalSearchTerm) ||
                          searchIncludes(s.branch, modalSearchTerm);
                      }
                      return true;
                    })}
                    books={books}
                    onRefresh={() => { }}
                    loans={loans}
                    resetSearch={false}
                  />
                </div>
              )}

              {detailModal.type === "banned-students" && (
                <StudentList
                  students={bannedStudents}
                  books={books}
                  loans={loans}
                  resetSearch={false}
                />
              )}

              {detailModal.type === "due-soon-0-3" && (
                <LoanOverview
                  loans={bucket0_3}
                  books={books}
                  onRefresh={() => { }}
                  personelName={personelName}
                  resetSearch={false}
                />
              )}

              {detailModal.type === "due-soon-4-7" && (
                <LoanOverview
                  loans={bucket4_7}
                  books={books}
                  onRefresh={() => { }}
                  personelName={personelName}
                  resetSearch={false}
                />
              )}

              {detailModal.type === "due-soon-8-14" && (
                <LoanOverview
                  loans={bucket8_14}
                  books={books}
                  onRefresh={() => { }}
                  personelName={personelName}
                  resetSearch={false}
                />
              )}

              {detailModal.type === "due-soon-15plus" && (
                <LoanOverview
                  loans={bucket15plus}
                  books={books}
                  onRefresh={() => { }}
                  personelName={personelName}
                  resetSearch={false}
                />
              )}

              {detailModal.type === "total-returned" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px solid #10b981" }}>
                    <div style={{ fontWeight: 600, color: "#065f46", marginBottom: "4px" }}>Toplam İade Sayısı (Kitap Bazlı)</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "#10b981" }}>
                      {totalReturnedFromBooks}
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={modalSearchTerm}
                      onChange={(e) => setModalSearchTerm(e.target.value)}
                      placeholder="Kitap adı, yazar veya kategori ile ara..."
                      style={{ flex: 1, minWidth: "200px", padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                    />
                    <select
                      value={modalCategoryFilter}
                      onChange={(e) => setModalCategoryFilter(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "150px" }}
                    >
                      <option value="">Tüm Kategoriler</option>
                      {Array.from(new Set(bookStats.filter(b => b.category).map(b => b.category))).sort().map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <select
                      value={modalSortOption}
                      onChange={(e) => setModalSortOption(e.target.value)}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #e5e7eb", minWidth: "150px" }}
                    >
                      <option value="returned-desc">İade (Yüksek → Düşük)</option>
                      <option value="returned-asc">İade (Düşük → Yüksek)</option>
                      <option value="borrowed-desc">Ödünç (Yüksek → Düşük)</option>
                      <option value="title-asc">Kitap Adı (A → Z)</option>
                      <option value="title-desc">Kitap Adı (Z → A)</option>
                    </select>
                    {(modalSearchTerm || modalCategoryFilter || modalSortOption !== "returned-desc") && (
                      <button
                        onClick={() => {
                          setModalSearchTerm("");
                          setModalCategoryFilter("");
                          setModalSortOption("returned-desc");
                        }}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                        }}
                      >
                        Filtreleri Temizle
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[...bookStats]
                      .filter(book => book.returned > 0)
                      .filter(book => {
                        if (modalSearchTerm) {
                          if (!searchIncludes(book.title, modalSearchTerm) &&
                            !searchIncludes(book.author, modalSearchTerm) &&
                            !searchIncludes(book.category, modalSearchTerm)) {
                            return false;
                          }
                        }
                        if (modalCategoryFilter && book.category !== modalCategoryFilter) {
                          return false;
                        }
                        return true;
                      })
                      .sort((a, b) => {
                        if (modalSortOption === "returned-desc") return b.returned - a.returned;
                        if (modalSortOption === "returned-asc") return a.returned - b.returned;
                        if (modalSortOption === "borrowed-desc") return b.borrowed - a.borrowed;
                        if (modalSortOption === "title-asc") return a.title.localeCompare(b.title, "tr");
                        if (modalSortOption === "title-desc") return b.title.localeCompare(a.title, "tr");
                        return b.returned - a.returned;
                      })
                      .slice(0, 200)
                      .map((book, index) => {
                        const activeLoans = book.borrowed - book.returned;
                        return (
                          <div
                            key={index}
                            style={{
                              padding: "16px",
                              backgroundColor: index < 3 ? "#f0fdf4" : "#f8fafc",
                              borderRadius: "12px",
                              border: index < 3 ? "2px solid #10b981" : "1px solid #e2e8f0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              boxShadow: index < 3 ? "0 2px 8px rgba(16, 185, 129, 0.15)" : "none",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                              <div
                                style={{
                                  width: "40px",
                                  height: "40px",
                                  borderRadius: "50%",
                                  backgroundColor: index < 3 ? "#10b981" : "#cbd5e1",
                                  color: "white",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: "16px",
                                }}
                              >
                                {index + 1}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b" }}>{book.title}</div>
                                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                                  {book.author} • {book.category}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "32px", textAlign: "right" }}>
                              <div>
                                <div style={{ fontWeight: 700, color: "#10b981", fontSize: "20px" }}>{book.returned}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>İade</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: "#3b82f6", fontSize: "20px" }}>{book.borrowed}</div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>Toplam Ödünç</div>
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: activeLoans > 0 ? "#f59e0b" : "#10b981", fontSize: "20px" }}>
                                  {activeLoans}
                                </div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>Aktif</div>
                              </div>
                              {book.late > 0 && (
                                <div>
                                  <div style={{ fontWeight: 700, color: "#ef4444", fontSize: "20px" }}>{book.late}</div>
                                  <div style={{ fontSize: "12px", color: "#64748b" }}>Gecikme</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {detailModal.type === "book-ratios" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#eff6ff", borderRadius: "8px", border: "1px solid #3b82f6" }}>
                    <div style={{ fontWeight: 600, color: "#1e40af", marginBottom: "4px" }}>Kategorilere Göre Ödünç Oranları</div>
                    <div style={{ fontSize: "14px", color: "#64748b" }}>Her kategorideki kitapların ödünç alınma yüzdeleri</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                    {categoryStats.map((cat, index) => {
                      const totalBooksInCategory = books.filter(b => b.category === cat.label).length;
                      const totalBorrowsInCategory = cat.value;
                      const avgBorrowsPerBook = totalBooksInCategory > 0 ? (totalBorrowsInCategory / totalBooksInCategory).toFixed(1) : 0;
                      const ratio = totalBorrowed > 0 ? Math.round((totalBorrowsInCategory / totalBorrowed) * 100) : 0;

                      return (
                        <div
                          key={index}
                          style={{
                            padding: "20px",
                            backgroundColor: "#f8fafc",
                            borderRadius: "12px",
                            border: "1px solid #e2e8f0",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onClick={() => setDetailModal({ type: "category", category: cat.label })}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "none";
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b", marginBottom: "12px" }}>
                            {cat.label}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "13px", color: "#64748b" }}>Toplam Ödünç</span>
                              <span style={{ fontSize: "20px", fontWeight: 700, color: "#3b82f6" }}>{totalBorrowsInCategory}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "13px", color: "#64748b" }}>Ödünç Oranı</span>
                              <span style={{ fontSize: "18px", fontWeight: 600, color: "#8b5cf6" }}>%{ratio}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "13px", color: "#64748b" }}>Kitap Başı Ort.</span>
                              <span style={{ fontSize: "16px", fontWeight: 600, color: "#10b981" }}>{avgBorrowsPerBook}</span>
                            </div>
                            <div style={{ marginTop: "8px", height: "8px", backgroundColor: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                              <div
                                style={{
                                  width: `${ratio}%`,
                                  height: "100%",
                                  backgroundColor: "#3b82f6",
                                  transition: "width 0.3s",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {detailModal.type === "avg-duration-by-category" && (
                <div>
                  <div style={{ marginBottom: "20px", padding: "16px", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", borderRadius: "12px", color: "white" }}>
                    <div style={{ fontWeight: 700, fontSize: "18px", marginBottom: "6px" }}>📚 Kategori Bazında Ortalama Okunma Süresi</div>
                    <div style={{ fontSize: "14px", opacity: 0.95 }}>Aktif ödünçlere göre, her kategorideki kitapların ortalama kaç gündür ödünçte olduğunu gösterir.</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {avgDurationByCategory.map((cat, index) => {
                      const maxDuration = Math.max(...avgDurationByCategory.map(c => c.value));
                      const barWidth = maxDuration > 0 ? (cat.value / maxDuration) * 100 : 0;
                      return (
                        <div
                          key={index}
                          style={{
                            padding: "16px",
                            background: "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)",
                            borderRadius: "12px",
                            border: "2px solid #8b5cf6",
                            transition: "all 0.3s ease",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <div>
                              <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>{cat.label}</div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Kategori #{index + 1}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "32px", fontWeight: 700, color: "#8b5cf6" }}>{cat.value}</div>
                              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>gün ortalama</div>
                            </div>
                          </div>
                          <div style={{ position: "relative", height: "8px", backgroundColor: "#e9ecef", borderRadius: "4px", overflow: "hidden" }}>
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                height: "100%",
                                width: `${barWidth}%`,
                                background: "linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)",
                                borderRadius: "4px",
                                transition: "width 0.5s ease",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {detailModal.type === "late-rate-by-category" && (
                <div>
                  <div style={{ marginBottom: "20px", padding: "16px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", borderRadius: "12px", color: "white" }}>
                    <div style={{ fontWeight: 700, fontSize: "18px", marginBottom: "6px" }}>⚠️ Kategori Bazında Gecikme Oranı</div>
                    <div style={{ fontSize: "14px", opacity: 0.95 }}>Her kategorideki kitaplar için geçmiş ödünç kayıtlarında gecikme yüzdesi.</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {lateRateByCategory.map((cat, index) => {
                      const maxRate = Math.max(...lateRateByCategory.map(c => c.value));
                      const barWidth = maxRate > 0 ? (cat.value / maxRate) * 100 : 0;
                      return (
                        <div
                          key={index}
                          style={{
                            padding: "16px",
                            background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
                            borderRadius: "12px",
                            border: "2px solid #ef4444",
                            transition: "all 0.3s ease",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <div>
                              <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>{cat.label}</div>
                              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Kategori #{index + 1}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "32px", fontWeight: 700, color: "#ef4444" }}>%{cat.value}</div>
                              <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600 }}>gecikme oranı</div>
                            </div>
                          </div>
                          <div style={{ position: "relative", height: "8px", backgroundColor: "#fee2e2", borderRadius: "4px", overflow: "hidden" }}>
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                height: "100%",
                                width: `${barWidth}%`,
                                background: "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)",
                                borderRadius: "4px",
                                transition: "width 0.5s ease",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {detailModal.type === "least-read-categories" && (
                <div>
                  <div style={{ marginBottom: "20px", padding: "16px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", borderRadius: "12px", color: "white" }}>
                    <div style={{ fontWeight: 700, fontSize: "18px", marginBottom: "6px" }}>En Az Okunan Kategoriler</div>
                    <div style={{ fontSize: "14px", opacity: 0.95 }}>En az ödünç alınan kitap kategorileri (yüzde olarak).</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                    {leastReadCategories.map((cat, index) => (
                      <div
                        key={index}
                        style={{
                          padding: "20px",
                          background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
                          borderRadius: "12px",
                          border: "2px solid #f87171",
                          textAlign: "center",
                          transition: "all 0.3s ease",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-4px)";
                          e.currentTarget.style.boxShadow = "0 8px 16px rgba(239, 68, 68, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <div style={{ fontSize: "48px", fontWeight: 700, color: "#ef4444", marginBottom: "8px" }}>
                          %{cat.percentage}
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b" }}>{cat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailModal.type === "healthy-books" && (
                <BookList
                  books={books.filter(b => (b.healthyCount || 0) > 0)}
                  loans={loans}
                  onRefresh={() => { }}
                  onSearch={() => { }}
                  resetSearch={false}
                />
              )}

              {detailModal.type === "damaged-books" && (
                <BookList
                  books={books.filter(b => (b.damagedCount || 0) > 0)}
                  loans={loans}
                  onRefresh={() => { }}
                  onSearch={() => { }}
                  resetSearch={false}
                />
              )}

              {detailModal.type === "lost-books" && (
                <BookList
                  books={books.filter(b => (b.lostCount || 0) > 0)}
                  loans={loans}
                  onRefresh={() => { }}
                  onSearch={() => { }}
                  resetSearch={false}
                />
              )}

              {detailModal.type === "popular-books" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#fef3c7", borderRadius: "8px", border: "1px solid #f59e0b" }}>
                    <div style={{ fontWeight: 600, color: "#92400e", marginBottom: "4px" }}>Popüler Kitaplar (5+ Ödünç)</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "#d97706" }}>
                      {bookStats.filter(b => b.borrowed >= 5).length} kitap
                    </div>
                  </div>
                  <BookList
                    books={books.filter(book => {
                      const stats = bookStats.find(bs => bs.title === book.title && bs.author === book.author);
                      return stats && stats.borrowed >= 5;
                    }).sort((a, b) => {
                      const aStats = bookStats.find(bs => bs.title === a.title && bs.author === a.author);
                      const bStats = bookStats.find(bs => bs.title === b.title && bs.author === b.author);
                      return (bStats?.borrowed || 0) - (aStats?.borrowed || 0);
                    })}
                    loans={loans}
                    onRefresh={() => { }}
                    onSearch={() => { }}
                    resetSearch={false}
                  />
                </div>
              )}

              {detailModal.type === "least-read-books" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#fef2f2", borderRadius: "8px", border: "1px solid #ef4444" }}>
                    <div style={{ fontWeight: 600, color: "#991b1b", marginBottom: "4px" }}>En Az Okunan Kitaplar (1-2 Ödünç)</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "#dc2626" }}>
                      {bookStats.filter(b => b.borrowed > 0 && b.borrowed <= 2).length} kitap
                    </div>
                  </div>
                  <BookList
                    books={books.filter(book => {
                      const stats = bookStats.find(bs => bs.title === book.title && bs.author === book.author);
                      return stats && stats.borrowed > 0 && stats.borrowed <= 2;
                    }).sort((a, b) => {
                      const aStats = bookStats.find(bs => bs.title === a.title && bs.author === a.author);
                      const bStats = bookStats.find(bs => bs.title === b.title && bs.author === b.author);
                      return (aStats?.borrowed || 0) - (bStats?.borrowed || 0);
                    })}
                    loans={loans}
                    onRefresh={() => { }}
                    onSearch={() => { }}
                    resetSearch={false}
                  />
                </div>
              )}

              {detailModal.type === "long-books" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f0f9ff", borderRadius: "8px", border: "1px solid #3b82f6" }}>
                    <div style={{ fontWeight: 600, color: "#1e40af", marginBottom: "4px" }}>Uzun Kitaplar (200+ Sayfa)</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "#3b82f6" }}>
                      {books.filter(b => (b.pageCount || 0) >= 200).length} kitap
                    </div>
                  </div>
                  <BookList
                    books={books.filter(b => (b.pageCount || 0) >= 200).sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0))}
                    loans={loans}
                    onRefresh={() => { }}
                    onSearch={() => { }}
                    resetSearch={false}
                  />
                </div>
              )}

              {detailModal.type === "short-books" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#ecfdf5", borderRadius: "8px", border: "1px solid #10b981" }}>
                    <div style={{ fontWeight: 600, color: "#065f46", marginBottom: "4px" }}>Kısa Kitaplar (&lt;100 Sayfa)</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "#10b981" }}>
                      {books.filter(b => (b.pageCount || 0) > 0 && (b.pageCount || 0) < 100).length} kitap
                    </div>
                  </div>
                  <BookList
                    books={books.filter(b => (b.pageCount || 0) > 0 && (b.pageCount || 0) < 100).sort((a, b) => (a.pageCount || 0) - (b.pageCount || 0))}
                    loans={loans}
                    onRefresh={() => { }}
                    onSearch={() => { }}
                    resetSearch={false}
                  />
                </div>
              )}

              {detailModal.type === "page-stats" && (
                <div>
                  <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#fef9e7", borderRadius: "8px", border: "1px solid #fbbf24" }}>
                    <div style={{ fontWeight: 600, color: "#92400e", marginBottom: "8px" }}>Sayfa Sayısı İstatistikleri</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
                      <div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Ortalama</div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#d97706" }}>{avgPageCount}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Kısa (&lt;100)</div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#10b981" }}>
                          {books.filter(b => (b.pageCount || 0) > 0 && (b.pageCount || 0) < 100).length}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Orta (100-200)</div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#3b82f6" }}>
                          {books.filter(b => (b.pageCount || 0) >= 100 && (b.pageCount || 0) < 200).length}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>Uzun (200+)</div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#8b5cf6" }}>
                          {books.filter(b => (b.pageCount || 0) >= 200).length}
                        </div>
                      </div>
                    </div>
                  </div>
                  <BookList
                    books={books.filter(b => (b.pageCount || 0) > 0).sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0))}
                    loans={loans}
                    onRefresh={() => { }}
                    onSearch={() => { }}
                    resetSearch={false}
                  />
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      }
    </div >
  );
};

export default StatsCharts;
