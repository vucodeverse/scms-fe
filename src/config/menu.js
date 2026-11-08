import { PERMISSIONS } from "./permissions.js";

// Cấu trúc menu chính của Admin shell. Mục hiển thị khi người dùng có quyền
// tương ứng trong `permissions` của /auth/me (đúng chủ đích PermissionCatalog
// của backend). Các route nghiệp vụ sẽ được các issue màn hình tương ứng
// hoàn thiện; khai báo tập trung tại đây để menu nhất quán.
export const APP_MENU = [
  {
    group: "Vận hành",
    items: [
      { key: "pos", label: "Bán hàng (POS)", path: "/pos", icon: "pos", permission: PERMISSIONS.POS_OPERATE },
      { key: "orders", label: "Đơn hàng", path: "/branch/orders", icon: "orders", permission: PERMISSIONS.ORDER_VIEW },
      { key: "inventory", label: "Kho", path: "/branch/inventory", icon: "inventory", permission: PERMISSIONS.INVENTORY_MANAGE },
      { key: "branch-overview", label: "Tổng quan chi nhánh", path: "/branch/overview", icon: "dashboard", permission: PERMISSIONS.REPORT_VIEW },
      { key: "chain-overview", label: "Tổng quan chuỗi", path: "/chain/overview", icon: "dashboard", permission: PERMISSIONS.REPORT_VIEW },
    ],
  },
  {
    group: "Master data",
    items: [
      { key: "branches", label: "Chi nhánh", path: "/chain/branches", icon: "branch", permission: PERMISSIONS.BRANCH_MANAGE },
      { key: "employees", label: "Nhân viên", path: "/branch/employees", icon: "users", permission: PERMISSIONS.EMPLOYEE_MANAGE },
      { key: "menu", label: "Menu & BOM", path: "/chain/menu", icon: "menu", permission: PERMISSIONS.MENU_MANAGE },
      { key: "vouchers", label: "Khuyến mãi & voucher", path: "/chain/vouchers", icon: "tag", permission: PERMISSIONS.VOUCHER_MANAGE },
      { key: "roles", label: "Vai trò & phân quyền", path: "/settings/roles", icon: "settings", permission: PERMISSIONS.ROLE_ASSIGN },
      { key: "sepay", label: "SePay & thanh toán", path: "/settings/sepay", icon: "wallet", permission: PERMISSIONS.SETTINGS_MANAGE },
    ],
  },
];

// Lọc menu theo permissions của người dùng hiện tại; nhóm rỗng bị loại.
export function buildMenu(user) {
  if (!user) return [];
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return APP_MENU.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || permissions.includes(item.permission)),
  })).filter((section) => section.items.length > 0);
}
