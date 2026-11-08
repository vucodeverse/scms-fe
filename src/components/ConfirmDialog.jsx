import { Button, Modal, Spinner } from "react-bootstrap";

// Dialog xác nhận (mục 7.7): dùng cho hành động quan trọng/phá hủy.
// Hành động phá hủy dùng nút nền mực đậm (danger theo token), không dùng đỏ.
export default function ConfirmDialog({
  show,
  title,
  body,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal show={show} onHide={busy ? undefined : onCancel} centered backdrop="static">
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2">{title}</Modal.Title>
      </Modal.Header>
      {body ? <Modal.Body>{body}</Modal.Body> : null}
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy ? <Spinner size="sm" className="me-2" /> : null}
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
