// scms-fe/src/lib/unitConversion.js
// Logic quy đổi đơn vị chuẩn cho chuỗi đồ uống F&B:
// Thùng/Bao/Kiện -> Gói/Hộp/Chai lẻ -> Tổng khối lượng / Thể tích chuẩn (g, kg, ml, lít, cái)

export function fmtQty(v) {
  if (v === null || v === undefined || v === "") return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(v));
}

/**
 * Phân tích và tính toán quy đổi kiện/thùng sang đơn vị lẻ và tổng khối lượng/thể tích.
 *
 * @param {string} packUnit - Quy cách đóng gói (vd: "Thùng 10 gói 500g", "Bao 5kg", "Thùng 6 chai 700ml")
 * @param {number|string} unitsPerPack - Định lượng cơ sở trong 1 kiện từ DB (nếu có)
 * @param {string} baseUnit - Đơn vị cơ sở ("g", "ml", "cái", "ly")
 * @param {number|string} cartons - Số lượng kiện / thùng cần quy đổi
 * @param {string} ingredientName - Tên nguyên vật liệu để đối chiếu dung tích/khối lượng
 * @returns {object} { cartonName, itemsPerPack, itemUnit, hasSubPacks, totalPacks, totalBaseQty, formattedTotalQty, rawPackUnit }
 */
