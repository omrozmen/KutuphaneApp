import { LoanInfo, Book } from "../api/types";

type Props = {
    loan: LoanInfo;
    book?: Book | null;
    onReturn?: (bookId: string, borrowerName: string, bookTitle: string) => void;
    showReturnButton?: boolean;
    onClick?: () => void;
    loading?: boolean;
};

const LoanCard = ({
    loan,
    book,
    onReturn,
    showReturnButton = true,
    onClick,
    loading = false,
}: Props) => {
    // Calculate remaining days
    const getDaysDiff = (dueDateStr: string | Date) => {
        const dueDate = new Date(dueDateStr);
        dueDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const remainingDays = getDaysDiff(loan.dueDate);
    const isLate = remainingDays < 0;
    const isWarning = remainingDays >= 0 && remainingDays <= 3;
    const dueDate = new Date(loan.dueDate);

    // Get book title - from book object or loan object
    const bookTitle = book?.title || loan.title;

    return (
        <div
            onClick={onClick}
            style={{
                padding: "10px 14px",
                backgroundColor: "#fff",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: onClick ? "pointer" : "default",
                transition: "all 0.15s",
                gap: "12px",
            }}
            onMouseEnter={(e) => {
                if (onClick) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.08)";
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.backgroundColor = "#f8fafc";
                }
            }}
            onMouseLeave={(e) => {
                if (onClick) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.backgroundColor = "#fff";
                }
            }}
        >
            {/* Left: Book and Student Info */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontWeight: 600,
                        fontSize: "13px",
                        color: "#1e293b",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                    }}>
                        {bookTitle}
                    </div>
                    <div style={{
                        fontSize: "12px",
                        color: "#64748b",
                        marginTop: "2px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                    }}>
                        <span>{loan.borrower}</span>
                        <span style={{ color: "#cbd5e1" }}>•</span>
                        <span>{dueDate.toLocaleDateString("tr-TR")}</span>
                    </div>
                </div>
            </div>

            {/* Right: Status Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <span
                    style={{
                        padding: "3px 10px",
                        borderRadius: "10px",
                        fontSize: "11px",
                        fontWeight: 600,
                        backgroundColor: isLate ? "#fee2e2" : isWarning ? "#fef3c7" : "#d1fae5",
                        color: isLate ? "#dc2626" : isWarning ? "#d97706" : "#059669",
                        whiteSpace: "nowrap",
                    }}
                >
                    {remainingDays < 0
                        ? `${Math.abs(remainingDays)} gün geçti`
                        : remainingDays === 0
                            ? "Bugün"
                            : `${remainingDays} gün`}
                </span>

                {showReturnButton && onReturn && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!loading && loan.bookId) {
                                onReturn(loan.bookId, loan.borrower, bookTitle);
                            }
                        }}
                        disabled={loading}
                        style={{
                            padding: "6px 12px",
                            backgroundColor: isLate ? "#ef4444" : isWarning ? "#f59e0b" : "#3b82f6",
                            color: "white",
                            border: "none",
                            borderRadius: "5px",
                            cursor: loading ? "not-allowed" : "pointer",
                            opacity: loading ? 0.7 : 1,
                            fontWeight: 600,
                            fontSize: "11px",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Teslim Al
                    </button>
                )}
            </div>
        </div>
    );
};

export default LoanCard;
