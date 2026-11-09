import { http } from "./client.js";
import { buildListParams, normalizePage } from "./paging.js";

// API ca làm việc, phân ca & két tiền POS — /api/v1/shifts (UC08, UC24–UC27).
export const shiftsApi = {
  async list({ branchId, status, startDate, endDate, uiPage = 1, size = 20, sortDir = "DESC" } = {}) {
    const params = buildListParams({
      uiPage,
      size,
      filters: {
        branchId,
        status,
        startDate,
        endDate,
        sortDir: sortDir ? sortDir.toUpperCase() : undefined,
      },
    });
    const page = await http.get("/shifts", { params });
    return normalizePage(page);
  },

  current(branchId) {
    return http.get("/shifts/current", { params: { branchId } });
  },

  previousClosed(branchId) {
    return http.get("/shifts/previous-closed", { params: { branchId } });
  },

  branchesOverview() {
    return http.get("/shifts/branches-overview");
  },

  detail(shiftId) {
    return http.get(`/shifts/${shiftId}`);
  },

  open(payload) {
    return http.post("/shifts/open", payload);
  },

  cashIn(shiftId, payload) {
    return http.post(`/shifts/${shiftId}/cash-in`, payload);
  },

  cashOut(shiftId, payload) {
    return http.post(`/shifts/${shiftId}/cash-out`, payload);
  },

  close(shiftId, payload) {
    return http.post(`/shifts/${shiftId}/close`, payload);
  },

  schedules({ branchId, startDate, endDate }) {
    return http.get("/shifts/schedules", { params: { branchId, startDate, endDate } });
  },

  createSchedule(payload) {
    return http.post("/shifts/schedules", payload);
  },

  updateSchedule(shiftId, payload) {
    return http.put(`/shifts/schedules/${shiftId}`, payload);
  },

  deleteSchedule(shiftId) {
    return http.delete(`/shifts/schedules/${shiftId}`);
  },
};
