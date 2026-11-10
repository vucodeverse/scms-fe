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
  getReceipt(id) {
    return http.get(`/orders/${id}/receipt`);
  },
  async exportReceiptPdf(id) {
    const response = await http.get(`/orders/${id}/receipt/export`, {
      responseType: "blob",
      rawResponse: true,
    });
    const fallback = `hoa-don-#${id}.pdf`;
    let fileName = fallback;
    const cd = response.headers?.["content-disposition"];
    if (cd) {
      const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
      fileName = decodeURIComponent(match?.[1] || match?.[2] || fallback);
    }
    const url = URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return fileName;
  },
  printReceipt(id) {
    return http.post(`/orders/${id}/receipt/print`);
  },
};
