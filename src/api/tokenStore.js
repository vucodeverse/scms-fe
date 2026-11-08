// Lưu token phía client.
// - Access token: sessionStorage (mất khi đóng tab).
// - Refresh token: backend CHỈ trả khi đăng nhập với rememberMe = true
//   (hiệu lực 7 ngày, lưu localStorage). Không rememberMe -> không có
//   refresh token, phiên kết thúc khi access token hết hạn (30 phút).
// Backend mặc định trả token trong body (chưa bật chế độ cookie httpOnly),
// nên FE buộc phải giữ token ở storage — chấp nhận đánh đổi này và ghi rõ.

const ACCESS_KEY = "scms.accessToken";
const REFRESH_KEY = "scms.refreshToken";
const REMEMBER_KEY = "scms.rememberMe";

function refreshStorage() {
  return localStorage.getItem(REMEMBER_KEY) === "1" ? localStorage : sessionStorage;
}

export const tokenStore = {
  getAccessToken() {
    return sessionStorage.getItem(ACCESS_KEY);
  },
  getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY);
  },
  save({ accessToken, refreshToken }, rememberMe) {
    if (accessToken) sessionStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REMEMBER_KEY, rememberMe ? "1" : "0");
      // Dọn bản ở storage còn lại để không giữ hai refresh token song song.
      localStorage.removeItem(REFRESH_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
      refreshStorage().setItem(REFRESH_KEY, refreshToken);
    }
  },
  saveRefreshed({ accessToken, refreshToken }) {
    // Backend XOAY VÒNG refresh token: luôn ghi đè bằng token mới,
    // giữ token cũ sẽ bị backend thu hồi toàn bộ phiên.
    if (accessToken) sessionStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) {
      const storage = localStorage.getItem(REFRESH_KEY) ? localStorage : sessionStorage;
      storage.setItem(REFRESH_KEY, refreshToken);
    }
  },
  clear() {
    sessionStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  },
  hasSession() {
    // Còn access token (trong sessionStorage) là còn khả năng khôi phục
    // phiên trong cùng tab; refresh token chỉ có khi rememberMe = true.
    return Boolean(this.getRefreshToken() || this.getAccessToken());
  },
};
