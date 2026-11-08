import { http } from "./client.js";
import { buildListParams, normalizePage } from "./paging.js";

// API voucher (UC13) — /api/v1/vouchers, chỉ COO.
// payload: { code, discountType: 'PERCENT'|'FIXED', discountValue,
//   minOrderAmount, startDate, endDate (ISO instant), usageLimit (null =
//   không giới hạn), status: 'ACTIVE'|'INACTIVE', productIds, categoryIds }
export const vouchersApi = {
  async list({ uiPage = 1, size = 20, keyword, status } = {}) {
    const params = buildListParams({
      uiPage,
      size,
      sortBy: "createdAt",
      sortDir: "DESC",
      filters: { keyword, status },
    });
    const page = await http.get("/vouchers", { params });
    return normalizePage(page);
  },
  detail(id) {
    return http.get(`/vouchers/${id}`);
  },
  create(payload) {
    return http.post("/vouchers", payload);
  },
  update(id, payload) {
    return http.put(`/vouchers/${id}`, payload);
  },
  // Đổi trạng thái qua endpoint riêng PATCH /vouchers/{id}/status.
  changeStatus(id, status) {
    return http.patch(`/vouchers/${id}/status`, { status });
  },
  // Xoá mềm: chuyển INACTIVE.
  softDelete(id) {
    return http.delete(`/vouchers/${id}`);
  },
  // Xoá cứng: backend chặn 422 VOUCHER_IN_USE khi voucher đã có lượt dùng.
  hardDelete(id) {
    return http.delete(`/vouchers/${id}/permanent`);
  },
};
