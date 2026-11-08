import { http } from "./client.js";

// API đơn hàng (UC16–UC18) — /api/v1/orders.
// Tạo đơn: backend tính lại tổng từ giá cơ sở dữ liệu; FE gửi kèm
// totalAmount/finalAmount theo giỏ hàng (trường bắt buộc của request).
// KHÔNG dùng POST /payments/orders (đầu mối cũ, không lưu dòng đơn).
export const ordersApi = {
  // params: { branchId, status, fromDate, toDate, keyword, page, size }
  // fromDate/toDate là ISO instant; page 1-based (khớp PageResponse).
  list(params) {
    return http.get("/orders", { params });
  },
  detail(id) {
    return http.get(`/orders/${id}`);
  },
  // payload: { branchId, totalAmount, discountAmount, finalAmount, note,
  //   lines: [{ productId, size, quantity, unitPrice, sugarLevel, iceLevel, note, toppingIds }] }
  create(payload) {
    return http.post("/orders", payload);
  },
  applyVoucher(id, code) {
    return http.post(`/orders/${id}/voucher`, { code });
  },
  removeVoucher(id) {
    return http.delete(`/orders/${id}/voucher`);
  },
  cancel(id, cancelReason) {
    return http.post(`/orders/${id}/cancel`, { cancelReason });
  },
};
