import { http } from "./client.js";

// API kho (UC28–UC33) — /api/v1/inventory, /stock-transactions,
// /stocktake. Vai trò COO/BRANCH_MANAGER. Backend chưa có endpoint
// quản lý nguyên liệu (dữ liệu do seeder nạp) và chưa có endpoint
// tra cứu phiếu đã lập — phiếu chỉ tạo mới, kết quả lấy từ response.
export const inventoryApi = {
  // LƯU Ý: GET /inventory dùng phân trang 0-based kiểu Spring Pageable,
  // KHÁC phần còn lại của hệ thống (1-based). Adapter này nhận uiPage
  // 1-based như mọi màn hình khác và trừ 1 khi gọi backend.
  // -> PageResponse<IngredientStockDto>
  getStock({ branchId, keyword, uiPage = 1, size = 10 } = {}) {
    return http.get("/inventory", {
      params: { branchId, keyword, page: uiPage - 1, size },
    });
  },
  // -> LowStockAlertDto[]
  getLowStock(branchId) {
    return http.get("/inventory/low-stock", { params: { branchId } });
  },
  // payload: { source, supplierName, invoiceRef, notes,
  //   items: [{ ingredientId, cartons, looseUnits, purchasePrice, expiryDate }] }
  receive(payload) {
    return http.post("/stock-transactions/receive", payload);
  },
  // payload: { purpose, destinationBar, baristaName, notes,
  //   items: [{ ingredientId, quantityPacks }] }
  issue(payload) {
    return http.post("/stock-transactions/issue", payload);
  },
  // payload: { reasonCategory, reason, evidenceFileId,
  //   items: [{ ingredientId, quantityPacks, itemCause }] }
  dispose(payload) {
    return http.post("/stock-transactions/dispose", payload);
  },
  // payload?: { roundType, witnessName, notes }
  createStocktakeSession(payload) {
    return http.post("/stocktake/session", payload || {});
  },
  getActiveStocktake() {
    return http.get("/stocktake/active");
  },
  getStocktake(id) {
    return http.get(`/stocktake/${id}`);
  },
  // counts: [{ ingredientId, countedQuantity }] -> StocktakeReconciliationDto
  submitStocktakeCounts(id, counts) {
    return http.post(`/stocktake/${id}/adjust`, { counts });
  },
};
