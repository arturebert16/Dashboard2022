/* ============================================================
   Dashboard – Pesquisas Eleitorais 2022
   ============================================================ */

const PALETTE = ['#C73DB9', '#F73131', '#FF6728', '#F1B01B', '#53C373', '#00BAC6', '#3486C7', '#5555C6', '#7B7CDA', '#E879A8'];
const REAL_COLOR = '#ffffff';
const REAL_NAME = 'TSE (Real)';

const DATA = window.DASH_DATA;

// Janela: 25/ago a 01/nov de 2022 (estendido)
const JANELA_INI = '2022-08-25';
const JANELA_FIM = '2022-11-01';

const ELEICAO_T1 = '2022-10-02';
const ELEICAO_T2 = '2022-10-30';

// Data de início para o modo "Y compacto" (zoom X+Y em fim de campanha)
// Default (para Geral / cards que cobrem T1+T2); para cards só de T1 ou só de T2
// usamos janelas específicas (ver compactIniFor()).
const COMPACT_INI = '2022-10-05';
const COMPACT_INI_T1 = '2022-09-20';  // ~2 semanas antes de 02/10
const COMPACT_INI_T2 = '2022-10-18';  // ~2 semanas antes de 30/10

const CANDIDATOS_T1 = ['Lula', 'Jair Bolsonaro', 'Ciro Gomes', 'Simone Tebet'];
const CANDIDATOS_T2 = ['Lula', 'Jair Bolsonaro'];

// ---------- Helpers ----------
const dateMs = (s) => new Date(s + 'T12:00:00').getTime();
const fmtNum = (v, d=1) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d);

const ELEICAO_T1_MS = dateMs(ELEICAO_T1);
const ELEICAO_T2_MS = dateMs(ELEICAO_T2);
const JANELA_INI_MS = dateMs(JANELA_INI);
const JANELA_FIM_MS = dateMs(JANELA_FIM);
const COMPACT_INI_MS = dateMs(COMPACT_INI);
const COMPACT_INI_T1_MS = dateMs(COMPACT_INI_T1);
const COMPACT_INI_T2_MS = dateMs(COMPACT_INI_T2);

// Retorna o ms de início do zoom X a partir dos turnos cobertos pelo card.
// turnos: array como ['t1'], ['t2'] ou ['t1','t2'].
function compactIniFor(turnos) {
  const t = turnos || [];
  const hasT1 = t.includes('t1');
  const hasT2 = t.includes('t2');
  if (hasT1 && !hasT2) return COMPACT_INI_T1_MS;
  if (hasT2 && !hasT1) return COMPACT_INI_T2_MS;
  return COMPACT_INI_MS;
}

const inRange = (d) => d >= JANELA_INI && d <= JANELA_FIM;
const polls1 = DATA.primeiroTurno.filter(p => inRange(p.data));
const polls2 = DATA.segundoTurno.filter(p => inRange(p.data));

const institutos = [...new Set([...polls1, ...polls2].map(p => p.instituto))].sort();
const colorByInst = {};
institutos.forEach((inst, i) => { colorByInst[inst] = PALETTE[i % PALETTE.length]; });

const colorByCandidato = {
  'Lula': '#F73131',
  'Jair Bolsonaro': '#3486C7',
  'Ciro Gomes': '#53C373',
  'Simone Tebet': '#F1B01B',
  'Outros': '#7B7CDA',
};

const real1 = DATA.real1;
const real2 = DATA.real2;

// ============================================================
//                       METODOLOGIAS
// ============================================================

// Metodologia A — Acerto simples: 1 - |est - real| / real (média entre candidatos), em %
function pollAcertoSimples(poll, real, candidatos) {
  const vals = [];
  for (const c of candidatos) {
    const est = poll.estimativas[c];
    const r = real.estimativas[c];
    if (est == null || r == null || r === 0) continue;
    vals.push(1 - Math.abs(est - r) / r);
  }
  if (vals.length === 0) return null;
  return (vals.reduce((a,b) => a+b, 0) / vals.length) * 100;
}

// Metodologia B — Pindograma: desvio padrão das diferenças (est - real) por candidato, em pp
function pollErroPindograma(poll, real, candidatos) {
  const diffs = [];
  for (const c of candidatos) {
    const est = poll.estimativas[c];
    const r = real.estimativas[c];
    if (est == null || r == null) continue;
    diffs.push(est - r);
  }
  if (diffs.length === 0) return null;
  const mean = diffs.reduce((a,b) => a+b, 0) / diffs.length;
  const variance = diffs.reduce((s, d) => s + (d - mean)**2, 0) / diffs.length;
  return Math.sqrt(variance);
}

const METODOLOGIAS = {
  acerto: {
    label: 'Acerto Simples',
    desc: 'Acerto = <code>1 − |Instituto − Real| / Real</code>',
    yLabel: 'Acerto',
    fmt: (v) => v.toFixed(2) + '%',
    fmtAxis: (v) => v.toFixed(0) + '%',
    compute: pollAcertoSimples,
    higherBetter: true,
  },
  pindograma: {
    label: 'Erro Ajustado (Pindograma)',
    desc: 'Erro Ajustado = desvio padrão das diferenças <code>(Instituto − Real)</code> por candidato, em pp (quanto menor, melhor)',
    yLabel: 'Erro (pp)',
    fmt: (v) => v.toFixed(2) + ' pp',
    fmtAxis: (v) => v.toFixed(1) + ' pp',
    compute: pollErroPindograma,
    higherBetter: false,
  },
};

// ============================================================
//                         STATE
// ============================================================
const state = {
  metodologia: 'acerto',
  viewT1: 'candidato',
  viewT2: 'candidato',
};

