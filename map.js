(function () {
  "use strict";

  const data = window.COMEX_DATA;
  const d3 = window.d3;
  const view = document.querySelector("#map-view");
  if (!view) return;

  const $ = (selector) => view.querySelector(selector);
  const fmtInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const fmtCompact = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtPct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const BRAZIL_ID = -1;
  const SANTOS = [-46.3336, -23.9608];
  const BRAZIL_CENTER = [-51.9253, -14.235];
  const partnerCoordinates = {
    "Estados Unidos": [-98.5795, 39.8283],
    "China": [104.1954, 35.8617],
    "Rússia": [105.3188, 61.524]
  };
  const featureNames = { Brazil: "Brasil", China: "China", Russia: "Rússia", USA: "Estados Unidos" };
  const countryIds = new Map(data ? data.countries.map((country, id) => [country, id]) : []);
  const productLabels = new Map();
  const state = { year: "all", flow: "all", product: null, selectedCountry: null, selectedRoute: null };
  const dom = {
    year: $("#map-year"), flow: $("#map-flow"), product: $("#map-product"),
    productOptions: $("#map-product-options"), canvas: $("#map-canvas"), svg: $("#trade-map"),
    loading: $("#map-loading"), empty: $("#map-empty"), tooltip: $("#map-tooltip"),
    count: $("#map-result-count"), infoTitle: $("#map-info-title"), info: $("#map-info-content"),
    infoEyebrow: $(".map-info-card .panel__eyebrow"),
    clear: $("#map-clear-selection"), layout: $(".map-layout"), infoCard: $(".map-info-card"),
    zoomIn: $("#map-zoom-in"), zoomOut: $("#map-zoom-out"), zoomReset: $("#map-zoom-reset")
  };

  let initialized = false;
  let firstOpen = true;
  let projection;
  let geoPath;
  let layers;
  let mapSvgSelection;
  let mapViewport;
  let zoomBehavior;
  const countryFeatures = new Map();
  let current = { routes: [], partners: new Map(), totalFob: 0, totalRecords: 0, rowCount: 0 };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  }

  function formatCompact(value, unit) {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    let result;
    if (abs >= 1e9) result = `${fmtCompact.format(value / 1e9)} bi`;
    else if (abs >= 1e6) result = `${fmtCompact.format(value / 1e6)} mi`;
    else if (abs >= 1e3) result = `${fmtCompact.format(value / 1e3)} mil`;
    else result = fmtCompact.format(value);
    return unit ? `${unit} ${result}` : result;
  }

  function formatTonnes(weightKg) {
    return `${formatCompact(weightKg / 1000)} t`;
  }

  function flowLabel(flow) {
    return flow === 0 ? "Importação" : "Exportação";
  }

  function selectedCountryName(countryId) {
    return countryId === BRAZIL_ID ? "Brasil" : data.countries[countryId];
  }

  function selectionIdForCountry(country) {
    return country === "Brasil" ? BRAZIL_ID : countryIds.get(country);
  }

  function periodLabel() {
    return state.year === "all" ? data.meta.period : String(state.year);
  }

  function createMetrics() {
    return { records: 0, fob: 0, weight: 0, byProduct: new Map() };
  }

  function addRow(metrics, row) {
    metrics.records += row[4];
    metrics.fob += row[5];
    metrics.weight += row[6];
    const product = metrics.byProduct.get(row[3]) || 0;
    metrics.byProduct.set(row[3], product + row[5]);
  }

  function principalProduct(metrics) {
    if (!metrics || !metrics.byProduct.size) return null;
    let winner = null;
    for (const entry of metrics.byProduct) {
      if (!winner || entry[1] > winner[1]) winner = entry;
    }
    return winner ? { id: winner[0], item: data.products[winner[0]], fob: winner[1] } : null;
  }

  function topProducts(metrics, limit = 3) {
    if (!metrics || !metrics.byProduct.size) return [];
    return [...metrics.byProduct.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, fob]) => ({ id, item: data.products[id], fob }));
  }

  function aggregateMapData() {
    const year = state.year === "all" ? null : Number(state.year);
    const flow = state.flow === "all" ? null : Number(state.flow);
    const routeMap = new Map();
    const partners = new Map(data.countries.map((_, id) => [id, createMetrics()]));
    const overall = createMetrics();
    const flows = new Map([[0, createMetrics()], [1, createMetrics()]]);
    let totalFob = 0;
    let totalRecords = 0;
    let rowCount = 0;

    for (const row of data.rows) {
      if ((year !== null && row[1] !== year) || (flow !== null && row[0] !== flow) || (state.product !== null && row[3] !== state.product)) continue;
      rowCount += 1;
      totalFob += row[5];
      totalRecords += row[4];
      addRow(partners.get(row[2]), row);
      addRow(overall, row);
      addRow(flows.get(row[0]), row);
      const key = `${row[2]}-${row[0]}`;
      if (!routeMap.has(key)) routeMap.set(key, { key, countryId: row[2], country: data.countries[row[2]], flow: row[0], ...createMetrics() });
      addRow(routeMap.get(key), row);
    }

    const routes = [...routeMap.values()].filter((route) => route.fob > 0 || route.records > 0 || route.weight > 0);
    routes.forEach((route) => { route.share = totalFob ? (route.fob / totalFob) * 100 : 0; });
    partners.forEach((metrics) => { metrics.share = totalFob ? (metrics.fob / totalFob) * 100 : 0; });
    overall.share = totalFob ? 100 : 0;
    flows.forEach((metrics) => { metrics.share = totalFob ? (metrics.fob / totalFob) * 100 : 0; });
    return { routes, partners, overall, flows, totalFob, totalRecords, rowCount };
  }

  function routePath(route) {
    const port = projection(SANTOS);
    const partner = projection(partnerCoordinates[route.country]);
    const start = route.flow === 1 ? port : partner;
    const end = route.flow === 1 ? partner : port;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const distance = Math.max(1, Math.hypot(dx, dy));
    const bend = Math.min(82, distance * .17) * (route.flow === 1 ? 1 : -1);
    const controlX = (start[0] + end[0]) / 2 - (dy / distance) * bend;
    const controlY = (start[1] + end[1]) / 2 + (dx / distance) * bend;
    return `M${start[0].toFixed(1)},${start[1].toFixed(1)} Q${controlX.toFixed(1)},${controlY.toFixed(1)} ${end[0].toFixed(1)},${end[1].toFixed(1)}`;
  }

  function countryKey(feature) {
    return featureNames[feature.properties.name] || null;
  }

  function countryMetrics(countryId) {
    if (countryId === BRAZIL_ID) return current.overall || createMetrics();
    return current.partners.get(countryId) || createMetrics();
  }

  function tooltipRows(title, eyebrow, rows) {
    return `<strong>${escapeHtml(title)}</strong><em>${escapeHtml(eyebrow)}</em>${rows.map(([label, value]) => `<span>${escapeHtml(label)}<b>${escapeHtml(value)}</b></span>`).join("")}`;
  }

  function countryTooltip(country) {
    if (country === "Brasil") {
      const metrics = countryMetrics(BRAZIL_ID);
      const product = principalProduct(metrics);
      return tooltipRows("Brasil", "Centro da análise", [
        ["Valor FOB", formatCompact(metrics.fob, "US$")],
        ["Toneladas", formatTonnes(metrics.weight)],
        ["Participação", "100,0%"],
        ["Registros", fmtInt.format(metrics.records)],
        ["Principal produto", product ? product.item[1] : "—"]
      ]);
    }
    const id = countryIds.get(country);
    const metrics = countryMetrics(id);
    const product = principalProduct(metrics);
    return tooltipRows(country, "Parceiro comercial", [
      ["Valor FOB", formatCompact(metrics.fob, "US$")],
      ["Toneladas", formatTonnes(metrics.weight)],
      ["Participação", `${fmtPct.format(metrics.share || 0)}%`],
      ["Registros", fmtInt.format(metrics.records)],
      ["Principal produto", product ? product.item[1] : "—"]
    ]);
  }

  function routeTooltip(route) {
    const origin = route.flow === 1 ? "Porto de Santos" : route.country;
    const destination = route.flow === 1 ? route.country : "Porto de Santos";
    return tooltipRows(`${origin} → ${destination}`, flowLabel(route.flow), [
      ["Valor FOB", formatCompact(route.fob, "US$")],
      ["Toneladas", formatTonnes(route.weight)],
      ["Participação", `${fmtPct.format(route.share)}%`],
      ["Período", periodLabel()]
    ]);
  }

  function showTooltip(content, event) {
    dom.tooltip.innerHTML = content;
    dom.tooltip.classList.add("is-visible");
    dom.tooltip.setAttribute("aria-hidden", "false");
    moveTooltip(event);
  }

  function moveTooltip(event) {
    if (!dom.tooltip.classList.contains("is-visible")) return;
    const bounds = dom.canvas.getBoundingClientRect();
    const xSource = Number.isFinite(event && event.clientX) ? event.clientX - bounds.left : bounds.width / 2;
    const ySource = Number.isFinite(event && event.clientY) ? event.clientY - bounds.top : bounds.height / 2;
    const width = dom.tooltip.offsetWidth || 270;
    const height = dom.tooltip.offsetHeight || 170;
    const left = Math.max(10, Math.min(bounds.width - width - 10, xSource + 14));
    const top = Math.max(10, Math.min(bounds.height - height - 10, ySource + 14));
    dom.tooltip.style.left = `${left}px`;
    dom.tooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    dom.tooltip.classList.remove("is-visible");
    dom.tooltip.setAttribute("aria-hidden", "true");
  }

  function interactionTarget() {
    if (state.selectedRoute) return { route: state.selectedRoute, country: Number(state.selectedRoute.split("-")[0]) };
    if (state.selectedCountry !== null) return { route: null, country: state.selectedCountry };
    return null;
  }

  function updateInteraction(hoverCountry = null, hoverRoute = null) {
    if (!layers) return;
    const selected = interactionTarget();
    const focusCountry = hoverCountry !== null ? hoverCountry : selected && selected.country;
    const focusRoute = hoverRoute || (selected && selected.route);

    layers.countries.selectAll(".map-country--focus")
      .classed("is-selected", (feature) => selectionIdForCountry(countryKey(feature)) === (selected && selected.country))
      .classed("is-hovered", (feature) => selectionIdForCountry(countryKey(feature)) === hoverCountry)
      .classed("is-muted", (feature) => focusCountry !== null && focusCountry !== BRAZIL_ID && countryKey(feature) !== "Brasil" && selectionIdForCountry(countryKey(feature)) !== focusCountry);

    layers.routes.selectAll(".trade-route")
      .classed("is-selected", (route) => route.key === (selected && selected.route) || (!selected?.route && (selected?.country === BRAZIL_ID || route.countryId === selected?.country)))
      .classed("is-hovered", (route) => route.key === hoverRoute)
      .classed("is-muted", (route) => Boolean(focusRoute ? route.key !== focusRoute : focusCountry !== null && focusCountry !== BRAZIL_ID && route.countryId !== focusCountry));

    layers.labels.selectAll(".map-country-label")
      .classed("is-selected", (item) => item.id === (selected && selected.country))
      .classed("is-muted", (item) => focusCountry !== null && item.id !== focusCountry);
  }

  function transitionMap(transform) {
    if (!mapSvgSelection || !zoomBehavior) return;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = reduceMotion ? mapSvgSelection : mapSvgSelection.transition().duration(680).ease(d3.easeCubicInOut);
    target.call(zoomBehavior.transform, transform);
  }

  function focusCountryOnMap(countryId) {
    const country = selectedCountryName(countryId);
    const feature = countryFeatures.get(country);
    if (!feature || !geoPath) return;
    const [[x0, y0], [x1, y1]] = geoPath.bounds(feature);
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    const scale = Math.max(1.75, Math.min(3.6, .72 / Math.max(width / 960, height / 560)));
    const [centerX, centerY] = projection(country === "Brasil" ? BRAZIL_CENTER : partnerCoordinates[country]);
    transitionMap(d3.zoomIdentity.translate(480 - scale * centerX, 280 - scale * centerY).scale(scale));
  }

  function resetMapView() {
    transitionMap(d3.zoomIdentity);
  }

  function keepMapLabelsReadable(scale) {
    if (!layers || !projection) return;
    const inverse = 1 / Math.max(1, scale);
    layers.labels.selectAll(".map-country-label").attr("transform", (item) => {
      const [x, rawY] = projection(item.coord);
      const y = rawY - 9;
      return `translate(${x},${y}) scale(${inverse}) translate(${-x},${-y})`;
    });
    const [portX, portY] = projection(SANTOS);
    layers.labels.select(".map-location").attr("transform", `translate(${portX},${portY}) scale(${inverse})`);
  }

  function selectCountry(countryId) {
    const sameSelection = state.selectedCountry === countryId && state.selectedRoute === null;
    state.selectedCountry = sameSelection ? null : countryId;
    state.selectedRoute = null;
    updateInteraction();
    renderInfoPanel();
    if (sameSelection) resetMapView();
    else focusCountryOnMap(countryId);
  }

  function selectRoute(route) {
    const sameSelection = state.selectedRoute === route.key;
    state.selectedRoute = sameSelection ? null : route.key;
    state.selectedCountry = sameSelection ? null : route.countryId;
    updateInteraction();
    renderInfoPanel();
    if (sameSelection) resetMapView();
    else focusCountryOnMap(route.countryId);
  }

  function clearSelection() {
    state.selectedCountry = null;
    state.selectedRoute = null;
    updateInteraction();
    renderInfoPanel();
    resetMapView();
  }

  function releasePointerFocus(event) {
    if (event && event.detail > 0 && event.currentTarget && typeof event.currentTarget.blur === "function") event.currentTarget.blur();
  }

  function renderInfoPanel() {
    const selectedRoute = state.selectedRoute ? current.routes.find((route) => route.key === state.selectedRoute) : null;
    const hasSelection = state.selectedCountry !== null;
    dom.clear.hidden = !hasSelection;

    if (!hasSelection) {
      dom.layout.classList.remove("is-detail-open");
      dom.layout.classList.remove("is-brazil-detail");
      dom.infoCard.classList.remove("is-expanded");
      dom.infoEyebrow.textContent = "Leitura do recorte";
      dom.clear.textContent = "Limpar seleção";
      dom.infoTitle.textContent = "Resumo dos países";
      const summaryCountries = [{ country: "Brasil", id: BRAZIL_ID }, ...data.countries.map((country, id) => ({ country, id }))];
      dom.info.innerHTML = `<div class="map-info-overview">${summaryCountries.map(({ country, id }) => {
        const metrics = countryMetrics(id);
        const description = id === BRAZIL_ID ? "Centro dos fluxos · 100,0% do valor FOB" : `${fmtPct.format(metrics.share || 0)}% do valor FOB`;
        return `<button class="map-partner-row${id === BRAZIL_ID ? " map-partner-row--brazil" : ""}" type="button" data-map-country="${id}" aria-label="Selecionar ${escapeHtml(country)}"><i></i><span><strong>${escapeHtml(country)}</strong><small>${description}</small></span><b>${formatCompact(metrics.fob, "US$")}</b></button>`;
      }).join("")}</div>`;
      dom.info.querySelectorAll("[data-map-country]").forEach((button) => button.addEventListener("click", () => selectCountry(Number(button.dataset.mapCountry))));
      return;
    }

    const country = selectedCountryName(state.selectedCountry);
    const metrics = selectedRoute || countryMetrics(state.selectedCountry);
    const visibleFlow = selectedRoute ? flowLabel(selectedRoute.flow) : state.flow === "all" ? "Importação e exportação" : flowLabel(Number(state.flow));
    const share = current.totalFob ? (metrics.fob / current.totalFob) * 100 : 0;
    const productSection = (title, source) => {
      const products = topProducts(source);
      return `<section class="map-top-products"><h4>${escapeHtml(title)}</h4>${products.length ? products.map((product, index) => `
        <div class="map-top-product">
          <b>${index + 1}</b>
          <div><strong>${escapeHtml(product.item[0])} — ${escapeHtml(product.item[1])}</strong><span>${formatCompact(product.fob, "US$")}</span></div>
        </div>`).join("") : `<p>Nenhum produto encontrado neste fluxo.</p>`}</section>`;
    };
    let productSections;
    let showsBothFlows = false;
    if (selectedRoute) {
      productSections = productSection(selectedRoute.flow === 0 ? "Top 3 importados" : "Top 3 exportados", selectedRoute);
    } else if (state.flow !== "all") {
      productSections = productSection(Number(state.flow) === 0 ? "Top 3 importados" : "Top 3 exportados", metrics);
    } else {
      showsBothFlows = true;
      const importRoute = state.selectedCountry === BRAZIL_ID ? current.flows.get(0) : current.routes.find((route) => route.countryId === state.selectedCountry && route.flow === 0);
      const exportRoute = state.selectedCountry === BRAZIL_ID ? current.flows.get(1) : current.routes.find((route) => route.countryId === state.selectedCountry && route.flow === 1);
      productSections = productSection("Top 3 importados", importRoute) + productSection("Top 3 exportados", exportRoute);
    }
    dom.layout.classList.add("is-detail-open");
    dom.layout.classList.toggle("is-brazil-detail", state.selectedCountry === BRAZIL_ID);
    dom.infoCard.classList.add("is-expanded");
    dom.infoEyebrow.textContent = "Detalhe do parceiro";
    dom.clear.textContent = "← Voltar ao mapa";
    dom.infoTitle.textContent = country;
    dom.info.innerHTML = `
      <div class="map-detail-heading"><i></i><div><strong>${escapeHtml(country)}</strong><span>${escapeHtml(visibleFlow)}</span></div></div>
      <div class="map-detail-grid">
        <div><span>Valor FOB</span><strong>${formatCompact(metrics.fob, "US$")}</strong></div>
        <div><span>Toneladas</span><strong>${formatTonnes(metrics.weight)}</strong></div>
        <div><span>Participação</span><strong>${fmtPct.format(share)}%</strong></div>
        <div><span>Registros</span><strong>${fmtInt.format(metrics.records)}</strong></div>
      </div>
      <div class="map-top-products-grid${showsBothFlows ? "" : " is-single"}">${productSections}</div>`;
  }

  function renderRoutes() {
    const values = current.routes.map((route) => route.fob).filter((value) => value > 0);
    const domain = values.length ? d3.extent(values) : [0, 1];
    const widthScale = domain[0] === domain[1] ? () => 5.5 : d3.scaleSqrt().domain(domain).range([3.2, 10]);
    if (state.selectedRoute && !current.routes.some((route) => route.key === state.selectedRoute)) state.selectedRoute = null;

    const bindRouteEvents = (selection) => selection
      .on("mouseenter focus", function (event, route) { updateInteraction(route.countryId, route.key); showTooltip(routeTooltip(route), event); })
      .on("mousemove", (event) => moveTooltip(event))
      .on("mouseleave blur", () => { hideTooltip(); updateInteraction(); })
      .on("click", (event, route) => { event.stopPropagation(); selectRoute(route); releasePointerFocus(event); });

    bindRouteEvents(layers.routes.selectAll("path.route-hit")
      .data(current.routes, (route) => route.key)
      .join("path")
      .attr("class", "route-hit")
      .attr("aria-hidden", "true")
      .attr("d", routePath));

    const visibleRoutes = layers.routes.selectAll("path.trade-route")
      .data(current.routes, (route) => route.key)
      .join(
        (enter) => enter.append("path").attr("class", (route) => `trade-route trade-route--${route.flow === 0 ? "import" : "export"}`).style("opacity", 0)
          .call((selection) => selection.transition().duration(450).style("opacity", .82)),
        (update) => update,
        (exit) => exit.transition().duration(220).style("opacity", 0).remove()
      )
      .attr("d", routePath)
      .attr("stroke-width", (route) => widthScale(route.fob))
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (route) => `${flowLabel(route.flow)} entre ${route.country} e Porto de Santos, ${formatCompact(route.fob, "US$")}`)
      .on("keydown", (event, route) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRoute(route); } });
    bindRouteEvents(visibleRoutes);

    updateInteraction();
  }

  function renderData() {
    current = aggregateMapData();
    dom.count.textContent = `${fmtInt.format(current.totalRecords)} registros · ${current.routes.length} ${current.routes.length === 1 ? "rota agregada" : "rotas agregadas"}`;
    dom.empty.hidden = current.routes.length > 0;
    renderRoutes();
    renderInfoPanel();
  }

  function renderBaseMap(world) {
    const svg = d3.select(dom.svg);
    mapSvgSelection = svg;
    projection = d3.geoNaturalEarth1().fitExtent([[22, 24], [938, 536]], world);
    geoPath = d3.geoPath(projection);
    svg.selectAll("*").remove();
    mapViewport = svg.append("g").attr("class", "map-viewport");
    mapViewport.append("path").datum({ type: "Sphere" }).attr("class", "map-sphere").attr("aria-hidden", "true").attr("d", geoPath);
    mapViewport.append("path").datum(d3.geoGraticule10()).attr("class", "map-graticule").attr("aria-hidden", "true").attr("d", geoPath);
    layers = {
      countries: mapViewport.append("g").attr("class", "map-countries"),
      routes: mapViewport.append("g").attr("class", "map-routes"),
      countryHits: mapViewport.append("g").attr("class", "map-country-hits"),
      labels: mapViewport.append("g").attr("class", "map-labels")
    };
    countryFeatures.clear();
    world.features.forEach((feature) => {
      const key = countryKey(feature);
      if (key) countryFeatures.set(key, feature);
    });

    zoomBehavior = d3.zoom()
      .scaleExtent([1, 6])
      .extent([[0, 0], [960, 560]])
      .translateExtent([[0, 0], [960, 560]])
      .clickDistance(5)
      .filter((event) => (!event.ctrlKey || event.type === "wheel") && !event.button)
      .on("start", () => dom.svg.classList.add("is-dragging"))
      .on("zoom", (event) => {
        mapViewport.attr("transform", event.transform);
        keepMapLabelsReadable(event.transform.k);
      })
      .on("end", () => dom.svg.classList.remove("is-dragging"));
    svg.call(zoomBehavior).on("dblclick.zoom", null);

    layers.countries.selectAll("path")
      .data(world.features)
      .join("path")
      .attr("d", geoPath)
      .attr("class", (feature) => {
        const key = countryKey(feature);
        return `map-country${key ? " map-country--focus" : ""}${key === "Brasil" ? " map-country--brazil" : ""}`;
      })
      .attr("aria-hidden", "true");

    const bindCountryEvents = (selection) => selection
      .on("mouseenter focus", function (event, feature) {
        const country = countryKey(feature);
        const id = selectionIdForCountry(country);
        updateInteraction(id);
        showTooltip(countryTooltip(country), event);
      })
      .on("mousemove", (event) => moveTooltip(event))
      .on("mouseleave blur", () => { hideTooltip(); updateInteraction(); })
      .on("click", function (event, feature) {
        const country = countryKey(feature);
        selectCountry(selectionIdForCountry(country));
        releasePointerFocus(event);
      })
      .on("keydown", function (event, feature) {
        const country = countryKey(feature);
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectCountry(selectionIdForCountry(country)); }
      });

    bindCountryEvents(layers.countryHits.selectAll("path")
      .data(world.features.filter((feature) => countryKey(feature)))
      .join("path")
      .attr("class", "map-country-hit")
      .attr("d", geoPath)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (feature) => countryKey(feature)));

    const labelData = data.countries.map((country, id) => ({ country, id, coord: partnerCoordinates[country] }));
    layers.labels.selectAll("text.map-country-label").data(labelData).join("text")
      .attr("class", "map-country-label")
      .attr("aria-hidden", "true")
      .attr("x", (item) => projection(item.coord)[0])
      .attr("y", (item) => projection(item.coord)[1] - 9)
      .attr("text-anchor", "middle")
      .text((item) => item.country);

    const port = projection(SANTOS);
    const portGroup = layers.labels.append("g").attr("class", "map-location").attr("transform", `translate(${port[0]},${port[1]})`).attr("tabindex", 0).attr("role", "button").attr("aria-label", "Porto de Santos, ponto central dos fluxos analisados");
    portGroup.append("circle").attr("class", "map-location__pulse").attr("r", 11);
    portGroup.append("circle").attr("class", "map-location__dot").attr("r", 6);
    portGroup.append("circle").attr("r", 19).attr("fill", "transparent").attr("pointer-events", "all");
    portGroup.append("text").attr("class", "map-location__label").attr("x", 11).attr("y", -10).text("Porto de Santos");
    portGroup
      .on("mouseenter focus", (event) => showTooltip(tooltipRows("Porto de Santos", "Brasil", [["Função", "Ponto central dos fluxos analisados"]]), event))
      .on("mousemove", (event) => moveTooltip(event))
      .on("mouseleave blur", hideTooltip);

    svg.on("click", (event) => { if (event.target === dom.svg) clearSelection(); });
    dom.loading.hidden = true;
    renderData();
  }

  function populateFilters() {
    data.meta.years.forEach((year) => dom.year.add(new Option(year, year)));
    const fragment = document.createDocumentFragment();
    data.products.forEach((product, id) => {
      const label = `${product[0]} — ${product[1]}`;
      productLabels.set(label, id);
      const option = document.createElement("option");
      option.value = label;
      fragment.appendChild(option);
    });
    dom.productOptions.appendChild(fragment);
  }

  function bindEvents() {
    dom.year.addEventListener("change", () => { state.year = dom.year.value; clearSelection(); renderData(); });
    dom.flow.addEventListener("change", () => { state.flow = dom.flow.value; clearSelection(); renderData(); });
    dom.product.addEventListener("change", () => {
      const value = dom.product.value.trim();
      state.product = value && productLabels.has(value) ? productLabels.get(value) : null;
      if (value && state.product === null) dom.product.value = "";
      clearSelection();
      renderData();
    });
    dom.product.addEventListener("input", () => {
      const value = dom.product.value.trim();
      if (!value) { state.product = null; clearSelection(); renderData(); }
      else if (productLabels.has(value)) { state.product = productLabels.get(value); clearSelection(); renderData(); }
    });
    dom.product.addEventListener("search", () => { if (!dom.product.value) { state.product = null; clearSelection(); renderData(); } });
    dom.clear.addEventListener("click", clearSelection);
    dom.zoomIn.addEventListener("click", () => {
      if (mapSvgSelection && zoomBehavior) mapSvgSelection.transition().duration(220).call(zoomBehavior.scaleBy, 1.5);
    });
    dom.zoomOut.addEventListener("click", () => {
      if (mapSvgSelection && zoomBehavior) mapSvgSelection.transition().duration(220).call(zoomBehavior.scaleBy, 1 / 1.5);
    });
    dom.zoomReset.addEventListener("click", () => {
      if (mapSvgSelection && zoomBehavior) mapSvgSelection.transition().duration(260).call(zoomBehavior.transform, d3.zoomIdentity);
    });
    window.addEventListener("resize", hideTooltip, { passive: true });
  }

  async function initialize() {
    if (initialized) return;
    initialized = true;
    if (!data || !d3) {
      const message = !data ? "A base de dados não pôde ser carregada." : "A biblioteca de visualização não pôde ser carregada.";
      dom.loading.textContent = message;
      console.error(`[Mapa] ${message}`);
      return;
    }
    populateFilters();
    bindEvents();
    renderInfoPanel();
    try {
      if (!window.COMEX_WORLD || !Array.isArray(window.COMEX_WORLD.features)) throw new Error("Geometria mundial indisponível");
      renderBaseMap(window.COMEX_WORLD);
    } catch (error) {
      dom.loading.textContent = "Não foi possível carregar o mapa geográfico. O restante do dashboard continua disponível.";
      console.error("[Mapa] Falha ao carregar assets/world.js", error);
    }
  }

  function show() {
    initialize();
    if (firstOpen) {
      view.classList.add("is-entering");
      window.setTimeout(() => view.classList.remove("is-entering"), 750);
      firstOpen = false;
    }
  }

  window.COMEX_MAP = { show };
})();
