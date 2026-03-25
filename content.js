// eBay Sold Price Panel - content.js
// Injects a floating sidebar showing recently sold prices for the current item

(function () {
  "use strict";

  // ─── Helpers ────────────────────────────────────────────────────────────────

  // ─── Site detection ─────────────────────────────────────────────────────────

  function getSite() {
    const h = location.hostname;
    if (h.includes("vinted")) return "vinted";
    if (h.includes("ebay")) return "ebay";
    return "unknown";
  }

  function isUK() {
    return location.hostname.endsWith(".co.uk");
  }

  // ─── eBay item readers ───────────────────────────────────────────────────────

  function getEbayTitle() {
    const h1 = document.querySelector("h1.x-item-title__mainTitle span");
    if (h1) return h1.innerText.trim();
    const og = document.querySelector('meta[property="og:title"]');
    if (og) return og.getAttribute("content").trim();
    return document.title.replace(" | eBay", "").trim();
  }

  function getEbayCondition() {
    const selectors = [
      ".x-item-condition-value .ux-textspans",
      ".x-item-condition-value span",
      "[data-testid='x-item-condition'] span",
      ".condText",
      "#vi-itm-cond",
      ".u-flL.condText",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = el.textContent.trim().toLowerCase();
        if (txt && txt.length > 1) return txt;
      }
    }
    const condArea = document.querySelector(".x-item-condition-text, .vim-x-item-condition");
    if (condArea) return condArea.textContent.trim().toLowerCase();
    return null;
  }

  // ─── Vinted item readers ─────────────────────────────────────────────────────

  function getVintedTitle() {
    // Try the main item title heading
    const selectors = [
      "[data-testid='item-page-summary-plugin'] h1",
      "[data-testid='item-description-title'] h1",
      ".item-page-summary h1",
      "h1[itemprop='name']",
      "h1.web_ui__Text__title",
      "h1",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = el.innerText.trim();
        if (txt && txt.length > 2) return txt;
      }
    }
    // Fallback: og:title (Vinted sets this to the item name)
    const og = document.querySelector('meta[property="og:title"]');
    if (og) return og.getAttribute("content").replace(/\s*[\|\-–].*$/, "").trim();
    return document.title.replace(/\s*[\|\-–].*$/, "").trim();
  }

  // Vinted condition labels: "New with tags", "New without tags",
  // "Very good", "Good", "Satisfactory"
  function getVintedCondition() {
    const selectors = [
      "[data-testid='item-condition'] span",
      "[data-testid='item-condition']",
      "[itemprop='itemCondition']",
      ".item-conditions span",
      ".details-list__item-title + .details-list__item-value",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = el.textContent.trim().toLowerCase();
        if (txt && txt.length > 2 && !txt.includes("condition")) return txt;
      }
    }
    // Vinted also embeds structured data
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const json = JSON.parse(ld.textContent);
        if (json.itemCondition) {
          const cond = json.itemCondition.toLowerCase();
          if (cond.includes("new")) return "new";
          if (cond.includes("used")) return "used";
        }
      } catch (_) {}
    }
    return null;
  }

  // ─── Unified readers ─────────────────────────────────────────────────────────

  function getItemTitle() {
    return getSite() === "vinted" ? getVintedTitle() : getEbayTitle();
  }

  function getItemCondition() {
    return getSite() === "vinted" ? getVintedCondition() : getEbayCondition();
  }

  // Maps condition string to eBay's LH_ItemCondition param
  // 1000=New, 2500=Seller refurb, 3000=Used, 4000=Very Good,
  // 5000=Good, 6000=Acceptable, 7000=For parts
  function conditionToEbayParam(condStr) {
    if (!condStr) return null;
    const c = condStr.toLowerCase();
    if (/for parts|not working|spares/.test(c)) return "7000";
    if (/faulty|untested|acceptable|satisfactory/.test(c)) return "6000";
    if (/very good/.test(c)) return "4000";
    if (/\bgood\b/.test(c)) return "5000";
    if (/seller.{0,10}refurb|refurbished/.test(c)) return "2500";
    if (/certified.{0,10}refurb/.test(c)) return "2000";
    if (/new with tags|new without tags|\bnew\b/.test(c)) return "1000";
    if (/used|pre.?owned/.test(c)) return "3000";
    return null;
  }

  function conditionLabel(condStr) {
    if (!condStr) return null;
    return condStr.charAt(0).toUpperCase() + condStr.slice(1).split("\n")[0].trim().slice(0, 30);
  }

  function stripModelNoise(title) {
    return title
      .replace(/\b(brand new|new|used|for parts|spares|untested|faulty|boxed|unboxed|bundle|lot|set|pair|x\d+|\d+x)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 80);
  }

  function buildSoldSearchURL(query, conditionCode) {
    const base = isUK() ? "https://www.ebay.co.uk" : "https://www.ebay.com";
    const params = new URLSearchParams({
      _nkw: query,
      LH_Sold: "1",
      LH_Complete: "1",
      _sop: "13",
      _ipg: "60",
    });
    if (conditionCode) params.set("LH_ItemCondition", conditionCode);
    return `${base}/sch/i.html?${params}`;
  }

  function buildActiveSearchURL(query, conditionCode) {
    const base = isUK() ? "https://www.ebay.co.uk" : "https://www.ebay.com";
    const params = new URLSearchParams({
      _nkw: query,
      _sop: "15",
      _ipg: "60",
    });
    if (conditionCode) params.set("LH_ItemCondition", conditionCode);
    return `${base}/sch/i.html?${params}`;
  }

  function parseCurrency(str) {
    if (!str) return null;
    const n = parseFloat(str.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }

  function formatPrice(n) {
    if (n === null || n === undefined) return "—";
    const sym = isUK() ? "£" : "$";
    return sym + n.toFixed(2);
  }

  // ─── Panel UI ───────────────────────────────────────────────────────────────

  function createPanel() {
    const panel = document.createElement("div");
    panel.id = "esp-panel";
    panel.innerHTML = `
      <div id="esp-header">
        <span id="esp-title">Sold Prices</span>
        <div id="esp-header-btns">
          <button id="esp-refresh" title="Refresh">&#8635;</button>
          <button id="esp-toggle" title="Collapse">&#8249;</button>
        </div>
      </div>
      <div id="esp-body">
        <div id="esp-loading">
          <div class="esp-spinner"></div>
          <span>Fetching sold listings…</span>
        </div>
        <div id="esp-content" style="display:none">
          <div id="esp-stats"></div>
          <div id="esp-divider"></div>
          <div id="esp-list-header">
            <span>Recent sales</span>
            <span id="esp-open-link"></span>
          </div>
          <div id="esp-list"></div>
          <div id="esp-active-row">
            <span id="esp-active-label"></span>
            <a id="esp-active-link" target="_blank">View active listings →</a>
          </div>
        </div>
        <div id="esp-error" style="display:none">
          <span id="esp-error-msg"></span>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }

  function showLoading() {
    document.getElementById("esp-loading").style.display = "flex";
    document.getElementById("esp-content").style.display = "none";
    document.getElementById("esp-error").style.display = "none";
  }

  function showError(msg) {
    document.getElementById("esp-loading").style.display = "none";
    document.getElementById("esp-content").style.display = "none";
    const errEl = document.getElementById("esp-error");
    errEl.style.display = "flex";
    document.getElementById("esp-error-msg").textContent = msg;
  }

  function showResults(data, query, conditionCode) {
    document.getElementById("esp-loading").style.display = "none";
    document.getElementById("esp-error").style.display = "none";
    document.getElementById("esp-content").style.display = "block";

    const sym = isUK() ? "£" : "$";

    // ── Stats row ──
    const statsEl = document.getElementById("esp-stats");
    statsEl.innerHTML = `
      <div class="esp-stat">
        <span class="esp-stat-val">${data.count}</span>
        <span class="esp-stat-label">sold</span>
      </div>
      <div class="esp-stat esp-stat-mid">
        <span class="esp-stat-val">${formatPrice(data.avg)}</span>
        <span class="esp-stat-label">avg</span>
      </div>
      <div class="esp-stat">
        <span class="esp-stat-val">${data.activeCount ?? "—"}</span>
        <span class="esp-stat-label">active</span>
      </div>
    `;

    // ── Price range bar ──
    if (data.min !== null && data.max !== null && data.min !== data.max) {
      const range = document.createElement("div");
      range.id = "esp-range";
      const pct =
        data.avg !== null
          ? ((data.avg - data.min) / (data.max - data.min)) * 100
          : 50;
      range.innerHTML = `
        <div class="esp-range-bar">
          <div class="esp-range-fill" style="width:100%"></div>
          <div class="esp-range-marker" style="left:${pct.toFixed(1)}%"></div>
        </div>
        <div class="esp-range-labels">
          <span>${formatPrice(data.min)}</span>
          <span style="flex:1;text-align:center;font-size:10px;opacity:.6">range</span>
          <span>${formatPrice(data.max)}</span>
        </div>
      `;
      statsEl.after(range);
    }

    // ── Recent sales list ──
    const listEl = document.getElementById("esp-list");
    listEl.innerHTML = "";
    if (data.sales.length === 0) {
      listEl.innerHTML =
        `<div class="esp-empty">No recent sales found.<br><a href="${buildSoldSearchURL(query)}" target="_blank" style="color:#f60;font-size:11px">Check eBay sold search →</a></div>`;
    } else {
      data.sales.slice(0, 10).forEach((s) => {
        const row = document.createElement("a");
        row.className = "esp-sale-row";
        row.href = s.url;
        row.target = "_blank";
        row.title = s.title;
        const badge =
          s.condition === "Used"
            ? '<span class="esp-badge esp-badge-used">Used</span>'
            : s.condition === "New"
            ? '<span class="esp-badge esp-badge-new">New</span>'
            : "";
        row.innerHTML = `
          <div class="esp-sale-title">${escapeHtml(truncate(s.title, 52))}${badge}</div>
          <div class="esp-sale-meta">
            <span class="esp-sale-price">${formatPrice(s.price)}</span>
            <span class="esp-sale-date">${s.date}</span>
          </div>
        `;
        listEl.appendChild(row);
      });
    }

    // ── "Open all sold" link ──
    const openLink = document.getElementById("esp-open-link");
    openLink.innerHTML = `<a href="${buildSoldSearchURL(query, conditionCode)}" target="_blank">View all →</a>`;

    // ── Active listings footer ──
    const activeRow = document.getElementById("esp-active-row");
    const activeLabel = document.getElementById("esp-active-label");
    const activeLink = document.getElementById("esp-active-link");
    if (data.activeCount !== null && data.activeCount > 0) {
      activeLabel.textContent = `${data.activeCount} active listing${data.activeCount !== 1 ? "s" : ""}`;
    } else {
      activeLabel.textContent = "No active listings found";
    }
    activeLink.href = buildActiveSearchURL(query, conditionCode);
  }

  // ─── eBay Scraper ────────────────────────────────────────────────────────────

  async function fetchSoldData(query, conditionCode) {
    const soldURL = buildSoldSearchURL(query, conditionCode);
    const activeURL = buildActiveSearchURL(query, conditionCode);

    let soldHtml, activeHtml;

    try {
      const [soldRes, activeRes] = await Promise.all([
        fetch(soldURL, { credentials: "include" }),
        fetch(activeURL, { credentials: "include" }),
      ]);
      soldHtml = await soldRes.text();
      activeHtml = await activeRes.text();
    } catch (e) {
      throw new Error("Could not fetch eBay results. Check your connection.");
    }

    const soldDoc = new DOMParser().parseFromString(soldHtml, "text/html");
    const activeDoc = new DOMParser().parseFromString(activeHtml, "text/html");

    const sales = [];
    const prices = [];

    // ── Strategy 1: li.s-item DOM parsing ──
    const soldItems = soldDoc.querySelectorAll("li.s-item, li[class*='s-item']");

    soldItems.forEach((item) => {
      const titleEl =
        item.querySelector(".s-item__title span[role='heading']") ||
        item.querySelector(".s-item__title span") ||
        item.querySelector(".s-item__title");
      if (!titleEl) return;
      const title = titleEl.textContent.trim();
      if (!title || title === "Shop on eBay" || /^results for/i.test(title)) return;

      const priceEl =
        item.querySelector(".s-item__price") ||
        item.querySelector("[class*='price']") ||
        item.querySelector(".notranslate");

      const linkEl =
        item.querySelector("a.s-item__link") ||
        item.querySelector("a[href*='/itm/']");

      const dateEl =
        item.querySelector(".s-item__ended-date") ||
        item.querySelector(".s-item__listingDate") ||
        item.querySelector("[class*='ended']") ||
        item.querySelector("[class*='sold']");

      const condEl =
        item.querySelector(".SECONDARY_INFO") ||
        item.querySelector(".s-item__subtitle");

      const rawPrice = priceEl ? priceEl.textContent.trim() : "";
      const price = parseCurrency(rawPrice.split(/\s+to\s+/i)[0]);
      const dateText = dateEl ? dateEl.textContent.replace(/sold|ended/gi, "").trim() : "";
      const condition = condEl ? condEl.textContent.trim() : "";
      const url = linkEl ? linkEl.href : soldURL;

      if (price !== null && price > 0) {
        prices.push(price);
        sales.push({ title, price, date: dateText, condition, url });
      }
    });

    // ── Strategy 2: Extract from embedded JSON in <script> tags ──
    // eBay often embeds item data as window.__INITIAL_STATE__ or similar JSON blobs
    if (prices.length === 0) {
      soldDoc.querySelectorAll("script").forEach((script) => {
        const src = script.textContent || "";

        // Look for JSON-LD product data
        if (script.type === "application/ld+json") {
          try {
            const json = JSON.parse(src);
            const items = Array.isArray(json) ? json : (json["@graph"] || [json]);
            items.forEach((obj) => {
              const p = parseCurrency(String((obj.offers && obj.offers.price) || obj.price || ""));
              const t = obj.name || "Item";
              if (p > 0) { prices.push(p); sales.push({ title: t, price: p, date: "", condition: "", url: soldURL }); }
            });
          } catch (_) {}
        }

        // Look for eBay's internal data blob: "price":{"value":"55.00"} or "soldPrice":"55.00"
        if (prices.length === 0 && src.includes('"price"')) {
          // Match patterns like "price":{"value":"55.00"} or "price":"55.00"
          const matches = [...src.matchAll(/"(?:price|soldPrice|binPrice|currentBidPrice)":\s*\{?"?value"?:\s*"?([\d.]+)"?\}?/gi)];
          matches.forEach((m) => {
            const p = parseFloat(m[1]);
            if (p > 0) prices.push(p);
          });
        }
      });

      // If we got prices from JSON but no sales objects, build minimal ones
      if (prices.length > 0 && sales.length === 0) {
        prices.forEach((p) => sales.push({ title: query, price: p, date: "", condition: "", url: soldURL }));
      }
    }

    // ── Strategy 3: Regex scrape the raw HTML for £/$ prices near "Sold" text ──
    // This is the nuclear option — finds every price-like string near a sold date
    if (prices.length === 0) {
      const sym = isUK() ? "£" : "\\$";
      // Match "Sold DD Mon YYYY ... £55.00" within a ~500 char window
      const soldBlocks = [...soldHtml.matchAll(/Sold\s+\d{1,2}\s+\w+\s+\d{4}[\s\S]{0,500}?(?:£|\$)([\d,]+\.?\d{0,2})/gi)];
      soldBlocks.forEach((m) => {
        const p = parseCurrency(m[1]);
        if (p > 0 && p < 100000) { prices.push(p); sales.push({ title: query, price: p, date: "", condition: "", url: soldURL }); }
      });

      // Also try: any £XX.XX price in the page (broad fallback)
      if (prices.length === 0) {
        const allPrices = [...soldHtml.matchAll(/(?:£|\$)([\d,]+\.\d{2})/g)];
        const seen = new Set();
        allPrices.forEach((m) => {
          const p = parseCurrency(m[1]);
          if (p > 0.5 && p < 50000 && !seen.has(p)) {
            seen.add(p);
            prices.push(p);
            sales.push({ title: query, price: p, date: "", condition: "", url: soldURL });
          }
        });
      }
    }

    // ── Parse active count ──
    let activeCount = null;
    // Try several selectors + also look for "X results" text anywhere
    const countSelectors = [
      ".srp-controls__count-heading",
      ".listingscnt",
      '[data-testid="srp-result-count"]',
      ".srp-controls__count",
      ".rcnt",
      "h1.srp-controls__count-heading",
    ];
    for (const sel of countSelectors) {
      const el = activeDoc.querySelector(sel);
      if (el) {
        const match = el.textContent.replace(/,/g, "").match(/[\d]+/);
        if (match) { activeCount = parseInt(match[0], 10); break; }
      }
    }
    // Fallback: count li.s-item elements on active page
    if (activeCount === null) {
      const activeItems = activeDoc.querySelectorAll("li.s-item");
      if (activeItems.length > 1) activeCount = activeItems.length - 1; // minus placeholder
    }

    // ── Stats ──
    const count = prices.length;
    const avg =
      count > 0 ? prices.reduce((a, b) => a + b, 0) / count : null;
    const min = count > 0 ? Math.min(...prices) : null;
    const max = count > 0 ? Math.max(...prices) : null;

    return { count, avg, min, max, sales, activeCount };
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  let collapsed = false;
  let currentQuery = "";
  let currentConditionCode = null;
  let currentConditionLabel = null;

  async function run(query, conditionCode) {
    showLoading();
    try {
      const data = await fetchSoldData(query, conditionCode);
      showResults(data, query, conditionCode);
    } catch (e) {
      showError(e.message || "Something went wrong.");
    }
  }

  function isItemPage() {
    const path = location.pathname;
    const site = getSite();
    if (site === "ebay") return path.startsWith("/itm/");
    if (site === "vinted") return path.startsWith("/items/");
    return false;
  }

  function buildHeader() {
    const site = getSite();
    const titleEl = document.getElementById("esp-title");

    // Source badge — "via eBay" when on Vinted
    const sourceBadge = site === "vinted"
      ? `<span class="esp-source-badge">via eBay</span>`
      : "";

    // Condition badge
    const condBadge = currentConditionLabel
      ? `<span class="esp-cond-badge">${currentConditionLabel}</span>`
      : "";

    titleEl.innerHTML = `Sold Prices ${sourceBadge}${condBadge}`;
  }

  function init() {
    if (!isItemPage()) return;
    if (document.getElementById("esp-panel")) return;

    // Vinted is a React SPA — content may not be in the DOM yet at document_idle
    // Wait a beat for the page to fully render before reading title/condition
    const delay = getSite() === "vinted" ? 1200 : 0;

    setTimeout(() => {
      if (document.getElementById("esp-panel")) return; // guard double-run

      const rawTitle = getItemTitle();
      const query = stripModelNoise(rawTitle);
      currentQuery = query;

      const rawCondition = getItemCondition();
      currentConditionCode = conditionToEbayParam(rawCondition);
      currentConditionLabel = conditionLabel(rawCondition);

      createPanel();
      buildHeader();

      // Collapse / expand
      const toggleBtn = document.getElementById("esp-toggle");
      const body = document.getElementById("esp-body");
      toggleBtn.addEventListener("click", () => {
        collapsed = !collapsed;
        body.style.display = collapsed ? "none" : "block";
        document.getElementById("esp-panel").classList.toggle("esp-collapsed", collapsed);
        toggleBtn.textContent = collapsed ? "›" : "‹";
      });

      // Refresh
      document.getElementById("esp-refresh").addEventListener("click", () => {
        run(currentQuery, currentConditionCode);
      });

      // Drag to reposition
      let dragging = false;
      let startY, startTop;
      const header = document.getElementById("esp-header");
      header.style.cursor = "grab";
      header.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        dragging = true;
        startY = e.clientY;
        startTop = parseInt(document.getElementById("esp-panel").style.top || "120", 10);
        header.style.cursor = "grabbing";
      });
      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const delta = e.clientY - startY;
        const newTop = Math.max(10, startTop + delta);
        document.getElementById("esp-panel").style.top = newTop + "px";
      });
      document.addEventListener("mouseup", () => {
        dragging = false;
        header.style.cursor = "grab";
      });

      run(query, currentConditionCode);
    }, delay);
  }

  // Wait for page to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
