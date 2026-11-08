import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Toast, ToastContainer } from "react-bootstrap";

// Toast (mục 7.8): thông báo ngắn góc phải trên, tự đóng.
// Dùng: const toast = useToast(); toast.success("..."), toast.error("...")
const ToastContext = createContext({ success: () => {}, error: () => {}, info: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const push = useCallback((variant, message) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((prev) => [...prev, { id, variant, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Memo hoá api: nếu object thay đổi mỗi lần render, mọi useEffect phụ
  // thuộc vào toast sẽ chạy lại vô hạn (đã gặp khi API list lỗi liên tục).
  const api = useMemo(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  const close = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 2000 }}>
        {toasts.map((t) => (
          <Toast key={t.id} onClose={() => close(t.id)} show>
            <Toast.Header closeButton>
              <strong className="me-auto">
                {t.variant === "success" ? "Thành công" : t.variant === "error" ? "Có lỗi" : "Thông báo"}
              </strong>
            </Toast.Header>
            <Toast.Body>{t.message}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}
