import { Form } from "react-bootstrap";

// Trường form chuẩn (mục 7.2): label uppercase nhỏ, lỗi hiển thị ngay
// dưới field (khớp FieldErrorItem từ backend), helper text màu muted.
export default function FormField({ label, required = false, error = null, help = null, children, className = "mb-3" }) {
  return (
    <Form.Group className={className}>
      {label ? (
        <Form.Label>
          {label}
          {required ? <span style={{ color: "var(--accent)" }}> *</span> : null}
        </Form.Label>
      ) : null}
      {children}
      {help && !error ? <Form.Text>{help}</Form.Text> : null}
      {error ? <div className="field-error">{error}</div> : null}
    </Form.Group>
  );
}
