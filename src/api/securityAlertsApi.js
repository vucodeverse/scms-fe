import { http } from "./client.js";

export const SECURITY_ALERTS_CHANGED_EVENT = "scms:security-alerts-changed";

export function notifySecurityAlertsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SECURITY_ALERTS_CHANGED_EVENT));
  }
}

export const securityAlertsApi = {
  list({ branchId, activeOnly = false, limit = 20 } = {}) {
    const params = { activeOnly, limit };
    if (branchId) params.branchId = branchId;
    return http.get("/security-alerts", { params });
  },
  acknowledge(alertId, note = "") {
    return http.post(`/security-alerts/${alertId}/acknowledge`, note ? { note } : {});
  },
  unlockPin(alertId, note = "") {
    return http.post(`/security-alerts/${alertId}/unlock-pin`, note ? { note } : {});
  },
};
