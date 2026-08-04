export function paginationPage(value: string | undefined, totalItems: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requestedPage = /^\d+$/.test(value ?? "") ? Number(value) : 1;
  return Math.min(Math.max(requestedPage, 1), totalPages);
}
