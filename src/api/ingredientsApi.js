import { http } from "./client.js";

export const ingredientsApi = {
  list(status = "ACTIVE", keyword = "") {
    const params = {};
    if (status) params.status = status;
    if (keyword) params.keyword = keyword;
    return http.get("/ingredients", { params });
  },
  get(id) {
    return http.get(`/ingredients/${id}`);
  },
  create(payload) {
    return http.post("/ingredients", payload);
  },
  update(id, payload) {
    return http.put(`/ingredients/${id}`, payload);
  },
  changeStatus(id, status) {
    return http.patch(`/ingredients/${id}/status`, null, { params: { status } });
  },
};
