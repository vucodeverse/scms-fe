// Cấu hình môi trường phía FE. Base URL của backend đặt qua .env:
// VITE_API_BASE_URL=http://localhost:8080/api/v1
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1").replace(/\/$/, "");
