import { publicHttp } from "./client.js";

// API chấm công kiosk (UC03/UC04) — /api/v1/attendance.
// Các endpoint này hiện PUBLIC ở backend (chưa kiểm tra kiosk key),
// kiosk gọi qua publicHttp không gắn access token. Chỉ nên chạy
// kiosk trong LAN của cửa hàng (xem issue #4).
export const attendanceApi = {
  kioskEmployees(branchId) {
    return publicHttp.get("/attendance/kiosk/employees", { params: { branchId } });
  },
  checkIn(payload) {
    return publicHttp.post("/attendance/check-in", payload);
  },
  checkOut(payload) {
    return publicHttp.post("/attendance/check-out", payload);
  },
  cardSwipe(payload) {
    return publicHttp.post("/attendance/card-swipe", payload);
  },
  status(employeeId) {
    return publicHttp.get(`/attendance/status/${employeeId}`);
  },
};
