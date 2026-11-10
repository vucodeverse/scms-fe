import { http } from "./client.js";
import { buildListParams, normalizePage } from "./paging.js";

// API sản phẩm (UC10) — /api/v1/products.
export const productsApi = {
  async list({ uiPage = 1, size = 20, keyword, categoryId, status } = {}) {
    const params = buildListParams({ uiPage, size, filters: { keyword, categoryId, status } });
    const page = await http.get("/products", { params });
    return normalizePage(page);
  },
  detail(id) {
    return http.get(`/products/${id}`);
  },
  // payload: { name, categoryId, description, imageUrl, defaultSize, status }
  create(payload) {
    return http.post("/products", payload);
  },
  update(id, payload) {
    return http.put(`/products/${id}`, payload);
  },
  // Backend không có PATCH status cho sản phẩm: xoá mềm = đặt INACTIVE.
  softDelete(id) {
    return http.delete(`/products/${id}`);
  },
  hardDelete(id) {
    return http.delete(`/products/${id}/permanent`);
  },
  // --- FE-09: size/giá + topping của sản phẩm (UC11) ---
  // Công thức (UC12, chỉ đọc): GET /products/{id}/recipe?size=S|M|L
  // -> { productId, productName, size, estimatedCogs, items: [{ ingredientId, ingredientName, baseUnit, quantityBase, unitCost, lineCost, size }] }
  recipe(id, size) {
    return http.get(`/products/${id}/recipe`, { params: size ? { size } : {} });
  },
  saveRecipe(id, payload) {
    return http.put(`/products/${id}/recipe`, payload);
  },
  deleteRecipe(id, size) {
    return http.delete(`/products/${id}/recipe`, { params: size ? { size } : {} });
  },
  listSizes(id) {
    return http.get(`/products/${id}/sizes`);
  },
  // Upsert theo size: { size: 'S'|'M'|'L', price: số nguyên VND 0..100.000.000 }
  upsertSize(id, payload) {
    return http.post(`/products/${id}/sizes`, payload);
  },
  // Xoá giá một size; backend trả 422 DEFAULT_SIZE_IN_USE nếu size đang
  // là size mặc định của sản phẩm.
  deleteSize(id, size) {
    return http.delete(`/products/${id}/sizes/${size}`);
  },
  // Thay toàn bộ topping áp dụng: items = [{ toppingId, extraPrice, isDefault }]
  replaceToppings(id, items) {
    return http.put(`/products/${id}/toppings`, { items });
  },
};