// ============================================================
//                  APEX BASE CONFIG
// ============================================================
// Config base "Zoomable Timeseries" (ApexCharts): toolbar nativo + zoom em X
// com autoescalonamento de Y ao fazer zoom.
const baseChart = {
  fontFamily: 'Manrope, sans-serif',
  background: 'transparent',
  toolbar: {
    show: true,
    offsetX: -8,
    offsetY: -4,
    autoSelected: 'zoom',
    tools: {
      download: false,
      selection: false,
      zoom: true,
      zoomin: true,
      zoomout: true,
      pan: true,
      reset: true,
    },
  },
  zoom: {
    enabled: true,
    type: 'x',
    autoScaleYaxis: true,
  },
  animations: { enabled: false },
};

const baseGrid = {
  borderColor: 'rgba(255,255,255,0.05)',
  strokeDashArray: 4,
  padding: { top: 0, right: 8, bottom: 0, left: 8 },
};

const baseTooltip = {
  theme: 'dark',
  x: { format: 'dd MMM yyyy' },
  // intersect:false -> tooltip acompanha o ponto mais próximo, sem exigir
  // que o cursor esteja exatamente em cima do marker.
  intersect: false,
  shared: false,
};

const baseLegend = {
  fontFamily: 'Manrope, sans-serif',
  fontWeight: 500,
  fontSize: '12px',
  labels: { colors: '#8b90a8' },
  markers: { width: 10, height: 10, radius: 3 },
  itemMargin: { horizontal: 8, vertical: 4 },
  position: 'bottom',
};

// Election day vertical annotations
function electionLineAnnotation(turno) {
  const isT1 = turno === 't1';
  return {
    x: isT1 ? ELEICAO_T1_MS : ELEICAO_T2_MS,
    strokeDashArray: 5,
    borderColor: isT1 ? 'rgba(83, 195, 115, 0.85)' : 'rgba(247, 49, 49, 0.85)',
    borderWidth: 2,
    label: {
      borderColor: 'transparent',
      style: {
        color: '#fff',
        background: isT1 ? 'rgba(83, 195, 115, 0.85)' : 'rgba(247, 49, 49, 0.85)',
        fontFamily: 'Manrope',
        fontWeight: 700,
        fontSize: '10px',
      },
      text: isT1 ? '1° Turno · 02/10' : '2° Turno · 30/10',
      orientation: 'horizontal',
      position: 'top',
      offsetY: 0,
    },
  };
}

// ============================================================
//                       TABS
// ============================================================
const tabBtns = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

tabBtns.forEach(btn => btn.addEventListener('click', () => {
  const id = btn.dataset.tab;
  tabBtns.forEach(b => b.classList.toggle('active', b === btn));
  panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + id));
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}));

// ============================================================
//                  LINE CHART (com controles)
// ============================================================

/**
 * Cria card padrão com header + controles + chart.
 *   opts = { title, chip?, electionLines: ['t1'|'t2'], extraActions?: HTMLElement[] }
 * Retorna { card, chartEl, controls: {fs, y, reset} }
 */
function buildCard(parent, opts) {
  const card = document.createElement('div');
  card.className = 'card turno-card';
  const chip = opts.chip ? `<span class="chip ${opts.chipClass || 'chip-real'}">${opts.chip}</span>` : '';
  card.innerHTML = `
    <div class="card-header">
      <h3>${opts.title}</h3>
      <div class="chart-controls">
        ${chip}
        <button class="icon-btn btn-reset" title="Reiniciar legenda (mostrar todas)">
          <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
        </button>
        <button class="icon-btn btn-y" title="Compactar eixo Y (zoom in)">
          <svg viewBox="0 0 24 24"><path d="M12 4v16"/><path d="M7 9l5-5 5 5"/><path d="M7 15l5 5 5-5"/></svg>
        </button>
        <button class="icon-btn btn-fs" title="Tela cheia">
          <svg viewBox="0 0 24 24"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></svg>
        </button>
      </div>
    </div>
    <div class="chart"></div>
    <div class="card-actions"></div>
  `;
  parent.appendChild(card);
  return {
    card,
    chartEl: card.querySelector('.chart'),
    actionsEl: card.querySelector('.card-actions'),
    btnFs: card.querySelector('.btn-fs'),
    btnY: card.querySelector('.btn-y'),
    btnReset: card.querySelector('.btn-reset'),
  };
}

/**
 * Cria comportamento de legenda customizado:
 *  - Se TODAS as séries (não-Real) estão visíveis: clique → isola a clicada (esconde as outras)
 *  - Se já existem séries escondidas: clique → toggle individual (mostra/esconde a clicada)
 *  - "TSE (Real)" e linhas reais (HR-*) ficam sempre visíveis
 */
function legendClickHandler() {
  return function(chartContext, seriesIndex /*, config */) {
    const w = chartContext.w;
    const seriesNames = w.globals.seriesNames;
    const collapsed = new Set([
      ...w.globals.collapsedSeriesIndices,
      ...w.globals.ancillaryCollapsedSeriesIndices,
    ]);
    const clickedName = seriesNames[seriesIndex];
    if (clickedName === REAL_NAME || clickedName.startsWith('HR-')) return false;

    // Indices de séries "togglable" (não-real)
    const togglable = [];
    seriesNames.forEach((n, i) => {
      if (n !== REAL_NAME && !n.startsWith('HR-')) togglable.push(i);
    });
    const allVisible = togglable.every(i => !collapsed.has(i));
    const isClickedHidden = collapsed.has(seriesIndex);

    if (allVisible) {
      // Esconde todas exceto a clicada (e Real)
      togglable.forEach(i => {
        if (i !== seriesIndex) chartContext.hideSeries(seriesNames[i]);
      });
    } else {
      // Toggle individual
      if (isClickedHidden) chartContext.showSeries(clickedName);
      else chartContext.hideSeries(clickedName);
    }
    return false;
  };
}

/**
 * Aplica fullscreen num card e reajusta altura do ApexCharts para ocupar
 * todo o espaço disponível (Apex não cresce sozinho via resize event).
 */
