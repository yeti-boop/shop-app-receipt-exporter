function exportReceipt() {
  const orderHeader = document.body.innerText.match(/Order\s*#\s*([A-Z0-9-]+)/i);
  const orderNum = orderHeader ? orderHeader[1] : "Unknown_Order";
  const itemNodes = document.querySelectorAll('a[href*="/products/"]');
  const rows = [];

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function parsePrice(value) {
    const match = String(value ?? "").match(/[-+]?\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})|[-+]?\$?\s?\d+(?:\.\d{2})/);
    return match ? Number.parseFloat(match[0].replace(/[$,\s]/g, "")) : 0;
  }

  itemNodes.forEach((node) => {
    const paragraphs = node.querySelectorAll("p");

    if (paragraphs.length < 3) {
      return;
    }

    const itemName = paragraphs[0].innerText.trim();
    const unitPrice = parsePrice(paragraphs[1].innerText);
    const variantInfo = paragraphs[2].innerText.trim();

    let qty = 1;
    const qtyBadge = node.querySelector('[aria-label$="items"], [aria-label*="quantity" i]');

    if (qtyBadge) {
      const match = qtyBadge.innerText.match(/x\s*(\d+)/i)
        || qtyBadge.getAttribute("aria-label")?.match(/(\d+)/);

      if (match) {
        qty = Number.parseInt(match[1], 10);
      }
    }

    const total = unitPrice * qty;

    rows.push([
      orderNum,
      itemName,
      variantInfo,
      qty,
      unitPrice.toFixed(2),
      total.toFixed(2)
    ]);
  });

  if (rows.length === 0) {
    alert("No items found. Please ensure the receipt page has fully loaded.");
    return;
  }

  const headers = [
    "Order Number",
    "Item Name",
    "Variant",
    "Quantity",
    "Unit Price",
    "Extended Total"
  ];

  const csvContent = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `Shop_Receipt_${orderNum.replace(/[^a-z0-9_-]+/gi, "_")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

exportReceipt();
