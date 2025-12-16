import React, { useState, useMemo } from 'react';
import { LoanInfo, Book } from '../api/types';

type Props = {
    loans: LoanInfo[];
    books: Book[];
    onLoanClick?: (loan: LoanInfo) => void;
};

const DashboardCalendar: React.FC<Props> = ({ loans, books, onLoanClick }) => {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    const today = new Date();
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();

    // Helper to get days in month
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => {
        const day = new Date(year, month, 1).getDay();
        return day === 0 ? 6 : day - 1; // Adjust for Monday start (0=Mon, 6=Sun)
    };

    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const startingDayOfWeek = getFirstDayOfMonth(currentYear, currentMonth);

    const turkishDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const monthNames = [
        "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
        "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
    ];

    // Group due dates by day
    const dueDatesByDay = useMemo(() => {
        const map = new Map<number, LoanInfo[]>();
        loans.forEach(loan => {
            const dueDate = new Date(loan.dueDate);
            if (dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear) {
                const day = dueDate.getDate();
                const list = map.get(day) || [];
                list.push(loan);
                map.set(day, list);
            }
        });
        return map;
    }, [loans, currentMonth, currentYear]);

    // Check for late books
    const isDateLate = (date: Date) => {
        const todayZero = new Date();
        todayZero.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        return checkDate < todayZero;
    };

    const handlePrevMonth = () => {
        setSelectedDate(new Date(currentYear, currentMonth - 1, 1));
    };

    const handleNextMonth = () => {
        setSelectedDate(new Date(currentYear, currentMonth + 1, 1));
    };

    const handleDateClick = (day: number) => {
        const newDate = new Date(currentYear, currentMonth, day);
        setSelectedDate(newDate);
    };

    // Get books for selected date
    const selectedDateLoans = useMemo(() => {
        const day = selectedDate.getDate();
        // Verify we are still looking at the same month/year in the calendar view
        if (selectedDate.getMonth() !== currentMonth || selectedDate.getFullYear() !== currentYear) {
            return [];
        }
        return dueDatesByDay.get(day) || [];
    }, [selectedDate, dueDatesByDay, currentMonth, currentYear]);

    return (
        <div
            className="card"
            style={{
                padding: "0",
                overflow: "hidden",
                display: "flex",
                flexDirection: "row",
                height: "500px",
                transition: "transform 0.2s, box-shadow 0.2s",
                cursor: "default"
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.01)";
                e.currentTarget.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "";
            }}
        >
            {/* Left Side: Calendar */}
            <div style={{ flex: 1, padding: "24px", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        {monthNames[currentMonth]} {currentYear}
                    </h3>
                    <div style={{ display: "flex", gap: "4px" }}>
                        <button onClick={handlePrevMonth} style={{ padding: "4px 8px", background: "none", border: "1px solid #e2e8f0", borderRadius: "4px", cursor: "pointer" }}>&lt;</button>
                        <button onClick={() => setSelectedDate(new Date())} style={{ padding: "4px 8px", background: "none", border: "1px solid #e2e8f0", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>Bugün</button>
                        <button onClick={handleNextMonth} style={{ padding: "4px 8px", background: "none", border: "1px solid #e2e8f0", borderRadius: "4px", cursor: "pointer" }}>&gt;</button>
                    </div>
                </div>

                {/* Days Header */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "8px" }}>
                    {turkishDays.map(day => (
                        <div key={day} style={{ textAlign: "center", fontWeight: 600, color: "#94a3b8", fontSize: "12px" }}>
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", flex: 1 }}>
                    {/* Empty cells for start of month */}
                    {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                        <div key={`empty - ${i} `} style={{ aspectRatio: "1" }}></div>
                    ))}

                    {/* Days */}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                        const date = new Date(currentYear, currentMonth, day);
                        const isToday = date.toDateString() === today.toDateString();
                        const isSelected = date.toDateString() === selectedDate.toDateString();
                        const loansForDay = dueDatesByDay.get(day) || [];
                        const hasDue = loansForDay.length > 0;
                        const isLate = isDateLate(date);

                        return (
                            <div
                                key={day}
                                onClick={() => handleDateClick(day)}
                                style={{
                                    aspectRatio: "1",
                                    borderRadius: "8px",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    position: "relative",
                                    backgroundColor: isSelected ? "#3b82f6" : isToday ? "#eff6ff" : "transparent",
                                    color: isSelected ? "white" : isToday ? "#3b82f6" : "#1e293b",
                                    border: isToday && !isSelected ? "1px solid #3b82f6" : "1px solid transparent",
                                    transition: "all 0.2s"
                                }}
                            >
                                <span style={{ fontWeight: isSelected || isToday ? 700 : 500, fontSize: "14px" }}>{day}</span>

                                {/* Dots indicator */}
                                {hasDue && (
                                    <div style={{ display: "flex", gap: "2px", marginTop: "2px" }}>
                                        <div style={{
                                            width: "4px",
                                            height: "4px",
                                            borderRadius: "50%",
                                            backgroundColor: isSelected ? "white" : isLate ? "#ef4444" : "#3b82f6"
                                        }}></div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Legend */}
                <div style={{ display: "flex", gap: "12px", marginTop: "16px", fontSize: "11px", color: "#64748b", justifyContent: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#3b82f6" }}></div>
                        <span>Teslim (Normal)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#ef4444" }}></div>
                        <span>Teslim (Gecikmiş)</span>
                    </div>
                </div>
            </div>

            {/* Right Side: Details List */}
            <div style={{ width: "350px", background: "#f8fafc", padding: "24px", display: "flex", flexDirection: "column", borderLeft: "1px solid #e2e8f0" }}>
                <h4 style={{ margin: "0 0 16px 0", color: "#1e293b", fontSize: "16px", fontWeight: 700, borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", flexShrink: 0 }}>
                    {selectedDate.getDate()} {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                    <span style={{ display: "block", fontSize: "12px", color: "#64748b", fontWeight: 400, marginTop: "4px" }}>
                        Teslim Edilmesi Gereken Kitaplar
                    </span>
                </h4>

                <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
                    {selectedDateLoans.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {selectedDateLoans.map((loan, idx) => {
                                const book = books.find(b => b.id === loan.bookId);
                                const isLate = isDateLate(new Date(loan.dueDate));
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => onLoanClick && onLoanClick(loan)}
                                        style={{
                                            padding: "16px",
                                            background: "white",
                                            borderRadius: "12px",
                                            border: "1px solid",
                                            borderColor: isLate ? "#fca5a5" : "#e2e8f0",
                                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                                            cursor: "pointer",
                                            transition: "all 0.2s",
                                            position: "relative",
                                            overflow: "hidden"
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = "translateY(-2px)";
                                            e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
                                            e.currentTarget.style.borderColor = "#3b82f6";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = "translateY(0)";
                                            e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                                            e.currentTarget.style.borderColor = isLate ? "#fca5a5" : "#e2e8f0";
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "15px", marginBottom: "8px", lineHeight: "1.4" }}>
                                            {book?.title || loan.title}
                                        </div>
                                        <div style={{ fontSize: "13px", color: "#64748b", display: "flex", flexDirection: "column", gap: "4px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#e0f2fe", color: "#0ea5e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px" }}>👤</span>
                                                <span style={{ fontWeight: 500 }}>{loan.borrower}</span>
                                            </div>
                                        </div>
                                        {isLate && (
                                            <div style={{
                                                marginTop: "12px",
                                                paddingTop: "12px",
                                                borderTop: "1px dashed #fee2e2",
                                                fontSize: "12px",
                                                color: "#ef4444",
                                                fontWeight: 600,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "4px"
                                            }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                                </svg>
                                                Teslim Tarihi Gecikti
                                            </div>
                                        )}
                                        <div style={{
                                            position: "absolute",
                                            top: "12px",
                                            right: "12px",
                                            opacity: 0.5
                                        }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", color: "#94a3b8", marginTop: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                            <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                            </div>
                            <p style={{ margin: 0, fontSize: "14px" }}>Bu tarihte teslim edilecek kitap yok.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardCalendar;
