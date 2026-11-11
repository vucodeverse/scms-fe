import { PERMISSIONS } from "./permissions.js";

// Cấu trúc menu chính của Admin shell. Mục hiển thị khi người dùng có quyền
// tương ứng trong `permissions` của /auth/me (đúng chủ đích PermissionCatalog
// của backend). Các route nghiệp vụ sẽ được các issue màn hình tương ứng
// hoàn thiện; khai báo tập trung tại đây để menu nhất quán.
export const APP_MENU = [
  // --- DÀNH RIÊNG CHO QUẢN LÝ CHI NHÁNH (BRANCH_MANAGER) ---
  {
    group: "Vận hành cửa hàng",
    onlyRoles: ["BRANCH_MANAGER"],
    items: [
      { key: "branch-overview", label: "Tổng quan chi nhánh", path: "/branch/overview", icon: "dashboard", roles: ["BRANCH_MANAGER"] },
      { key: "pos", label: "Bán hàng (POS)", path: "/pos", icon: "pos", roles: ["BRANCH_MANAGER"] },
      { key: "orders", label: "Đơn hàng tại quầy", path: "/branch/orders", icon: "orders", roles: ["BRANCH_MANAGER"] },
      { key: "shifts", label: "Ca & phân ca", path: "/branch/shifts", icon: "clock", roles: ["BRANCH_MANAGER"] },
    ],
  },
  {
    group: "Kho & Nghiệp vụ cửa hàng",
    onlyRoles: ["BRANCH_MANAGER"],
    items: [
      { key: "inventory", label: "Tồn kho chi nhánh", path: "/branch/inventory", icon: "inventory", roles: ["BRANCH_MANAGER"] },
      { key: "branch-requisitions", label: "Đơn xin cấp hàng", path: "/branch/inventory/requisitions", icon: "box", roles: ["BRANCH_MANAGER"] },
      { key: "slip-issue", label: "Xuất kho ra quầy Bar", path: "/branch/inventory/slip?type=issue", icon: "arrowRight", roles: ["BRANCH_MANAGER"] },
      { key: "slip-dispose", label: "Báo cáo xuất hủy sự cố", path: "/branch/inventory/slip?type=dispose", icon: "trash", roles: ["BRANCH_MANAGER"] },
      { key: "stocktake", label: "Kiểm kê kho ca", path: "/branch/inventory/stocktake", icon: "audit", roles: ["BRANCH_MANAGER"] },
      { key: "slip-receive", label: "Nhập hàng nhà cung cấp", path: "/branch/inventory/slip?type=receive", icon: "plus", roles: ["BRANCH_MANAGER"] },
    ],
  },
  {
    group: "Báo cáo chi nhánh",
    onlyRoles: ["BRANCH_MANAGER"],
    items: [
      { key: "rpt-sales", label: "Doanh số chi nhánh", path: "/reports/sales", icon: "report", roles: ["BRANCH_MANAGER"] },
      { key: "rpt-cash", label: "Dòng tiền két", path: "/reports/cash-flow", icon: "cash", roles: ["BRANCH_MANAGER"] },
      { key: "rpt-inventory", label: "Xuất - nhập - tồn", path: "/reports/inventory", icon: "box", roles: ["BRANCH_MANAGER"] },
      { key: "rpt-hr", label: "Nhân sự & ca", path: "/reports/hr-shifts", icon: "users", roles: ["BRANCH_MANAGER"] },
      { key: "rpt-peak", label: "Khung giờ cao điểm", path: "/reports/peak-hours", icon: "clock", roles: ["BRANCH_MANAGER"] },
    ],
  },
  {
    group: "Nhân sự cửa hàng",
    onlyRoles: ["BRANCH_MANAGER"],
    items: [
      { key: "employees", label: "Nhân viên quán", path: "/branch/employees", icon: "users", roles: ["BRANCH_MANAGER"] },
    ],
  },

  // --- DÀNH RIÊNG CHO BAN ĐIỀU HÀNH & KHO TỔNG (COO) ---
  {
    group: "Vận hành chuỗi",
    onlyRoles: ["COO"],
    items: [
      { key: "chain-overview", label: "Tổng quan chuỗi", path: "/chain/overview", icon: "dashboard", onlyRoles: ["COO"] },
      { key: "branch-overview", label: "Tổng quan chi nhánh", path: "/branch/overview", icon: "dashboard", onlyRoles: ["COO"] },
      { key: "orders", label: "Đơn hàng toàn chuỗi", path: "/branch/orders", icon: "orders", onlyRoles: ["COO"] },
      { key: "shifts", label: "Lịch ca làm việc", path: "/branch/shifts", icon: "clock", onlyRoles: ["COO"] },
    ],
  },
  {
    group: "Kho Tổng & Cung ứng chuỗi",
    onlyRoles: ["COO"],
    items: [
      { key: "slip-approve", label: "Duyệt cấp hàng Kho Tổng", path: "/chain/requisitions/approve", icon: "approve", onlyRoles: ["COO"] },
      { key: "chain-inventory", label: "Tồn kho toàn chuỗi", path: "/branch/inventory", icon: "inventory", onlyRoles: ["COO"] },
      { key: "ingredients", label: "Mặt hàng Kho Tổng (Master)", path: "/chain/ingredients", icon: "box", onlyRoles: ["COO"] },
    ],
  },
  {
    group: "Báo cáo quản trị",
    onlyRoles: ["COO"],
    items: [
      { key: "rpt-financial", label: "Tài chính hợp nhất", path: "/reports/financial", icon: "wallet", onlyRoles: ["COO"] },
      { key: "rpt-products", label: "Sản phẩm bán chạy", path: "/reports/product-sales", icon: "tag", onlyRoles: ["COO"] },
      { key: "rpt-sales", label: "Doanh số chuỗi", path: "/reports/sales", icon: "report", onlyRoles: ["COO"] },
      { key: "rpt-cash", label: "Dòng tiền két", path: "/reports/cash-flow", icon: "cash", onlyRoles: ["COO"] },
      { key: "rpt-inventory", label: "Xuất - nhập - tồn", path: "/reports/inventory", icon: "box", onlyRoles: ["COO"] },
      { key: "rpt-hr", label: "Nhân sự & ca", path: "/reports/hr-shifts", icon: "users", onlyRoles: ["COO"] },
      { key: "rpt-peak", label: "Khung giờ cao điểm", path: "/reports/peak-hours", icon: "clock", onlyRoles: ["COO"] },
    ],
  },
  {
    group: "Quản trị hệ thống",
    onlyRoles: ["COO"],
    items: [
      { key: "branches", label: "Chi nhánh", path: "/chain/branches", icon: "branch", onlyRoles: ["COO"] },
      { key: "managers", label: "Tài khoản quản lý", path: "/chain/managers", icon: "user", onlyRoles: ["COO"] },
      { key: "employees", label: "Nhân viên toàn chuỗi", path: "/branch/employees", icon: "users", onlyRoles: ["COO"] },
      { key: "menu", label: "Menu & Công thức (BOM)", path: "/chain/menu", icon: "menu", onlyRoles: ["COO"] },
      { key: "chain-sync", label: "Đồng bộ chuỗi", path: "/chain/menu/sync", icon: "sync", onlyRoles: ["COO"] },
      { key: "vouchers", label: "Khuyến mãi & voucher", path: "/chain/vouchers", icon: "tag", onlyRoles: ["COO"] },
      { key: "roles", label: "Vai trò & phân quyền", path: "/settings/roles", icon: "settings", onlyRoles: ["COO"] },
      { key: "sepay", label: "SePay & thanh toán", path: "/settings/sepay", icon: "wallet", onlyRoles: ["COO"] },
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

// Xây dựng menu quầy POS theo trạng thái mở khóa PIN, trạng thái ca & khóa bàn giao két giữa ca.
// Thu ngân phải mở khóa PIN, kiểm két & mở ca (và không bị khóa bàn giao) trước khi mở mục Gọi món (POS).
export function buildPosMenu({ unlocked = true, shiftOpen = false, handoverPending = false } = {}) {
  const canOpenPos = Boolean(unlocked && shiftOpen && !handoverPending);
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
          badge: !canOpenPos ? (!unlocked ? "PIN" : !shiftOpen ? "Mở ca" : "Bàn giao") : undefined,
          disabledReason: !unlocked
            ? "Vui lòng nhập PIN mở khóa Thu ngân tại Ca & két tiền"
            : !shiftOpen
              ? "Vui lòng kiểm két & mở ca trước khi vào Gọi món (POS)"
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
// Khi chưa đăng nhập hoặc là Thu ngân (CASHIER): chỉ hiển thị các chức năng quầy POS.
export function buildMenu(user) {
  if (!user || user.role === "CASHIER") return POS_MENU;
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return APP_MENU
    .filter((section) => !Array.isArray(section.onlyRoles) || section.onlyRoles.includes(user.role))
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!Array.isArray(item.onlyRoles) || item.onlyRoles.includes(user.role)) &&
          (!item.permission ||
            permissions.includes(item.permission) ||
            (Array.isArray(item.roles) && item.roles.includes(user.role)))
      ),
    }))
    .filter((section) => section.items.length > 0);
}
