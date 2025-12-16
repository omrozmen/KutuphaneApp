export type UserResponse = {
  username: string;
  role: string;
  usedRecoveryCode?: boolean;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  category: string;
  quantity: number;
  totalQuantity: number;
  healthyCount: number;
  damagedCount: number;
  lostCount: number;
  loans: LoanEntry[];
  shelf?: string;
  publisher?: string;
  summary?: string;
  bookNumber?: number;
  year?: number;
  pageCount?: number;
};

export type LoanEntry = {
  borrower: string;
  dueDate: string;
  personel: string;
};

export type LoanInfo = {
  bookId: string;
  title: string;
  author: string;
  category: string;
  borrower: string;
  dueDate: string;
  remainingDays: number;
  personel?: string;
};

export type BookStat = {
  title: string;
  author: string;
  category: string;
  quantity: number;
  borrowed: number;
  returned: number;
  late: number;
};

export type StudentStat = {
  name: string;
  surname: string;
  borrowed: number;
  returned: number;
  late: number;
  class?: number;
  branch?: string;
  studentNumber?: number;
  penaltyPoints?: number;
  isBanned?: boolean;
};

export type StudentHistoryEntry = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCategory?: string;
  borrowedAt: string;
  dueDate: string;
  returnedAt?: string;
  wasLate: boolean;
  lateDays: number;
  borrowPersonel: string;
  returnPersonel?: string;
  durationDays?: number;
  status: string;
  loanDays: number;
  studentNumber?: number;
};

export type StudentBookSummary = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCategory?: string;
  borrowCount: number;
  returnCount: number;
  lateCount: number;
  averageReturnDays?: number;
  totalLateDays: number;
  lastBorrowedAt: string;
};

export type StudentHistoryResponse = {
  name: string;
  surname: string;
  totalBorrowed: number;
  totalReturned: number;
  activeLoans: number;
  lateReturns: number;
  books: StudentBookSummary[];
  entries: StudentHistoryEntry[];
};

export type BookHistoryEntry = {
  bookId: string;
  title: string;
  author: string;
  category?: string;
  borrower: string;
  studentNumber?: number;
  borrowedAt: string;
  dueDate: string;
  returnedAt?: string;
  wasLate: boolean;
  lateDays: number;
  borrowPersonel: string;
  returnPersonel?: string;
  loanDays: number;
  durationDays?: number;
  status: string;
};

export type BookBorrowerSummary = {
  borrower: string;
  studentNumber?: number;
  borrowCount: number;
  returnCount: number;
  lateCount: number;
  lastBorrowedAt?: string;
  averageReturnDays?: number;
};

export type BookHistoryResponse = {
  bookId: string;
  title: string;
  author: string;
  category?: string;
  totalBorrowed: number;
  totalReturned: number;
  activeLoans: number;
  lateReturns: number;
  borrowers: BookBorrowerSummary[];
  entries: BookHistoryEntry[];
};

export type LogRecord = {
  timestamp: string;
  action: string;
  filePath: string;
  dataType: string;
  personelName: string;
  recordCount: number;
  details?: string;
};