function applyFullscreen(card, chartEl, chart, on) {
  if (on) {
    // Medir espaço real dentro do card (descontando header e actions)
    const cardRect = card.getBoundingClientRect();
    const header = card.querySelector('.card-header');
    const actions = card.querySelector('.card-actions');
    const hHeader = header ? header.getBoundingClientRect().height : 0;
    const hActions = actions ? actions.getBoundingClientRect().height : 0;
    // padding do card (18 topo + 14 base = 32) + gaps
    const available = Math.max(300, cardRect.height - hHeader - hActions - 48);
    chart.updateOptions({ chart: { height: available } }, false, false);
  } else {
    chart.updateOptions({ chart: { height: 380 } }, false, false);
  }
}

/**
 * Liga os controles do card ao chart (fullscreen, Y compacto, reset legenda)
 */
function wireCardControls({ card, chartEl, btnFs, btnY, btnReset }, chart, ctx) {
  // Fullscreen
  btnFs.addEventListener('click', () => {
    document.querySelectorAll('.card.fullscreen').forEach(c => {
      if (c !== card && c.__fsChart) applyFullscreen(c, c.querySelector('.chart'), c.__fsChart, false);
      if (c !== card) c.classList.remove('fullscreen');
    });
    const entering = !card.classList.contains('fullscreen');
    card.classList.toggle('fullscreen', entering);
    document.body.classList.toggle('has-fullscreen', entering);
    card.__fsChart = chart;
    // aguarda o navegador aplicar o layout do .fullscreen antes de medir
    setTimeout(() => {
      applyFullscreen(card, chartEl, chart, entering);
      window.dispatchEvent(new Event('resize'));
    }, 60);
  });

  // ESC sai do fullscreen
  if (!window.__fsEsc) {
    window.__fsEsc = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.card.fullscreen').forEach(c => {
          if (c.__fsChart) applyFullscreen(c, c.querySelector('.chart'), c.__fsChart, false);
          c.classList.remove('fullscreen');
        });
        document.body.classList.remove('has-fullscreen');
      }
    });
  }

  // Y compactar (também restringe X a partir de 05/10)
  btnY.addEventListener('click', () => {
    ctx.yCompact = !ctx.yCompact;
    btnY.classList.toggle('active', ctx.yCompact);
    applyYRange(chart, ctx);
  });

  // Reset: legenda + zoom + Y-compact
  btnReset.addEventListener('click', () => {
    resetCardChart(chart, ctx, btnY);
  });
}

/**
 * Reseta o card: mostra todas as séries, desativa Y-compact, volta o zoom
 * para a janela cheia e recomputa Y para todos os pontos.
 */
function resetCardChart(chart, ctx, btnY, seriesFilter) {
  // Legenda: mostra tudo (seriesFilter pode excluir HR-* para instituto card)
  chart.w.globals.seriesNames.forEach(n => {
    if (seriesFilter && !seriesFilter(n)) return;
    chart.showSeries(n);
  });
  // Y-compact OFF + xaxis full + yaxis recomputado para a janela cheia
  if (ctx) {
    ctx.yCompact = false;
    if (btnY) btnY.classList.remove('active');
    const r = computeYInWindow(ctx.allPoints, JANELA_INI_MS, JANELA_FIM_MS, ctx.extraYValues || []);
    chart.updateOptions({
      xaxis: { ...(ctx.xaxisBase || {}), min: JANELA_INI_MS, max: JANELA_FIM_MS },
      yaxis: r ? { ...ctx.yaxisBase, min: r.min, max: r.max } : { ...ctx.yaxisBase },
    }, false, false);
  }
}

/**
 * Aplica range X/Y conforme ctx.yCompact:
 *  - false: X = janela completa, Y = auto (recalculado pela visible window)
 *  - true:  X = a partir de COMPACT_INI, Y = min/max dos pontos nessa janela
 */
function applyYRange(chart, ctx) {
  const compactIni = ctx.compactIniMs != null ? ctx.compactIniMs : COMPACT_INI_MS;
  const xMin = ctx.yCompact ? compactIni : JANELA_INI_MS;
  const xMax = JANELA_FIM_MS;
  const r = ctx.yCompact
    ? ctx.yRangeCompact
    : computeYInWindow(ctx.allPoints, xMin, xMax, ctx.extraYValues || []);
  if (!r) return;
  chart.updateOptions({
    xaxis: { ...(ctx.xaxisBase || {}), min: xMin, max: xMax },
    yaxis: { ...ctx.yaxisBase, min: r.min, max: r.max },
  }, false, false);
}

/**
 * Calcula o range Y (com padding) dos pontos cujo X está em [xMin, xMax].
 * Usado tanto pelo botão "compactar Y" quanto pelo zoomed event do toolbar
 * nativo do ApexCharts.
 */
function computeYInWindow(points, xMin, xMax, extraValues = []) {
  const vals = [];
  (points || []).forEach(p => {
    if (p == null || p.x == null) return;
    if (p.x < xMin || p.x > xMax) return;
    if (Array.isArray(p.yRange)) p.yRange.forEach(v => { if (v != null) vals.push(v); });
    if (p.y != null) {
      if (Array.isArray(p.y)) p.y.forEach(v => { if (v != null) vals.push(v); });
      else vals.push(p.y);
    }
  });
  extraValues.forEach(v => { if (v != null) vals.push(v); });
  if (!vals.length) return null;
  const s = vals.slice().sort((a, b) => a - b);
  const min = s[0], max = s[s.length - 1];
  const pad = Math.max(0.5, (max - min) * 0.1);
  return { min: Math.floor(min - pad), max: Math.ceil(max + pad) };
}

/**
 * Handler do evento "zoomed" (toolbar nativo de zoomable timeseries).
 * Recalcula o Y range para caber nos pontos visíveis após o zoom.
 * Também é invocado no reset (retorna xaxis.min/max = undefined → janela cheia).
 */
