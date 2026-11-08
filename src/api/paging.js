// Hỗ trợ danh sách phân trang khớp backend scms-be:
// - Request: page BẮT ĐẦU TỪ 1 (backend tự quy đổi sang Spring 0-based —
//   xem PageQueryDefaults của backend: "FE gửi 1, Spring đếm từ 0"),
//   size, sortBy, sortDir + các filter riêng.
// - Response PageResponse: { content, page, size, totalElements, totalPages }.

// uiPage bắt đầu từ 1 — trùng với page của backend nên không quy đổi.
export function buildListParams({ uiPage = 1, size = 20, sortBy, sortDir, filters = {} }) {
  const params = { page: Math.max(1, uiPage), size };
  if (sortBy) {
    params.sortBy = sortBy;
    params.sortDir = (sortDir || "ASC").toUpperCase(); // enum backend: ASC | DESC
  }
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params[key] = value;
  }
  return params;
}

// Chuẩn hoá PageResponse về dạng UI dùng chung.
export function normalizePage(pageResponse) {
  if (!pageResponse) return { items: [], uiPage: 1, size: 20, totalItems: 0, totalPages: 0 };
  return {
    items: pageResponse.content || [],
    uiPage: pageResponse.page ?? 1,
    size: pageResponse.size ?? 20,
    totalItems: pageResponse.totalElements ?? 0,
    totalPages: pageResponse.totalPages ?? 0,
  };
}
