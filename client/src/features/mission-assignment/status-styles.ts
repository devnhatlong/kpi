import type { AssignmentStatus } from "./types";

export function assignmentStatusBadgeClass(status: AssignmentStatus): string {
  switch (status) {
    case "ASSIGNED":
      return "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300";
    case "IN_PROGRESS":
      return "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
    case "SUBMITTED":
      return "border-transparent bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300";
    case "APPROVED":
      return "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";
    case "REJECTED":
      return "border-transparent bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300";
    default:
      return "";
  }
}
