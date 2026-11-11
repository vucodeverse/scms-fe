import { useEffect, useRef, useState } from "react";
import { Button, Modal, Spinner } from "react-bootstrap";
import { ordersApi } from "../api/ordersApi.js";
import { formatDate, formatTime, formatNumber, formatVnd } from "../lib/format.js";
import { useToast } from "./ToastContext.jsx";

export default function ReceiptModal({ show, orderId, onHide }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const printAreaRef = useRef(null);

  useEffect(() => {
    if (!show || !orderId) {
      setReceipt(null);
      setError(null);
      return;
    }
    let isSubscribed = true;
    setLoading(true);
    setError(null);
    ordersApi
      .getReceipt(orderId)
      .then((data) => {
        if (isSubscribed) {
          setReceipt(data);
        }
      })
      .catch((err) => {
        if (isSubscribed) {
          setError(err.message || "Không thể tải thông tin biên lai.");
        }
      })
      .finally(() => {
        if (isSubscribed) {
          setLoading(false);
        }
      });
    return () => {
      isSubscribed = false;
    };
  }, [show, orderId]);

  async function handleExportPdf() {
    if (!orderId) return;
    setExporting(true);
    try {
      const fileName = await ordersApi.exportReceiptPdf(orderId);
      toast.success(`Đã tải xuống ${fileName}`);
    } catch (err) {
      toast.error(err.message || "Lỗi khi xuất PDF biên lai.");
    } finally {
      setExporting(false);
    }
  }

  async function handlePrintEscPos() {
    if (!orderId) return;
    setPrinting(true);
    try {
      await ordersApi.printReceipt(orderId);
      toast.success("Đã gửi lệnh in nhiệt ESC/POS thành công.");
    } catch (err) {
      toast.error(err.message || "Lỗi khi gửi lệnh in nhiệt.");
    } finally {
      setPrinting(false);
    }
  }

  function handleBrowserPrint() {
    if (!printAreaRef.current) return;
    const printContent = printAreaRef.current.innerHTML;
    const printWindow = window.open("", "_blank", "width=420,height=650");
    if (!printWindow) {
      toast.error("Trình duyệt đã chặn cửa sổ in (popup blocker). Vui lòng cho phép popup.");
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Hóa đơn #${orderId}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 4mm;
            }
            body {
              font-family: 'Courier New', Courier, monospace, -apple-system, BlinkMacSystemFont, sans-serif;
              font-size: 13px;
              line-height: 1.4;
              color: #000;
              margin: 0;
              padding: 6px;
              width: 72mm;
            }
            .receipt-dashed {
              border-top: 1px dashed #444;
              margin: 8px 0;
            }
            .text-center { text-align: center; }
            .text-end { text-align: right; }
            .fw-bold { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 2px 0; }
          </style>
        </head>
        <body>
          ${printContent}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title as="h5">Biên lai thanh toán</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ background: "#f8f9fa", padding: "24px" }}>
        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" size="sm" className="me-2" />
            Đang tải dữ liệu biên lai…
          </div>
        ) : error ? (
          <div className="alert alert-warning mb-0">
            <strong>Thông báo:</strong> {error}
          </div>
        ) : receipt ? (
          <div
            ref={printAreaRef}
            style={{
              background: "#ffffff",
              color: "#111111",
              fontFamily: "'Courier New', Courier, monospace, -apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: "15px",
              lineHeight: 1.55,
              padding: "32px 28px",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            {/* Header chi nhánh */}
            <div style={{ textAlign: "center", marginBottom: "12px" }}>
              <div style={{ fontWeight: "bold", fontSize: "19px", letterSpacing: "0.5px" }}>
                {receipt.branchName || "SMART CAFE"}
              </div>
              {receipt.branchAddress ? (
                <div style={{ fontSize: "14px", color: "#444", marginTop: "3px" }}>{receipt.branchAddress}</div>
              ) : null}
              {receipt.branchPhone ? (
                <div style={{ fontSize: "14px", color: "#444", marginTop: "1px" }}>ĐT: {receipt.branchPhone}</div>
              ) : null}
            </div>

            <div style={{ borderTop: "1px dashed #718096", margin: "12px 0" }} />

            {/* Tiêu đề hóa đơn */}
            <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "19px", margin: "10px 0" }}>
              HÓA ĐƠN THANH TOÁN
            </div>

            {/* Meta đơn hàng */}
            <div style={{ fontSize: "14px", marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>Số HĐ:</span>
                <strong style={{ fontFamily: "monospace" }}>{receipt.receiptNo || `#${receipt.orderId}`}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>Ngày in: {formatDate(receipt.printedAt)}</span>
                <span>Giờ in: {formatTime(receipt.printedAt)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>Thu ngân:</span>
                <span>{receipt.cashierName || "—"}</span>
              </div>
            </div>

            <div style={{ borderTop: "1px dashed #718096", margin: "12px 0" }} />

            {/* Bảng món */}
            <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px dashed #cbd5e0" }}>
                  <th style={{ textAlign: "left", paddingBottom: "8px" }}>TÊN HÀNG</th>
                  <th style={{ textAlign: "center", paddingBottom: "8px", width: "40px" }}>SL</th>
                  <th style={{ textAlign: "right", paddingBottom: "8px" }}>ĐƠN GIÁ</th>
                  <th style={{ textAlign: "right", paddingBottom: "8px" }}>T.TIỀN</th>
                </tr>
              </thead>
              <tbody>
                {(receipt.items || []).map((item) => (
                  <tr key={item.index} style={{ verticalAlign: "top" }}>
                    <td colSpan={4} style={{ padding: "7px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: "600" }}>
                          {item.index}) {item.productName} {item.size ? `(${item.size})` : ""}
                        </span>
                        <div style={{ display: "flex", gap: "14px" }}>
                          <span style={{ width: "32px", textAlign: "center" }}>{item.quantity}</span>
                          <span style={{ width: "85px", textAlign: "right" }}>
                            {formatNumber(item.unitPrice)}
                          </span>
                          <span style={{ width: "95px", textAlign: "right", fontWeight: "600" }}>
                            {formatNumber(item.lineTotal)}
                          </span>
                        </div>
                      </div>
                      {item.toppings?.length ? (
                        <div style={{ paddingLeft: "18px", color: "#555", fontSize: "13px", marginTop: "2px" }}>
                          {item.toppings.map((tp, idx) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>+ {tp.name} ({tp.quantity})</span>
                              <span>{formatNumber(tp.price)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {item.options ? (
                        <div style={{ paddingLeft: "18px", color: "#555", fontSize: "13px", marginTop: "2px" }}>
                          * {item.options}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: "1px dashed #718096", margin: "12px 0" }} />

            {/* Tổng cộng & Giảm giá */}
            <div style={{ fontSize: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span>T.Cộng</span>
                <span style={{ fontWeight: "bold" }}>{receipt.totalQuantity}</span>
                <span style={{ fontWeight: "bold" }}>{formatNumber(receipt.totalAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span>Tổng tiền hàng:</span>
                <span>{formatNumber(receipt.totalAmount)}</span>
              </div>
              {receipt.hasDiscount ? (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: "#c53030" }}>
                  <span>Giảm giá (Voucher):</span>
                  <span>−{formatNumber(receipt.discountAmount)}</span>
                </div>
              ) : null}
            </div>

            <div style={{ borderTop: "1px dashed #718096", margin: "12px 0" }} />

            {/* Thanh toán & Tiền thừa */}
            <div style={{ fontSize: "15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "16px" }}>
                <span>{receipt.paymentMethod || "TIỀN MẶT"}</span>
                <span>{formatNumber(receipt.finalAmount)}</span>
              </div>
              {receipt.isCash ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "14px" }}>
                    <span>Tiền khách đưa:</span>
                    <span>{formatNumber(receipt.receivedAmount || receipt.finalAmount)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "14px", fontWeight: "600" }}>
                    <span>Tiền thối lại:</span>
                    <span>{formatNumber(receipt.changeReturned || 0)}</span>
                  </div>
                </>
              ) : null}
              {receipt.amountInWords ? (
                <div style={{ fontStyle: "italic", fontSize: "13px", color: "#4a5568", marginTop: "5px" }}>
                  ({receipt.amountInWords})
                </div>
              ) : null}
            </div>

            <div style={{ borderTop: "1px dashed #718096", margin: "14px 0" }} />

            {/* Lời cảm ơn */}
            <div style={{ textAlign: "center", fontWeight: "600", fontSize: "14px", marginTop: "8px" }}>
              Cảm Ơn Quý Khách - Hẹn Gặp Lại!
            </div>
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between flex-wrap gap-2">
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleBrowserPrint}
            disabled={!receipt || loading}
          >
            🖨️ In trình duyệt
          </Button>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={handlePrintEscPos}
            disabled={!receipt || loading || printing}
          >
            {printing ? <Spinner size="sm" className="me-1" /> : "⚡ "}
            In máy nhiệt K80
          </Button>
          <Button
            variant="outline-success"
            size="sm"
            onClick={handleExportPdf}
            disabled={!receipt || loading || exporting}
          >
            {exporting ? <Spinner size="sm" className="me-1" /> : "📥 "}
            Tải PDF
          </Button>
        </div>
        <Button variant="secondary" size="sm" onClick={onHide}>
          Đóng
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

