import { http } from "./client.js";

// API topping dùng chung (UC11) — /api/v1/toppings.
// Danh sách không phân trang (backend chủ đích trả hết cho dropdown chọn).
// payload: { name, defaultPrice (số nguyên VND), status: 'ACTIVE'|'INACTIVE' }
export const toppingsApi = {
  list() {
    return http.get("/toppings");
  },
  create(payload) {
    return http.post("/toppings", payload);
  },
  update(id, payload) {
    return http.put(`/toppings/${id}`, payload);
  },
  // Xoá mềm: chuyển INACTIVE (topping ngừng bán, không hiện trên POS).
  softDelete(id) {
    return http.delete(`/toppings/${id}`);
  },
  // Xoá cứng: backend gỡ topping khỏi mọi sản phẩm rồi xoá dòng.
  hardDelete(id) {
    return http.delete(`/toppings/${id}/permanent`);
  },
};
