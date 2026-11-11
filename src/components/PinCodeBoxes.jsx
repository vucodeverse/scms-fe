import { useEffect, useRef } from "react";

// Nhóm ô vuông nhập mã PIN từng chữ số (mặc định 4 ô vuông).
export default function PinCodeBoxes({
  value = "",
  onChange,
  length = 4,
  disabled = false,
  isInvalid = false,
  autoFocus = false,
  ariaLabel = "Mã PIN 4 số",
}) {
  const inputRefs = useRef([]);
  const digits = String(value || "").replace(/\D/g, "").slice(0, length);

  useEffect(() => {
    if (autoFocus && !disabled) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  function updateDigitAt(idx, char) {
    const next = Array.from({ length }, (_, i) => digits[i] || "");
    next[idx] = char;
    onChange?.(next.join(""));
  }

  function handleChange(idx, raw) {
    if (disabled) return;
    const clean = String(raw || "").replace(/\D/g, "");
    if (!clean) {
      updateDigitAt(idx, "");
      return;
    }
    const targetIdx = idx > digits.length ? digits.length : idx;
    if (clean.length > 1) {
      const next = Array.from({ length }, (_, i) => digits[i] || "");
      let cursor = targetIdx;
      for (const ch of clean) {
        if (cursor >= length) break;
        next[cursor] = ch;
        cursor += 1;
      }
      onChange?.(next.join(""));
      const focusIdx = Math.min(cursor, length - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }
    updateDigitAt(targetIdx, clean);
    if (targetIdx < length - 1) {
      inputRefs.current[targetIdx + 1]?.focus();
    }
  }

  function handleKeyDown(idx, e) {
    if (disabled) return;
    if (e.key === "Backspace") {
      if (digits[idx]) {
        e.preventDefault();
        updateDigitAt(idx, "");
      } else if (idx > 0) {
        e.preventDefault();
        updateDigitAt(idx - 1, "");
        inputRefs.current[idx - 1]?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
      return;
    }
    if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(idx, e) {
    if (disabled) return;
    const pasted = e.clipboardData?.getData("text")?.replace(/\D/g, "") || "";
    if (!pasted) return;
    e.preventDefault();
    const next = Array.from({ length }, (_, i) => digits[i] || "");
    let cursor = Math.min(idx, digits.length);
    for (const ch of pasted) {
      if (cursor >= length) break;
      next[cursor] = ch;
      cursor += 1;
    }
    onChange?.(next.join(""));
    const focusIdx = Math.min(cursor, length - 1);
    inputRefs.current[focusIdx]?.focus();
  }

  return (
    <div className="scms-pin-boxes" role="group" aria-label={ariaLabel}>
      {Array.from({ length }, (_, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          aria-label={`${ariaLabel} - ô ${idx + 1}`}
          className={`scms-pin-box${isInvalid ? " is-invalid" : ""}`}
          value={digits[idx] || ""}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={(e) => handlePaste(idx, e)}
        />
      ))}
    </div>
  );
}
