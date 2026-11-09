// Điều hướng sau đăng nhập (SCR-03): backend trả `landing` dạng mã màn hình
// trong response login — COO: SCR-10, Branch Manager: SCR-07, Cashier: SCR-04.
// Riêng Thu ngân (CASHIER / quầy POS) vào màn Ca & két tiền trước để kiểm két & mở ca rồi mới vào Gọi món POS.
export const LANDING_BY_SCREEN = {
  "SCR-10": "/chain/overview",
  "SCR-07": "/branch/overview",
  "SCR-04": "/branch/shifts",
};

export const LANDING_BY_ROLE = {
  COO: "/chain/overview",
  BRANCH_MANAGER: "/branch/overview",
  CASHIER: "/branch/shifts",
};

// Nhãn vai trò hiển thị (khớp cách gọi của prototype/tài liệu).
export const ROLE_LABELS = {
  COO: "COO",
  BRANCH_MANAGER: "Quản lý chi nhánh",
  CASHIER: "Thu ngân",
  BARISTA: "Pha chế",
  WAITER: "Phục vụ",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || "";
}

export function isUnassignedBranchManager(user) {
  return Boolean(user && user.role === "BRANCH_MANAGER" && !user.branchId);
}

export function landingPath({ landing, user } = {}) {
  if (user?.role && LANDING_BY_ROLE[user.role]) return LANDING_BY_ROLE[user.role];
  if (landing && LANDING_BY_SCREEN[landing]) return LANDING_BY_SCREEN[landing];
  return "/branch/shifts";
}
