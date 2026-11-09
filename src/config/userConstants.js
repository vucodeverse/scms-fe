export const POSITION_LABELS = {
  COO: "COO",
  BRANCH_MANAGER: "Quản lý chi nhánh",
  CASHIER: "Thu ngân",
  BARISTA: "Pha chế",
  WAITER: "Phục vụ",
};

export const USER_STATUS_LABELS = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngừng hoạt động",
};

export const BRANCH_STATUS_LABELS = {
  OPEN: "Đang mở",
  TEMP_CLOSED: "Tạm đóng",
  MAINTENANCE: "Bảo trì",
  INACTIVE: "Ngừng hoạt động",
};

export const BRANCH_STATUS_VARIANTS = {
  OPEN: "dark",
  TEMP_CLOSED: "warn",
  MAINTENANCE: "warn",
  INACTIVE: "neutral",
};

export const ASSIGNMENT_FILTER_OPTIONS = [
  { value: "", label: "Tất cả phân công" },
  { value: "true", label: "Chưa gán chi nhánh" },
  { value: "false", label: "Đã gán chi nhánh" },
];
