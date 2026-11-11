import { http } from "./client.js";

// API kho (UC28–UC33, FEA-01, FEA-02) — /api/v1/inventory, /stock-transactions,
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
  // FEA-02: Xuất kho nội bộ ra Quầy Bar (Two-Party Transfer)
  // payload: { branchId, destination, baristaName, notes,
  //   items: [{ ingredientId, quantityPacks, looseUnits }] }
  issue(payload) {
    return http.post("/stock-transactions/issue", payload);
  },
  // FEA-04: Quản lý xuất hủy hàng hỏng & hết date (Waste Ticket)
  // payload: { branchId, reasonCode, explanation, evidenceImageUrl,
  //   items: [{ ingredientId, quantityBase }] }
  dispose(payload) {
    return http.post("/stock-transactions/dispose", payload);
  },
  // FEA-05: Mở phiên kiểm kê ca (Snapshot tồn sổ sách, bắt đầu kiểm kê mù)
  // payload?: { roundType, witnessName, notes }
  createStocktakeSession(payload) {
    return http.post("/stocktake/session", payload || {});
  },
  // FEA-05: Lấy phiên đang mở (Ẩn số liệu sổ sách bookQuantity = null để đếm mù)
  getActiveStocktake(branchId) {
    return http.get("/stocktake/active", { params: branchId ? { branchId } : {} });
  },
  getStocktake(id) {
    return http.get(`/stocktake/${id}`);
  },
  // FEA-05: Nộp số đếm thực tế 4 mắt & đối soát tự động
  // payload: { witnessName: "Nguyễn Văn Barista", counts: [{ ingredientId: 1, countedQuantity: 2450.0, notes?: "" }] }
  reconcileStocktake(id, payload) {
    return http.post(`/stocktake/${id}/reconcile`, payload);
  },
  // Legacy / Direct adjust (UC32)
  submitStocktakeCounts(id, counts) {
    return http.post(`/stocktake/${id}/adjust`, { counts });
  },

  // FEA-01: Đề xuất & Điều phối tiếp nhận hàng Đa Kho Tổng (Multi-Hub DC)
  // Bước 1: Quán lập đơn xin cấp hàng (PR)
  createRequisition(payload) {
    return http.post("/stock-transactions/requisition", payload);
  },
  // Bước 2: COO tra cứu danh sách đơn chờ duyệt kèm tồn 3 Hub
  getPendingRequisitions() {
    return http.get("/stock-transactions/requisitions/pending");
  },
  // Tra cứu đơn cấp hàng theo bộ lọc (status, branchId)
  getRequisitions(params) {
    return http.get("/stock-transactions/requisitions", { params });
  },
  // Bước 3: COO duyệt phân bổ
  approveRequisition(payload) {
    return http.post("/stock-transactions/requisition/approve", payload);
  },
  // COO từ chối cấp hàng
  rejectRequisition(id, reason) {
    return http.post(`/stock-transactions/requisition/${id}/reject`, null, { params: { reason } });
  },
};
