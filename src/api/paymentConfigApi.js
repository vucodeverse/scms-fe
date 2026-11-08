import { http } from "./client.js";

// API cấu hình thanh toán SePay (UC15) — /api/v1/settings/sepay, chỉ COO.
// GET trả PaymentConfigResponse: apiToken luôn ở dạng maskedApiToken,
// backend không bao giờ trả token thật. PUT nhận apiToken để trống
// (null) khi giữ nguyên token hiện tại.
export const paymentConfigApi = {
  get() {
    return http.get("/settings/sepay");
  },
  // payload: { bankName, accountNumber, accountHolder, paymentPrefix,
  //            apiToken (null nếu giữ nguyên), webhookUrl, active }
  update(payload) {
    return http.put("/settings/sepay", payload);
  },
  // body tuỳ chọn: { apiToken, webhookUrl } — bỏ trống thì backend
  // kiểm tra bằng cấu hình đã lưu.
  ping(payload) {
    return http.post("/settings/sepay/ping", payload || {});
  },
};