function makeZoomedHandler(ctx) {
  return function(chartContext, { xaxis }) {
    // Se o user está com Y compactado, não mexe — deixa o range dele valer.
    if (ctx.yCompact) return;
    const xMin = (xaxis && xaxis.min != null) ? xaxis.min : JANELA_INI_MS;
    const xMax = (xaxis && xaxis.max != null) ? xaxis.max : JANELA_FIM_MS;
    const r = computeYInWindow(ctx.allPoints, xMin, xMax, ctx.extraYValues || []);
    if (!r) return;
    chartContext.updateOptions({
      yaxis: { ...ctx.yaxisBase, min: r.min, max: r.max },
    }, false, false);
  };
}

/**
 * Calcula min/max full (todos os pontos) e compact (somente pontos com x >= COMPACT_INI).
 *
 * points: array de { x, y } ou { x, yRange: [lo, hi] }
 * extraValues: valores escalares (ex: valor real) a incluir no full
 * extraValuesCompact: valores escalares a incluir no compact (por padrão = extraValues)
 */
function computeYRanges(points, extraValues = [], extraValuesCompact = null, compactIniMs = COMPACT_INI_MS) {
  const full = [];
  const compact = [];
  (points || []).forEach(p => {
    if (p == null) return;
    // Forma antiga: array plana de valores
    if (typeof p === 'number') {
      full.push(p);
      return;
    }
    if (Array.isArray(p)) {
      p.forEach(v => { if (v != null) full.push(v); });
      return;
    }
    // { x, y } ou { x, yRange }
    const vals = [];
    if (Array.isArray(p.yRange)) vals.push(...p.yRange.filter(v => v != null));
    if (p.y != null) {
      if (Array.isArray(p.y)) vals.push(...p.y.filter(v => v != null));
      else vals.push(p.y);
    }
    vals.forEach(v => full.push(v));
    if (p.x != null && p.x >= compactIniMs) vals.forEach(v => compact.push(v));
  });

  extraValues.forEach(v => { if (v != null) full.push(v); });
  const extraC = extraValuesCompact == null ? extraValues : extraValuesCompact;
  extraC.forEach(v => { if (v != null) compact.push(v); });

  function rangeOf(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const min = s[0];
    const max = s[s.length - 1];
    const pad = Math.max(0.5, (max - min) * 0.1);
    return { min: Math.floor(min - pad), max: Math.ceil(max + pad) };
  }

  return {
    full: rangeOf(full),
    compact: rangeOf(compact.length ? compact : full),
  };
}

// ============================================================
//                       GERAL
// ============================================================

/**
 * Constrói séries por instituto: cada ponto = (data, score conforme metodologia)
 */
function buildScoreSeries(polls, real, candidatos, metodologiaKey) {
  const M = METODOLOGIAS[metodologiaKey];
  const map = {};
  polls.forEach(p => {
    const v = M.compute(p, real, candidatos);
    if (v == null) return;
    (map[p.instituto] = map[p.instituto] || []).push({ x: dateMs(p.data), y: +v.toFixed(3) });
  });
  return Object.entries(map)
    .map(([name, data]) => ({ name, data: data.sort((a,b) => a.x - b.x), color: colorByInst[name] }))
    .sort((a,b) => a.name.localeCompare(b.name));
}

/**
 * Aggrega T1 + T2 (cada um com seu real) num só conjunto de séries por instituto
 */
function buildScoreSeriesMedia(metodologiaKey) {
  const M = METODOLOGIAS[metodologiaKey];
  const map = {};
  polls1.forEach(p => {
    const v = M.compute(p, real1, CANDIDATOS_T1);
    if (v == null) return;
    (map[p.instituto] = map[p.instituto] || []).push({ x: dateMs(p.data), y: +v.toFixed(3) });
  });
  polls2.forEach(p => {
    const v = M.compute(p, real2, CANDIDATOS_T2);
    if (v == null) return;
    (map[p.instituto] = map[p.instituto] || []).push({ x: dateMs(p.data), y: +v.toFixed(3) });
  });
  return Object.entries(map)
    .map(([name, data]) => ({ name, data: data.sort((a,b) => a.x - b.x), color: colorByInst[name] }))
    .sort((a,b) => a.name.localeCompare(b.name));
}

/**
 * Cria um card de gráfico de linha do Geral (acerto/erro por instituto, ao longo do tempo)
 */
function makeGeralLineCard(parent, title, chip, chipClass, series, electionLines) {
  const M = METODOLOGIAS[state.metodologia];
  const ctrl = buildCard(parent, { title, chip, chipClass, electionLines });

  const compactIniMs = compactIniFor(electionLines);

  // Y ranges
  const allPoints = [];
  series.forEach(s => s.data.forEach(d => allPoints.push(d)));
  const yRanges = computeYRanges(allPoints, [], null, compactIniMs);

  const yaxisBase = {
    labels: { style: { colors: '#8b90a8', fontFamily: 'Manrope' }, formatter: M.fmtAxis },
    title: { text: M.yLabel, style: { color: '#5d6280', fontFamily: 'Manrope', fontWeight: 600 } },
  };

  const xaxisBase = {
    type: 'datetime',
    labels: { style: { colors: '#8b90a8', fontFamily: 'Manrope' }, datetimeFormatter: { day: 'dd/MM' } },
    axisBorder: { color: '#262a40' },
    axisTicks: { color: '#262a40' },
  };

  const xAnnotations = (electionLines || []).map(electionLineAnnotation);

  // ctx criado ANTES da config para que o handler de "zoomed" capture a
  // referência correta (o handler lê ctx.allPoints/extraYValues em runtime).
  const ctx = {
    yCompact: false,
    yRangeFull: yRanges.full,
    yRangeCompact: yRanges.compact,
    yaxisBase,
    xaxisBase,
    compactIniMs,
    allPoints,
    extraYValues: [],
  };

  const cfg = {
    chart: {
      ...baseChart,
      type: 'line',
      height: 360,
      events: {
        legendClick: legendClickHandler(),
        zoomed: makeZoomedHandler(ctx),
      },
    },
    series,
    colors: series.map(s => s.color),
    stroke: { curve: 'smooth', width: 3 },
    markers: { size: 4, strokeWidth: 0, hover: { size: 8, sizeOffset: 4 } },
    grid: baseGrid,
    legend: { ...baseLegend, onItemClick: { toggleDataSeries: false } },
    dataLabels: { enabled: false },
    tooltip: { ...baseTooltip, y: { formatter: (v) => v == null ? '—' : M.fmt(v) } },
    xaxis: { ...xaxisBase, min: JANELA_INI_MS, max: JANELA_FIM_MS },
    yaxis: { ...yaxisBase, min: yRanges.full ? yRanges.full.min : undefined, max: yRanges.full ? yRanges.full.max : undefined },
    annotations: { xaxis: xAnnotations },
  };

  const chart = new ApexCharts(ctrl.chartEl, cfg);
  chart.render();

  wireCardControls(ctrl, chart, ctx);

  return { ctrl, chart };
}

