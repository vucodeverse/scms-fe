import { http } from "./client.js";

// API Đồng bộ cấu hình toàn chuỗi (UC14) — /api/v1/chain-sync.
export const syncConfigApi = {
  // Lấy toàn bộ dữ liệu cấu hình chuỗi sẵn sàng đồng bộ (chi nhánh, danh mục, món ăn kèm size & voucher)
  getPreview() {
    return http.get("/chain-sync/preview");
  },
  // Lấy danh sách món ăn & bảng giá phục vụ chọn món đồng bộ
  getProducts() {
    return http.get("/chain-sync/products");
  },
  // Phát lệnh đồng bộ xuống các chi nhánh mục tiêu
  // payload: { targetBranchIds, syncCategories, syncProducts, syncVouchers, categoryIds, productIds, voucherIds }
  syncToBranches(payload) {
    return http.post("/chain-sync", payload);
  },
};
