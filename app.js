(function () {
  "use strict";

  const data = window.COMEX_DATA;
  if (!data) throw new Error("Base agregada não encontrada.");
  const monthlyRows = window.COMEX_MONTHLY_ROWS || [];

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const fmtInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const fmtDecimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtUnit = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const colors = ["#168c87", "#d97745", "#557da1", "#7d69a8", "#bc5f72", "#84a65a"];

  const state = { tab: "overview", year: "all", country: "all", product: null };
  const catalogState = { page: 1, pageSize: 50, query: "", flow: "all", year: "all", country: "all" };
  const productLabelToId = new Map();
  const productSearchIndex = data.products.map((product) => `${product[0]} ${product[1]}`.toLocaleLowerCase("pt-BR"));
  const elements = {
    year: $("#year-filter"), country: $("#country-filter"), product: $("#product-filter"),
    productOptions: $("#product-options"), reset: $("#reset-filters"), filters: $("#filters-panel"),
    analysis: $("#analysis-view"), quality: $("#quality-view"), products: $("#products-view"), methodology: $("#methodology-view")
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  }

  function countryColor(countryId) {
    const fixedColors = { "China": colors[0], "Estados Unidos": colors[1], "Rússia": colors[2] };
    return fixedColors[data.countries[countryId]] || colors[countryId % colors.length];
  }

  function formatCompact(value, unit) {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    let result;
    if (abs >= 1e9) result = fmtDecimal.format(value / 1e9) + " bi";
    else if (abs >= 1e6) result = fmtDecimal.format(value / 1e6) + " mi";
    else if (abs >= 1e3) result = fmtDecimal.format(value / 1e3) + " mil";
    else result = fmtDecimal.format(value);
    return unit ? `${unit} ${result}` : result;
  }

  function formatTonnes(weightKg) {
    return `${formatCompact(weightKg / 1000)} T`;
  }

  function applyTheme(theme, persist = true) {
    const selectedTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = selectedTheme;
    const dark = selectedTheme === "dark";
    const toggle = $("#theme-toggle");
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "Ativar tema claro" : "Ativar tema escuro");
    $("#theme-label").textContent = dark ? "Tema claro" : "Tema escuro";
    $("#theme-color").setAttribute("content", dark ? "#071522" : "#102a43");
    if (persist) {
      try { localStorage.setItem("comex-theme", selectedTheme); } catch (_) { /* preferência opcional */ }
    }
  }

  function populateFilters() {
    data.meta.years.forEach((year) => elements.year.add(new Option(year, year)));
    data.countries.forEach((country, id) => elements.country.add(new Option(country, id)));
    data.meta.years.forEach((year) => $("#catalog-year").add(new Option(year, year)));
    data.countries.forEach((country, id) => $("#catalog-country").add(new Option(country, id)));
    const fragment = document.createDocumentFragment();
    data.products.forEach((product, id) => {
      const label = `${product[0]} — ${product[1]}`;
      productLabelToId.set(label, id);
      const option = document.createElement("option");
      option.value = label;
      fragment.appendChild(option);
    });
    elements.productOptions.appendChild(fragment);
    $("#header-records").textContent = fmtInt.format(data.meta.sourceRows);
  }

  function flowForTab() {
    if (state.tab === "imports") return 0;
    if (state.tab === "exports") return 1;
    return null;
  }

  function filteredRows() {
    const flow = flowForTab();
    const year = state.year === "all" ? null : Number(state.year);
    const country = state.country === "all" ? null : Number(state.country);
    return data.rows.filter((row) =>
      (flow === null || row[0] === flow) &&
      (year === null || row[1] === year) &&
      (country === null || row[2] === country) &&
      (state.product === null || row[3] === state.product)
    );
  }

  function filteredMonthlyRows() {
    const flow = flowForTab();
    const year = state.year === "all" ? null : Number(state.year);
    const country = state.country === "all" ? null : Number(state.country);
    return monthlyRows.filter((row) =>
      (flow === null || row[0] === flow) &&
      (year === null || row[1] === year) &&
      (country === null || row[3] === country) &&
      (state.product === null || row[4] === state.product)
    );
  }

  function aggregate(rows) {
    const result = { records: 0, fob: 0, weight: 0, byYear: new Map(), byProduct: new Map(), byCountry: new Map() };
    for (const row of rows) {
      const [flow, year, country, product, records, fob, weight] = row;
      result.records += records; result.fob += fob; result.weight += weight;
      const yearKey = `${flow}-${year}`;
      const yearMetrics = result.byYear.get(yearKey) || [0, 0, 0];
      yearMetrics[0] += records; yearMetrics[1] += fob; yearMetrics[2] += weight;
      result.byYear.set(yearKey, yearMetrics);
      const productMetrics = result.byProduct.get(product) || [0, 0, 0];
      productMetrics[0] += records; productMetrics[1] += fob; productMetrics[2] += weight;
      result.byProduct.set(product, productMetrics);
      const countryMetrics = result.byCountry.get(country) || [0, 0, 0];
      countryMetrics[0] += records; countryMetrics[1] += fob; countryMetrics[2] += weight;
      result.byCountry.set(country, countryMetrics);
    }
    return result;
  }

  function updateContext(rowCount) {
    const labels = { overview: "Importações e exportações", imports: "Importações consolidadas", exports: "Exportações consolidadas" };
    const titles = { overview: "Panorama consolidado", imports: "Análise das importações", exports: "Análise das exportações" };
    $("#scope-label").textContent = labels[state.tab];
    $("#analysis-title").textContent = titles[state.tab];
    const filters = [];
    if (state.year !== "all") filters.push(state.year);
    if (state.country !== "all") filters.push(data.countries[Number(state.country)]);
    if (state.product !== null) filters.push(`NCM ${data.products[state.product][0]}`);
    $("#analysis-subtitle").textContent = filters.length ? `Recorte: ${filters.join(" · ")}.` : "Indicadores calculados para todo o período disponível.";
    $("#result-count").textContent = `${fmtInt.format(rowCount)} combinações agregadas no recorte`;
  }

  function updateKpis(summary) {
    $("#kpi-fob").textContent = formatCompact(summary.fob, "US$");
    $("#kpi-weight").textContent = formatTonnes(summary.weight);
    $("#kpi-records").textContent = fmtInt.format(summary.records);
    $("#kpi-unit").textContent = summary.weight ? `US$ ${fmtUnit.format(summary.fob / summary.weight)}` : "—";
  }

  function bindTooltips(container, selector, contentFor) {
    let tooltip = container.querySelector(".chart-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "chart-tooltip";
      tooltip.setAttribute("role", "tooltip");
      container.appendChild(tooltip);
    }
    const position = (event, target) => {
      const bounds = container.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      const rawX = event && event.clientX ? event.clientX - bounds.left : targetBounds.left + targetBounds.width / 2 - bounds.left;
      const rawY = event && event.clientY ? event.clientY - bounds.top : targetBounds.top - bounds.top;
      tooltip.style.left = `${Math.max(105, Math.min(bounds.width - 105, rawX))}px`;
      tooltip.style.top = `${Math.max(105, rawY)}px`;
    };
    container.querySelectorAll(selector).forEach((target) => {
      const show = (event) => {
        tooltip.innerHTML = contentFor(target);
        position(event, target);
        tooltip.classList.add("is-visible");
      };
      target.addEventListener("mouseenter", show);
      target.addEventListener("mousemove", (event) => position(event, target));
      target.addEventListener("mouseleave", () => tooltip.classList.remove("is-visible"));
      target.addEventListener("focus", show);
      target.addEventListener("blur", () => tooltip.classList.remove("is-visible"));
    });
  }

  function metricTooltip(title, metrics) {
    const unit = metrics.weight ? metrics.fob / metrics.weight : 0;
    return `<strong>${title}</strong><span>Valor FOB <b>${formatCompact(metrics.fob, "US$")}</b></span><span>Toneladas líquidas <b>${formatTonnes(metrics.weight)}</b></span><span>Registros <b>${fmtInt.format(metrics.records)}</b></span><span>Valor unitário <b>${metrics.weight ? `US$ ${fmtUnit.format(unit)}/kg` : "—"}</b></span>`;
  }

  function renderTrend(summary) {
    const years = data.meta.years;
    const flows = flowForTab() === null ? [0, 1] : [flowForTab()];
    const series = flows.map((flow) => ({ flow, values: years.map((year) => summary.byYear.get(`${flow}-${year}`) || [0, 0, 0]) }));
    const max = Math.max(1, ...series.flatMap((s) => s.values.map((metrics) => metrics[1])));
    const width = 820, height = 300, left = 74, right = 24, top = 22, bottom = 42;
    const plotW = width - left - right, plotH = height - top - bottom;
    const x = (index) => left + index * (plotW / (years.length - 1));
    const y = (value) => top + plotH - (value / max) * plotH;
    const grid = Array.from({ length: 5 }, (_, i) => {
      const val = max * (1 - i / 4); const py = top + i * (plotH / 4);
      return `<line class="chart-gridline" x1="${left}" x2="${width-right}" y1="${py}" y2="${py}"/><text class="chart-axis" x="${left-10}" y="${py+4}" text-anchor="end">${formatCompact(val)}</text>`;
    }).join("");
    const yearLabels = years.map((year, i) => `<text class="chart-axis" x="${x(i)}" y="${height-13}" text-anchor="middle">${year}</text>`).join("");
    const lines = series.map((s) => {
      const points = s.values.map((metrics, i) => `${x(i)},${y(metrics[1])}`).join(" ");
      const cls = s.flow === 0 ? "import" : "export";
      const circles = s.values.map((metrics, i) => `<circle class="chart-point-${cls} trend-point" cx="${x(i)}" cy="${y(metrics[1])}" r="4" tabindex="0" data-flow="${s.flow}" data-year="${years[i]}" data-records="${metrics[0]}" data-fob="${metrics[1]}" data-weight="${metrics[2]}" aria-label="${data.meta.flows[s.flow]} em ${years[i]}"></circle>`).join("");
      return `<polyline class="chart-line-${cls}" points="${points}"/>${circles}`;
    }).join("");
    const chart = $("#trend-chart");
    chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}${yearLabels}${lines}</svg>`;
    bindTooltips(chart, ".trend-point", (point) => metricTooltip(`${data.meta.flows[Number(point.dataset.flow)]} · ${point.dataset.year}`, {
      records: Number(point.dataset.records), fob: Number(point.dataset.fob), weight: Number(point.dataset.weight)
    }));
    $("#trend-legend").innerHTML = series.map((s) => `<span class="${s.flow === 1 ? "export" : ""}">${data.meta.flows[s.flow]}</span>`).join("");
  }

  function topProducts(summary, limit) {
    return [...summary.byProduct.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, limit);
  }

  function renderProducts(summary) {
    const products = topProducts(summary, 10);
    const max = products.length ? products[0][1][1] : 1;
    $("#products-chart").innerHTML = products.map(([id, metrics]) => {
      const item = data.products[id];
      const pct = (metrics[1] / max) * 100;
      return `<div class="bar-row"><button class="bar-label" type="button" data-product-id="${id}" title="Filtrar por ${escapeHtml(item[0])} — ${escapeHtml(item[1])}">${escapeHtml(item[1])}</button><div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(2)}%"></div></div><span class="bar-value">${formatCompact(metrics[1], "US$")}</span></div>`;
    }).join("");
    $$(".bar-label").forEach((button) => button.addEventListener("click", () => {
      const id = Number(button.dataset.productId);
      state.product = id;
      elements.product.value = `${data.products[id][0]} — ${data.products[id][1]}`;
      renderAnalysis();
      elements.filters.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    const tableProducts = topProducts(summary, 12);
    $("#products-table").innerHTML = tableProducts.map(([id, metrics], index) => {
      const item = data.products[id];
      const share = summary.fob ? (metrics[1] / summary.fob) * 100 : 0;
      return `<tr class="product-table-row" tabindex="0" data-product-id="${id}" aria-label="Abrir participação por país de ${escapeHtml(item[1])}"><td class="rank">${String(index + 1).padStart(2, "0")}</td><td class="product-cell"><strong>${escapeHtml(item[1])}</strong><span>Código NCM ${escapeHtml(item[0])}</span></td><td class="numeric">${formatCompact(metrics[1], "US$")}</td><td class="numeric">${formatTonnes(metrics[2])}</td><td class="numeric">${fmtPct.format(share)}%</td></tr>`;
    }).join("");
    $$("#products-table .product-table-row").forEach((row) => {
      const open = () => openProductCountryModal(Number(row.dataset.productId));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
      });
    });
  }

  function renderCountries(summary) {
    const entries = [...summary.byCountry.entries()].sort((a, b) => b[1][1] - a[1][1]);
    let cursor = 0;
    const segments = entries.map(([id, metrics], index) => {
      const pct = summary.fob ? (metrics[1] / summary.fob) * 100 : 0;
      const offset = cursor; cursor += pct;
      return `<circle class="donut-segment" cx="21" cy="21" r="15.9155" fill="none" pathLength="100" stroke="${countryColor(id)}" stroke-width="8" stroke-dasharray="${pct.toFixed(4)} ${(100 - pct).toFixed(4)}" stroke-dashoffset="-${offset.toFixed(4)}" tabindex="0" data-country="${id}" data-records="${metrics[0]}" data-fob="${metrics[1]}" data-weight="${metrics[2]}" data-share="${pct.toFixed(4)}" aria-label="${data.countries[id]}: ${fmtPct.format(pct)} por cento"></circle>`;
    }).join("");
    const donut = $("#country-donut");
    donut.innerHTML = `<svg viewBox="0 0 42 42" aria-label="Participação dos países no valor FOB"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#edf2f6" stroke-width="8"/>${segments}</svg><div><strong>${formatCompact(summary.fob, "US$")}</strong><span>total FOB</span></div>`;
    $("#country-legend").innerHTML = entries.map(([id, metrics], index) => {
      const pct = summary.fob ? (metrics[1] / summary.fob) * 100 : 0;
      return `<div class="country-item"><i style="background:${countryColor(id)}"></i><span>${data.countries[id]}</span><strong>${fmtPct.format(pct)}%</strong></div>`;
    }).join("");
    bindTooltips($(".country-layout"), ".donut-segment", (segment) => `${metricTooltip(data.countries[Number(segment.dataset.country)], {
      records: Number(segment.dataset.records), fob: Number(segment.dataset.fob), weight: Number(segment.dataset.weight)
    })}<span>Participação <b>${fmtPct.format(Number(segment.dataset.share))}%</b></span>`);
  }

  function openProductCountryModal(productId) {
    const flow = flowForTab();
    const selectedYear = state.year === "all" ? null : Number(state.year);
    const byCountry = data.countries.map(() => [0, 0, 0]);
    for (const row of data.rows) {
      if (row[3] !== productId || (flow !== null && row[0] !== flow) || (selectedYear !== null && row[1] !== selectedYear)) continue;
      byCountry[row[2]][0] += row[4];
      byCountry[row[2]][1] += row[5];
      byCountry[row[2]][2] += row[6];
    }
    const product = data.products[productId];
    const totalFob = byCountry.reduce((total, metrics) => total + metrics[1], 0);
    const flowLabel = flow === null ? "Importações e exportações" : data.meta.flows[flow];
    const yearLabel = selectedYear === null ? data.meta.period : selectedYear;
    $("#product-modal-title").textContent = product[1];
    $("#product-modal-subtitle").textContent = `Código NCM ${product[0]} · ${flowLabel} · ${yearLabel}`;

    let cursor = 0;
    const segments = byCountry.map((metrics, countryId) => {
      const share = totalFob ? (metrics[1] / totalFob) * 100 : 0;
      const offset = cursor; cursor += share;
      return `<circle class="modal-donut-segment" cx="21" cy="21" r="15.9155" fill="none" pathLength="100" stroke="${countryColor(countryId)}" stroke-width="8" stroke-dasharray="${share.toFixed(4)} ${(100 - share).toFixed(4)}" stroke-dashoffset="-${offset.toFixed(4)}" tabindex="0" data-country="${countryId}" data-records="${metrics[0]}" data-fob="${metrics[1]}" data-weight="${metrics[2]}" data-share="${share.toFixed(4)}" aria-label="${escapeHtml(data.countries[countryId])}: ${fmtPct.format(share)} por cento"></circle>`;
    }).join("");
    $("#product-modal-donut").innerHTML = `<svg viewBox="0 0 42 42" aria-label="Participação por país"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="#edf2f6" stroke-width="8"/>${segments}</svg><div><strong>${formatCompact(totalFob, "US$")}</strong><span>total FOB</span></div>`;
    $("#product-modal-legend").innerHTML = byCountry.map((metrics, countryId) => {
      const share = totalFob ? (metrics[1] / totalFob) * 100 : 0;
      return `<div class="modal-country-item"><i style="background:${countryColor(countryId)}"></i><div><strong>${escapeHtml(data.countries[countryId])}</strong><span>${formatCompact(metrics[1], "US$")}</span></div><b>${fmtPct.format(share)}%</b></div>`;
    }).join("");
    bindTooltips($(".product-modal__content"), ".modal-donut-segment", (segment) => `${metricTooltip(data.countries[Number(segment.dataset.country)], {
      records: Number(segment.dataset.records), fob: Number(segment.dataset.fob), weight: Number(segment.dataset.weight)
    })}<span>Participação <b>${fmtPct.format(Number(segment.dataset.share))}%</b></span>`);
    const modal = $("#product-country-modal");
    if (!modal.open) modal.showModal();
  }

  function renderMetricSeries(containerSelector, labels, points, valueFormatter, tooltipFor) {
    const container = $(containerSelector);
    const values = points.map((point) => point.value);
    const max = Math.max(1, ...values);
    const width = 700, height = 300, left = 76, right = 24, top = 22, bottom = 42;
    const plotW = width - left - right, plotH = height - top - bottom;
    const divisor = Math.max(1, labels.length - 1);
    const x = (index) => labels.length === 1 ? left + plotW / 2 : left + index * (plotW / divisor);
    const y = (value) => top + plotH - (value / max) * plotH;
    const grid = Array.from({ length: 5 }, (_, i) => {
      const value = max * (1 - i / 4); const py = top + i * (plotH / 4);
      return `<line class="chart-gridline" x1="${left}" x2="${width-right}" y1="${py}" y2="${py}"/><text class="chart-axis" x="${left-10}" y="${py+4}" text-anchor="end">${valueFormatter(value)}</text>`;
    }).join("");
    const xLabels = labels.map((label, index) => `<text class="chart-axis" x="${x(index)}" y="${height-13}" text-anchor="middle">${label}</text>`).join("");
    const flowClass = flowForTab() === 1 ? "export" : "import";
    const polyline = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
    const circles = points.map((point, index) => `<circle class="chart-point-${flowClass} trend-point extra-point" cx="${x(index)}" cy="${y(point.value)}" r="4" tabindex="0" data-index="${index}" aria-label="${labels[index]}: ${valueFormatter(point.value)}"></circle>`).join("");
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${grid}${xLabels}<polyline class="chart-line-${flowClass}" points="${polyline}"/>${circles}</svg>`;
    bindTooltips(container, ".extra-point", (point) => tooltipFor(points[Number(point.dataset.index)], labels[Number(point.dataset.index)]));
  }

  function renderSeasonality(monthRows) {
    const monthly = Array.from({ length: 12 }, () => ({ records: 0, fob: 0, weight: 0 }));
    for (const row of monthRows) {
      const month = row[2] - 1;
      monthly[month].records += row[5];
      monthly[month].fob += row[6];
      monthly[month].weight += row[7];
    }
    const yearsCount = state.year === "all" ? data.meta.years.length : 1;
    const points = monthly.map((metrics) => ({ ...metrics, yearsCount, value: metrics.fob / yearsCount }));
    const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    renderMetricSeries("#seasonality-chart", labels, points, (value) => formatCompact(value), (point, label) =>
      `<strong>${label} · média de ${point.yearsCount} ${point.yearsCount === 1 ? "ano" : "anos"}</strong><span>FOB médio mensal <b>${formatCompact(point.value, "US$")}</b></span><span>FOB acumulado <b>${formatCompact(point.fob, "US$")}</b></span><span>Toneladas líquidas <b>${formatTonnes(point.weight)}</b></span><span>Registros <b>${fmtInt.format(point.records)}</b></span>`
    );
  }

  function renderUnitValue(summary) {
    const flow = flowForTab();
    const years = state.year === "all" ? data.meta.years : [Number(state.year)];
    const points = years.map((year) => {
      const metrics = summary.byYear.get(`${flow}-${year}`) || [0, 0, 0];
      return { records: metrics[0], fob: metrics[1], weight: metrics[2], value: metrics[2] ? metrics[1] / metrics[2] : 0 };
    });
    renderMetricSeries("#unit-value-chart", years, points, (value) => fmtUnit.format(value), (point, year) =>
      `<strong>${data.meta.flows[flow]} · ${year}</strong><span>Valor unitário <b>US$ ${fmtUnit.format(point.value)}/kg</b></span><span>Valor FOB <b>${formatCompact(point.fob, "US$")}</b></span><span>Toneladas líquidas <b>${formatTonnes(point.weight)}</b></span><span>Registros <b>${fmtInt.format(point.records)}</b></span>`
    );
  }

  function renderInsights(summary) {
    const byYearCombined = new Map();
    for (const [key, metrics] of summary.byYear) {
      const year = Number(key.split("-")[1]);
      byYearCombined.set(year, (byYearCombined.get(year) || 0) + metrics[1]);
    }
    const peakYear = [...byYearCombined.entries()].sort((a, b) => b[1] - a[1])[0];
    const topProduct = topProducts(summary, 1)[0];
    const topCountry = [...summary.byCountry.entries()].sort((a, b) => b[1][1] - a[1][1])[0];
    const insights = [];
    if (peakYear) insights.push(`<strong>${peakYear[0]}</strong> apresentou o maior valor FOB do recorte, com ${formatCompact(peakYear[1], "US$")}.`);
    if (topProduct) {
      const item = data.products[topProduct[0]];
      insights.push(`<strong>NCM ${item[0]}</strong> lidera a pauta em valor FOB e representa ${fmtPct.format((topProduct[1][1] / summary.fob) * 100)}% do total filtrado.`);
    }
    if (topCountry) insights.push(`<strong>${data.countries[topCountry[0]]}</strong> concentra ${fmtPct.format((topCountry[1][1] / summary.fob) * 100)}% do valor FOB selecionado.`);
    if (summary.weight) insights.push(`A razão agregada entre valor e massa é de <strong>US$ ${fmtUnit.format(summary.fob / summary.weight)} por kg</strong>.`);
    $("#insight-list").innerHTML = insights.map((text, i) => `<div class="insight"><b>${i + 1}</b><p>${text}</p></div>`).join("");
  }

  function renderAnalysis() {
    const rows = filteredRows();
    const summary = aggregate(rows);
    updateContext(rows.length);
    updateKpis(summary);
    const empty = rows.length === 0;
    $("#empty-state").hidden = !empty;
    $("#charts-content").hidden = empty;
    if (empty) return;
    renderTrend(summary);
    const flowOnly = flowForTab() !== null;
    $("#flow-extra-charts").hidden = !flowOnly;
    if (flowOnly) {
      renderSeasonality(filteredMonthlyRows());
      renderUnitValue(summary);
    }
    renderProducts(summary);
    renderCountries(summary);
    renderInsights(summary);
  }

  function getCatalogRows() {
    const flow = catalogState.flow === "all" ? null : Number(catalogState.flow);
    const year = catalogState.year === "all" ? null : Number(catalogState.year);
    const country = catalogState.country === "all" ? null : Number(catalogState.country);
    return data.rows.filter((row) =>
      (flow === null || row[0] === flow) &&
      (year === null || row[1] === year) &&
      (country === null || row[2] === country) &&
      (!catalogState.query || productSearchIndex[row[3]].includes(catalogState.query))
    );
  }

  function renderCatalog() {
    const rows = getCatalogRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / catalogState.pageSize));
    catalogState.page = Math.min(catalogState.page, totalPages);
    const start = (catalogState.page - 1) * catalogState.pageSize;
    const visibleRows = rows.slice(start, start + catalogState.pageSize);
    $("#catalog-table").innerHTML = visibleRows.map((row) => {
      const [flow, year, country, productId] = row;
      const product = data.products[productId];
      return `<tr><td><span class="flow-badge flow-badge--${flow === 0 ? "import" : "export"}">${data.meta.flows[flow]}</span></td><td class="catalog-code">${escapeHtml(product[0])}</td><td>${escapeHtml(product[1])}</td><td>${year}</td><td>${escapeHtml(data.countries[country])}</td></tr>`;
    }).join("");
    const uniqueProducts = new Set(rows.map((row) => row[3])).size;
    $("#catalog-count").textContent = `${fmtInt.format(uniqueProducts)} produtos · ${fmtInt.format(rows.length)} combinações`;
    $("#catalog-page").textContent = `Página ${fmtInt.format(catalogState.page)} de ${fmtInt.format(totalPages)}`;
    $("#catalog-prev").disabled = catalogState.page <= 1;
    $("#catalog-next").disabled = catalogState.page >= totalPages;
  }

  function renderQuality() {
    const q = data.quality.overall;
    $("#quality-output").textContent = fmtInt.format(q.output_rows);
    $("#quality-table").innerHTML = data.quality.files.map((file) => `<tr><td>${escapeHtml(file["Arquivo"])}</td><td>${escapeHtml(file["Fluxo"])}</td><td class="numeric">${fmtInt.format(file["Linhas mantidas"])}</td></tr>`).join("");
  }

  function switchTab(tab) {
    state.tab = tab;
    $$(".tab").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const analytical = ["overview", "imports", "exports"].includes(tab);
    elements.filters.hidden = !analytical;
    elements.analysis.hidden = !analytical;
    elements.quality.hidden = tab !== "quality";
    elements.products.hidden = tab !== "products";
    elements.methodology.hidden = tab !== "methodology";
    if (analytical) renderAnalysis();
    if (tab === "quality") renderQuality();
    if (tab === "products") renderCatalog();
    window.scrollTo({ top: document.querySelector(".tab-nav").offsetTop, behavior: "smooth" });
  }

  function resetFilters() {
    state.year = "all"; state.country = "all"; state.product = null;
    elements.year.value = "all"; elements.country.value = "all"; elements.product.value = "";
    renderAnalysis();
  }

  function bindEvents() {
    $$(".tab").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
    $("#theme-toggle").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
    elements.year.addEventListener("change", () => { state.year = elements.year.value; renderAnalysis(); });
    elements.country.addEventListener("change", () => { state.country = elements.country.value; renderAnalysis(); });
    elements.product.addEventListener("change", () => {
      const value = elements.product.value.trim();
      state.product = value && productLabelToId.has(value) ? productLabelToId.get(value) : null;
      if (value && state.product === null) elements.product.value = "";
      renderAnalysis();
    });
    elements.product.addEventListener("input", () => {
      const value = elements.product.value.trim();
      if (productLabelToId.has(value)) {
        state.product = productLabelToId.get(value);
        renderAnalysis();
      }
    });
    elements.product.addEventListener("search", () => { if (!elements.product.value) { state.product = null; renderAnalysis(); } });
    elements.reset.addEventListener("click", resetFilters);
    $("#catalog-search").addEventListener("input", (event) => {
      catalogState.query = event.target.value.trim().toLocaleLowerCase("pt-BR");
      catalogState.page = 1;
      renderCatalog();
    });
    [["#catalog-flow", "flow"], ["#catalog-year", "year"], ["#catalog-country", "country"]].forEach(([selector, key]) => {
      $(selector).addEventListener("change", (event) => {
        catalogState[key] = event.target.value;
        catalogState.page = 1;
        renderCatalog();
      });
    });
    $("#catalog-prev").addEventListener("click", () => { catalogState.page -= 1; renderCatalog(); });
    $("#catalog-next").addEventListener("click", () => { catalogState.page += 1; renderCatalog(); });
    $("#product-modal-close").addEventListener("click", () => $("#product-country-modal").close());
    $("#product-country-modal").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
  }

  applyTheme(document.documentElement.dataset.theme || "light", false);
  populateFilters();
  bindEvents();
  renderQuality();
  renderAnalysis();
})();