/**
 * Renderiza a aba Geral inteira (re-renderiza ao trocar metodologia)
 */
function renderGeral() {
  const parent = document.getElementById('grid-geral');
  parent.innerHTML = '';

  const M = METODOLOGIAS[state.metodologia];
  document.getElementById('metodologia-desc').innerHTML = M.desc + ' &nbsp;·&nbsp; janela: 25/ago a 01/nov de 2022';

  // Charts 1, 2, 3 (line)
  makeGeralLineCard(parent, `${M.label} médio (1° + 2° turno)`, 'Média', 'chip', buildScoreSeriesMedia(state.metodologia), ['t1','t2']);
  makeGeralLineCard(parent, `${M.label} — 1° Turno`, '1° Turno', 'chip-1', buildScoreSeries(polls1, real1, CANDIDATOS_T1, state.metodologia), ['t1']);
  makeGeralLineCard(parent, `${M.label} — 2° Turno`, '2° Turno', 'chip-2', buildScoreSeries(polls2, real2, CANDIDATOS_T2, state.metodologia), ['t2']);
}

// ============================================================
//             1° / 2° TURNO — séries (por candidato)
// ============================================================

function buildCandidateSeries(polls, candidato) {
  const map = {};
  polls.forEach(p => {
    const v = p.estimativas[candidato];
    if (v == null) return;
    (map[p.instituto] = map[p.instituto] || []).push({
      x: dateMs(p.data),
      y: v,
      yRange: [+(v - p.margem_erro).toFixed(2), +(v + p.margem_erro).toFixed(2)],
      margem: p.margem_erro,
    });
  });
  return Object.entries(map)
    .map(([name, data]) => ({ name, data: data.sort((a,b) => a.x - b.x), color: colorByInst[name] }))
    .sort((a,b) => a.name.localeCompare(b.name));
}

// "Outros" no T1 = soma de Ciro + Tebet + Outros (todos menos Lula e Bolsonaro)
function buildOutrosSeries(polls) {
  const map = {};
  polls.forEach(p => {
    let soma = 0;
    Object.entries(p.estimativas).forEach(([k, v]) => {
      if (k !== 'Lula' && k !== 'Jair Bolsonaro' && v != null) soma += v;
    });
    soma = +soma.toFixed(2);
    (map[p.instituto] = map[p.instituto] || []).push({
      x: dateMs(p.data),
      y: soma,
      yRange: [+(soma - p.margem_erro).toFixed(2), +(soma + p.margem_erro).toFixed(2)],
      margem: p.margem_erro,
    });
  });
  return Object.entries(map)
    .map(([name, data]) => ({ name, data: data.sort((a,b) => a.x - b.x), color: colorByInst[name] }))
    .sort((a,b) => a.name.localeCompare(b.name));
}

function realValueOutros(real) {
  let s = 0;
  Object.entries(real.estimativas).forEach(([k,v]) => {
    if (k !== 'Lula' && k !== 'Jair Bolsonaro') s += v;
  });
  return +s.toFixed(2);
}

