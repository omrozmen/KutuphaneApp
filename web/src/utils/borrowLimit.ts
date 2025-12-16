import { Book, LoanInfo, StudentStat } from "../api/types";

const normalizeName = (value?: string | number | null): string => {
  if (value === undefined || value === null) return "";
  return value
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
};

const buildCandidateNames = (
  studentFullName: string,
  studentData?: StudentStat | null
): Set<string> => {
  const candidates = new Set<string>();
  const normalizedFullName = normalizeName(studentFullName);
  if (normalizedFullName) {
    candidates.add(normalizedFullName);
  }

  if (studentData) {
    if (studentData.name) {
      candidates.add(normalizeName(studentData.name));
    }
    if (studentData.surname) {
      candidates.add(normalizeName(studentData.surname));
    }
    const combined = normalizeName(
      `${studentData.name ?? ""} ${studentData.surname ?? ""}`
    );
    if (combined) {
      candidates.add(combined);
    }
  }

  return candidates;
};

const filterValidLoans = (
  loans: LoanInfo[] = [],
  books: Book[] = [],
  candidates: Set<string>
): LoanInfo[] => {
  if (loans.length === 0 || candidates.size === 0) return [];

  const bookIds =
    books.length > 0
      ? new Set((books.map((book) => book.id).filter(Boolean) as string[]))
      : null;

  return loans.filter((loan) => {
    if (!loan.borrower) return false;
    const borrower = normalizeName(loan.borrower);
    if (!candidates.has(borrower)) return false;
    if (!bookIds || !loan.bookId) return true;
    return bookIds.has(loan.bookId);
  });
};

export type BorrowLimitCheckResult = {
  activeLoanCount: number;
  totalAfterBorrow: number;
  exceedsLimit: boolean;
  excessCount: number;
  matchedLoans: LoanInfo[];
};

type BorrowLimitCheckParams = {
  studentFullName: string;
  studentData?: StudentStat | null;
  loans?: LoanInfo[];
  books?: Book[];
  booksToBorrowCount: number;
  maxBorrowLimit: number;
};

export type BorrowSelectionResult = {
  availableBooks: Book[];
  alreadyBorrowedBooks: Book[];
};

type BorrowSelectionParams = {
  booksToBorrow: Array<Book | null | undefined>;
  loans?: LoanInfo[];
  studentFullName: string;
  studentData?: StudentStat | null;
};

const isBorrowable = (book?: Book | null): book is Book => {
  if (!book) return false;
  const quantity = book.quantity ?? 0;
  const healthy = book.healthyCount ?? quantity;
  return quantity > 0 && healthy > 0;
};

export const evaluateBorrowLimit = ({
  studentFullName,
  studentData,
  loans = [],
  books = [],
  booksToBorrowCount,
  maxBorrowLimit,
}: BorrowLimitCheckParams): BorrowLimitCheckResult => {
  const candidates = buildCandidateNames(studentFullName, studentData);
  const matchedLoans = filterValidLoans(loans, books, candidates);
  const normalizedBooksToBorrow = Math.max(booksToBorrowCount, 0);
  const normalizedLimit = Math.max(maxBorrowLimit, 0);

  // Limit hesabı sadece aktif ödünç kayıtlarından yapılmalıdır.
  // `borrowed/returned` istatistiği öğrencinin geçmiş toplamlarıdır; limit kontrolünde kullanılmaz.
  const activeLoanCount = matchedLoans.length;
  const totalAfterBorrow = activeLoanCount + normalizedBooksToBorrow;
  const exceedsLimit = totalAfterBorrow > normalizedLimit;
  const excessCount = exceedsLimit ? totalAfterBorrow - normalizedLimit : 0;

  return {
    activeLoanCount,
    totalAfterBorrow,
    exceedsLimit,
    excessCount,
    matchedLoans,
  };
};

export const evaluateBorrowSelection = ({
  booksToBorrow,
  loans = [],
  studentFullName,
  studentData,
}: BorrowSelectionParams): BorrowSelectionResult => {
  const availableBooks: Book[] = [];
  const alreadyBorrowedBooks: Book[] = [];
  if (!booksToBorrow || booksToBorrow.length === 0) {
    return { availableBooks, alreadyBorrowedBooks };
  }

  const candidates = buildCandidateNames(studentFullName, studentData);
  const borrowedBookIds = new Set(
    loans
      .filter((loan) => loan.bookId && loan.borrower && candidates.has(normalizeName(loan.borrower)))
      .map((loan) => loan.bookId as string)
  );

  booksToBorrow.forEach((book) => {
    if (!isBorrowable(book)) return;
    if (book.id && borrowedBookIds.has(book.id)) {
      alreadyBorrowedBooks.push(book);
    } else {
      availableBooks.push(book);
    }
  });

  return { availableBooks, alreadyBorrowedBooks };
};
