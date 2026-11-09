import { http } from "./client.js";

// API báo cáo & phân tích (UC34–UC42) — /api/v1/reports. Chỉ đọc.
// - Ngày lọc `from`/`to` dạng yyyy-MM-dd theo giờ VN; bỏ trống cả hai = hôm nay.
// - BM: bỏ trống branchId (backend tự lấy chi nhánh của BM; gửi chi nhánh khác -> 403).
//   COO: bắt buộc branchId với report cấp chi nhánh; UC41/42 bỏ trống = toàn chuỗi.
// - UC40/UC41 chỉ COO.

// Bỏ các param rỗng để không gửi "branchId=" (backend sẽ báo lỗi kiểu dữ liệu).
function clean(params = {}) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

// branchIds=1&branchIds=2 (Spring bind List<Integer>), không dùng branchIds[]=…
function serializeParams(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((item) => sp.append(k, item));
    else sp.append(k, v);
  }
  return sp.toString();
}

function get(path, params) {
  return http.get(path, { params: clean(params), paramsSerializer: { serialize: serializeParams } });
}

// Loại báo cáo -> đường dẫn (khớp ReportExportController).
export const REPORT_TYPES = {
  SALES: "sales",
  CASH_FLOW: "cash-flow",
  INVENTORY: "inventory",
  HR_SHIFTS: "hr-shifts",
  FINANCIAL: "consolidated-financial",
  PRODUCT_SALES: "product-sales",
  PEAK_HOURS: "peak-hours",
};

function fileNameFrom(disposition, fallback) {
  if (!disposition) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/"/g, ""));
    } catch {
      /* dùng tên thường bên dưới */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : fallback;
}

export const reportsApi = {
  // UC34 -> DashboardDto
  dashboard({ branchId } = {}) {
    return get("/reports/dashboard", { branchId });
  },
  // UC35 -> SalesReportDto. params: { branchId, from, to, shiftId, paymentMethod }
  sales(params) {
    return get("/reports/sales", params);
  },
  // UC37 -> CashFlowReportDto. params: { branchId, from, to, shiftId }
  cashFlow(params) {
    return get("/reports/cash-flow", params);
  },
  // UC38 -> InventoryReportDto. params: { branchId, from, to }
  inventory(params) {
    return get("/reports/inventory", params);
  },
  // UC39 -> HrShiftReportDto. params: { branchId, from, to }
  hrShifts(params) {
    return get("/reports/hr-shifts", params);
  },
  // UC40 (COO) -> FinancialReportDto. params: { from, to, branchIds: [] }
  consolidatedFinancial(params) {
    return get("/reports/consolidated-financial", params);
  },
  // UC41 (COO) -> ProductSalesReportDto. params: { branchId, from, to, ranking, limit }
  productSales(params) {
    return get("/reports/product-sales", params);
  },
  // UC42 -> PeakHoursReportDto. params: { branchId, from, to }
  peakHours(params) {
    return get("/reports/peak-hours", params);
  },

  // UC36 — xuất file với ĐÚNG bộ lọc của màn hình xem (BR-02), format XLSX | PDF.
  // Tải file về máy qua thẻ <a download>. Lỗi 422 REPORT_NO_DATA_TO_EXPORT
  // (không có dữ liệu) / 403 / 500 được ném ra dạng ApiError như các API khác.
  async export(type, params, format = "XLSX") {
    const response = await http.get(`/reports/${type}/export`, {
      params: clean({ ...params, format }),
      paramsSerializer: { serialize: serializeParams },
      responseType: "blob",
      rawResponse: true,
    });
    const fallback = `bao-cao-${type}.${format === "PDF" ? "pdf" : "xlsx"}`;
    const fileName = fileNameFrom(response.headers?.["content-disposition"], fallback);
    const url = URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return fileName;
  },
};