// ============================================================
//   Card de "candidato" (mantém line/rangeArea + nova UX)
// ============================================================
function candidateChartConfig(seriesByInst, realValue, mode, electionTurno, zoomedHandler) {
  const realPoints = [
    { x: JANELA_INI_MS, y: realValue },
    { x: JANELA_FIM_MS, y: realValue },
  ];

  const compactIniMs = compactIniFor([electionTurno]);

  // Usa os pontos (com x) para computar full e compact (>= compactIniMs)
  const allPoints = [];
  seriesByInst.forEach(s => s.data.forEach(d => allPoints.push(d)));
  const yRanges = computeYRanges(allPoints, [realValue], null, compactIniMs);

  let series, colors, strokeWidth, dashArray, fillOpacity;

  if (mode === 'line') {
    series = [
      ...seriesByInst.map(s => ({ name: s.name, type: 'line', data: s.data })),
      { name: REAL_NAME, type: 'line', data: realPoints },
    ];
    colors = [...seriesByInst.map(s => s.color), REAL_COLOR];
    strokeWidth = [...seriesByInst.map(() => 3), 2];
    dashArray = [...seriesByInst.map(() => 0), 6];
    fillOpacity = 1;
  } else {
    const realRange = realPoints.map(p => ({ x: p.x, y: [p.y, p.y] }));
    series = [
      ...seriesByInst.map(s => ({
        name: s.name,
        type: 'rangeArea',
        data: s.data.map(d => ({ x: d.x, y: d.yRange })),
      })),
      { name: REAL_NAME, type: 'rangeArea', data: realRange },
    ];
    colors = [...seriesByInst.map(s => s.color), REAL_COLOR];
    strokeWidth = [...seriesByInst.map(() => 1), 2];
    dashArray = [...seriesByInst.map(() => 0), 6];
    fillOpacity = 0.35;
  }

  const yaxisBase = {
    labels: { style: { colors: '#8b90a8', fontFamily: 'Manrope' }, formatter: (v) => v.toFixed(0) + '%' },
  };
  const xaxisBase = {
    type: 'datetime',
    labels: { style: { colors: '#8b90a8', fontFamily: 'Manrope' }, datetimeFormatter: { day: 'dd/MM' } },
    axisBorder: { color: '#262a40' },
    axisTicks: { color: '#262a40' },
  };

  return {
    cfg: {
      chart: {
        ...baseChart,
        height: 380,
        type: mode === 'line' ? 'line' : 'rangeArea',
        events: {
          legendClick: legendClickHandler(),
          ...(zoomedHandler ? { zoomed: zoomedHandler } : {}),
        },
      },
      series,
      colors,
      stroke: { curve: mode === 'line' ? 'smooth' : 'straight', width: strokeWidth, dashArray },
      dataLabels: { enabled: false },
      fill: mode === 'line' ? { type: 'solid', opacity: 1 } : { type: 'solid', opacity: fillOpacity },
      markers: { size: mode === 'line' ? 4 : 0, strokeWidth: 0, hover: { size: 8, sizeOffset: 4 } },
      grid: baseGrid,
      legend: { ...baseLegend, onItemClick: { toggleDataSeries: false } },
      tooltip: {
        ...baseTooltip,
        shared: false,
        y: {
          formatter: (val) => {
            if (Array.isArray(val)) return `${fmtNum(val[0])}% – ${fmtNum(val[1])}%`;
            return val == null ? '—' : val.toFixed(1) + '%';
          },
        },
      },
      xaxis: { ...xaxisBase, min: JANELA_INI_MS, max: JANELA_FIM_MS },
      yaxis: { ...yaxisBase, min: yRanges.full ? yRanges.full.min : undefined, max: yRanges.full ? yRanges.full.max : undefined },
      annotations: {
        xaxis: [electionLineAnnotation(electionTurno)],
        yaxis: [{
          y: realValue,
          borderColor: 'rgba(255,255,255,0.25)',
          borderWidth: 0,
          label: {
            borderColor: 'transparent',
            style: { color: '#fff', background: 'rgba(255,255,255,0.08)', fontFamily: 'Manrope', fontWeight: 700 },
            text: `Real: ${realValue.toFixed(2)}%`,
            position: 'right',
            offsetX: -8,
          },
        }],
      },
    },
    yRanges,
    yaxisBase,
    xaxisBase,
    compactIniMs,
    allPoints,
  };
}

function createCandidateCard(parent, title, seriesByInst, realValue, electionTurno) {
  const ctrl = buildCard(parent, {
    title,
    chip: `Real: <strong style="margin-left:4px;color:#fff">${realValue.toFixed(2)}%</strong>`,
    chipClass: 'chip-real',
  });

  // Botão extra: line ↔ rangeArea
  const btnRA = document.createElement('button');
  btnRA.className = 'btn-toggle';
  btnRA.innerHTML = `<span class="icon"></span><span class="label">Mostrar margem de erro (Range Area)</span>`;
  ctrl.actionsEl.appendChild(btnRA);

  let mode = 'line';
  let chart = null;
  // ctx persistente — mutado a cada build() para que o handler zoomed (que
  // captura a referência) sempre leia os valores atualizados.
  const ctx = {
    yCompact: false,
    yRangeFull: null,
    yRangeCompact: null,
    yaxisBase: null,
    xaxisBase: null,
    compactIniMs: compactIniFor([electionTurno]),
    allPoints: [],
    extraYValues: [realValue],
  };
  const zoomedHandler = makeZoomedHandler(ctx);

  function build() {
    const built = candidateChartConfig(seriesByInst, realValue, mode, electionTurno, zoomedHandler);
    if (chart) chart.destroy();
    chart = new ApexCharts(ctrl.chartEl, built.cfg);
    chart.render();
    ctx.yRangeFull = built.yRanges.full;
    ctx.yRangeCompact = built.yRanges.compact;
    ctx.yaxisBase = built.yaxisBase;
    ctx.xaxisBase = built.xaxisBase;
    ctx.compactIniMs = built.compactIniMs;
    ctx.allPoints = built.allPoints;
    if (ctx.yCompact) applyYRange(chart, ctx);
  }
  build();

  // Botão range area
  btnRA.addEventListener('click', () => {
    mode = mode === 'line' ? 'rangeArea' : 'line';
    btnRA.classList.toggle('active', mode === 'rangeArea');
    btnRA.querySelector('.label').textContent = mode === 'line'
      ? 'Mostrar margem de erro (Range Area)'
      : 'Mostrar linha simples (Line)';
    build();
  });

  // Controles do header — fullscreen com ajuste real de altura
  ctrl.btnFs.addEventListener('click', () => {
    document.querySelectorAll('.card.fullscreen').forEach(c => {
      if (c !== ctrl.card && c.__fsChart) applyFullscreen(c, c.querySelector('.chart'), c.__fsChart, false);
      if (c !== ctrl.card) c.classList.remove('fullscreen');
    });
    const entering = !ctrl.card.classList.contains('fullscreen');
    ctrl.card.classList.toggle('fullscreen', entering);
    document.body.classList.toggle('has-fullscreen', entering);
    ctrl.card.__fsChart = chart;
    setTimeout(() => {
      applyFullscreen(ctrl.card, ctrl.chartEl, chart, entering);
      window.dispatchEvent(new Event('resize'));
    }, 60);
  });
  ctrl.btnY.addEventListener('click', () => {
    ctx.yCompact = !ctx.yCompact;
    ctrl.btnY.classList.toggle('active', ctx.yCompact);
    applyYRange(chart, ctx);
  });
  ctrl.btnReset.addEventListener('click', () => {
    resetCardChart(chart, ctx, ctrl.btnY);
  });
}

