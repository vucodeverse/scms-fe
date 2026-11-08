import { http } from "./client.js";

// API Đồng bộ cấu hình toàn chuỗi (UC14) — /api/v1/chain-sync, chỉ COO.
export const syncConfigApi = {
  syncToBranches(payload) {
    return http.post("/chain-sync", payload);
  },
};

