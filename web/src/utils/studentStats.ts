import { StudentStat } from "../api/types";

/**
 * Öğrenci istatistikleri backend'deki kalıcı sayaçlardan gelir.
 * Burada sadece negatif değerleri sıfıra çekeriz ve eksik kayıtlar için
 * aktif + iade toplamını yedek olarak kullanırız.
 */
export const normalizeStudentCounters = (
  student?: StudentStat | null,
  activeLoans: number = 0,
) => {
  const safeActiveLoans = Math.max(activeLoans ?? 0, 0);
  const reportedReturned = Math.max(student?.returned ?? 0, 0);
  const backendBorrowed = Math.max(student?.borrowed ?? 0, 0);
  const derivedBorrowed = reportedReturned + safeActiveLoans;
  const reportedBorrowed = Math.max(backendBorrowed, derivedBorrowed);

  return {
    borrowed: reportedBorrowed,
    returned: reportedReturned,
  };
};
