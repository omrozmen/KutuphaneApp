export type StudentNameLike = {
  name?: string | null;
  surname?: string | null;
};

export function formatStudentFullName(student: StudentNameLike): string {
  const name = (student?.name ?? "").toString().trim();
  const surname = (student?.surname ?? "").toString().trim();
  return `${name} ${surname}`.replace(/\s+/g, " ").trim();
}


