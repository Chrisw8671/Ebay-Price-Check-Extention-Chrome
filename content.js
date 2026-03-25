// eBay Sold Price Panel - content.js
// Shows recent eBay sold prices for the current eBay or Vinted item.

(function () {
  "use strict";

  const PANEL_ID = "esp-panel";
  const RANGE_ID = "esp-range";

  let collapsed = false;
  let currentStateKey = "";
  let initTimer = null;
  let navObserverStarted = false;

  function getSite() {
    const host = location.hostname;
    if (host.includes("vinted")) return "vinted";
    if (host.includes("ebay")) return "ebay";
    return "unknown";
  }

  function isUK() {
    return location.hostname.endsWith(".co.uk");
  }

  function isItemPage() {
    const path = location.pathname;
    if (getSite() === "ebay") return path.startsWith("/itm/");
    if (getSite() === "vinted") return path.startsWith("/items/");
    return false;
  }

  function normalizeText(str) {
    return (str || "").replace(/\s+/g, " ").trim();
  }

  function capitalizeWords(str) {
    return normalizeText(str)
      .toLowerCase()
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncate(str, n) {
    const clean = String(str || "");
    return clean.length > n ? clean.slice(0, n - 1) + "..." : clean;
  }

  function parseCurrency(str) {
    if (!str) return null;
    const match = String(str).replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
    if (!match) return null;
    const value = parseFloat(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  function formatPrice(n) {
    if (n === null || n === undefined) return "--";
    return (isUK() ? "£" : "$") + n.toFixed(2);
  }

  function buildEbayBase() {
    return isUK() ? "https://www.ebay.co.uk" : "https://www.ebay.com";
  }

  function buildSoldSearchURL(query, conditionCode) {
    const params = new URLSearchParams({
      _nkw: query,
      _sacat: "0",
      LH_Complete: "1",
      LH_Sold: "1",
      _sop: "13",
      _ipg: "60",
      rt: "nc",
      _oac: "1",
    });
    if (conditionCode) params.set("LH_ItemCondition", conditionCode);
    return `${buildEbayBase()}/sch/i.html?${params.toString()}`;
  }

  function buildActiveSearchURL(query, conditionCode) {
    const params = new URLSearchParams({
      _nkw: query,
      _sacat: "0",
      _sop: "15",
      _ipg: "60",
      rt: "nc",
      _oac: "1",
    });
    if (conditionCode) params.set("LH_ItemCondition", conditionCode);
    return `${buildEbayBase()}/sch/i.html?${params.toString()}`;
  }

  function getEbayTitle() {
    const selectors = [
      "h1.x-item-title__mainTitle span",
      "[data-testid='x-item-title'] span",
      "h1 span",
      "h1",
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = normalizeText(el && el.textContent);
      if (text && !/^details about/i.test(text)) return text;
    }

    const og = document.querySelector('meta[property="og:title"]');
    return normalizeText(og && og.getAttribute("content")).replace(/\s+\|\s+eBay$/i, "");
  }

  function getEbayCondition() {
    const selectors = [
      ".x-item-condition-value .ux-textspans",
      ".x-item-condition-value span",
      "[data-testid='x-item-condition'] span",
      ".x-item-condition-text .ux-textspans",
      ".condText",
      "#vi-itm-cond",
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = normalizeText(el && el.textContent);
      if (text && text.length > 1) return text;
    }
    return null;
  }

  function stripVintedSiteSuffix(value) {
    return normalizeText(value)
      .replace(/\s+[|\-–]\s+Vinted.*$/i, "")
      .replace(/\s+[|\-–]\s+Buy.*$/i, "")
      .trim();
  }

  function getVintedTitle() {
    const selectors = [
      "[data-testid='item-page-summary-plugin'] h1",
      "[data-testid='item-page-title'] h1",
      "[itemprop='name']",
      "h1.web_ui__Text__title",
      "h1",
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = normalizeText(el && el.textContent);
      if (text && text.length > 2) return text;
    }

    const og = document.querySelector('meta[property="og:title"]');
    const ogTitle = normalizeText(og && og.getAttribute("content"));
    if (ogTitle) return stripVintedSiteSuffix(ogTitle);

    return stripVintedSiteSuffix(document.title);
  }

  function getVintedCondition() {
    const selectors = [
      "[data-testid='item-condition'] span",
      "[data-testid='item-condition']",
      "[itemprop='itemCondition']",
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = normalizeText(el && el.textContent);
      if (text && !/^condition$/i.test(text)) return text;
    }

    const rows = document.querySelectorAll("dt, .details-list__item-title, [data-testid='item-details'] *");
    for (const row of rows) {
      const label = normalizeText(row.textContent);
      if (!/^condition$/i.test(label)) continue;
      const sibling = row.nextElementSibling;
      const value = normalizeText(sibling && sibling.textContent);
      if (value) return value;
    }

    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
      try {
        const json = JSON.parse(script.textContent);
        const items = Array.isArray(json) ? json : json["@graph"] || [json];
        for (const item of items) {
          const raw = normalizeText(item && item.itemCondition);
          if (!raw) continue;
          if (/new/i.test(raw)) return "New";
          if (/used/i.test(raw)) return "Used";
        }
      } catch (_) {}
    }

    return null;
  }

  function getItemTitle() {
    return getSite() === "vinted" ? getVintedTitle() : getEbayTitle();
  }

  function getItemCondition() {
    return getSite() === "vinted" ? getVintedCondition() : getEbayCondition();
  }

  function mapToEbayCondition(rawCondition) {
    const raw = normalizeText(rawCondition);
    if (!raw) return { raw: null, code: null, label: null };

    const lower = raw.toLowerCase();

    if (/new with tags|new with box|brand new|new\b/.test(lower)) {
      return { raw, code: "1000", label: "New" };
    }
    if (/new without tags|new other|open box/.test(lower)) {
      return { raw, code: "1000", label: "New" };
    }
    if (/seller.{0,10}refurb|refurbished/.test(lower)) {
      return { raw, code: "2500", label: "Seller refurbished" };
    }
    if (/certified.{0,10}refurb/.test(lower)) {
      return { raw, code: "2000", label: "Certified refurbished" };
    }
    if (/very good/.test(lower)) {
      return { raw, code: "4000", label: "Very Good" };
    }
    if (/\bgood\b/.test(lower)) {
      return { raw, code: "5000", label: "Good" };
    }
    if (/acceptable|satisfactory/.test(lower)) {
      return { raw, code: "6000", label: "Acceptable" };
    }
    if (/for parts|spares|not working|faulty|broken/.test(lower)) {
      return { raw, code: "7000", label: "For parts or not working" };
    }
    if (/used|pre.?owned|worn/.test(lower)) {
      return { raw, code: "3000", label: "Used" };
    }

    return { raw, code: null, label: capitalizeWords(raw) };
  }

  function buildConditionBadgeText(mapped) {
    if (!mapped || !mapped.raw) return "";
    if (!mapped.label || mapped.label === mapped.raw) return capitalizeWords(mapped.raw);
    if (getSite() === "vinted") return `${capitalizeWords(mapped.raw)} -> ${mapped.label}`;
    return mapped.label;
  }

  function normalizeQuery(title) {
    return normalizeText(title).slice(0, 120);
  }

  function buildQueryFallbacks(title) {
    const clean = normalizeQuery(title);
    return clean ? [clean] : [];
  }

  function getSaleBadge(conditionText) {
    const lower = normalizeText(conditionText).toLowerCase();
    if (!lower) return "";
    if (/new/.test(lower)) return '<span class="esp-badge esp-badge-new">New</span>';
    if (/used|very good|good|acceptable|satisfactory/.test(lower)) {
      return '<span class="esp-badge esp-badge-used">Used</span>';
    }
    return "";
  }

  function createPanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
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
          <span>Fetching sold listings...</span>
        </div>
        <div id="esp-content" style="display:none">
          <div id="esp-stats"></div>
          <div id="esp-divider"></div>
          <div id="esp-list-header">
            <span>Recent sales</span>
            <span id="esp-open-link"></span>
          </div>
          <div id="esp-list-subtitle" class="esp-query-note"></div>
          <div id="esp-list"></div>
          <div id="esp-active-row">
            <span id="esp-active-label"></span>
            <a id="esp-active-link" target="_blank" rel="noopener noreferrer">View active listings -></a>
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
    const loading = document.getElementById("esp-loading");
    const content = document.getElementById("esp-content");
    const error = document.getElementById("esp-error");
    if (loading) loading.style.display = "flex";
    if (content) content.style.display = "none";
    if (error) error.style.display = "none";
  }

  function showError(message) {
    const loading = document.getElementById("esp-loading");
    const content = document.getElementById("esp-content");
    const error = document.getElementById("esp-error");
    const errorMsg = document.getElementById("esp-error-msg");
    if (loading) loading.style.display = "none";
    if (content) content.style.display = "none";
    if (error) error.style.display = "flex";
    if (errorMsg) errorMsg.textContent = message;
  }

  function renderHeader(state) {
    const titleEl = document.getElementById("esp-title");
    if (!titleEl) return;

    const sourceBadge = state.site === "vinted" ? '<span class="esp-source-badge">via eBay</span>' : "";
    const condBadge = state.conditionBadgeText
      ? `<span class="esp-cond-badge">${escapeHtml(state.conditionBadgeText)}</span>`
      : "";

    titleEl.innerHTML = `Sold Prices ${sourceBadge}${condBadge}`;
  }

  function renderResults(data, state) {
    const loading = document.getElementById("esp-loading");
    const error = document.getElementById("esp-error");
    const content = document.getElementById("esp-content");
    const statsEl = document.getElementById("esp-stats");
    const listEl = document.getElementById("esp-list");
    const queryNote = document.getElementById("esp-list-subtitle");
    const openLink = document.getElementById("esp-open-link");
    const activeLabel = document.getElementById("esp-active-label");
    const activeLink = document.getElementById("esp-active-link");

    if (loading) loading.style.display = "none";
    if (error) error.style.display = "none";
    if (content) content.style.display = "block";

    const existingRange = document.getElementById(RANGE_ID);
    if (existingRange) existingRange.remove();

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
        <span class="esp-stat-val">${data.activeCount ?? "--"}</span>
        <span class="esp-stat-label">active</span>
      </div>
    `;

    if (data.min !== null && data.max !== null && data.min !== data.max) {
      const pct = data.avg !== null ? ((data.avg - data.min) / (data.max - data.min)) * 100 : 50;
      const range = document.createElement("div");
      range.id = RANGE_ID;
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

    queryNote.textContent =
      data.queryUsed && data.queryUsed !== state.query
        ? `Search used: ${data.queryUsed}`
        : "";

    listEl.innerHTML = "";
    if (!data.sales.length) {
      listEl.innerHTML = `<div class="esp-empty">No recent sales found.<br><a href="${buildSoldSearchURL(state.query, data.conditionCodeUsed)}" target="_blank" rel="noopener noreferrer" style="color:#f60;font-size:11px">Check eBay sold search -></a></div>`;
    } else {
      data.sales.slice(0, 10).forEach((sale) => {
        const row = document.createElement("a");
        row.className = "esp-sale-row";
        row.href = sale.url || buildSoldSearchURL(data.queryUsed || state.query, data.conditionCodeUsed);
        row.target = "_blank";
        row.rel = "noopener noreferrer";
        row.title = sale.title || "";
        row.innerHTML = `
          <div class="esp-sale-title">${escapeHtml(truncate(sale.title || state.query, 52))}${getSaleBadge(sale.condition)}</div>
          <div class="esp-sale-meta">
            <span class="esp-sale-price">${formatPrice(sale.price)}</span>
            <span class="esp-sale-date">${escapeHtml(sale.date || "")}</span>
          </div>
        `;
        listEl.appendChild(row);
      });
    }

    openLink.innerHTML = `<a href="${buildSoldSearchURL(data.queryUsed || state.query, data.conditionCodeUsed)}" target="_blank" rel="noopener noreferrer">View all -></a>`;
    activeLabel.textContent =
      data.activeCount !== null
        ? `${data.activeCount} active listing${data.activeCount === 1 ? "" : "s"}`
        : "No active listings found";
    activeLink.href = buildActiveSearchURL(data.queryUsed || state.query, data.conditionCodeUsed);
  }

  async function fetchText(url) {
    return new Promise((resolve, reject) => {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error("Chrome extension messaging is unavailable."));
        return;
      }

      chrome.runtime.sendMessage({ type: "esp-fetch-html", url }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || "Background fetch failed."));
          return;
        }
        if (!response) {
          reject(new Error("No response from background fetch."));
          return;
        }
        if (!response.ok) {
          reject(new Error(response.error || `Could not fetch eBay results (${response.status}).`));
          return;
        }
        resolve(response.text);
      });
    });
  }

  function parseActiveCount(activeDoc) {
    const selectors = [
      ".srp-controls__count-heading",
      ".srp-controls__count",
      '[data-testid="srp-result-count"]',
      ".listingscnt",
      ".rcnt",
    ];
    for (const selector of selectors) {
      const el = activeDoc.querySelector(selector);
      const text = normalizeText(el && el.textContent);
      if (!text) continue;
      const match = text.replace(/,/g, "").match(/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }

    const items = activeDoc.querySelectorAll("li.s-item");
    if (items.length > 1) return items.length - 1;

    const bodyText = normalizeText(activeDoc.body && activeDoc.body.textContent).replace(/,/g, "");
    const resultMatch = bodyText.match(/(\d+)\s+results\b/i);
    if (resultMatch) return parseInt(resultMatch[1], 10);

    return null;
  }

  function parseSoldResults(soldHtml, soldDoc, soldURL, fallbackTitle) {
    const sales = [];
    const prices = [];
    const seen = new Set();

    function addSale(sale) {
      const price = sale && sale.price;
      if (price === null || price === undefined || price <= 0 || price > 100000) return;

      const dedupeKey = `${sale.url || ""}|${sale.title || ""}|${price}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      prices.push(price);
      sales.push(sale);
    }

    const soldItems = soldDoc.querySelectorAll("li.s-item, li[class*='s-item']");
    soldItems.forEach((item) => {
      const titleEl =
        item.querySelector(".s-item__title span[role='heading']") ||
        item.querySelector(".s-item__title span") ||
        item.querySelector(".s-item__title");
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
        item.querySelector("[class*='ended']");
      const conditionEl =
        item.querySelector(".SECONDARY_INFO") ||
        item.querySelector(".s-item__subtitle");

      const title = normalizeText(titleEl && titleEl.textContent);
      if (!title || title === "Shop on eBay" || /^results for/i.test(title)) return;

      const rawPriceText = normalizeText(priceEl && priceEl.textContent);
      if (!/[£$]/.test(rawPriceText)) return;
      const rawPrice = rawPriceText.split(/\s+to\s+/i)[0];
      const price = parseCurrency(rawPrice);
      if (price === null || price <= 0) return;

      addSale({
        title,
        price,
        date: normalizeText(dateEl && dateEl.textContent).replace(/^(sold|ended)\s*/i, ""),
        condition: normalizeText(conditionEl && conditionEl.textContent),
        url: linkEl ? linkEl.href : soldURL,
      });
    });

    if (!prices.length) {
      const links = soldDoc.querySelectorAll("a[href*='/itm/']");
      links.forEach((linkEl) => {
        const container =
          linkEl.closest("li") ||
          linkEl.closest("div.s-item__wrapper") ||
          linkEl.closest("div[data-view*='mi:']") ||
          linkEl.parentElement;
        if (!container) return;

        const title =
          normalizeText(
            linkEl.textContent ||
              (container.querySelector(".s-item__title, [role='heading']") || {}).textContent
          ) || fallbackTitle;
        if (!title || /^shop on ebay|results for/i.test(title)) return;

        const priceCandidates = [
          container.querySelector(".s-item__price"),
          container.querySelector("[class*='price']"),
          container.querySelector(".notranslate"),
        ];

        let rawPriceText = "";
        for (const candidate of priceCandidates) {
          rawPriceText = normalizeText(candidate && candidate.textContent);
          if (/[£$]/.test(rawPriceText)) break;
        }

        if (!rawPriceText) {
          const textBlock = normalizeText(container.textContent);
          const match = textBlock.match(/(?:£|\$)\s*[\d,]+(?:\.\d{1,2})?/);
          rawPriceText = match ? match[0] : "";
        }

        if (!/[£$]/.test(rawPriceText)) return;

        const price = parseCurrency(rawPriceText.split(/\s+to\s+/i)[0]);
        if (price === null || price <= 0) return;

        const dateText = normalizeText(
          (container.querySelector(".s-item__ended-date, .s-item__listingDate, [class*='ended']") || {})
            .textContent
        ).replace(/^(sold|ended)\s*/i, "");

        addSale({
          title,
          price,
          date: dateText,
          condition: normalizeText(
            (container.querySelector(".SECONDARY_INFO, .s-item__subtitle") || {}).textContent
          ),
          url: linkEl.href || soldURL,
        });
      });
    }

    if (!prices.length) {
      const ldScripts = soldDoc.querySelectorAll('script[type="application/ld+json"]');
      ldScripts.forEach((script) => {
        try {
          const json = JSON.parse(script.textContent);
          const items = Array.isArray(json) ? json : json["@graph"] || [json];
          items.forEach((item) => {
            const title = normalizeText(item && item.name) || fallbackTitle;
            const rawPrice = item && item.offers ? item.offers.price : item && item.price;
            const price = parseCurrency(String(rawPrice || ""));
            if (price === null || price <= 0) return;
            addSale({
              title,
              price,
              date: "",
              condition: "",
              url: soldURL,
            });
          });
        } catch (_) {}
      });
    }

    if (!prices.length) {
      const matches = [
        ...soldHtml.matchAll(/Sold\s+\d{1,2}\s+\w+\s+\d{4}[\s\S]{0,500}?(?:£|\$)([\d,]+(?:\.\d{1,2})?)/gi),
      ];
      matches.forEach((match) => {
        const price = parseCurrency(match[1]);
        if (price === null || price <= 0 || price > 100000) return;
        addSale({
          title: fallbackTitle,
          price,
          date: "",
          condition: "",
          url: soldURL,
        });
      });
    }

    return { sales, prices };
  }

  async function fetchSoldData(query, conditionCode) {
    const queries = buildQueryFallbacks(query);
    const conditionVariants = conditionCode ? [conditionCode, null] : [null];

    for (const conditionCodeVariant of conditionVariants) {
      for (const queryVariant of queries) {
        const soldURL = buildSoldSearchURL(queryVariant, conditionCodeVariant);
        const activeURL = buildActiveSearchURL(queryVariant, conditionCodeVariant);

        let soldHtml;
        let activeHtml;
        try {
          [soldHtml, activeHtml] = await Promise.all([fetchText(soldURL), fetchText(activeURL)]);
        } catch (error) {
          if (
            conditionCodeVariant === conditionVariants[conditionVariants.length - 1] &&
            queryVariant === queries[queries.length - 1]
          ) {
            throw error;
          }
          continue;
        }

        const soldDoc = new DOMParser().parseFromString(soldHtml, "text/html");
        const activeDoc = new DOMParser().parseFromString(activeHtml, "text/html");
        const { sales, prices } = parseSoldResults(soldHtml, soldDoc, soldURL, queryVariant);
        const activeCount = parseActiveCount(activeDoc);

        if (!prices.length && queryVariant !== queries[queries.length - 1]) continue;

        return {
          count: prices.length,
          avg: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
          min: prices.length ? Math.min(...prices) : null,
          max: prices.length ? Math.max(...prices) : null,
          sales,
          activeCount,
          queryUsed: queryVariant,
          conditionCodeUsed: conditionCodeVariant,
        };
      }
    }

    return {
      count: 0,
      avg: null,
      min: null,
      max: null,
      sales: [],
      activeCount: null,
      queryUsed: query,
      conditionCodeUsed: conditionCode,
    };
  }

  function bindPanelEvents(state) {
    const panel = document.getElementById(PANEL_ID);
    const body = document.getElementById("esp-body");
    const toggleBtn = document.getElementById("esp-toggle");
    const refreshBtn = document.getElementById("esp-refresh");
    const header = document.getElementById("esp-header");

    toggleBtn.textContent = collapsed ? ">" : "<";
    body.style.display = collapsed ? "none" : "block";
    panel.classList.toggle("esp-collapsed", collapsed);

    toggleBtn.addEventListener("click", () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? "none" : "block";
      panel.classList.toggle("esp-collapsed", collapsed);
      toggleBtn.textContent = collapsed ? ">" : "<";
    });

    refreshBtn.addEventListener("click", () => {
      runForPage(state);
    });

    let dragging = false;
    let startY = 0;
    let startTop = 120;

    header.style.cursor = "grab";
    header.addEventListener("mousedown", (event) => {
      if (event.target.tagName === "BUTTON") return;
      dragging = true;
      startY = event.clientY;
      startTop = parseInt(panel.style.top || "120", 10);
      header.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (event) => {
      if (!dragging) return;
      const nextTop = Math.max(10, startTop + (event.clientY - startY));
      panel.style.top = `${nextTop}px`;
    });

    document.addEventListener("mouseup", () => {
      dragging = false;
      header.style.cursor = "grab";
    });
  }

  function getPageState() {
    const site = getSite();
    const rawTitle = getItemTitle();
    const rawCondition = getItemCondition();
    const mappedCondition = mapToEbayCondition(rawCondition);
    const query = normalizeQuery(rawTitle);

    return {
      site,
      rawTitle,
      rawCondition,
      query,
      conditionCode: mappedCondition.code,
      conditionBadgeText: buildConditionBadgeText(mappedCondition),
    };
  }

  async function runForPage(state) {
    if (!state.query) {
      showError("Could not read the item title from this page yet.");
      return;
    }

    showLoading();

    try {
      const data = await fetchSoldData(state.query, state.conditionCode);
      renderResults(data, state);
    } catch (error) {
      showError(error && error.message ? error.message : "Something went wrong.");
    }
  }

  function removePanelIfPresent() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
  }

  function scheduleInit(delay) {
    clearTimeout(initTimer);
    initTimer = setTimeout(init, delay);
  }

  function init() {
    if (!isItemPage()) {
      currentStateKey = "";
      removePanelIfPresent();
      return;
    }

    const state = getPageState();
    if (!state.query) {
      scheduleInit(600);
      return;
    }

    const stateKey = `${location.href}::${state.query}::${state.conditionCode || ""}`;
    if (stateKey === currentStateKey && document.getElementById(PANEL_ID)) return;

    currentStateKey = stateKey;
    createPanel();
    renderHeader(state);
    bindPanelEvents(state);
    runForPage(state);
  }

  function watchForNavigation() {
    if (navObserverStarted) return;
    navObserverStarted = true;

    let lastHref = location.href;
    const handleMaybeNavigate = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      scheduleInit(700);
    };

    const originalPushState = history.pushState;
    history.pushState = function () {
      const result = originalPushState.apply(this, arguments);
      handleMaybeNavigate();
      return result;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function () {
      const result = originalReplaceState.apply(this, arguments);
      handleMaybeNavigate();
      return result;
    };

    window.addEventListener("popstate", () => scheduleInit(700));

    const observer = new MutationObserver(() => {
      handleMaybeNavigate();
      if (getSite() === "vinted" && isItemPage() && !document.getElementById(PANEL_ID)) {
        scheduleInit(500);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init();
      watchForNavigation();
    });
  } else {
    init();
    watchForNavigation();
  }
})();
