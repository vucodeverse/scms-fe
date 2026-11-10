import { PERMISSIONS } from "./permissions.js";

// Cấu trúc menu chính của Admin shell. Mục hiển thị khi người dùng có quyền
// tương ứng trong `permissions` của /auth/me (đúng chủ đích PermissionCatalog
// của backend). Các route nghiệp vụ sẽ được các issue màn hình tương ứng
// hoàn thiện; khai báo tập trung tại đây để menu nhất quán.
export const APP_MENU = [
  {
    group: "Vận hành",
    items: [
      { key: "shifts", label: "Ca & phân ca", path: "/branch/shifts", icon: "clock", permission: PERMISSIONS.SHIFT_MANAGE, roles: ["COO", "BRANCH_MANAGER"] },
      { key: "orders", label: "Đơn hàng tại quầy", path: "/branch/orders", icon: "orders", permission: PERMISSIONS.ORDER_VIEW, roles: ["COO", "BRANCH_MANAGER"] },
      { key: "inventory", label: "Kho", path: "/branch/inventory", icon: "inventory", permission: PERMISSIONS.INVENTORY_MANAGE },
      { key: "branch-overview", label: "Tổng quan chi nhánh", path: "/branch/overview", icon: "dashboard", permission: PERMISSIONS.REPORT_VIEW },
      { key: "chain-overview", label: "Tổng quan chuỗi", path: "/chain/overview", icon: "dashboard", permission: PERMISSIONS.REPORT_VIEW, onlyRoles: ["COO"] },
    ],
  },
  {
    // UC35–UC42. `onlyRoles`: chỉ hiện cho các vai trò này (khớp @PreAuthorize backend).
    group: "Báo cáo",
    items: [
      { key: "rpt-sales", label: "Doanh số", path: "/reports/sales", icon: "report", permission: PERMISSIONS.REPORT_VIEW },
      { key: "rpt-cash", label: "Dòng tiền két", path: "/reports/cash-flow", icon: "cash", permission: PERMISSIONS.REPORT_VIEW },
      { key: "rpt-inventory", label: "Xuất - nhập - tồn", path: "/reports/inventory", icon: "box", permission: PERMISSIONS.REPORT_VIEW },
      { key: "rpt-hr", label: "Nhân sự & ca", path: "/reports/hr-shifts", icon: "users", permission: PERMISSIONS.REPORT_VIEW },
      { key: "rpt-peak", label: "Giờ cao điểm", path: "/reports/peak-hours", icon: "clock", permission: PERMISSIONS.REPORT_VIEW },
      { key: "rpt-financial", label: "Tài chính hợp nhất", path: "/reports/financial", icon: "wallet", permission: PERMISSIONS.REPORT_VIEW, onlyRoles: ["COO"] },
      { key: "rpt-products", label: "Sản phẩm bán chạy", path: "/reports/product-sales", icon: "tag", permission: PERMISSIONS.REPORT_VIEW, onlyRoles: ["COO"] },
    ],
  },
  {
    group: "Dữ Liệu",
    items: [
      { key: "branches", label: "Chi nhánh", path: "/chain/branches", icon: "branch", permission: PERMISSIONS.BRANCH_MANAGE },
      { key: "managers", label: "Tài khoản quản lý", path: "/chain/managers", icon: "user", permission: PERMISSIONS.MANAGER_MANAGE },
      { key: "employees", label: "Nhân viên", path: "/branch/employees", icon: "users", permission: PERMISSIONS.EMPLOYEE_MANAGE, roles: ["COO", "BRANCH_MANAGER"] },
      { key: "menu", label: "Menu & BOM", path: "/chain/menu", icon: "menu", permission: PERMISSIONS.MENU_MANAGE },
      { key: "chain-sync", label: "Đồng bộ chuỗi", path: "/chain/menu/sync", icon: "sync", permission: PERMISSIONS.SYNC_PUBLISH },
      { key: "vouchers", label: "Khuyến mãi & voucher", path: "/chain/vouchers", icon: "tag", permission: PERMISSIONS.VOUCHER_MANAGE },
      { key: "roles", label: "Vai trò & phân quyền", path: "/settings/roles", icon: "settings", permission: PERMISSIONS.ROLE_ASSIGN },
      { key: "sepay", label: "SePay & thanh toán", path: "/settings/sepay", icon: "wallet", permission: PERMISSIONS.SETTINGS_MANAGE },
    ],
  },
];

// Menu dành riêng cho quầy POS (chỉ gồm các chức năng bán hàng, tra cứu đơn tại quầy, ca két)
export const POS_MENU = [
  {
    group: "Quầy bán hàng",
    items: [
      { key: "pos", label: "Gọi món (POS)", path: "/pos", icon: "pos" },
      { key: "orders", label: "Đơn hàng tại quầy", path: "/branch/orders", icon: "orders" },
      { key: "shifts", label: "Ca & két tiền", path: "/branch/shifts", icon: "cash" },
    ],
  },
];

// Xây dựng menu quầy POS theo trạng thái mở khóa PIN, trạng thái ca, khóa bàn giao & chờ đóng ca sớm.
// Thu ngân phải mở khóa PIN, kiểm két & mở ca (và không bị khóa bàn giao / đóng ca sớm) trước khi mở mục Gọi món (POS).
export function buildPosMenu({ unlocked = true, shiftOpen = false, handoverPending = false, earlyClosePending = false } = {}) {
  const canOpenPos = Boolean(unlocked && shiftOpen && !handoverPending && !earlyClosePending);
  return [
    {
      group: "Quầy bán hàng",
      items: [
        {
          key: "pos",
          label: "Gọi món (POS)",
          path: "/pos",
          icon: "pos",
          disabled: !canOpenPos,
          badge: !canOpenPos
            ? !unlocked
              ? "PIN"
              : !shiftOpen
                ? "Mở ca"
                : earlyClosePending
                  ? "Chờ đóng"
                  : "Bàn giao"
            : undefined,
          disabledReason: !unlocked
            ? "Vui lòng nhập PIN mở khóa Thu ngân tại Ca & két tiền"
            : !shiftOpen
              ? "Vui lòng kiểm két & mở ca trước khi vào Gọi món (POS)"
              : earlyClosePending
                ? "Ca đang chờ Quản lý chi nhánh xác nhận đóng ca sớm tại Ca & két tiền"
                : "Két tiền đang tạm khóa chờ người mới kiểm két nhận bàn giao giữa ca tại Ca & két tiền",
        },
        {
          key: "orders",
          label: "Đơn hàng tại quầy",
          path: "/branch/orders",
          icon: "orders",
          disabled: !unlocked,
          disabledReason: !unlocked ? "Vui lòng nhập PIN mở khóa Thu ngân trước" : undefined,
        },
        { key: "shifts", label: "Ca & két tiền", path: "/branch/shifts", icon: "cash" },
      ],
    },
  ];
}

// Lọc menu theo permissions và roles của người dùng hiện tại; nhóm rỗng bị loại.
// Khi chưa đăng nhập hoặc là nhân sự tại quầy (Thu ngân / Pha chế / Phục vụ): chỉ hiển thị menu POS.
export function buildMenu(user) {
  if (!user || (user.role !== "COO" && user.role !== "BRANCH_MANAGER")) return POS_MENU;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return APP_MENU.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        (!Array.isArray(item.onlyRoles) || item.onlyRoles.includes(user.role)) &&
        (!item.permission ||
          permissions.includes(item.permission) ||
          (Array.isArray(item.roles) && item.roles.includes(user.role)))
    ),
  })).filter((section) => section.items.length > 0);
}
