import { useEffect, useState } from "react";
import { Button } from "react-bootstrap";
import { useAuth } from "../auth/AuthContext.jsx";
import { useRouter } from "../router/HashRouter.jsx";
import { roleLabel } from "../auth/landing.js";
import Icon from "./Icon.jsx";

// Khối góc phải top rail theo prototype: đồng hồ trực tiếp + avatar
// chữ cái đầu (nền accent-soft) + nút Đăng xuất.
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function initialsOf(name) {
  if (!name) return "SC";
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function SessionHeaderRight() {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  const now = useClock();
  const clock = now.toLocaleTimeString("vi-VN", { hour12: false });

  return (
    <>
      <span className="topbar__clock">
        <Icon name="clock" size={14} />
        {clock}
      </span>
      <span
        className="avatar"
        title={user ? `${user.fullName} · ${roleLabel(user.role)}` : ""}
      >
        {initialsOf(user?.fullName)}
      </span>
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={async () => {
          await logout();
          navigate("/login");
        }}
      >
        Đăng xuất
      </Button>
    </>
  );
}
