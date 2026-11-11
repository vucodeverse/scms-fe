import { http } from "./client.js";

/**
 * API Quản lý Mặt hàng Nguyên vật liệu Kho Tổng (Master Ingredients)
 * Quyền: Chỉ COO có quyền Thêm/Sửa/Đổi trạng thái; các vai trò khác Read-only.
 */
export const ingredientApi = {
  /**
   * Danh sách nguyên vật liệu theo trạng thái.
   * @param {string} status 'ACTIVE' | 'INACTIVE' | 'ALL'
   */
  list(status = "ACTIVE") {
    const params = {};
    if (status) params.status = status;
    return http.get("/ingredients", { params });
  },

  /**
   * Lấy chi tiết một nguyên vật liệu theo ID.
   * @param {number|string} id
   */
  get(id) {
    return http.get(`/ingredients/${id}`);
  },

  /**
   * Tạo mới một mặt hàng nguyên vật liệu (Chỉ COO).
   * @param {{ name: string, baseUnit: string, packUnit: string, unitsPerPack: number, unitCost: number }} payload
   */
  create(payload) {
    return http.post("/ingredients", payload);
  },

  /**
   * Cập nhật thông tin mặt hàng nguyên vật liệu (Chỉ COO).
   * @param {number|string} id
   * @param {{ name: string, packUnit: string, unitsPerPack: number, unitCost: number, status?: string }} payload
   */
  update(id, payload) {
    return http.put(`/ingredients/${id}`, payload);
  },

  /**
   * Bật/Tắt trạng thái hoạt động (ACTIVE <-> INACTIVE) của nguyên vật liệu (Chỉ COO).
   * @param {number|string} id
   * @param {string} [status] 'ACTIVE' | 'INACTIVE' (nếu bỏ trống thì backend tự toggle đảo trạng thái)
   */
  toggleStatus(id, status) {
    const params = status ? { status } : undefined;
    return http.patch(`/ingredients/${id}/status`, null, { params });
  },
};

export default ingredientApi;
