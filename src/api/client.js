import axios from "axios";
import { API_BASE_URL } from "../config/env.js";
import { tokenStore } from "./tokenStore.js";

// Lớp gọi API dùng chung cho toàn FE (FE-02).
// Hợp đồng backend scms-be:
// - Mọi response bọc envelope { code, data, message, traceId } — client bóc
//   sẵn, tầng trên chỉ nhận `data`.
// - Lỗi trả cùng envelope + danh sách lỗi theo field (fieldErrors[]) — client
//   chuẩn hoá thành ApiError { status, code, message, fieldErrors, traceId }.
// - Access token hết hạn (30 phút) -> 401: client tự gọi /auth/refresh MỘT
//   lần (single-flight, các request khác xếp hàng), ghi đè refresh token mới
//   vì backend xoay vòng token; refresh thất bại -> xoá phiên + phát sự kiện
//   "scms:session-expired" để AuthContext đưa người dùng về trang đăng nhập.

export class ApiError extends Error {
  constructor({ status = 0, code = "NETWORK_ERROR", message = "Không kết nối được tới máy chủ.", fieldErrors = [], traceId = null }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors; // [{ field, code, message }]
    this.traceId = traceId;
  }

  fieldError(field) {
    const found = this.fieldErrors.find((e) => e.field === field);
    return found ? found.message : null;
  }
}

function toApiError(error) {
  if (error instanceof ApiError) return error;
  const response = error?.response;
  if (!response) {
    return new ApiError({ message: "Không kết nối được tới máy chủ. Kiểm tra backend đang chạy và thử lại." });
  }
  const body = response.data || {};
  return new ApiError({
    status: response.status,
    code: body.code || `HTTP_${response.status}`,
    message: body.message || "Đã xảy ra lỗi khi xử lý yêu cầu.",
    fieldErrors: Array.isArray(body.fieldErrors) ? body.fieldErrors : Array.isArray(body.errors) ? body.errors : [],
    traceId: body.traceId || null,
  });
}

const raw = axios.create({ baseURL: API_BASE_URL });
export const http = axios.create({ baseURL: API_BASE_URL });

http.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

async function refreshSession() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw new ApiError({ status: 401, code: "UNAUTHORIZED", message: "Phiên đăng nhập đã hết hạn." });
  const res = await raw.post("/auth/refresh", { refreshToken });
  const data = res.data?.data;
  if (!data?.accessToken) throw new ApiError({ status: 401, code: "UNAUTHORIZED", message: "Phiên đăng nhập đã hết hạn." });
  tokenStore.saveRefreshed(data);
  return data.accessToken;
}

function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = refreshSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function expireSession() {
  tokenStore.clear();
  window.dispatchEvent(new CustomEvent("scms:session-expired"));
}

http.interceptors.response.use(
  (response) => response.data?.data,
  async (error) => {
    const original = error?.config;
    const status = error?.response?.status;
    const url = original?.url || "";
    const isAuthCall = url.includes("/auth/refresh") || url.includes("/auth/login");
    if (status === 401 && original && !original._retried && !isAuthCall && tokenStore.getRefreshToken()) {
      original._retried = true;
      try {
        const newToken = await refreshOnce();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return http(original);
      } catch {
        expireSession();
        throw toApiError(error);
      }
    }
    if (status === 401 && !isAuthCall && !tokenStore.getRefreshToken()) {
      expireSession();
    }
    throw toApiError(error);
  },
);

// Gọi API không cần phiên (kiosk) — vẫn bóc envelope và chuẩn hoá lỗi.
export const publicHttp = axios.create({ baseURL: API_BASE_URL });
publicHttp.interceptors.response.use(
  (response) => response.data?.data,
  (error) => {
    throw toApiError(error);
  },
);