// ============================================================
//   Card "por instituto" (linhas por candidato + linhas reais H)
// ============================================================
function buildCandidatesByInstSeries(instituto, polls, candidatos) {
  // Para esse instituto, série por candidato com yRange (margem) para rangeArea
  const map = {};
  polls.filter(p => p.instituto === instituto).forEach(p => {
    candidatos.forEach(c => {
      const v = p.estimativas[c];
      if (v == null) return;
      (map[c] = map[c] || []).push({
        x: dateMs(p.data),
        y: v,
        yRange: [+(v - p.margem_erro).toFixed(2), +(v + p.margem_erro).toFixed(2)],
        margem: p.margem_erro,
      });
    });
  });
  return candidatos
    .filter(c => map[c])
    .map(c => ({
      name: c,
      data: map[c].sort((a,b) => a.x - b.x),
      color: colorByCandidato[c] || '#999',
    }));
}

function createInstitutoCard(parent, instituto, polls, real, candidatos, electionTurno) {
  const ctrl = buildCard(parent, {
    title: instituto,
    chip: '',
  });

  const series = buildCandidatesByInstSeries(instituto, polls, candidatos);
  const compactIniMs = compactIniFor([electionTurno]);

  // Ranges (usa pontos {x,y,yRange} — compact filtra por x >= compactIniMs)
  const allPoints = [];
  series.forEach(s => s.data.forEach(d => allPoints.push(d)));
  const realValues = candidatos.filter(c => real.estimativas[c] != null).map(c => real.estimativas[c]);
  const yRanges = computeYRanges(allPoints, realValues, null, compactIniMs);

  const yaxisBase = {
    labels: { style: { colors: '#8b90a8', fontFamily: 'Manrope' }, formatter: (v) => v.toFixed(0) + '%' },
  };
  const xaxisBase = {
    type: 'datetime',
    labels: { style: { colors: '#8b90a8', fontFamily: 'Manrope' }, datetimeFormatter: { day: 'dd/MM' } },
    axisBorder: { color: '#262a40' },
    axisTicks: { color: '#262a40' },
  };

  // --- Botões extras ---
  // Toggle line ↔ rangeArea (margem de erro)
  const btnRA = document.createElement('button');
  btnRA.className = 'btn-toggle';
  btnRA.innerHTML = `<span class="icon"></span><span class="label">Mostrar margem de erro (Range Area)</span>`;
  ctrl.actionsEl.appendChild(btnRA);

  // Toggle linhas horizontais reais
  const btnReal = document.createElement('button');
  btnReal.className = 'btn-toggle';
  btnReal.innerHTML = `<span class="icon"></span><span class="label">Mostrar linhas dos valores reais</span>`;
  ctrl.actionsEl.appendChild(btnReal);

  let mode = 'line';          // 'line' | 'rangeArea'
  let showReal = false;
  let chart = null;
  const ctx = {
    yCompact: false,
    yRangeFull: yRanges.full,
    yRangeCompact: yRanges.compact,
    yaxisBase,
    xaxisBase,
    compactIniMs,
    allPoints,
    extraYValues: realValues,
  };
  const zoomedHandler = makeZoomedHandler(ctx);

  function build() {
    // Séries principais (por candidato)
    const mainSeries = series.map(s => ({
      name: s.name,
      type: mode === 'line' ? 'line' : 'rangeArea',
      data: mode === 'line'
        ? s.data
        : s.data.map(d => ({ x: d.x, y: d.yRange })),
    }));

    // Séries auxiliares — linhas horizontais reais (HR-<candidato>)
    const realSeries = !showReal ? [] : candidatos
      .filter(c => real.estimativas[c] != null)
      .map(c => {
        const y = real.estimativas[c];
        return {
          name: `HR-${c}`,
          type: mode === 'line' ? 'line' : 'rangeArea',
          data: [
            { x: JANELA_INI_MS, y: mode === 'line' ? y : [y, y] },
            { x: JANELA_FIM_MS, y: mode === 'line' ? y : [y, y] },
          ],
          color: colorByCandidato[c] || '#999',
        };
      });

    const allSeries = [...mainSeries, ...realSeries];
    const colors = [
      ...series.map(s => s.color),
      ...realSeries.map(s => s.color),
    ];

    const strokeWidth = [
      ...series.map(() => mode === 'line' ? 3 : 1),
      ...realSeries.map(() => 2),
    ];
    const dashArray = [
      ...series.map(() => 0),
      ...realSeries.map(() => 6),
    ];

    const yAnnotations = !showReal ? [] : candidatos
      .filter(c => real.estimativas[c] != null)
      .map(c => ({
        y: real.estimativas[c],
        borderColor: 'transparent',
        label: {
          borderColor: 'transparent',
          style: { color: '#fff', background: (colorByCandidato[c] || '#666') + 'cc', fontFamily: 'Manrope', fontWeight: 700, fontSize: '10px' },
          text: `${c}: ${real.estimativas[c].toFixed(2)}%`,
          position: 'left',
          offsetX: 8,
        },
      }));

    const cfg = {
      chart: {
        ...baseChart,
        type: mode === 'line' ? 'line' : 'rangeArea',
        height: 380,
        events: {
          legendClick: legendClickHandler(),
          zoomed: zoomedHandler,
        },
      },
      series: allSeries,
      colors,
      stroke: { curve: mode === 'line' ? 'smooth' : 'straight', width: strokeWidth, dashArray },
      fill: mode === 'line' ? { type: 'solid', opacity: 1 } : { type: 'solid', opacity: 0.35 },
      markers: { size: mode === 'line' ? 4 : 0, strokeWidth: 0, hover: { size: 8, sizeOffset: 4 } },
      dataLabels: { enabled: false },
      grid: baseGrid,
      legend: {
        ...baseLegend,
        onItemClick: { toggleDataSeries: false },
        formatter: (seriesName) => seriesName.startsWith('HR-') ? '' : seriesName,
        markers: { ...baseLegend.markers, fillColors: undefined },
      },
      tooltip: {
        ...baseTooltip,
        shared: false,
        y: {
          formatter: (val) => {
            if (Array.isArray(val)) return `${fmtNum(val[0])}% – ${fmtNum(val[1])}%`;
            return val == null ? '—' : val.toFixed(1) + '%';
          },
        },
      },
      xaxis: {
        ...xaxisBase,
        min: ctx.yCompact ? compactIniMs : JANELA_INI_MS,
        max: JANELA_FIM_MS,
      },
      yaxis: {
        ...yaxisBase,
        min: ctx.yCompact && yRanges.compact ? yRanges.compact.min : (yRanges.full ? yRanges.full.min : undefined),
        max: ctx.yCompact && yRanges.compact ? yRanges.compact.max : (yRanges.full ? yRanges.full.max : undefined),
      },
      annotations: {
        xaxis: [electionLineAnnotation(electionTurno)],
        yaxis: yAnnotations,
      },
    };

    if (chart) chart.destroy();
    chart = new ApexCharts(ctrl.chartEl, cfg);
    chart.render();
  }
  build();

  // Botão margem de erro (rangeArea)
  btnRA.addEventListener('click', () => {
    mode = mode === 'line' ? 'rangeArea' : 'line';
    btnRA.classList.toggle('active', mode === 'rangeArea');
    btnRA.querySelector('.label').textContent = mode === 'line'
      ? 'Mostrar margem de erro (Range Area)'
      : 'Mostrar linha simples (Line)';
    build();
  });

  // Botão valores reais
  btnReal.addEventListener('click', () => {
    showReal = !showReal;
    btnReal.classList.toggle('active', showReal);
    btnReal.querySelector('.label').textContent = showReal
      ? 'Esconder linhas dos valores reais'
      : 'Mostrar linhas dos valores reais';
    build();
  });

  // Fullscreen com ajuste real de altura
  ctrl.btnFs.addEventListener('click', () => {
    document.querySelectorAll('.card.fullscreen').forEach(c => {
      if (c !== ctrl.card && c.__fsChart) applyFullscreen(c, c.querySelector('.chart'), c.__fsChart, false);
      if (c !== ctrl.card) c.classList.remove('fullscreen');
    });
    const entering = !ctrl.card.classList.contains('fullscreen');
    ctrl.card.classList.toggle('fullscreen', entering);
    document.body.classList.toggle('has-fullscreen', entering);
    ctrl.card.__fsChart = chart;
    setTimeout(() => {
      applyFullscreen(ctrl.card, ctrl.chartEl, chart, entering);
      window.dispatchEvent(new Event('resize'));
    }, 60);
  });
  ctrl.btnY.addEventListener('click', () => {
    ctx.yCompact = !ctx.yCompact;
    ctrl.btnY.classList.toggle('active', ctx.yCompact);
    applyYRange(chart, ctx);
  });
  ctrl.btnReset.addEventListener('click', () => {
    resetCardChart(chart, ctx, ctrl.btnY, (n) => !n.startsWith('HR-'));
  });
}

