import { http, publicHttp } from "./client.js";
import { buildListParams, normalizePage } from "./paging.js";

// API chi nhánh (UC05) — /api/v1/branches.
// GET /branches là permitAll ở backend (publicList dùng cho Kiosk không cần phiên);
// các thao tác CRUD còn lại chỉ dành cho COO.
// Tạo mới dùng CreateBranchRequest (có code, managerUserId tùy chọn); sửa dùng
// SaveBranchRequest (không có code — mã read-only sau khi tạo).
export const branchesApi = {
  async list({ uiPage = 1, size = 20, keyword, status, sortBy = "createdAt", sortDir = "DESC" } = {}) {
    const params = buildListParams({
      uiPage,
      size,
      sortBy,
      sortDir,
      filters: { keyword, status },
    });
    const page = await http.get("/branches", { params });
    return normalizePage(page);
  },
  async publicList({ uiPage = 1, size = 100, keyword, status, sortBy = "code", sortDir = "ASC" } = {}) {
    const params = buildListParams({
      uiPage,
      size,
      sortBy,
      sortDir,
      filters: { keyword, status },
    });
    const page = await publicHttp.get("/branches", { params });
    return normalizePage(page);
  },
  detail(id) {
    return http.get(`/branches/${id}`);
  },
  create(payload) {
    return http.post("/branches", payload);
  },
  update(id, payload) {
    return http.put(`/branches/${id}`, payload);
  },
  assignManager(id, managerUserId) {
    return http.put(`/branches/${id}/manager`, { managerUserId: managerUserId ?? null });
  },
  changeStatus(id, status) {
    return http.patch(`/branches/${id}/status`, { status });
  },
  // Xoá mềm: backend chuyển INACTIVE; chặn 422 BRANCH_NOT_EMPTY khi
  // chi nhánh còn nhân sự đang hoạt động.
  softDelete(id) {
    return http.delete(`/branches/${id}`);
  },
};