export function parsePackDetails(packUnit, unitsPerPack, baseUnit, cartons = 1, ingredientName = "") {
  const c = Math.max(0, Number(cartons) || 0);
  const raw = String(packUnit || "").trim();
  const name = String(ingredientName || "").trim();
  const combined = `${raw} ${name}`;

  let itemsPerPack = 1;
  let itemUnit = "";
  let cartonName = "Kiện";

  // 1. Phân tích loại bao bì lớn (Thùng, Bao, Kiện, Két, Cây, Bịch...)
  const mPrefix = combined.match(/\b(Thùng|Bao|Kiện|Két|Hộp|Túi|Chai|Lon|Cây|Bịch)\b/iu);
  if (mPrefix) {
    cartonName = mPrefix[1];
  } else {
    cartonName = "Thùng";
  }

  // Phân tích số món đóng gói con bên trong (vd: Thùng 10 gói, Thùng 6 chai, Thùng 24 lon...)
  const mSub = combined.match(/(Thùng|Kiện|Bao|Két)\s*(\d+)\s*(gói|túi|hộp|lon|chai|cây|bịch|bao|ly|cái)/iu);
  if (mSub) {
    cartonName = mSub[1];
    itemsPerPack = parseInt(mSub[2], 10) || 1;
    itemUnit = mSub[3].toLowerCase();
  } else {
    const mPacks = combined.match(/(\d+)\s*(gói|túi|hộp|lon|chai|cây|bịch|bao|ly|cái)/iu);
    if (mPacks) {
      itemsPerPack = parseInt(mPacks[1], 10) || 1;
      itemUnit = mPacks[2].toLowerCase();
    }
  }

  // 2. Xác định xem có phải mặt hàng đếm số lượng (ly nhựa, ống hút...) không
  const isCountItem =
    baseUnit === "cái" ||
    baseUnit === "ly" ||
    baseUnit === "ống" ||
    combined.includes("Ly nhựa") ||
    combined.includes("Ống hút");

  let unitWeight = 0;
  let weightUnit = "";

  if (isCountItem) {
    // Với ly nhựa, ống hút: 1 cây = 50 ly, 1 bịch = 100 cái...
    const mCount = combined.match(/(\d+)\s*(ly|cái|ống)(?![a-zA-Zà-ỹÀ-Ỹ0-9])/iu);
    if (mCount) {
      unitWeight = parseInt(mCount[1], 10);
      weightUnit = mCount[2].toLowerCase();
    } else {
      unitWeight = 1;
      weightUnit = baseUnit || "cái";
    }
  } else {
    // Với nguyên liệu định lượng (Trà, Siro, Đường, Cà phê, Sữa...):
    // Tìm định lượng từng gói/chai/hộp/bao: 500g, 700ml, 5kg, 1kg, 1L, 380g...
    const mWeight = combined.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|lít|lit|ml)(?![a-zA-Zà-ỹÀ-Ỹ0-9])/iu);
    if (mWeight) {
      const val = parseFloat(mWeight[1].replace(",", "."));
      const u = mWeight[2].toLowerCase();
      if (u === "kg") {
        unitWeight = val * 1000;
        weightUnit = "g";
      } else if (u === "g") {
        unitWeight = val;
        weightUnit = "g";
      } else if (u === "l" || u === "lít" || u === "lit") {
        unitWeight = val * 1000;
        weightUnit = "ml";
      } else if (u === "ml") {
        unitWeight = val;
        weightUnit = "ml";
      }
    }

    // Nhận diện đặc thù nếu chuỗi chưa ghi dung tích rõ ràng
    if (!unitWeight && (combined.includes("Sữa tươi") || combined.includes("Dalat Milk"))) {
      unitWeight = 1000;
      weightUnit = "ml";
    } else if (!unitWeight && (combined.includes("Ông Thọ") || combined.includes("Sữa đặc"))) {
      unitWeight = 380;
      weightUnit = "g";
    }
  }

  // 3. Tính tổng số đơn vị cơ sở cho 1 kiện (totalBaseUnitsPerCarton)
  let totalBaseUnitsPerCarton = Number(unitsPerPack) || 0;
  let effBaseUnit = baseUnit || weightUnit || "g";

  if (totalBaseUnitsPerCarton > 1) {
    if (weightUnit && (effBaseUnit === "hộp" || effBaseUnit === "lon" || !effBaseUnit)) {
      effBaseUnit = weightUnit;
    }
  } else if (unitWeight > 0) {
    totalBaseUnitsPerCarton = itemsPerPack * unitWeight;
    effBaseUnit = weightUnit || baseUnit || (isCountItem ? "cái" : "g");
  } else {
    totalBaseUnitsPerCarton = itemsPerPack > 1 ? itemsPerPack : 1;
  }

  // 4. Kiểm tra xem có đơn vị con thực sự (gói, hộp, lon, chai...) hay không
  // TUYỆT ĐỐI không để itemUnit = 'g' hoặc 'ml' (tránh lỗi ngớ ngẩn như '4 g', '5 g')
  const hasSubPacks = itemsPerPack > 1 && !!itemUnit && itemUnit !== "g" && itemUnit !== "ml" && itemUnit !== effBaseUnit;
  const totalPacks = hasSubPacks ? c * itemsPerPack : 0;
  const totalBaseQty = c * totalBaseUnitsPerCarton;

  // 5. Chuẩn hóa format hiển thị dễ đọc cho người dùng:
  //    >= 1000 g -> hiển thị "X kg (Y g)"
  //    >= 1000 ml -> hiển thị "X lít (Y ml)"
  let formattedTotalQty = "";
  if (effBaseUnit === "g") {
    if (totalBaseQty >= 1000) {
      const kg = totalBaseQty / 1000;
      formattedTotalQty = `${fmtQty(kg)} kg (${fmtQty(totalBaseQty)} g)`;
    } else {
      formattedTotalQty = `${fmtQty(totalBaseQty)} g`;
    }
  } else if (effBaseUnit === "ml") {
    if (totalBaseQty >= 1000) {
      const lit = totalBaseQty / 1000;
      formattedTotalQty = `${fmtQty(lit)} lít (${fmtQty(totalBaseQty)} ml)`;
    } else {
      formattedTotalQty = `${fmtQty(totalBaseQty)} ml`;
    }
  } else {
    formattedTotalQty = `${fmtQty(totalBaseQty)} ${effBaseUnit}`;
  }

  return {
    cartonName,
    itemsPerPack,
    itemUnit: hasSubPacks ? itemUnit : "",
    hasSubPacks,
    totalPacks,
    totalBaseQty,
    formattedTotalQty,
    rawPackUnit: raw || `${cartonName}`,
  };
}