// ============================================================
//                       Render T1 / T2
// ============================================================
function renderT1() {
  const grid = document.getElementById('grid-t1');
  grid.innerHTML = '';
  if (state.viewT1 === 'candidato') {
    createCandidateCard(grid, 'Lula',          buildCandidateSeries(polls1, 'Lula'),          real1.estimativas['Lula'],          't1');
    createCandidateCard(grid, 'Jair Bolsonaro',buildCandidateSeries(polls1, 'Jair Bolsonaro'),real1.estimativas['Jair Bolsonaro'],'t1');
    createCandidateCard(grid, 'Ciro Gomes',    buildCandidateSeries(polls1, 'Ciro Gomes'),    real1.estimativas['Ciro Gomes'],    't1');
    createCandidateCard(grid, 'Simone Tebet',  buildCandidateSeries(polls1, 'Simone Tebet'),  real1.estimativas['Simone Tebet'],  't1');
    createCandidateCard(grid, 'Outros — soma de todos os candidatos exceto Lula e Bolsonaro', buildOutrosSeries(polls1), realValueOutros(real1), 't1');
  } else {
    institutos.forEach(inst => {
      if (polls1.some(p => p.instituto === inst)) {
        createInstitutoCard(grid, inst, polls1, real1, CANDIDATOS_T1, 't1');
      }
    });
  }
}

function renderT2() {
  const grid = document.getElementById('grid-t2');
  grid.innerHTML = '';
  if (state.viewT2 === 'candidato') {
    createCandidateCard(grid, 'Lula',           buildCandidateSeries(polls2, 'Lula'),           real2.estimativas['Lula'],           't2');
    createCandidateCard(grid, 'Jair Bolsonaro', buildCandidateSeries(polls2, 'Jair Bolsonaro'), real2.estimativas['Jair Bolsonaro'], 't2');
  } else {
    institutos.forEach(inst => {
      if (polls2.some(p => p.instituto === inst)) {
        createInstitutoCard(grid, inst, polls2, real2, CANDIDATOS_T2, 't2');
      }
    });
  }
}

// ============================================================
//                    Toggles dos headers
// ============================================================
document.querySelectorAll('#metodologia-toggle .seg').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#metodologia-toggle .seg').forEach(b => b.classList.toggle('active', b === btn));
    state.metodologia = btn.dataset.metodologia;
    renderGeral();
  });
});

document.querySelectorAll('#view-t1-toggle .seg').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#view-t1-toggle .seg').forEach(b => b.classList.toggle('active', b === btn));
    state.viewT1 = btn.dataset.view;
    renderT1();
  });
});

document.querySelectorAll('#view-t2-toggle .seg').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#view-t2-toggle .seg').forEach(b => b.classList.toggle('active', b === btn));
    state.viewT2 = btn.dataset.view;
    renderT2();
  });
});

// ============================================================
//                       INIT
// ============================================================
renderGeral();
renderT1();
renderT2();
