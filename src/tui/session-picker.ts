export const RESUME_SESSION_PAGE_SIZE = 5;

export interface ResumeSessionPage<T> {
  items: readonly T[];
  pageIndex: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
}

export function resumeSessionPage<T>(
  items: readonly T[],
  pageIndex: number,
  pageSize = RESUME_SESSION_PAGE_SIZE,
): ResumeSessionPage<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const clampedPage = Math.max(0, Math.min(Math.floor(pageIndex), totalPages - 1));
  const startIndex = clampedPage * safePageSize;
  const endIndex = Math.min(items.length, startIndex + safePageSize);
  return {
    items: items.slice(startIndex, endIndex),
    pageIndex: clampedPage,
    totalPages,
    startIndex,
    endIndex,
    totalItems: items.length,
  };
}
