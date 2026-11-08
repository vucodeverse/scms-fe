import { http } from "./client.js";
import { buildListParams, normalizePage } from "./paging.js";

// API chi nhánh (UC05) — /api/v1/branches, chỉ COO.
// Tạo mới dùng CreateBranchRequest (có code); sửa dùng
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
  detail(id) {
    return http.get(`/branches/${id}`);
  },
  create(payload) {
    return http.post("/branches", payload);
  },
  update(id, payload) {
    return http.put(`/branches/${id}`, payload);
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
