import { http } from "./client.js";
import { buildListParams, normalizePage } from "./paging.js";

// API danh mục menu (UC09) — /api/v1/menu-categories.
// Danh mục hệ thống UNCAT không xuất hiện trong danh sách quản lý.
export const categoriesApi = {
  async list({ uiPage = 1, size = 20, keyword, status } = {}) {
    const params = buildListParams({
      uiPage,
      size,
      sortBy: "sortOrder",
      sortDir: "ASC",
      filters: { keyword, status },
    });
    const page = await http.get("/menu-categories", { params });
    return normalizePage(page);
  },
  // Toàn bộ danh mục (tối đa 100) — dùng khi tính lại thứ tự hiển thị.
  async listAll() {
    const page = await http.get("/menu-categories", {
      params: buildListParams({ uiPage: 1, size: 100, sortBy: "sortOrder", sortDir: "ASC" }),
    });
    return normalizePage(page).items;
  },
  // LƯU Ý: DTO chi tiết của backend (CategoryDetailDto) chỉ có
  // { id, code, name, description, sortOrder, systemCategory,
  // products } — KHÔNG có status/productCount/createdAt/updatedAt.
  // Màn hình cần các trường đó thì lấy dòng từ list/listAll.
  detail(id) {
    return http.get(`/menu-categories/${id}`);
  },
  // payload: { name, description, sortOrder, status } — mã do backend sinh.
  // Không gửi productIds: backend giữ nguyên gán sản phẩm hiện có khi sửa.
  create(payload) {
    return http.post("/menu-categories", payload);
  },
  update(id, payload) {
    return http.put(`/menu-categories/${id}`, payload);
  },
  changeStatus(id, status) {
    return http.patch(`/menu-categories/${id}/status`, { status });
  },
  softDelete(id) {
    return http.delete(`/menu-categories/${id}`);
  },
  hardDelete(id) {
    return http.delete(`/menu-categories/${id}/permanent`);
  },
  // items: [{ categoryId, sortOrder }]
  reorder(items) {
    return http.put("/menu-categories/sequence", { items });
  },
};
