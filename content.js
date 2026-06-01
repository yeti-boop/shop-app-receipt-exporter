(() => {
  const EXTENSION_ROOT_ID = "shop-receipt-exporter-modal";
  const moneyRegex = /[-+]?\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})|[-+]?\$?\s?\d+(?:\.\d{2})/;
  const stopBlockLabels = [
    "order summary",
    "payment",
    "billing",
    "shipping",
    "subtotal",
    "discount",
    "tax",
    "taxes",
    "total",
    "items",
    "contact",
    "delivery"
  ];

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function pageLines() {
    return document.body.innerText
      .split(/\n+/)
      .map(text)
      .filter(Boolean);
  }

  function csvEscape(value) {
    const cleaned = String(value ?? "");
    return /[",\n\r]/.test(cleaned) ? `"${cleaned.replace(/"/g, '""')}"` : cleaned;
  }

  function spreadsheetText(value) {
    const cleaned = String(value ?? "");
    return cleaned ? `\t${cleaned}` : "";
  }

  function htmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseMoney(value) {
    const match = text(value).match(moneyRegex);
    return match ? Number.parseFloat(match[0].replace(/[$,\s]/g, "")) : null;
  }

  function formatMoney(value) {
    return Number.isFinite(value) ? value.toFixed(2) : "";
  }

  function detectCurrency(lines) {
    const joined = lines.join(" ");
    const codeMatch = joined.match(/\b(USD|CAD|AUD|NZD|GBP|EUR|JPY|CNY|HKD|SGD|MXN)\b/i);

    if (codeMatch) {
      return codeMatch[1].toUpperCase();
    }

    if (/[€]/.test(joined)) {
      return "EUR";
    }

    if (/[£]/.test(joined)) {
      return "GBP";
    }

    if (/[¥]/.test(joined)) {
      return "JPY";
    }

    if (/[$]/.test(joined)) {
      return "Unspecified $";
    }

    return "";
  }

  function isQuantityOnly(value) {
    return /^x\s*\d+$/i.test(text(value)) || /^\d+\s+items?$/i.test(text(value));
  }

  function isLikelyProductName(value) {
    const cleaned = text(value);
    return cleaned.length > 1 && !isQuantityOnly(cleaned) && !moneyRegex.test(cleaned);
  }

  function getOrderNumber(lines) {
    const bodyText = document.body.innerText;
    const labelled = bodyText.match(/Order\s*#\s*([A-Z0-9-]+)/i);

    if (labelled) {
      return labelled[1];
    }

    const pathOrder = window.location.pathname.match(/orders\/([^/?#]+)/i);
    return pathOrder ? decodeURIComponent(pathOrder[1]) : "Unknown_Order";
  }

  function getOrderDate(lines) {
    const time = document.querySelector("time[datetime]");

    if (time) {
      return time.getAttribute("datetime") || text(time.textContent);
    }

    const dateLine = lines.find((line) => {
      return /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i.test(line);
    });

    return dateLine || "";
  }

  function getMerchant(lines) {
    const headings = [...document.querySelectorAll("h1,h2,h3")]
      .map((node) => text(node.innerText || node.textContent))
      .filter(Boolean)
      .filter((line) => !/^order\b/i.test(line) && !moneyRegex.test(line));

    if (headings.length) {
      return headings[0];
    }

    const title = text(document.title).replace(/\s*[-|].*$/, "");
    return /^shop\b/i.test(title) ? "" : title;
  }

  function amountFor(labels, lines) {
    const normalizedLabels = labels.map((label) => label.toLowerCase());

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lower = line.toLowerCase().replace(/:$/, "");
      const matchesLabel = normalizedLabels.some((label) => lower === label || lower.startsWith(`${label} `));

      if (!matchesLabel) {
        continue;
      }

      const inlineAmount = parseMoney(line);

      if (inlineAmount !== null) {
        return inlineAmount;
      }

      for (let lookahead = index + 1; lookahead < Math.min(index + 4, lines.length); lookahead += 1) {
        const amount = parseMoney(lines[lookahead]);

        if (amount !== null) {
          return amount;
        }
      }
    }

    return null;
  }

  function blockAfter(labels, lines) {
    const normalizedLabels = labels.map((label) => label.toLowerCase());
    const start = lines.findIndex((line) => {
      const lower = line.toLowerCase().replace(/:$/, "");
      return normalizedLabels.some((label) => lower === label || lower.startsWith(label));
    });

    if (start === -1) {
      return "";
    }

    const block = [];

    for (let index = start + 1; index < Math.min(start + 8, lines.length); index += 1) {
      const line = lines[index];
      const lower = line.toLowerCase().replace(/:$/, "");

      if (stopBlockLabels.some((label) => lower === label || lower.startsWith(label))) {
        break;
      }

      if (moneyRegex.test(line)) {
        break;
      }

      block.push(line);
    }

    return block.join(", ");
  }

  function getCustomer(lines) {
    const shippingAddress = blockAfter(["ship to", "shipping address", "delivery address"], lines);

    if (shippingAddress) {
      return shippingAddress.split(",")[0] || "";
    }

    return blockAfter(["contact", "customer"], lines).split(",")[0] || "";
  }

  function extractDetails(lines) {
    return {
      orderNumber: getOrderNumber(lines),
      orderDate: getOrderDate(lines),
      merchant: getMerchant(lines),
      currency: detectCurrency(lines),
      customer: getCustomer(lines),
      shippingAddress: blockAfter(["ship to", "shipping address", "delivery address"], lines),
      billingAddress: blockAfter(["billing address", "bill to"], lines),
      subtotal: amountFor(["subtotal"], lines),
      discount: amountFor(["discount", "discounts"], lines),
      shipping: amountFor(["shipping", "delivery"], lines),
      tax: amountFor(["tax", "taxes", "estimated tax"], lines),
      total: amountFor(["total", "order total", "paid"], lines)
    };
  }

  function extractQuantity(node) {
    const badge = node.querySelector('[aria-label$="items"], [aria-label*="quantity" i]');
    const source = `${badge?.innerText || ""} ${badge?.getAttribute("aria-label") || ""} ${node.innerText || ""}`;
    const explicit = source.match(/x\s*(\d+)/i) || source.match(/(?:qty|quantity)\s*:?\s*(\d+)/i);

    return explicit ? Number.parseInt(explicit[1], 10) : 1;
  }

  function extractItem(node) {
    const values = [...node.querySelectorAll("p,span,div")]
      .map((element) => text(element.innerText || element.textContent))
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);

    const itemName = values.find(isLikelyProductName) || "";

    if (!itemName) {
      return null;
    }

    const priceValue = values.find((value) => moneyRegex.test(value) && !isQuantityOnly(value));
    const unitPrice = parseMoney(priceValue);

    if (unitPrice === null) {
      return null;
    }

    const variant = values.find((value) => {
      return value !== itemName && isLikelyProductName(value) && !/^view\b/i.test(value);
    }) || "";
    const quantity = extractQuantity(node);

    return {
      itemName,
      variant,
      quantity,
      unitPrice,
      extendedTotal: unitPrice * quantity
    };
  }

  function extractItems() {
    const seen = new Set();

    return [...document.querySelectorAll('a[href*="/products/"]')]
      .map(extractItem)
      .filter(Boolean)
      .filter((item) => {
        const key = `${item.itemName}|${item.variant}|${item.quantity}|${item.unitPrice}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  function buildCsv(details, items) {
    const rows = [
      ["Shop.app Receipt Export"],
      [],
      ["Order Number", details.orderNumber],
      ["Order Date", details.orderDate],
      ["Merchant", details.merchant],
      ["Currency", details.currency],
      ["Customer", details.customer],
      ["Shipping Address", details.shippingAddress],
      ["Billing Address", details.billingAddress],
      [],
      ["Line Items"],
      ["Item Name", "Variant", "Quantity", "Unit Price", "Extended Total"],
      ...items.map((item) => [
        item.itemName,
        spreadsheetText(item.variant),
        item.quantity,
        formatMoney(item.unitPrice),
        formatMoney(item.extendedTotal)
      ]),
      [],
      ["Totals"],
      ["Subtotal", formatMoney(details.subtotal)],
      ["Discount", formatMoney(details.discount)],
      ["Shipping", formatMoney(details.shipping)],
      ["Tax", formatMoney(details.tax)],
      ["Order Total", formatMoney(details.total)]
    ];

    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  }

  function downloadCsv(details, items) {
    const blob = new Blob([buildCsv(details, items)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `Shop_Receipt_${details.orderNumber.replace(/[^a-z0-9_-]+/gi, "_")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function moneyCell(value) {
    return value === null || value === undefined ? "" : formatMoney(value);
  }

  function displayMoney(value, currency) {
    if (value === null || value === undefined) {
      return "";
    }

    const amount = formatMoney(value);

    if (currency === "Unspecified $") {
      return `$${amount}`;
    }

    return currency ? `${amount} ${currency}` : amount;
  }

  function buildPrintableHtml(details, items) {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

    return `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Shop Receipt ${htmlEscape(details.orderNumber)}</title>
          <style>
            @page { margin: 0.5in; }
            body {
              color: #111827;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 12px;
              margin: 0;
            }
            h1 {
              font-size: 24px;
              margin: 0 0 4px;
            }
            h2 {
              font-size: 14px;
              margin: 24px 0 8px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              gap: 24px;
              border-bottom: 2px solid #111827;
              padding-bottom: 14px;
            }
            .meta {
              min-width: 220px;
              text-align: right;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
              margin-top: 18px;
            }
            .label {
              color: #6b7280;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.04em;
              text-transform: uppercase;
            }
            .box {
              border: 1px solid #d1d5db;
              padding: 10px;
              min-height: 46px;
              white-space: pre-wrap;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
            }
            th, td {
              border-bottom: 1px solid #e5e7eb;
              padding: 7px 8px;
              text-align: left;
              vertical-align: top;
            }
            th {
              background: #f3f4f6;
              font-weight: 700;
            }
            .num {
              text-align: right;
              white-space: nowrap;
            }
            .totals {
              margin-left: auto;
              margin-top: 18px;
              width: 280px;
            }
            .totals td {
              border-bottom: 0;
              padding: 4px 0;
            }
            .total-row td {
              border-top: 2px solid #111827;
              font-size: 14px;
              font-weight: 700;
              padding-top: 8px;
            }
            .footnote {
              color: #6b7280;
              font-size: 11px;
              margin-top: 24px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Receipt Invoice</h1>
              <div>${htmlEscape(details.merchant || "Shop.app")}</div>
            </div>
            <div class="meta">
              <div><span class="label">Order</span> ${htmlEscape(details.orderNumber)}</div>
              <div><span class="label">Date</span> ${htmlEscape(details.orderDate)}</div>
              <div><span class="label">Items</span> ${items.length} lines / ${totalQuantity} units</div>
              <div><span class="label">Currency</span> ${htmlEscape(details.currency || "Not detected")}</div>
            </div>
          </div>
          <div class="grid">
            <div>
              <div class="label">Customer</div>
              <div class="box">${htmlEscape(details.customer)}</div>
            </div>
            <div>
              <div class="label">Ship To</div>
              <div class="box">${htmlEscape(details.shippingAddress)}</div>
            </div>
            <div>
              <div class="label">Bill To</div>
              <div class="box">${htmlEscape(details.billingAddress)}</div>
            </div>
          </div>
          <h2>Line Items</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Variant</th>
                <th class="num">Qty</th>
                <th class="num">Unit</th>
                <th class="num">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => `
                <tr>
                  <td>${htmlEscape(item.itemName)}</td>
                  <td>${htmlEscape(item.variant)}</td>
                  <td class="num">${item.quantity}</td>
                  <td class="num">${displayMoney(item.unitPrice, details.currency)}</td>
                  <td class="num">${displayMoney(item.extendedTotal, details.currency)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <table class="totals">
            <tbody>
              <tr><td>Subtotal</td><td class="num">${displayMoney(details.subtotal, details.currency)}</td></tr>
              <tr><td>Discount</td><td class="num">${displayMoney(details.discount, details.currency)}</td></tr>
              <tr><td>Shipping</td><td class="num">${displayMoney(details.shipping, details.currency)}</td></tr>
              <tr><td>Tax</td><td class="num">${displayMoney(details.tax, details.currency)}</td></tr>
              <tr class="total-row"><td>Total</td><td class="num">${displayMoney(details.total, details.currency)}</td></tr>
            </tbody>
          </table>
          <div class="footnote">Generated locally from the visible Shop.app receipt page. Verify against the original receipt before bookkeeping use.</div>
        </body>
      </html>`;
  }

  function printInvoice(details, items) {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!printWindow) {
      alert("Print window was blocked. Allow popups for this page and try again.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintableHtml(details, items));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function renderDetail(label, value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    return `<div class="sre-detail"><span>${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></div>`;
  }

  function showModal(details, items) {
    document.getElementById(EXTENSION_ROOT_ID)?.remove();

    const root = document.createElement("div");
    root.id = EXTENSION_ROOT_ID;
    root.innerHTML = `
      <style>
        #${EXTENSION_ROOT_ID} {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: rgba(17, 24, 39, 0.52);
          color: #111827;
          font-family: Arial, Helvetica, sans-serif;
        }
        #${EXTENSION_ROOT_ID} .sre-panel {
          position: absolute;
          top: 5vh;
          left: 50%;
          transform: translateX(-50%);
          width: min(1120px, calc(100vw - 32px));
          max-height: 90vh;
          overflow: auto;
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
        }
        #${EXTENSION_ROOT_ID} .sre-header,
        #${EXTENSION_ROOT_ID} .sre-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
        }
        #${EXTENSION_ROOT_ID} .sre-actions {
          border-top: 1px solid #e5e7eb;
          border-bottom: 0;
          justify-content: flex-end;
        }
        #${EXTENSION_ROOT_ID} h2 {
          margin: 0;
          font-size: 18px;
          line-height: 1.3;
        }
        #${EXTENSION_ROOT_ID} .sre-body {
          padding: 18px 20px;
        }
        #${EXTENSION_ROOT_ID} .sre-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 18px;
          margin-bottom: 18px;
        }
        #${EXTENSION_ROOT_ID} .sre-detail {
          display: grid;
          grid-template-columns: 140px minmax(0, 1fr);
          gap: 8px;
          font-size: 13px;
        }
        #${EXTENSION_ROOT_ID} .sre-detail span {
          color: #6b7280;
        }
        #${EXTENSION_ROOT_ID} .sre-detail strong {
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        #${EXTENSION_ROOT_ID} table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        #${EXTENSION_ROOT_ID} th,
        #${EXTENSION_ROOT_ID} td {
          padding: 8px 10px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
          vertical-align: top;
        }
        #${EXTENSION_ROOT_ID} th {
          color: #374151;
          background: #f9fafb;
          font-weight: 700;
        }
        #${EXTENSION_ROOT_ID} .sre-num {
          text-align: right;
          white-space: nowrap;
        }
        #${EXTENSION_ROOT_ID} button {
          border: 1px solid #9ca3af;
          border-radius: 6px;
          background: #ffffff;
          color: #111827;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          padding: 8px 12px;
        }
        #${EXTENSION_ROOT_ID} .sre-primary {
          border-color: #111827;
          background: #111827;
          color: #ffffff;
        }
        #${EXTENSION_ROOT_ID} .sre-empty {
          border: 1px solid #f59e0b;
          background: #fffbeb;
          color: #92400e;
          padding: 12px;
          border-radius: 6px;
        }
      </style>
      <div class="sre-panel" role="dialog" aria-modal="true" aria-label="Shop receipt export preview">
        <div class="sre-header">
          <h2>Receipt Export Preview - Order ${htmlEscape(details.orderNumber)}</h2>
          <button type="button" data-sre-close>Close</button>
        </div>
        <div class="sre-body">
          <div class="sre-grid">
            ${renderDetail("Merchant", details.merchant)}
            ${renderDetail("Order Date", details.orderDate)}
            ${renderDetail("Currency", details.currency || "Not detected")}
            ${renderDetail("Customer", details.customer)}
            ${renderDetail("Shipping", displayMoney(details.shipping, details.currency))}
            ${renderDetail("Tax", displayMoney(details.tax, details.currency))}
            ${renderDetail("Total", displayMoney(details.total, details.currency))}
            ${renderDetail("Ship To", details.shippingAddress)}
            ${renderDetail("Bill To", details.billingAddress)}
          </div>
          ${items.length ? `
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Variant</th>
                  <th class="sre-num">Qty</th>
                  <th class="sre-num">Unit</th>
                  <th class="sre-num">Line Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item) => `
                  <tr>
                    <td>${htmlEscape(item.itemName)}</td>
                    <td>${htmlEscape(item.variant)}</td>
                    <td class="sre-num">${item.quantity}</td>
                    <td class="sre-num">${displayMoney(item.unitPrice, details.currency)}</td>
                    <td class="sre-num">${displayMoney(item.extendedTotal, details.currency)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : `<div class="sre-empty">No line items were found. Make sure the Shop.app receipt is fully loaded.</div>`}
        </div>
        <div class="sre-actions">
          <button type="button" data-sre-print ${items.length ? "" : "disabled"}>Print Invoice</button>
          <button type="button" data-sre-copy>Copy CSV</button>
          <button type="button" class="sre-primary" data-sre-download ${items.length ? "" : "disabled"}>Download CSV</button>
        </div>
      </div>
    `;

    root.querySelector("[data-sre-close]").addEventListener("click", () => root.remove());
    root.addEventListener("click", (event) => {
      if (event.target === root) {
        root.remove();
      }
    });
    root.querySelector("[data-sre-download]").addEventListener("click", () => downloadCsv(details, items));
    root.querySelector("[data-sre-print]").addEventListener("click", () => printInvoice(details, items));
    root.querySelector("[data-sre-copy]").addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(buildCsv(details, items));
      event.target.textContent = "Copied";
      window.setTimeout(() => {
        event.target.textContent = "Copy CSV";
      }, 1400);
    });

    document.body.appendChild(root);
  }

  const lines = pageLines();
  const details = extractDetails(lines);
  const items = extractItems();

  showModal(details, items);
})();
