import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import TaskLayout from "../layouts/TaskLayout.jsx";
import StatusTag from "../components/StatusTag.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useToast } from "../components/ToastContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { vouchersApi } from "../api/vouchersApi.js";
import { formatDate, formatDateTime, formatVnd } from "../lib/format.js";

const STATUS_LABELS = { ACTIVE: "Đang hoạt động", INACTIVE: "Ngừng hoạt động" };

function InfoRow({ label, children }) {
  return (
    <div className="stat-line" style={{ borderBottom: "1px solid var(--line)" }}>
      <span className="text-muted">{label}</span>
      <strong style={{ textAlign: "right" }}>{children}</strong>
    </div>
  );
}

// SCR-12 — Chi tiết voucher (FE-14). Mọi thao tác (Sửa, Xoá mềm /
// Kích hoạt lại, Xóa hẳn) nằm ở trang này; danh sách chỉ còn bấm
// vào mã voucher để mở chi tiết, cùng chuẩn với FE-13.
export default function VoucherDetailPage() {
  const { query, navigate } = useRouter();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const voucherId = query.id ? Number(query.id) : null;
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [voucher, setVoucher] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'activate' | 'soft' | 'hard'
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!voucherId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const detail = await vouchersApi.detail(voucherId);
      setVoucher(detail);
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else toastRef.current.error(err.message || "Không tải được dữ liệu voucher.");
    } finally {
      setLoading(false);
    }
  }, [voucherId]);

  useEffect(() => {
    load();
  }, [load]);

  async function runConfirm() {
    if (!confirm || !voucher) return;
    setBusy(true);
    try {
      if (confirm === "activate") {
        await vouchersApi.changeStatus(voucher.id, "ACTIVE");
        toast.success(`Đã kích hoạt voucher ${voucher.code}.`);
        setConfirm(null);
        load();
      } else if (confirm === "soft") {
        await vouchersApi.softDelete(voucher.id);
        toast.success(`Đã ngừng voucher ${voucher.code}.`);
        setConfirm(null);
        load();
      } else {
        await vouchersApi.hardDelete(voucher.id);
        toast.success(`Đã xóa hẳn voucher ${voucher.code}.`);
        navigate("/chain/vouchers");
      }
    } catch (err) {
      toast.error(err.message || "Thao tác thất bại.");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <TaskLayout
        title="Không tìm thấy voucher"
        screenCode="SCR-12"
        codeLabel="Khuyến mãi & Voucher"
        backTo="/chain/vouchers"
      >
        <div className="scms-panel panel-pad">
          <div className="empty-state">
            <span>Voucher không tồn tại. Quay lại danh sách.</span>
          </div>
        </div>
      </TaskLayout>
    );
  }

  const products = voucher?.products || [];
  const categories = voucher?.categories || [];
  const appliesToAll = products.length === 0 && categories.length === 0;

  return (
    <TaskLayout
      title={voucher ? `Chi tiết voucher · ${voucher.code}` : "Chi tiết voucher"}
      subtitle="Điều kiện áp dụng, thời gian hiệu lực và phạm vi áp dụng."
      screenCode="SCR-12"
      codeLabel="Khuyến mãi & Voucher"
      backTo="/chain/vouchers"
      meta={
        voucher ? (
          <StatusTag status={voucher.status} label={STATUS_LABELS[voucher.status] || voucher.status} />
        ) : null
      }
    >
      {loading || !voucher ? (
        <div className="text-center py-5">
          <Spinner className="me-2" /> Đang tải…
        </div>
      ) : (
        <>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Button variant="primary" onClick={() => navigate(`/chain/vouchers/edit?id=${voucher.id}`)}>
              Sửa voucher
            </Button>
            {voucher.status === "ACTIVE" ? (
              <Button variant="outline-secondary" onClick={() => setConfirm("soft")}>
                Xoá mềm
              </Button>
            ) : (
              <Button variant="outline-secondary" onClick={() => setConfirm("activate")}>
                Kích hoạt lại
              </Button>
            )}
            <Button variant="outline-danger" onClick={() => setConfirm("hard")}>
              Xóa hẳn
            </Button>
          </div>

          <div className="scms-panel panel-pad">
            <div className="panel-head">
              <div>
                <h2>
                  Voucher <span className="mono">{voucher.code}</span>
                </h2>
                <p>Thông tin và điều kiện áp dụng của voucher.</p>
              </div>
            </div>
            <InfoRow label="Loại giảm">
              {voucher.discountType === "PERCENT" ? "Phần trăm" : "Số tiền"}
            </InfoRow>
            <InfoRow label="Giá trị giảm">
              {voucher.discountType === "PERCENT"
                ? `${Number(voucher.discountValue)}%`
                : formatVnd(voucher.discountValue)}
            </InfoRow>
            <InfoRow label="Đơn tối thiểu">
              {voucher.minOrderAmount != null ? formatVnd(voucher.minOrderAmount) : "Không yêu cầu"}
            </InfoRow>
            <InfoRow label="Đã dùng / giới hạn">
              {voucher.usedCount} / {voucher.usageLimit ?? "Không giới hạn"}
            </InfoRow>
            <InfoRow label="Hiệu lực">
              {formatDate(voucher.startDate)} – {formatDate(voucher.endDate)}
            </InfoRow>
            <InfoRow label="Tạo lúc">{formatDateTime(voucher.createdAt)}</InfoRow>
            <InfoRow label="Cập nhật lúc">{formatDateTime(voucher.updatedAt)}</InfoRow>
          </div>

          <div className="scms-panel panel-pad mt-3">
            <div className="panel-head">
              <div>
                <h2>Phạm vi áp dụng</h2>
                <p>
                  {appliesToAll
                    ? "Voucher áp dụng cho toàn bộ sản phẩm trong menu."
                    : "Voucher chỉ áp dụng cho các sản phẩm và danh mục dưới đây."}
                </p>
              </div>
            </div>
            {appliesToAll ? (
              <div className="empty-state">
                <span>Toàn bộ sản phẩm — không giới hạn theo sản phẩm hay danh mục.</span>
              </div>
            ) : (
              <>
                <InfoRow label="Sản phẩm áp dụng">
                  {products.length ? products.map((p) => p.name).join(", ") : "Không giới hạn theo sản phẩm"}
                </InfoRow>
                <InfoRow label="Danh mục áp dụng">
                  {categories.length
                    ? categories.map((c) => c.name).join(", ")
                    : "Không giới hạn theo danh mục"}
                </InfoRow>
              </>
            )}
          </div>

          <ConfirmDialog
            show={!!confirm}
            title={
              confirm === "activate"
                ? "Kích hoạt voucher"
                : confirm === "soft"
                  ? "Xoá mềm voucher"
                  : "Xóa hẳn voucher"
            }
            body={
              confirm === "activate" ? (
                <>
                  Kích hoạt lại voucher <strong>{voucher.code}</strong>?
                </>
              ) : confirm === "soft" ? (
                <>
                  Xoá mềm voucher <strong>{voucher.code}</strong>? Voucher chuyển sang trạng thái ngừng
                  hoạt động và có thể kích hoạt lại.
                </>
              ) : (
                <>
                  Xóa hẳn voucher <strong>{voucher.code}</strong>? Thao tác không thể hoàn tác. Voucher đã
                  có lượt dùng sẽ bị backend từ chối xóa.
                </>
              )
            }
            confirmLabel={confirm === "hard" ? "Xóa hẳn" : "Xác nhận"}
            danger={confirm === "hard"}
            busy={busy}
            onConfirm={runConfirm}
            onCancel={() => !busy && setConfirm(null)}
          />
        </>
      )}
    </TaskLayout>
  );
}
