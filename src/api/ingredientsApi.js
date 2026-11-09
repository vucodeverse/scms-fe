import { http } from "./client.js";

export const ingredientsApi = {
  list(status = "ACTIVE") {
    return http.get("/ingredients", { params: status ? { status } : {} });
  },
};
