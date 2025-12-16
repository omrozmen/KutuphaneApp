import { createPortal } from "react-dom";
import { LoanInfo, Book, StudentStat } from "../api/types";

type Props = {
    bookId: string | null;
    loans: LoanInfo[];
    books: Book[];
    students: StudentStat[];
    maxPenaltyPoints?: number;
    onClose: () => void;
    onStudentClick?: (student: StudentStat) => void;
    onBookCatalogClick?: (book: Book) => void;
    onActionClick?: (loan: LoanInfo) => void;
    getDaysDiff?: (dueDate: string) => number;
};

const LoanDetailModal = ({
    bookId,
    loans,
    books,
    students,
    maxPenaltyPoints = 100,
    onClose,
    onStudentClick,
    onBookCatalogClick,
    onActionClick,
    getDaysDiff = (dueDate: string) => {
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffTime = due.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },
}: Props) => {
    if (!bookId) return null;

    const bookLoans = loans.filter((l) => l.bookId === bookId);
    if (bookLoans.length === 0) return null;

    const firstLoan = bookLoans[0];
    const book = books.find((b) => b.id === bookId);
    const totalQuantity = book ? (book.totalQuantity || book.quantity || 0) : 0;
    const availableQuantity = totalQuantity - bookLoans.length;

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
            onClick={onClose}
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
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "24px",
                    }}
                >
                    <h2 style={{ margin: 0 }}>Ödünç Listesi Detayı</h2>
                    <button
                        onClick={onClose}
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

                <div>
                    <div
                        onClick={() => {
                            if (book && onBookCatalogClick) {
                                onBookCatalogClick(book);
                            }
                        }}
                        style={{
                            marginBottom: "20px",
                            padding: "16px",
                            backgroundColor: "#f8fafc",
                            borderRadius: "8px",
                            cursor: book && onBookCatalogClick ? "pointer" : "default",
                            transition: "all 0.2s",
                        }}
                        onMouseEnter={(e) => {
                            if (book && onBookCatalogClick) {
                                e.currentTarget.style.backgroundColor = "#f0f9ff";
                                e.currentTarget.style.border = "1px solid #3b82f6";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (book && onBookCatalogClick) {
                                e.currentTarget.style.backgroundColor = "#f8fafc";
                                e.currentTarget.style.border = "none";
                            }
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 600,
                                fontSize: "18px",
                                marginBottom: "12px",
                                color: "#1e293b",
                            }}
                        >
                            {firstLoan.title}
                        </div>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, 1fr)",
                                gap: "12px",
                                marginBottom: "12px",
                            }}
                        >
                            <div>
                                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                    Yazar
                                </div>
                                <div style={{ fontWeight: 500, color: "#334155" }}>
                                    {firstLoan.author || "—"}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                    Kategori
                                </div>
                                <div style={{ fontWeight: 500, color: "#334155" }}>
                                    {firstLoan.category || "—"}
                                </div>
                            </div>
                            {book && (
                                <>
                                    {book.publisher && (
                                        <div>
                                            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                                Yayınevi
                                            </div>
                                            <div style={{ fontWeight: 500, color: "#334155" }}>
                                                {book.publisher}
                                            </div>
                                        </div>
                                    )}
                                    {book.year && (
                                        <div>
                                            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                                Yayın Yılı
                                            </div>
                                            <div style={{ fontWeight: 500, color: "#334155" }}>{book.year}</div>
                                        </div>
                                    )}
                                    {book.shelf && (
                                        <div>
                                            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                                Raf
                                            </div>
                                            <div style={{ fontWeight: 500, color: "#334155" }}>{book.shelf}</div>
                                        </div>
                                    )}
                                    {book.bookNumber && (
                                        <div>
                                            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                                Kitap Numarası
                                            </div>
                                            <div style={{ fontWeight: 500, color: "#334155" }}>
                                                {book.bookNumber}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div
                            style={{
                                marginTop: "12px",
                                paddingTop: "12px",
                                borderTop: "1px solid #e2e8f0",
                            }}
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, 1fr)",
                                    gap: "12px",
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                        Toplam Adet
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b" }}>
                                        {totalQuantity}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                        Ödünçte
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: "16px", color: "#1e293b" }}>
                                        {bookLoans.length} adet
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
                                        Mevcut
                                    </div>
                                    <div
                                        style={{
                                            fontWeight: 600,
                                            fontSize: "16px",
                                            color: availableQuantity <= 0 ? "#dc2626" : "#059669",
                                        }}
                                    >
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
                                    return getDaysDiff(a.dueDate) - getDaysDiff(b.dueDate);
                                })
                                .map((loan, index) => {
                                    const diff = getDaysDiff(loan.dueDate);
                                    const isLate = diff < 0;
                                    const remainingDays = diff;
                                    const isWarning = !isLate && remainingDays >= 0 && remainingDays <= 3;
                                    const student = students.find(
                                        (s) =>
                                            s.name === loan.borrower ||
                                            `${s.name} ${s.surname}`.trim() === loan.borrower ||
                                            s.surname === loan.borrower
                                    );

                                    return (
                                        <div
                                            key={`${loan.bookId}-${loan.borrower}-${index}`}
                                            onClick={() => {
                                                if (onStudentClick) {
                                                    // Öğrenci nesnesini bul veya oluştur
                                                    const foundStudent = students.find(
                                                        (s) =>
                                                            s.name === loan.borrower ||
                                                            `${s.name} ${s.surname}`.trim() === loan.borrower ||
                                                            s.surname === loan.borrower
                                                    );

                                                    if (foundStudent) {
                                                        onStudentClick(foundStudent);
                                                    } else {
                                                        // Eğer tam eşleşme bulunamazsa loan.borrower isminden geçici nesne oluştur
                                                        onStudentClick({
                                                            name: loan.borrower,
                                                            surname: "",
                                                            studentNumber: 0,
                                                            class: 0,
                                                            branch: "",
                                                            borrowed: 0,
                                                            returned: 0,
                                                            late: 0,
                                                            penaltyPoints: 0,
                                                            isBanned: false,
                                                        });
                                                    }
                                                }
                                            }}
                                            style={{
                                                padding: "12px",
                                                backgroundColor: "#f8fafc",
                                                borderRadius: "8px",
                                                border: "1px solid #e2e8f0",
                                                cursor: onStudentClick ? "pointer" : "default",
                                                transition: "all 0.2s",
                                            }}
                                            onMouseEnter={(e) => {
                                                if (onStudentClick) {
                                                    e.currentTarget.style.backgroundColor = "#f0f9ff";
                                                    e.currentTarget.style.borderColor = "#3b82f6";
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (onStudentClick) {
                                                    e.currentTarget.style.backgroundColor = "#f8fafc";
                                                    e.currentTarget.style.borderColor = "#e2e8f0";
                                                }
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    <div
                                                        style={{
                                                            fontWeight: 700,
                                                            marginBottom: "8px",
                                                            fontSize: "16px",
                                                            color: "#1e293b",
                                                        }}
                                                    >
                                                        {loan.borrower}
                                                    </div>
                                                    {student && (
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                flexDirection: "column",
                                                                gap: "4px",
                                                                marginBottom: "8px",
                                                            }}
                                                        >
                                                            {student.studentNumber && (
                                                                <div style={{ fontSize: "13px", color: "#64748b" }}>
                                                                    <strong>Numara:</strong> {student.studentNumber}
                                                                </div>
                                                            )}
                                                            {(student.class || student.branch) && (
                                                                <div style={{ fontSize: "13px", color: "#64748b" }}>
                                                                    <strong>Sınıf/Şube:</strong>{" "}
                                                                    {student.class ? `${student.class}` : "—"}
                                                                    {student.branch ? `/${student.branch}` : ""}
                                                                </div>
                                                            )}
                                                            {(() => {
                                                                const penaltyPoints = student.penaltyPoints || 0;
                                                                return (
                                                                    penaltyPoints > 0 && (
                                                                        <div
                                                                            style={{
                                                                                fontSize: "13px",
                                                                                color:
                                                                                    penaltyPoints >= maxPenaltyPoints
                                                                                        ? "#ef4444"
                                                                                        : "#f59e0b",
                                                                            }}
                                                                        >
                                                                            <strong>Ceza Puanı:</strong> {penaltyPoints}
                                                                        </div>
                                                                    )
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                    <div
                                                        style={{
                                                            fontSize: "12px",
                                                            color: "#64748b",
                                                            marginBottom: "4px",
                                                        }}
                                                    >
                                                        <strong>Teslim Tarihi:</strong>{" "}
                                                        {new Date(loan.dueDate).toLocaleDateString("tr-TR", {
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
                                                <div
                                                    style={{ display: "flex", alignItems: "center", gap: "12px" }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div
                                                        style={{
                                                            padding: "4px 12px",
                                                            borderRadius: "12px",
                                                            fontSize: "12px",
                                                            fontWeight: 600,
                                                            backgroundColor: isLate
                                                                ? "#fee2e2"
                                                                : isWarning
                                                                    ? "#fef3c7"
                                                                    : "#d1fae5",
                                                            color: isLate
                                                                ? "#dc2626"
                                                                : isWarning
                                                                    ? "#d97706"
                                                                    : "#059669",
                                                        }}
                                                    >
                                                        {isLate
                                                            ? "Süresi Doldu"
                                                            : remainingDays === 0
                                                                ? "Bugün Son Gün"
                                                                : `${remainingDays} gün kaldı`}
                                                    </div>
                                                    {onActionClick && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onActionClick(loan);
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
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default LoanDetailModal;
