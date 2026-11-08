import { http } from "./client.js";

// API thanh toán (UC19/UC20/UC43) — /api/v1/payments.
export const paymentsApi = {
  // { orderId, cashReceived, paymentNote } ->
  // { orderId, orderStatus, paymentStatus, totalAmount, cashReceived, changeReturned, paidAt }
  payCash(payload) {
    return http.post("/payments/cash", payload);
  },
  // { orderId } -> { orderId, referenceCode, amount, bankName, accountNumber,
  //   accountHolder, qrImageUrl, qrPayload, expiresAt, status }
  createVietQr(orderId) {
    return http.post("/payments/vietqr", { orderId });
  },
  // -> { orderId, orderStatus, paymentStatus, paymentMethod, amount,
  //      receivedAmount, referenceCode, sepayRef, paidAt, message }
  getStatus(orderId) {
    return http.get(`/payments/orders/${orderId}/status`);
  },
};
