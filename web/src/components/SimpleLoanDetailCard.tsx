import { createPortal } from "react-dom";
import { LoanInfo, Book } from "../api/types";

type Props = {
    loan: LoanInfo | null;
    books: Book[];
    onClose: () => void;
    onReturn?: (loan: LoanInfo) => void;
};

const SimpleLoanDetailCard = ({ loan, books, onClose, onReturn }: Props) => {
    if (!loan) return null;

    const book = books.find((b) => b.id === loan.bookId);
    const isOverdue = new Date(loan.dueDate) < new Date();

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
                zIndex: 10009,
            }}
            onClick={onClose}
        >
            <div
                className="card"
                style={{
                    maxWidth: "500px",
                    width: "90%",
                    padding: "24px",
                    animation: "slideIn 0.3s ease-out",
                    backgroundColor: "white",
                    position: "relative",
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
                        color: "#9ca3af",
                    }}
                >
                    ×
                </button>

                <h3
                    style={{
                        margin: "0 0 20px 0",
                        fontSize: "20px",
                        fontWeight: 700,
                        color: "#1e293b",
                        borderBottom: "1px solid #e2e8f0",
                        paddingBottom: "12px",
                    }}
                >
                    Ödünç Detayı
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", gap: "16px" }}>
                        <div
                            style={{
                                width: "80px",
                                height: "120px",
                                backgroundColor: "#f1f5f9",
                                borderRadius: "8px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#cbd5e1",
                                flexShrink: 0,
                            }}
                        >
                            <svg
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                            </svg>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div
                                style={{
                                    fontSize: "13px",
                                    color: "#64748b",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                }}
                            >
                                KİTAP
                            </div>
                            <div
                                style={{
                                    fontSize: "16px",
                                    fontWeight: 700,
                                    color: "#1e293b",
                                    marginBottom: "8px",
                                }}
                            >
                                {book?.title || loan.title}
                            </div>
                            <div style={{ fontSize: "13px", color: "#64748b" }}>
                                {book?.author || loan.author}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            padding: "16px",
                            backgroundColor: "#f8fafc",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                        }}
                    >
                        <div
                            style={{
                                marginBottom: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                            }}
                        >
                            <div
                                style={{
                                    width: "32px",
                                    height: "32px",
                                    borderRadius: "50%",
                                    backgroundColor: "#e0f2fe",
                                    color: "#0284c7",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 600,
                                }}
                            >
                                {loan.borrower.charAt(0)}
                            </div>
                            <div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>ÖĞRENCİ</div>
                                <div style={{ fontWeight: 600, color: "#334155" }}>
                                    {loan.borrower}
                                </div>
                            </div>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <div>
                                <div style={{ fontSize: "12px", color: "#64748b" }}>TESLİM TARİHİ</div>
                                <div
                                    style={{
                                        fontWeight: 600,
                                        color: isOverdue ? "#dc2626" : "#374151",
                                    }}
                                >
                                    {new Date(loan.dueDate).toLocaleDateString("tr-TR")}
                                    {isOverdue && (
                                        <span
                                            style={{
                                                marginLeft: "8px",
                                                padding: "2px 6px",
                                                backgroundColor: "#fee2e2",
                                                color: "#ef4444",
                                                borderRadius: "4px",
                                                fontSize: "11px",
                                            }}
                                        >
                                            GECİKTİ
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {onReturn && (
                        <button
                            onClick={() => onReturn(loan)}
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
                                transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.backgroundColor = "#2563eb")
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.backgroundColor = "#3b82f6")
                            }
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="9 11 12 14 22 4"></polyline>
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                            </svg>
                            Teslim Al
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SimpleLoanDetailCard;
