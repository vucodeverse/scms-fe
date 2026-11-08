import { http } from "./client.js";

// API vai trò & phân quyền (UC02) — /api/v1/roles.
// GET /roles trả mọi vai trò kèm permissions hiện tại + số user.
// Lưu ý backend: permissions chỉ lưu trong bộ nhớ (mất khi restart)
// và thực thi thật nằm ở @PreAuthorize theo role — FE hiển thị đúng
// bản chất này ở màn hình phân quyền.
export const rolesApi = {
  list() {
    return http.get("/roles");
  },
  permissions(roleId) {
    return http.get(`/roles/${roleId}/permissions`);
  },
  updatePermissions(roleId, permissions) {
    return http.put(`/roles/${roleId}/permissions`, { permissions });
  },
  assign(employeeId, roleCode) {
    return http.put(`/roles/assignments/${employeeId}`, { roleCode });
  },
};
