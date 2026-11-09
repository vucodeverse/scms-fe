import { toIsoDate } from "../reports/reportKit.js";

export const SHIFT_TYPES = ["MORNING", "EVENING", "NIGHT"];

export const SHIFT_TYPE_META = {
  MORNING: { label: "Ca sáng", start: "07:00", end: "14:00", window: "07:00 – 14:00" },
  EVENING: { label: "Ca chiều", start: "14:30", end: "22:30", window: "14:30 – 22:30" },
  NIGHT: { label: "Ca tối", start: "22:00", end: "06:00", window: "22:00 – 06:00 (+1 ngày)" },
};

export const SHIFT_STATUS_META = {
  SCHEDULED: { label: "Đã lên lịch", variant: "neutral" },
  OPEN: { label: "Đang mở", variant: "dark" },
  CLOSED: { label: "Đã đóng", variant: "success" },
};

export const CASH_TX_META = {
  OPEN: { label: "Mở ca", variant: "neutral", sign: "" },
  CASH_IN: { label: "Nạp tiền két", variant: "success", sign: "+" },
  CASH_OUT: { label: "Rút tiền két", variant: "warn", sign: "−" },
  REFUND_OUT: { label: "Hoàn tiền", variant: "warn", sign: "−" },
  CLOSE: { label: "Đóng ca", variant: "dark", sign: "" },
};

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function todayIso() {
  return toIsoDate(new Date());
}

export function parseIsoDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function addDaysIso(dateStr, deltaDays) {
  const base = parseIsoDate(dateStr) || new Date();
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
  return toIsoDate(next);
}

// Tuần bắt đầu từ Thứ Hai -> Chủ Nhật chứa ngày `anchorIso` (mặc định hôm nay).
export function weekRange(anchorIso = todayIso()) {
  const d = parseIsoDate(anchorIso) || new Date();
  const dow = (d.getDay() + 6) % 7; // Thứ 2 = 0
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { startDate: toIsoDate(mon), endDate: toIsoDate(sun) };
}

export function enumerateDates(startDate, endDate, maxDays = 14) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || start > end) return [];
  const days = [];
  const cur = new Date(start);
  while (cur <= end && days.length < maxDays) {
    days.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function weekdayShortLabel(dateStr) {
  const d = parseIsoDate(dateStr);
  if (!d) return "";
  return WEEKDAY_SHORT[d.getDay()];
}

export function shortDdMm(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = String(dateStr).split("-");
  return `${d}/${m}`;
}

export function formatHm(isoValue) {
  if (!isoValue) return "—";
  const d = isoValue instanceof Date ? isoValue : new Date(isoValue);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function toTimeInput(isoValue) {
  if (!isoValue) return "";
  const d = isoValue instanceof Date ? isoValue : new Date(isoValue);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Quy đổi ngày + giờ ("HH:mm") sang Instant ISO string cho backend.
// Nếu giờ kết thúc nhỏ hơn giờ bắt đầu (ca đêm 22:00 -> 06:00), tự cộng thêm 1 ngày.
export function buildShiftInstants(shiftDate, startTime, endTime) {
  if (!shiftDate || !startTime || !endTime) {
    return { plannedStart: null, plannedEnd: null, overnight: false };
  }
  const overnight = endTime < startTime;
  const endDate = overnight ? addDaysIso(shiftDate, 1) : shiftDate;
  const start = new Date(`${shiftDate}T${startTime}:00`);
  const end = new Date(`${endDate}T${endTime}:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { plannedStart: null, plannedEnd: null, overnight };
  }
  return {
    plannedStart: start.toISOString(),
    plannedEnd: end.toISOString(),
    endDate,
    overnight,
  };
}

export function actorName(id, employeeMap, fallbackPrefix = "NV") {
  if (!id) return "—";
  const emp = employeeMap?.[id];
  return emp?.fullName || `${fallbackPrefix} #${id}`;
}

export function formatSignedVnd(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "—";
  const n = Number(amount);
  const absFormatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.abs(n));
  if (n > 0) return `+${absFormatted} VNĐ`;
  if (n < 0) return `−${absFormatted} VNĐ`;
  return "0 VNĐ";
}
