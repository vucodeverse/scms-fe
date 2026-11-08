// Định dạng hiển thị dùng chung — tài liệu thiết kế mục 3.2.
// Tiền: vi-VN, dấu "." phân cách nghìn, hậu tố "VNĐ". Ngày dd/mm/yyyy, giờ HH:mm:ss.

const vndFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("vi-VN");

export function formatVnd(amount) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(value)) return "—";
  return `${vndFormatter.format(value)} VNĐ`;
}

export function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  return numberFormatter.format(num);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value) {
  const d = toDate(value);
  if (!d) return "—";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatTime(value) {
  const d = toDate(value);
  if (!d) return "—";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return "—";
  return `${formatDate(d)} ${formatTime(d)}`;
}
