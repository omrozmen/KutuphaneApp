import { Book, BookStat, LoanInfo, StudentStat } from "../api/types";
import StatsCharts from "./StatsCharts";

type Props = {
  books: Book[];
  bookStats: BookStat[];
  students: StudentStat[];
  loans: LoanInfo[];
  personelName: string;
};

const StatsPanel = ({ books, bookStats, students, loans, personelName }: Props) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <StatsCharts books={books} bookStats={bookStats} students={students} loans={loans} personelName={personelName} />
    </div>
  );
};

export default StatsPanel;
