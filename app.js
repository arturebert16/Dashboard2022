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
  statsInstituto: null,
  statsTurno: 't1',
  statsView: 'geral',
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
  // intersect:true -> o tooltip só aparece quando o cursor está em cima de um
  // marker da série (evita "puxar" dados da série vizinha quando há várias
  // linhas sobrepostas). Combinado com markers.hover.size grande, o alvo é
  // generoso o bastante para não ficar finicky.
  intersect: true,
  shared: false,
  followCursor: false,
  hideEmptySeries: true,
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
        <button class="icon-btn btn-reset" title="Reiniciar (legendas, zoom e linhas)">
          <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
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
function wireCardControls({ card, chartEl, btnFs, btnReset }, chart, ctx) {
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

  // Reset: legenda + zoom + linhas-h clicadas
  btnReset.addEventListener('click', () => {
    resetCardChart(chart, ctx);
  });
}

/**
 * Reseta o card: mostra todas as séries, apaga as linhas horizontais clicadas,
 * volta o zoom para a janela cheia e recomputa Y para todos os pontos.
 */
function resetCardChart(chart, ctx, seriesFilter) {
  // Legenda: mostra tudo (seriesFilter pode excluir HR-* para instituto card)
  chart.w.globals.seriesNames.forEach(n => {
    if (seriesFilter && !seriesFilter(n)) return;
    chart.showSeries(n);
  });
  if (ctx) {
    // Limpa linhas horizontais clicadas
    ctx.hLines = [];
    const r = computeYInWindow(ctx.allPoints, JANELA_INI_MS, JANELA_FIM_MS, ctx.extraYValues || []);
    chart.updateOptions({
      xaxis: { ...(ctx.xaxisBase || {}), min: JANELA_INI_MS, max: JANELA_FIM_MS },
      yaxis: r ? { ...ctx.yaxisBase, min: r.min, max: r.max } : { ...ctx.yaxisBase },
      annotations: {
        xaxis: ctx.xAnnotations || [],
        yaxis: (ctx.baseYAnnotations || []).slice(),
      },
    }, false, false);
  }
}

/**
 * Cria uma anotação yaxis (linha horizontal tracejada) para um valor y clicado.
 * Usa o formatter do eixo y, se disponível, para o label.
 */
function buildHLineAnnotation(y, formatter) {
  const txt = typeof formatter === 'function'
    ? formatter(y)
    : (typeof y === 'number' ? y.toFixed(2) : String(y));
  return {
    y,
    borderColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5,
    strokeDashArray: 4,
    label: {
      borderColor: 'transparent',
      style: { color: '#fff', background: 'rgba(24,26,40,0.85)', fontFamily: 'Manrope', fontWeight: 700, fontSize: '10px' },
      text: txt,
      position: 'left',
      offsetX: 60,
    },
  };
}

/**
 * Refaz as anotações do gráfico combinando baseYAnnotations + hLines.
 */
function applyAnnotations(chart, ctx) {
  const yAnns = (ctx.baseYAnnotations || []).slice();
  (ctx.hLines || []).forEach(y => {
    yAnns.push(buildHLineAnnotation(y, ctx.hLineFormatter));
  });
  chart.updateOptions({
    annotations: {
      xaxis: ctx.xAnnotations || [],
      yaxis: yAnns,
    },
  }, false, false);
}

/**
 * Handler do markerClick: toggle de linha horizontal no valor y clicado.
 */
function makeMarkerClickHandler(ctx) {
  return function(event, chartContext, opts) {
    const { seriesIndex, dataPointIndex } = opts;
    if (seriesIndex == null || dataPointIndex == null || seriesIndex < 0 || dataPointIndex < 0) return;
    const s = chartContext.w.config.series[seriesIndex];
    if (!s || !s.data || !s.data[dataPointIndex]) return;
    const p = s.data[dataPointIndex];
    let y = null;
    if (Array.isArray(p.y)) {
      y = (p.y[0] + p.y[1]) / 2;
    } else if (typeof p.y === 'number') {
      y = p.y;
    } else if (typeof p === 'number') {
      y = p;
    }
    if (y == null) return;
    ctx.hLines = ctx.hLines || [];
    // Toggle: se já existe uma linha quase no mesmo y (~0.05), remove; senão adiciona
    const idx = ctx.hLines.findIndex(v => Math.abs(v - y) < 0.05);
    if (idx >= 0) ctx.hLines.splice(idx, 1);
    else ctx.hLines.push(y);
    applyAnnotations(chartContext, ctx);
  };
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
 * Também é invocado no reset do toolbar (xaxis.min/max = undefined → janela cheia).
 */
function makeZoomedHandler(ctx) {
  return function(chartContext, { xaxis }) {
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
    yaxisBase,
    xaxisBase,
    compactIniMs,
    allPoints,
    extraYValues: [],
    xAnnotations,
    baseYAnnotations: [],
    hLines: [],
    hLineFormatter: M.fmt,
  };

  const cfg = {
    chart: {
      ...baseChart,
      type: 'line',
      height: 360,
      events: {
        legendClick: legendClickHandler(),
        zoomed: makeZoomedHandler(ctx),
        markerClick: makeMarkerClickHandler(ctx),
      },
    },
    series,
    colors: series.map(s => s.color),
    stroke: { curve: 'smooth', width: 3 },
    markers: { size: 5, strokeWidth: 0, hover: { size: 10 } },
    grid: baseGrid,
    legend: { ...baseLegend, onItemClick: { toggleDataSeries: false } },
    dataLabels: { enabled: false },
    tooltip: { ...baseTooltip, y: { formatter: (v) => v == null ? '—' : M.fmt(v) } },
    xaxis: { ...xaxisBase, min: JANELA_INI_MS, max: JANELA_FIM_MS },
    yaxis: { ...yaxisBase, min: yRanges.full ? yRanges.full.min : undefined, max: yRanges.full ? yRanges.full.max : undefined },
    annotations: { xaxis: xAnnotations, yaxis: [] },
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

  // Chart 4 — Desempenho por variável de ponderação (ocupa o 4º slot do grid 2x2)
  makePerformanceByMetodologiaCard(parent);
}

// ============================================================
//       METODOLOGIA DE PONDERAÇÃO (Geral) — bar charts
// ============================================================
const METODOLOGIA_FIELDS = [
  { key: 'faixa_etaria',     label: 'Faixa etária',        color: '#C73DB9' }, // c1
  { key: 'escolaridade',     label: 'Escolaridade',        color: '#00BAC6' }, // c6
  { key: 'renda_domiciliar', label: 'Renda domiciliar',    color: '#F1B01B' }, // c4
  { key: 'fonte_ponderacao', label: 'Fonte de ponderação', color: '#53C373' }, // c5
];

/** Retorna [[valor, contagem], ...] desc, ignorando "Não informado" e nulls. */
function countMetodologia(field) {
  const allPolls = [...polls1, ...polls2];
  const counts = {};
  allPolls.forEach(p => {
    const v = p[field];
    if (!v || v === 'Não informado') return;
    counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

/** Trunca string longa preservando o início informativo. */
function truncLabel(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Cria um card com chart de barras horizontais para um field metodológico. */
function makeMetodologiaBarCard(parent, fieldCfg) {
  const counts = countMetodologia(fieldCfg.key);
  const card = document.createElement('div');
  card.className = 'card metodologia-card';
  card.innerHTML = `
    <div class="card-header">
      <h3>${fieldCfg.label}</h3>
      <span class="chip chip-real" style="background: ${fieldCfg.color}22; color: ${fieldCfg.color}; border-color: ${fieldCfg.color}55;">
        ${counts.reduce((s, c) => s + c[1], 0)} pesquisas
      </span>
    </div>
    <div class="chart"></div>
  `;
  parent.appendChild(card);

  if (counts.length === 0) {
    card.querySelector('.chart').innerHTML = `<div class="stats-empty">Sem pesquisas com esse campo preenchido.</div>`;
    return;
  }

  // Aumenta a altura com base na quantidade de categorias (mín 200, máx 440)
  const height = Math.max(200, Math.min(440, 70 + counts.length * 42));

  const categories = counts.map(c => truncLabel(c[0], 54));
  const values = counts.map(c => c[1]);
  const fullLabels = counts.map(c => c[0]);

  const options = {
    chart: {
      type: 'bar',
      height,
      background: 'transparent',
      fontFamily: 'Manrope, sans-serif',
      toolbar: { show: false },
      animations: { enabled: false },
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 6,
        borderRadiusApplication: 'end',
        barHeight: '68%',
        distributed: false,
        dataLabels: { position: 'center' },
      },
    },
    colors: [fieldCfg.color],
    series: [{ name: 'Pesquisas', data: values }],
    dataLabels: {
      enabled: true,
      textAnchor: 'middle',
      style: {
        colors: ['#ffffff'],
        fontFamily: 'Manrope, sans-serif',
        fontSize: '11px',
        fontWeight: 700,
      },
      dropShadow: { enabled: false },
      formatter: (v) => v,
    },
    xaxis: {
      categories,
      labels: {
        style: { colors: '#8b90a8', fontSize: '10px', fontFamily: 'Manrope, sans-serif' },
        formatter: (v) => Number.isInteger(+v) ? v : Math.round(+v),
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#c0c4d6', fontSize: '11px', fontFamily: 'Manrope, sans-serif' },
        maxWidth: 320,
      },
    },
    grid: {
      borderColor: 'rgba(255,255,255,0.05)',
      strokeDashArray: 4,
      padding: { top: 0, right: 16, bottom: 0, left: 8 },
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    tooltip: {
      theme: 'dark',
      y: {
        title: {
          formatter: (_, opts) => fullLabels[opts.dataPointIndex],
        },
        formatter: (v) => `${v} pesquisa${v === 1 ? '' : 's'}`,
      },
    },
    legend: { show: false },
  };

  const chart = new ApexCharts(card.querySelector('.chart'), options);
  chart.render();
}

/** Renderiza os 4 bar charts de metodologia na aba Geral. */
function renderMetodologiaGeral() {
  const parent = document.getElementById('grid-metodologia');
  if (!parent) return;
  parent.innerHTML = '';
  METODOLOGIA_FIELDS.forEach(f => makeMetodologiaBarCard(parent, f));
}

// ============================================================
//   DESEMPENHO POR VARIÁVEL DE PONDERAÇÃO (Geral) — vertical bar
// ============================================================

/**
 * Agrupa pesquisas T1+T2 pelo valor do campo metodológico informado
 * e retorna [{ value, avg, n }] ordenado do MELHOR para o PIOR,
 * conforme a metodologia atual (higherBetter true/false).
 * Ignora pesquisas com valor "Não informado" ou vazio.
 */
function computePerformanceByField(field, metodologiaKey) {
  const M = METODOLOGIAS[metodologiaKey];
  const groups = {};
  const push = (value, score) => {
    (groups[value] = groups[value] || []).push(score);
  };
  polls1.forEach(p => {
    const v = p[field];
    if (!v || v === 'Não informado') return;
    const s = M.compute(p, real1, CANDIDATOS_T1);
    if (s == null) return;
    push(v, s);
  });
  polls2.forEach(p => {
    const v = p[field];
    if (!v || v === 'Não informado') return;
    const s = M.compute(p, real2, CANDIDATOS_T2);
    if (s == null) return;
    push(v, s);
  });
  const entries = Object.entries(groups).map(([value, scores]) => ({
    value,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    n: scores.length,
  }));
  entries.sort((a, b) => M.higherBetter ? b.avg - a.avg : a.avg - b.avg);
  return entries;
}

/**
 * Cria o card "Desempenho por variável de ponderação" com seletor das 4
 * variáveis e gráfico de barras verticais ranqueando os valores.
 * É recriado a cada renderGeral() para respeitar a metodologia atual.
 */
function makePerformanceByMetodologiaCard(parent) {
  const card = document.createElement('div');
  card.className = 'card turno-card performance-meto-card';
  card.innerHTML = `
    <div class="card-header">
      <h3>Desempenho por variável de ponderação</h3>
      <span class="chip chip-real perf-meto-chip">Ranking</span>
    </div>
    <div class="seg-toggle performance-meto-toggle" role="tablist">
      <button class="seg active" data-field="faixa_etaria">Faixa etária</button>
      <button class="seg" data-field="escolaridade">Escolaridade</button>
      <button class="seg" data-field="renda_domiciliar">Renda</button>
      <button class="seg" data-field="fonte_ponderacao">Fonte</button>
    </div>
    <div class="chart perf-meto-chart"></div>
  `;
  parent.appendChild(card);

  let currentField = 'faixa_etaria';
  let chart = null;

  const chartEl = card.querySelector('.chart');

  function render() {
    const M = METODOLOGIAS[state.metodologia];
    const entries = computePerformanceByField(currentField, state.metodologia);
    const fieldCfg = METODOLOGIA_FIELDS.find(f => f.key === currentField);
    const color = fieldCfg ? fieldCfg.color : '#C73DB9';

    // Atualiza o chip com a contagem de pesquisas válidas
    const totalPolls = entries.reduce((s, e) => s + e.n, 0);
    const chip = card.querySelector('.perf-meto-chip');
    chip.textContent = `${totalPolls} pesquisas · ${M.higherBetter ? 'maior = melhor' : 'menor = melhor'}`;
    chip.style.background = color + '22';
    chip.style.color = color;
    chip.style.borderColor = color + '55';

    if (chart) { chart.destroy(); chart = null; }
    chartEl.innerHTML = '';

    if (entries.length === 0) {
      chartEl.innerHTML = `<div class="stats-empty">Sem pesquisas para essa variável.</div>`;
      return;
    }

    // Labels: truncamos para caber rotacionados no eixo X.
    // Quanto mais barras, mais curto o rótulo; rotação também fica mais vertical.
    const n = entries.length;
    const labelMax = n <= 3 ? 30 : n <= 5 ? 22 : 18;
    const rotateDeg = n <= 3 ? -15 : n <= 5 ? -28 : -40;
    const categories = entries.map(e => truncLabel(e.value, labelMax));
    const fullLabels = entries.map(e => e.value);
    const values = entries.map(e => +e.avg.toFixed(2));
    const counts = entries.map(e => e.n);

    const height = 380;

    const options = {
      chart: {
        type: 'bar',
        height,
        background: 'transparent',
        fontFamily: 'Manrope, sans-serif',
        toolbar: { show: false },
        animations: { enabled: false },
      },
      plotOptions: {
        bar: {
          horizontal: false,
          borderRadius: 6,
          borderRadiusApplication: 'end',
          columnWidth: '62%',
          distributed: false,
          dataLabels: { position: 'top' },
        },
      },
      colors: [color],
      series: [{ name: M.yLabel, data: values }],
      dataLabels: {
        enabled: true,
        formatter: (v) => M.fmt(v),
        offsetY: -20,
        style: {
          colors: ['#c0c4d6'],
          fontFamily: 'Manrope, sans-serif',
          fontSize: '11px',
          fontWeight: 700,
        },
        dropShadow: { enabled: false },
      },
      xaxis: {
        categories,
        labels: {
          style: { colors: '#c0c4d6', fontSize: '10px', fontFamily: 'Manrope, sans-serif' },
          rotate: rotateDeg,
          rotateAlways: true,
          hideOverlappingLabels: false,
          trim: false,
          maxHeight: 110,
        },
        axisBorder: { color: '#262a40' },
        axisTicks: { color: '#262a40' },
      },
      yaxis: {
        labels: {
          style: { colors: '#8b90a8', fontSize: '10px', fontFamily: 'Manrope, sans-serif' },
          formatter: (v) => M.fmtAxis(+v),
        },
        title: { text: M.yLabel, style: { color: '#5d6280', fontFamily: 'Manrope', fontWeight: 600 } },
      },
      grid: {
        ...baseGrid,
        padding: { top: 30, right: 16, bottom: 80, left: 8 },
      },
      tooltip: {
        theme: 'dark',
        custom: ({ dataPointIndex }) => {
          const v = values[dataPointIndex];
          const n = counts[dataPointIndex];
          const lbl = fullLabels[dataPointIndex];
          const rank = dataPointIndex + 1;
          return `<div class="apex-tip perf-tip">
            <div class="perf-tip-rank">#${rank}</div>
            <div class="perf-tip-label">${lbl}</div>
            <div class="perf-tip-row"><span>${M.label}:</span><b>${M.fmt(v)}</b></div>
            <div class="perf-tip-row muted"><span>Pesquisas:</span><b>${n}</b></div>
          </div>`;
        },
      },
      legend: { show: false },
    };

    chart = new ApexCharts(chartEl, options);
    chart.render();
  }

  // Wire toggle
  card.querySelectorAll('.performance-meto-toggle .seg').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      card.querySelectorAll('.performance-meto-toggle .seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentField = btn.dataset.field;
      render();
    });
  });

  render();
}

/** Quebra um rótulo longo em até N linhas de ~maxPerLine chars cada. */
function wrapLabelLines(s, maxPerLine, maxLines) {
  if (!s) return [''];
  if (s.length <= maxPerLine) return [s];
  const words = s.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxPerLine) cur += ' ' + w;
    else { lines.push(cur); cur = w; if (lines.length === maxLines - 1) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Se sobrou texto, adiciona reticências na última linha
  const usedLen = lines.join(' ').length;
  if (usedLen < s.length - 1) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length + 1 > maxPerLine
      ? last.slice(0, maxPerLine - 1) + '…'
      : last + '…';
  }
  return lines;
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
function candidateChartConfig(seriesByInst, realValue, mode, electionTurno, zoomedHandler, markerClickHandler, hLines = []) {
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

  const baseRealAnnotation = {
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
          ...(markerClickHandler ? { markerClick: markerClickHandler } : {}),
        },
      },
      series,
      colors,
      stroke: { curve: mode === 'line' ? 'smooth' : 'straight', width: strokeWidth, dashArray },
      dataLabels: { enabled: false },
      fill: mode === 'line' ? { type: 'solid', opacity: 1 } : { type: 'solid', opacity: fillOpacity },
      markers: { size: mode === 'line' ? 5 : 0, strokeWidth: 0, hover: { size: 10 } },
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
        yaxis: [
          baseRealAnnotation,
          ...hLines.map(y => buildHLineAnnotation(y, (v) => v.toFixed(1) + '%')),
        ],
      },
    },
    yRanges,
    yaxisBase,
    xaxisBase,
    compactIniMs,
    allPoints,
    baseYAnnotations: [baseRealAnnotation],
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
  btnRA.innerHTML = `<span class="icon"></span><span class="label">Mostrar margem de erro</span>`;
  ctrl.actionsEl.appendChild(btnRA);

  let mode = 'line';
  let chart = null;
  // ctx persistente — mutado a cada build() para que os handlers (zoomed/
  // markerClick) capturem uma referência estável (leem em runtime).
  const ctx = {
    yaxisBase: null,
    xaxisBase: null,
    compactIniMs: compactIniFor([electionTurno]),
    allPoints: [],
    extraYValues: [realValue],
    xAnnotations: [electionLineAnnotation(electionTurno)],
    baseYAnnotations: [],
    hLines: [],
    hLineFormatter: (v) => v.toFixed(1) + '%',
  };
  const zoomedHandler = makeZoomedHandler(ctx);
  const markerClickHandler = makeMarkerClickHandler(ctx);

  function build() {
    const built = candidateChartConfig(seriesByInst, realValue, mode, electionTurno, zoomedHandler, markerClickHandler, ctx.hLines);
    if (chart) chart.destroy();
    chart = new ApexCharts(ctrl.chartEl, built.cfg);
    chart.render();
    ctx.yaxisBase = built.yaxisBase;
    ctx.xaxisBase = built.xaxisBase;
    ctx.compactIniMs = built.compactIniMs;
    ctx.allPoints = built.allPoints;
    ctx.baseYAnnotations = built.baseYAnnotations;
  }
  build();

  // Botão range area
  btnRA.addEventListener('click', () => {
    mode = mode === 'line' ? 'rangeArea' : 'line';
    btnRA.classList.toggle('active', mode === 'rangeArea');
    btnRA.querySelector('.label').textContent = mode === 'line'
      ? 'Mostrar margem de erro'
      : 'Mostrar linha simples';
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
  ctrl.btnReset.addEventListener('click', () => {
    resetCardChart(chart, ctx);
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
  btnRA.innerHTML = `<span class="icon"></span><span class="label">Mostrar margem de erro</span>`;
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
    yaxisBase,
    xaxisBase,
    compactIniMs,
    allPoints,
    extraYValues: realValues,
    xAnnotations: [electionLineAnnotation(electionTurno)],
    baseYAnnotations: [],
    hLines: [],
    hLineFormatter: (v) => v.toFixed(1) + '%',
  };
  const zoomedHandler = makeZoomedHandler(ctx);
  const markerClickHandler = makeMarkerClickHandler(ctx);

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

    // baseYAnnotations = (linhas reais se visíveis). As linhas clicadas (hLines)
    // são adicionadas por cima, e sobrevivem a rebuilds.
    ctx.baseYAnnotations = yAnnotations;
    const clickedAnn = (ctx.hLines || []).map(y => buildHLineAnnotation(y, ctx.hLineFormatter));

    const cfg = {
      chart: {
        ...baseChart,
        type: mode === 'line' ? 'line' : 'rangeArea',
        height: 380,
        events: {
          legendClick: legendClickHandler(),
          zoomed: zoomedHandler,
          markerClick: markerClickHandler,
        },
      },
      series: allSeries,
      colors,
      stroke: { curve: mode === 'line' ? 'smooth' : 'straight', width: strokeWidth, dashArray },
      fill: mode === 'line' ? { type: 'solid', opacity: 1 } : { type: 'solid', opacity: 0.35 },
      markers: { size: mode === 'line' ? 5 : 0, strokeWidth: 0, hover: { size: 10 } },
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
        min: JANELA_INI_MS,
        max: JANELA_FIM_MS,
      },
      yaxis: {
        ...yaxisBase,
        min: yRanges.full ? yRanges.full.min : undefined,
        max: yRanges.full ? yRanges.full.max : undefined,
      },
      annotations: {
        xaxis: ctx.xAnnotations,
        yaxis: [...yAnnotations, ...clickedAnn],
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
      ? 'Mostrar margem de erro'
      : 'Mostrar linha simples';
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
  ctrl.btnReset.addEventListener('click', () => {
    resetCardChart(chart, ctx, (n) => !n.startsWith('HR-'));
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
//          ESTATÍSTICAS DOS INSTITUTOS (nova aba)
// ============================================================

/**
 * Calcula estatísticas consolidadas para um instituto, filtradas por turno.
 * - metodo: moda (mais frequente) entre todas as pesquisas do instituto naquele turno
 * - amostraMean: média do campo `amostra`
 * - margemModa: margem de erro mais frequente (tipicamente fixa por instituto)
 * - volatility: array ordenado por std — desvio-padrão das estimativas por candidato
 * - accuracy: array com métricas vs. resultado real do TSE (MAE, viés, calibração)
 * - overall: métricas agregadas (MAE global, calibração global)
 * - lastPoll: última pesquisa antes do dia da eleição (teste definitivo)
 */
function computeInstitutoStats(instName, turno) {
  const sourcePolls = turno === 't2' ? polls2 : polls1;
  const real = turno === 't2' ? real2 : real1;
  const eleicaoMs = turno === 't2' ? ELEICAO_T2_MS : ELEICAO_T1_MS;
  const allPolls = sourcePolls.filter(p => p.instituto === instName);
  if (allPolls.length === 0) return null;

  // Método principal (moda)
  const metodoCount = {};
  allPolls.forEach(p => {
    if (!p.metodo) return;
    metodoCount[p.metodo] = (metodoCount[p.metodo] || 0) + 1;
  });
  const metodoEntries = Object.entries(metodoCount).sort((a, b) => b[1] - a[1]);
  const metodo = metodoEntries.length ? metodoEntries[0][0] : '—';
  const metodoUnico = metodoEntries.length === 1;

  // Amostra média
  const amostras = allPolls.map(p => p.amostra).filter(v => v != null);
  const amostraMean = amostras.length
    ? amostras.reduce((s, v) => s + v, 0) / amostras.length
    : null;

  // Margem de erro: usa moda; se houver mais de uma, calcula média
  const margens = allPolls.map(p => p.margem_erro).filter(v => v != null);
  const margemCount = {};
  margens.forEach(m => { margemCount[m] = (margemCount[m] || 0) + 1; });
  const margemEntries = Object.entries(margemCount).sort((a, b) => b[1] - a[1]);
  const margemModa = margemEntries.length ? Number(margemEntries[0][0]) : null;
  const margemMean = margens.length ? margens.reduce((s, v) => s + v, 0) / margens.length : null;
  const margemUnica = margemEntries.length === 1;

  // Conjunto de candidatos com dado real disponível (base para todas as métricas)
  const allCandidatos = new Set();
  allPolls.forEach(p => Object.keys(p.estimativas || {}).forEach(c => allCandidatos.add(c)));

  // ------- Volatilidade (variância intra-instituto) -------
  const volatility = [];
  allCandidatos.forEach(c => {
    const vals = [];
    allPolls.forEach(p => {
      const v = p.estimativas && p.estimativas[c];
      if (v != null) vals.push(v);
    });
    if (vals.length < 2) return;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    volatility.push({ candidato: c, std, mean, min, max, range: max - min, n: vals.length });
  });
  volatility.sort((a, b) => a.std - b.std);

  // ------- Acurácia vs. resultado real (TSE) -------
  // Para cada candidato com valor real conhecido:
  //   MAE   = média de |est − real|         (acurácia pura)
  //   Viés  = média de  (est − real)        (tendência de super/subestimar)
  //   RMSE  = raiz( média (est − real)²)     (penaliza erros grandes)
  //   Hit%  = fração de pesquisas onde |est − real| ≤ margem_erro declarada
  //           (calibração da margem: deveria ficar em torno de 95% se a margem é honesta)
  const accuracy = [];
  allCandidatos.forEach(c => {
    const realVal = real && real.estimativas ? real.estimativas[c] : null;
    if (realVal == null) return;
    const diffs = [];
    const absDiffs = [];
    const sqDiffs = [];
    let hits = 0;
    let hitsTotal = 0;
    allPolls.forEach(p => {
      const est = p.estimativas && p.estimativas[c];
      if (est == null) return;
      const d = est - realVal;
      diffs.push(d);
      absDiffs.push(Math.abs(d));
      sqDiffs.push(d * d);
      if (p.margem_erro != null) {
        hitsTotal++;
        if (Math.abs(d) <= p.margem_erro) hits++;
      }
    });
    if (diffs.length === 0) return;
    const mae = absDiffs.reduce((s, v) => s + v, 0) / absDiffs.length;
    const bias = diffs.reduce((s, v) => s + v, 0) / diffs.length;
    const rmse = Math.sqrt(sqDiffs.reduce((s, v) => s + v, 0) / sqDiffs.length);
    const hitRate = hitsTotal > 0 ? hits / hitsTotal : null;
    accuracy.push({ candidato: c, real: realVal, mae, bias, rmse, hitRate, hits, hitsTotal, n: diffs.length });
  });
  accuracy.sort((a, b) => a.mae - b.mae);

  // ------- Métricas agregadas (instituto como um todo) -------
  const overallMae = accuracy.length
    ? accuracy.reduce((s, a) => s + a.mae, 0) / accuracy.length
    : null;
  const overallBias = accuracy.length
    ? accuracy.reduce((s, a) => s + a.bias, 0) / accuracy.length
    : null;
  const totalHits = accuracy.reduce((s, a) => s + a.hits, 0);
  const totalHitsN = accuracy.reduce((s, a) => s + a.hitsTotal, 0);
  const overallHitRate = totalHitsN > 0 ? totalHits / totalHitsN : null;

  // ------- Última pesquisa antes da eleição (teste definitivo) -------
  const preEleicao = allPolls.filter(p => dateMs(p.data) <= eleicaoMs);
  let lastPoll = null;
  if (preEleicao.length > 0) {
    const latest = preEleicao.reduce((a, b) => dateMs(a.data) >= dateMs(b.data) ? a : b);
    const diasAntes = Math.round((eleicaoMs - dateMs(latest.data)) / (1000 * 60 * 60 * 24));
    const errosCandidato = [];
    allCandidatos.forEach(c => {
      const est = latest.estimativas && latest.estimativas[c];
      const realVal = real && real.estimativas ? real.estimativas[c] : null;
      if (est == null || realVal == null) return;
      errosCandidato.push({
        candidato: c,
        est, real: realVal,
        diff: est - realVal,
        absDiff: Math.abs(est - realVal),
      });
    });
    errosCandidato.sort((a, b) => b.absDiff - a.absDiff);
    const lastMae = errosCandidato.length
      ? errosCandidato.reduce((s, e) => s + e.absDiff, 0) / errosCandidato.length
      : null;
    lastPoll = {
      data: latest.data,
      diasAntes,
      metodo: latest.metodo,
      amostra: latest.amostra,
      margem: latest.margem_erro,
      erros: errosCandidato,
      mae: lastMae,
    };
  }

  // ------- Metodologia de ponderação (moda por campo) -------
  // Para cada um dos 4 campos novos, pega o valor mais frequente entre as
  // pesquisas do instituto. "Não informado" é preservado (significa que o
  // instituto não divulgou essa informação).
  const ponderacao = {};
  ['faixa_etaria', 'escolaridade', 'renda_domiciliar', 'fonte_ponderacao'].forEach(field => {
    const c = {};
    allPolls.forEach(p => {
      const v = p[field];
      if (!v) return;
      c[v] = (c[v] || 0) + 1;
    });
    const entries = Object.entries(c).sort((a, b) => b[1] - a[1]);
    ponderacao[field] = entries.length ? { value: entries[0][0], count: entries[0][1], unique: entries.length === 1 } : null;
  });

  return {
    turno,
    numPolls: allPolls.length,
    metodo, metodoUnico,
    amostraMean,
    margemModa, margemMean, margemUnica,
    volatility,
    accuracy,
    overallMae, overallBias, overallHitRate, totalHits, totalHitsN,
    lastPoll,
    ponderacao,
  };
}

// Classifica volatilidade em low/mid/high relativo ao máximo observado no instituto
function volBucket(std, maxStd) {
  if (maxStd <= 0) return 'low';
  const r = std / maxStd;
  if (r < 0.4) return 'low';
  if (r < 0.75) return 'mid';
  return 'high';
}

function volBadge(bucket) {
  if (bucket === 'low')  return `<span class="badge badge-low">Consistente</span>`;
  if (bucket === 'high') return `<span class="badge badge-high">Volátil</span>`;
  return `<span class="badge badge-mid">Moderado</span>`;
}

/**
 * Classifica a calibração da margem declarada do instituto.
 *  Se a margem é de ±2pp @ 95% de confiança, pesquisas honestas deveriam
 *  acertar dentro dessa faixa em ~95% dos casos. Valores muito menores
 *  indicam que a margem subestima o erro real.
 */
function calibBucket(hitRate) {
  if (hitRate == null) return 'mid';
  if (hitRate >= 0.85) return 'low';     // bem calibrado / dentro do esperado
  if (hitRate >= 0.60) return 'mid';     // razoável
  return 'high';                          // margem subestimada / ruim
}

function calibBadge(hitRate) {
  const b = calibBucket(hitRate);
  if (b === 'low')  return `<span class="badge badge-low">Bem calibrado</span>`;
  if (b === 'high') return `<span class="badge badge-high">Mal calibrado</span>`;
  return `<span class="badge badge-mid">Razoável</span>`;
}

/** Formata um valor sinalizado com seta ▲▼ e 2 casas. */
function fmtSigned(v, unit) {
  if (v == null || isNaN(v)) return '—';
  const arrow = v > 0.05 ? '▲' : v < -0.05 ? '▼' : '•';
  const sign  = v > 0 ? '+' : '';
  return `${arrow} ${sign}${v.toFixed(2)}${unit || ''}`;
}

/** Classe de cor para viés (positivo = superestima / negativo = subestima). */
function biasClass(v) {
  if (v == null || isNaN(v)) return '';
  if (Math.abs(v) < 0.5) return 'bias-neutral';
  return v > 0 ? 'bias-over' : 'bias-under';
}

/** Descrição textual do viés médio. */
function biasText(v) {
  if (v == null || isNaN(v)) return '—';
  if (Math.abs(v) < 0.25) return 'praticamente neutro';
  return v > 0 ? 'tende a superestimar' : 'tende a subestimar';
}

// Ícones SVG compactos para as 4 variáveis metodológicas
const ICO_IDADE = `<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>`;
const ICO_ESCOLA = `<svg viewBox="0 0 24 24"><path d="M2 10l10-5 10 5-10 5-10-5z"/><path d="M6 12v5c0 1 3 2 6 2s6-1 6-2v-5"/></svg>`;
const ICO_RENDA = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9.5a3 3 0 0 0-6 0c0 1.5 1.5 2 3 2.5s3 1 3 2.5a3 3 0 0 1-6 0"/><path d="M12 6v2M12 16v2"/></svg>`;
const ICO_FONTE = `<svg viewBox="0 0 24 24"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 12h6M9 16h6"/></svg>`;

const METODOLOGIA_ICONS = {
  faixa_etaria:     { icon: ICO_IDADE,  label: 'Faixa etária',        color: 'var(--c1)' },
  escolaridade:     { icon: ICO_ESCOLA, label: 'Escolaridade',        color: 'var(--c6)' },
  renda_domiciliar: { icon: ICO_RENDA,  label: 'Renda domiciliar',    color: 'var(--c4)' },
  fonte_ponderacao: { icon: ICO_FONTE,  label: 'Fonte de ponderação', color: 'var(--c5)' },
};

/**
 * Monta o HTML de um card "Metodologia de ponderação" para a aba Estatísticas.
 *   source: objeto com as 4 chaves (faixa_etaria, escolaridade, renda_domiciliar, fonte_ponderacao).
 *     - Modo Geral: s.ponderacao[k] = { value, count, unique }
 *     - Modo Última: pega direto do poll (poll.faixa_etaria etc)
 *   mode: 'moda' | 'poll' — controla o subtítulo explicativo.
 */
function buildPonderacaoCard(source, mode, numPolls) {
  const isModa = mode === 'moda';
  const rowsHtml = Object.entries(METODOLOGIA_ICONS).map(([key, cfg]) => {
    let value, sub;
    if (isModa) {
      const entry = source && source[key];
      if (!entry) {
        value = '—';
        sub = 'sem dado';
      } else {
        value = entry.value;
        if (entry.unique) {
          sub = `todas as ${numPolls} pesquisa${numPolls === 1 ? '' : 's'}`;
        } else {
          sub = `valor mais frequente (${entry.count}/${numPolls})`;
        }
      }
    } else {
      value = source && source[key] ? source[key] : '—';
      sub = null;
    }
    const naoInformado = value === 'Não informado';
    return `
      <div class="pond-row ${naoInformado ? 'pond-ni' : ''}">
        <div class="pond-head">
          <span class="pond-icon" style="color: ${cfg.color}; background: ${cfg.color}22;">${cfg.icon}</span>
          <span class="pond-label">${cfg.label}</span>
        </div>
        <div class="pond-value">${value}</div>
        ${sub ? `<div class="pond-sub">${sub}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="pond-card">
      <div class="pond-card-title">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
        Metodologia de ponderação
      </div>
      <div class="pond-rows">${rowsHtml}</div>
    </div>
  `;
}

// Ícones SVG para os stat cards
const ICO_METODO  = `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 4v6"/></svg>`;
const ICO_AMOSTRA = `<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="4"/><path d="M17 13a4 4 0 1 1-4 4"/><path d="M22 22l-2-2"/></svg>`;
const ICO_MARGEM  = `<svg viewBox="0 0 24 24"><path d="M4 12h16"/><path d="M7 8l-3 4 3 4"/><path d="M17 8l3 4-3 4"/></svg>`;

/** Formata amostra (milhares com separador) */
function fmtAmostra(v) {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('pt-BR');
}

/**
 * Renderiza os pills de seleção de instituto. Pills sem pesquisas no turno
 * atual ficam esmaecidos (visíveis, mas desabilitados).
 */
function renderInstPills(activeInst, onSelect, turno) {
  const wrap = document.getElementById('inst-pills');
  wrap.innerHTML = '';
  const sourcePolls = turno === 't2' ? polls2 : polls1;
  const hasDataBy = {};
  institutos.forEach(i => { hasDataBy[i] = sourcePolls.some(p => p.instituto === i); });
  institutos.forEach(inst => {
    const enabled = hasDataBy[inst];
    const btn = document.createElement('button');
    btn.className = 'inst-pill'
      + (inst === activeInst ? ' active' : '')
      + (enabled ? '' : ' disabled');
    btn.style.color = colorByInst[inst];
    btn.disabled = !enabled;
    btn.title = enabled ? inst : `${inst} — sem pesquisas neste turno`;
    btn.innerHTML = `<span class="dot"></span><span>${inst}</span>`;
    btn.addEventListener('click', () => {
      if (!enabled) return;
      if (inst === state.statsInstituto) return;
      onSelect(inst);
    });
    wrap.appendChild(btn);
  });
}

/**
 * Dispatcher: renderiza o corpo da aba Estatísticas conforme o modo.
 *   view = 'geral'  -> perfil médio + volatilidade + acurácia agregada
 *   view = 'ultima' -> foco na pesquisa final antes do pleito daquele turno
 */
function renderStatsBody(instName, turno, view) {
  const body = document.getElementById('stats-body');
  body.innerHTML = '';
  const s = computeInstitutoStats(instName, turno);
  const turnoLabel = turno === 't2' ? '2° turno' : '1° turno';
  if (!s) {
    body.innerHTML = `<div class="stats-empty">Sem pesquisas de "${instName}" no ${turnoLabel}.</div>`;
    return;
  }
  if (view === 'ultima') {
    renderStatsUltima(body, instName, turno, s, turnoLabel);
  } else {
    renderStatsGeral(body, instName, turno, s, turnoLabel);
  }
}

/**
 * View "Geral" — perfil médio, volatilidade intra-instituto, acurácia
 * agregada vs. TSE e summary da última pesquisa.
 */
function renderStatsGeral(body, instName, turno, s, turnoLabel) {

  // ---------- Perfil (cards de resumo) ----------
  const summary = document.createElement('div');
  summary.className = 'stats-summary';

  const metodoSub = s.metodoUnico
    ? `todas as ${s.numPolls} pesquisas do ${turnoLabel}`
    : `método mais frequente entre ${s.numPolls} pesquisas do ${turnoLabel}`;

  const margemSub = s.margemUnica
    ? `fixa em todas as ${s.numPolls} pesquisas do ${turnoLabel}`
    : `valor mais frequente · média: ±${s.margemMean.toFixed(2)} pp`;

  summary.innerHTML = `
    <div class="stat-card accent-1">
      <div class="stat-label"><span class="stat-icon">${ICO_METODO}</span>Método principal</div>
      <div class="stat-value">${s.metodo}</div>
      <div class="stat-sub">${metodoSub}</div>
    </div>
    <div class="stat-card accent-2">
      <div class="stat-label"><span class="stat-icon">${ICO_AMOSTRA}</span>Amostra média</div>
      <div class="stat-value">${fmtAmostra(s.amostraMean)}</div>
      <div class="stat-sub">entrevistados por pesquisa · N = ${s.numPolls}</div>
    </div>
    <div class="stat-card accent-3">
      <div class="stat-label"><span class="stat-icon">${ICO_MARGEM}</span>Margem de erro</div>
      <div class="stat-value">± ${s.margemModa != null ? s.margemModa.toFixed(1) : '—'} pp</div>
      <div class="stat-sub">${margemSub}</div>
    </div>
  `;
  body.appendChild(summary);

  // ---------- Metodologia de ponderação (4 campos) ----------
  const pondWrap = document.createElement('div');
  pondWrap.innerHTML = buildPonderacaoCard(s.ponderacao, 'moda', s.numPolls);
  body.appendChild(pondWrap.firstElementChild);

  // ---------- Título da seção ----------
  const h = document.createElement('h3');
  h.className = 'stats-section-title';
  h.textContent = 'Consistência e Volatilidade';
  body.appendChild(h);
  const hint = document.createElement('p');
  hint.className = 'stats-section-hint';
  hint.innerHTML = `
    Desvio-padrão das estimativas do instituto para cada candidato (em pontos percentuais).
    Quanto <strong>menor o σ</strong>, mais consistente; quanto <strong>maior</strong>, mais volátil entre pesquisas.
  `;
  body.appendChild(hint);

  // ---------- Tabela + highlight cards ----------
  if (s.volatility.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'stats-empty';
    empty.textContent = 'Dados insuficientes para computar volatilidade (mínimo 2 pesquisas por candidato).';
    body.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'vol-grid';
  body.appendChild(grid);

  const maxStd = Math.max(...s.volatility.map(v => v.std));

  // Tabela
  const tableCard = document.createElement('div');
  tableCard.className = 'vol-table-card';
  const tableRows = s.volatility.map(v => {
    const pct = maxStd > 0 ? (v.std / maxStd) * 100 : 0;
    const color = colorByCandidato[v.candidato] || '#999';
    const bucket = volBucket(v.std, maxStd);
    return `
      <tr>
        <td class="name">
          <span class="cdot" style="background:${color}"></span>
          <span>${v.candidato}</span>
        </td>
        <td class="num">${v.std.toFixed(2)}</td>
        <td class="num">${v.mean.toFixed(2)}%</td>
        <td class="num">${v.min.toFixed(1)} – ${v.max.toFixed(1)}%</td>
        <td><div class="bar" title="σ / σ_max = ${pct.toFixed(0)}%"><div class="bar-fill" style="--pct:${pct.toFixed(1)}%"></div></div></td>
        <td>${volBadge(bucket)}</td>
      </tr>
    `;
  }).join('');
  tableCard.innerHTML = `
    <table class="vol-table">
      <thead>
        <tr>
          <th>Candidato</th>
          <th class="num">σ (pp)</th>
          <th class="num">Média</th>
          <th class="num">Intervalo</th>
          <th style="width:140px">Volatilidade relativa</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
  grid.appendChild(tableCard);

  // Highlight cards (mais consistente + mais volátil)
  const highlight = document.createElement('div');
  highlight.className = 'vol-highlight';
  const lowest = s.volatility[0];
  const highest = s.volatility[s.volatility.length - 1];
  const lowColor = colorByCandidato[lowest.candidato] || '#999';
  const highColor = colorByCandidato[highest.candidato] || '#999';
  highlight.innerHTML = `
    <div class="vol-hl-card low">
      <div class="hl-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>
        Mais consistente
      </div>
      <div class="hl-candidate"><span class="cdot" style="background:${lowColor}"></span>${lowest.candidato}</div>
      <div class="hl-value">σ = ${lowest.std.toFixed(2)} pp · intervalo ${lowest.min.toFixed(1)}–${lowest.max.toFixed(1)}%</div>
    </div>
    <div class="vol-hl-card high">
      <div class="hl-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l3-3 4 4 8-8"/><path d="M14 5h7v7"/></svg>
        Mais volátil
      </div>
      <div class="hl-candidate"><span class="cdot" style="background:${highColor}"></span>${highest.candidato}</div>
      <div class="hl-value">σ = ${highest.std.toFixed(2)} pp · intervalo ${highest.min.toFixed(1)}–${highest.max.toFixed(1)}%</div>
    </div>
  `;
  grid.appendChild(highlight);

  // ============================================================
  //        ACURÁCIA VS. RESULTADO REAL (TSE)
  // ============================================================
  const accTitle = document.createElement('h3');
  accTitle.className = 'stats-section-title';
  accTitle.textContent = 'Acurácia vs. Resultado Real (TSE)';
  body.appendChild(accTitle);

  const accHint = document.createElement('p');
  accHint.className = 'stats-section-hint';
  accHint.innerHTML = `
    Métricas estatístico-probabilísticas das pesquisas do instituto contra o resultado oficial do TSE no ${turnoLabel}.
    <strong>MAE</strong> = erro absoluto médio · <strong>Viés</strong> = erro médio sinalizado (+ superestima / − subestima) ·
    <strong>Calibração</strong> = % de pesquisas em que |erro| ≤ margem declarada.
    Com margem de ±${s.margemModa != null ? s.margemModa.toFixed(1) : '—'} pp a 95% de confiança, pesquisas honestas deveriam calibrar em torno de 95%.
  `;
  body.appendChild(accHint);

  if (s.accuracy.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'stats-empty';
    empty.textContent = 'Não há dados reais do TSE para os candidatos deste turno.';
    body.appendChild(empty);
    return;
  }

  // Grid: tabela à esquerda, coluna de resumo + destaques à direita
  const accGrid = document.createElement('div');
  accGrid.className = 'acc-grid';
  body.appendChild(accGrid);

  const maxMae = Math.max(...s.accuracy.map(a => a.mae));
  const accRows = s.accuracy.map(a => {
    const pct = maxMae > 0 ? (a.mae / maxMae) * 100 : 0;
    const color = colorByCandidato[a.candidato] || '#999';
    const hitPct = a.hitRate != null ? (a.hitRate * 100).toFixed(0) + '%' : '—';
    const biasCls = biasClass(a.bias);
    return `
      <tr>
        <td class="name">
          <span class="cdot" style="background:${color}"></span>
          <span>${a.candidato}</span>
        </td>
        <td class="num">${a.real.toFixed(2)}%</td>
        <td class="num">${a.mae.toFixed(2)}</td>
        <td class="num ${biasCls}">${fmtSigned(a.bias, ' pp')}</td>
        <td class="num">${a.rmse.toFixed(2)}</td>
        <td class="num">${hitPct} <span class="hit-sub">(${a.hits}/${a.hitsTotal})</span></td>
        <td><div class="bar" title="MAE / MAE_max = ${pct.toFixed(0)}%"><div class="bar-fill acc-bar" style="--pct:${pct.toFixed(1)}%"></div></div></td>
        <td>${calibBadge(a.hitRate)}</td>
      </tr>
    `;
  }).join('');

  const accTableCard = document.createElement('div');
  accTableCard.className = 'vol-table-card acc-table-card';
  accTableCard.innerHTML = `
    <table class="vol-table acc-table">
      <thead>
        <tr>
          <th>Candidato</th>
          <th class="num">Real (TSE)</th>
          <th class="num">MAE (pp)</th>
          <th class="num">Viés</th>
          <th class="num">RMSE</th>
          <th class="num">Calibração</th>
          <th style="width:120px">Erro relativo</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${accRows}</tbody>
    </table>
  `;
  accGrid.appendChild(accTableCard);

  // ---- Coluna lateral: resumo agregado + destaques ----
  const accSide = document.createElement('div');
  accSide.className = 'acc-side';
  accGrid.appendChild(accSide);

  // Resumo agregado do instituto (média dos candidatos)
  const overallHitPct = s.overallHitRate != null ? (s.overallHitRate * 100).toFixed(0) + '%' : '—';
  const overallCalibBucket = calibBucket(s.overallHitRate);
  const overallSummary = document.createElement('div');
  overallSummary.className = 'acc-overall';
  overallSummary.innerHTML = `
    <div class="acc-overall-label">Resumo do instituto</div>
    <div class="acc-overall-metric">
      <span class="acc-k">Erro médio geral (MAE)</span>
      <span class="acc-v">${s.overallMae != null ? s.overallMae.toFixed(2) + ' pp' : '—'}</span>
    </div>
    <div class="acc-overall-metric">
      <span class="acc-k">Viés médio</span>
      <span class="acc-v ${biasClass(s.overallBias)}">${fmtSigned(s.overallBias, ' pp')}</span>
      <span class="acc-sub">(${biasText(s.overallBias)})</span>
    </div>
    <div class="acc-overall-metric">
      <span class="acc-k">Calibração geral</span>
      <span class="acc-v">${overallHitPct}</span>
      <span class="acc-sub">${s.totalHits}/${s.totalHitsN} dentro da margem</span>
    </div>
    <div class="acc-calib-bar calib-${overallCalibBucket}">
      <div class="acc-calib-fill" style="--pct:${s.overallHitRate != null ? (s.overallHitRate * 100).toFixed(1) + '%' : '0%'}"></div>
    </div>
  `;
  accSide.appendChild(overallSummary);

  // Destaques: mais preciso + mais enviesado
  const mostAccurate = s.accuracy[0];
  const mostBiased = [...s.accuracy].sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))[0];
  const accColorLow = colorByCandidato[mostAccurate.candidato] || '#999';
  const accColorHigh = colorByCandidato[mostBiased.candidato] || '#999';
  const biasDir = mostBiased.bias > 0 ? 'superestimado' : 'subestimado';

  const accHighlights = document.createElement('div');
  accHighlights.className = 'vol-highlight acc-highlights';
  accHighlights.innerHTML = `
    <div class="vol-hl-card low">
      <div class="hl-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
        Mais preciso
      </div>
      <div class="hl-candidate"><span class="cdot" style="background:${accColorLow}"></span>${mostAccurate.candidato}</div>
      <div class="hl-value">MAE = ${mostAccurate.mae.toFixed(2)} pp · real ${mostAccurate.real.toFixed(2)}%</div>
    </div>
    <div class="vol-hl-card high">
      <div class="hl-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 10l7-7 7 7"/></svg>
        Mais enviesado
      </div>
      <div class="hl-candidate"><span class="cdot" style="background:${accColorHigh}"></span>${mostBiased.candidato}</div>
      <div class="hl-value">${fmtSigned(mostBiased.bias, ' pp')} · ${biasDir} em média</div>
    </div>
  `;
  accSide.appendChild(accHighlights);

  // ============================================================
  //        ÚLTIMA PESQUISA ANTES DA ELEIÇÃO
  // ============================================================
  if (s.lastPoll && s.lastPoll.erros.length > 0) {
    const lastTitle = document.createElement('h3');
    lastTitle.className = 'stats-section-title';
    lastTitle.textContent = 'Última pesquisa antes do pleito';
    body.appendChild(lastTitle);

    const lastHint = document.createElement('p');
    lastHint.className = 'stats-section-hint';
    lastHint.innerHTML = `
      O teste definitivo: a pesquisa mais próxima da urna tende a ser a mais divulgada e a mais julgada.
      Aqui comparamos ponto a ponto com o resultado real do TSE.
    `;
    body.appendChild(lastHint);

    const lp = s.lastPoll;
    const dataFmt = new Date(lp.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const maxAbsLast = Math.max(...lp.erros.map(e => e.absDiff), 0.1);

    const errosHtml = lp.erros.map(e => {
      const color = colorByCandidato[e.candidato] || '#999';
      const pct = (e.absDiff / maxAbsLast) * 100;
      const dir = e.diff > 0 ? 'over' : e.diff < 0 ? 'under' : 'neutral';
      return `
        <div class="lp-row">
          <div class="lp-name"><span class="cdot" style="background:${color}"></span>${e.candidato}</div>
          <div class="lp-values">
            <span class="lp-est">${e.est.toFixed(1)}%</span>
            <span class="lp-arrow">→</span>
            <span class="lp-real">${e.real.toFixed(2)}%</span>
          </div>
          <div class="lp-bar-wrap">
            <div class="lp-bar bias-${dir}" style="--pct:${pct.toFixed(1)}%"></div>
          </div>
          <div class="lp-diff ${biasClass(e.diff)}">${fmtSigned(e.diff, ' pp')}</div>
        </div>
      `;
    }).join('');

    const lpCard = document.createElement('div');
    lpCard.className = 'lp-card';
    lpCard.innerHTML = `
      <div class="lp-header">
        <div>
          <div class="lp-date">${dataFmt}</div>
          <div class="lp-meta">${lp.diasAntes === 0 ? 'no dia da eleição' : `${lp.diasAntes} dia${lp.diasAntes === 1 ? '' : 's'} antes`} · ${lp.metodo || '—'} · ${lp.amostra != null ? lp.amostra.toLocaleString('pt-BR') + ' entrevistas' : '—'} · margem ±${lp.margem != null ? lp.margem.toFixed(1) : '—'} pp</div>
        </div>
        <div class="lp-mae">
          <div class="lp-mae-label">MAE dessa pesquisa</div>
          <div class="lp-mae-value">${lp.mae != null ? lp.mae.toFixed(2) + ' pp' : '—'}</div>
        </div>
      </div>
      <div class="lp-rows">${errosHtml}</div>
    `;
    body.appendChild(lpCard);
  }
}

/**
 * View "Última pesquisa" — foco no único poll mais próximo do pleito.
 * Mostra perfil específico dessa pesquisa, comparação ponto-a-ponto com
 * o real, badges de cobertura da margem, z-score e destaques.
 */
function renderStatsUltima(body, instName, turno, s, turnoLabel) {
  const lp = s.lastPoll;
  if (!lp || lp.erros.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'stats-empty';
    empty.textContent = `"${instName}" não tem pesquisa registrada antes do ${turnoLabel}.`;
    body.appendChild(empty);
    return;
  }

  // Precisamos do poll bruto para extrair os 4 campos metodológicos daquela
  // pesquisa específica (lp.erros só tem os erros por candidato).
  const sourcePolls = turno === 't2' ? polls2 : polls1;
  const rawLastPoll = sourcePolls.find(p => p.instituto === instName && p.data === lp.data) || {};

  const dataFmt = new Date(lp.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const diasTxt = lp.diasAntes === 0 ? 'No dia da eleição' : `${lp.diasAntes} dia${lp.diasAntes === 1 ? '' : 's'} antes`;
  const hitsDent = lp.erros.filter(e => lp.margem != null && e.absDiff <= lp.margem).length;
  const totalCand = lp.erros.length;
  const hitRate = totalCand > 0 ? hitsDent / totalCand : null;
  const bias = lp.erros.reduce((sum, e) => sum + e.diff, 0) / lp.erros.length;
  const rmse = Math.sqrt(lp.erros.reduce((sum, e) => sum + e.diff * e.diff, 0) / lp.erros.length);

  // ---------- Perfil dessa pesquisa (3 cards específicos) ----------
  const summary = document.createElement('div');
  summary.className = 'stats-summary';
  summary.innerHTML = `
    <div class="stat-card accent-1">
      <div class="stat-label"><span class="stat-icon">${ICO_METODO}</span>Data da pesquisa</div>
      <div class="stat-value stat-value-sm">${dataFmt}</div>
      <div class="stat-sub">${diasTxt} do ${turnoLabel}</div>
    </div>
    <div class="stat-card accent-2">
      <div class="stat-label"><span class="stat-icon">${ICO_AMOSTRA}</span>Método &amp; amostra</div>
      <div class="stat-value stat-value-sm">${lp.metodo || '—'}</div>
      <div class="stat-sub">${lp.amostra != null ? lp.amostra.toLocaleString('pt-BR') + ' entrevistas' : '—'}</div>
    </div>
    <div class="stat-card accent-3">
      <div class="stat-label"><span class="stat-icon">${ICO_MARGEM}</span>Margem &amp; MAE</div>
      <div class="stat-value">± ${lp.margem != null ? lp.margem.toFixed(1) : '—'} pp</div>
      <div class="stat-sub">MAE dessa pesquisa: <strong>${lp.mae != null ? lp.mae.toFixed(2) + ' pp' : '—'}</strong></div>
    </div>
  `;
  body.appendChild(summary);

  // ---------- Metodologia dessa pesquisa ----------
  const pondWrap = document.createElement('div');
  pondWrap.innerHTML = buildPonderacaoCard(rawLastPoll, 'poll');
  body.appendChild(pondWrap.firstElementChild);

  // ---------- Título ----------
  const h = document.createElement('h3');
  h.className = 'stats-section-title';
  h.textContent = 'Desempenho ponto-a-ponto vs. TSE';
  body.appendChild(h);
  const hint = document.createElement('p');
  hint.className = 'stats-section-hint';
  hint.innerHTML = `
    Comparação candidato-a-candidato entre <strong>${instName}</strong> em ${dataFmt} e o resultado oficial do TSE.
    <strong>Erro</strong> = estimativa − real · <strong>Z-score</strong> ≈ |erro| ÷ (margem ÷ 1.96) — quantos "erros padrão" longe do real ·
    <strong>P(&le; margem)</strong> = cobertura da margem declarada.
  `;
  body.appendChild(hint);

  // ---------- Tabela detalhada ----------
  const accGrid = document.createElement('div');
  accGrid.className = 'acc-grid';
  body.appendChild(accGrid);

  const maxAbs = Math.max(...lp.erros.map(e => e.absDiff), 0.1);

  const tableRows = lp.erros.map(e => {
    const color = colorByCandidato[e.candidato] || '#999';
    const pct = (e.absDiff / maxAbs) * 100;
    const dir = e.diff > 0 ? 'over' : e.diff < 0 ? 'under' : 'neutral';
    const within = lp.margem != null && e.absDiff <= lp.margem;
    // Z-score aproximado: margem a 95% ≈ 1.96 σ → σ ≈ margem/1.96
    const z = lp.margem != null && lp.margem > 0 ? e.absDiff / (lp.margem / 1.96) : null;
    const zClass = z == null ? '' : (z <= 1.96 ? 'z-ok' : z <= 3 ? 'z-warn' : 'z-bad');
    const relErr = e.real !== 0 ? (e.absDiff / e.real) * 100 : null;
    const withinBadge = lp.margem == null
      ? '<span class="badge badge-mid">—</span>'
      : (within
        ? '<span class="badge badge-low">Dentro</span>'
        : '<span class="badge badge-high">Fora</span>');
    return `
      <tr>
        <td class="name">
          <span class="cdot" style="background:${color}"></span>
          <span>${e.candidato}</span>
        </td>
        <td class="num">${e.est.toFixed(2)}%</td>
        <td class="num">${e.real.toFixed(2)}%</td>
        <td class="num ${biasClass(e.diff)}">${fmtSigned(e.diff, ' pp')}</td>
        <td class="num">${relErr != null ? relErr.toFixed(1) + '%' : '—'}</td>
        <td class="num ${zClass}">${z != null ? z.toFixed(2) : '—'}</td>
        <td><div class="bar" title="erro / max = ${pct.toFixed(0)}%"><div class="bar-fill lp-bar bias-${dir}" style="--pct:${pct.toFixed(1)}%"></div></div></td>
        <td>${withinBadge}</td>
      </tr>
    `;
  }).join('');

  const tableCard = document.createElement('div');
  tableCard.className = 'vol-table-card acc-table-card';
  tableCard.innerHTML = `
    <table class="vol-table acc-table">
      <thead>
        <tr>
          <th>Candidato</th>
          <th class="num">Estimativa</th>
          <th class="num">Real (TSE)</th>
          <th class="num">Erro</th>
          <th class="num">Erro rel.</th>
          <th class="num">Z-score</th>
          <th style="width:120px">Magnitude</th>
          <th>P(&le; margem)</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
  accGrid.appendChild(tableCard);

  // ---------- Coluna lateral: resumo + destaques ----------
  const side = document.createElement('div');
  side.className = 'acc-side';
  accGrid.appendChild(side);

  const hitPct = hitRate != null ? (hitRate * 100).toFixed(0) + '%' : '—';
  const calibBuck = calibBucket(hitRate);
  const overall = document.createElement('div');
  overall.className = 'acc-overall';
  overall.innerHTML = `
    <div class="acc-overall-label">Resumo da pesquisa final</div>
    <div class="acc-overall-metric">
      <span class="acc-k">MAE</span>
      <span class="acc-v">${lp.mae != null ? lp.mae.toFixed(2) + ' pp' : '—'}</span>
    </div>
    <div class="acc-overall-metric">
      <span class="acc-k">RMSE</span>
      <span class="acc-v">${rmse.toFixed(2)} pp</span>
    </div>
    <div class="acc-overall-metric">
      <span class="acc-k">Viés</span>
      <span class="acc-v ${biasClass(bias)}">${fmtSigned(bias, ' pp')}</span>
      <span class="acc-sub">(${biasText(bias)})</span>
    </div>
    <div class="acc-overall-metric">
      <span class="acc-k">Cobertura da margem</span>
      <span class="acc-v">${hitPct}</span>
      <span class="acc-sub">${hitsDent}/${totalCand} candidatos com |erro| ≤ ±${lp.margem != null ? lp.margem.toFixed(1) : '—'} pp</span>
    </div>
    <div class="acc-calib-bar calib-${calibBuck}">
      <div class="acc-calib-fill" style="--pct:${hitRate != null ? (hitRate * 100).toFixed(1) + '%' : '0%'}"></div>
    </div>
  `;
  side.appendChild(overall);

  // Destaques
  const erros = [...lp.erros].sort((a, b) => a.absDiff - b.absDiff);
  const mostAccurate = erros[0];
  const mostOff = erros[erros.length - 1];
  const accColorLow = colorByCandidato[mostAccurate.candidato] || '#999';
  const accColorHigh = colorByCandidato[mostOff.candidato] || '#999';
  const offDir = mostOff.diff > 0 ? 'superestimado' : 'subestimado';

  const highlights = document.createElement('div');
  highlights.className = 'vol-highlight acc-highlights';
  highlights.innerHTML = `
    <div class="vol-hl-card low">
      <div class="hl-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
        Mais próximo do real
      </div>
      <div class="hl-candidate"><span class="cdot" style="background:${accColorLow}"></span>${mostAccurate.candidato}</div>
      <div class="hl-value">|erro| = ${mostAccurate.absDiff.toFixed(2)} pp · ${mostAccurate.est.toFixed(1)}% vs. real ${mostAccurate.real.toFixed(2)}%</div>
    </div>
    <div class="vol-hl-card high">
      <div class="hl-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h0"/><circle cx="12" cy="12" r="10"/></svg>
        Mais distante do real
      </div>
      <div class="hl-candidate"><span class="cdot" style="background:${accColorHigh}"></span>${mostOff.candidato}</div>
      <div class="hl-value">${fmtSigned(mostOff.diff, ' pp')} · ${offDir}</div>
    </div>
  `;
  side.appendChild(highlights);
}

function renderStats() {
  const turno = state.statsTurno || 't1';
  const view  = state.statsView  || 'geral';
  if (!state.statsInstituto) {
    // Primeira abertura: pega o primeiro instituto com dados no turno atual
    state.statsInstituto = institutos.find(i => computeInstitutoStats(i, turno) != null) || institutos[0];
  }
  renderInstPills(state.statsInstituto, (inst) => {
    state.statsInstituto = inst;
    renderStats();
  }, turno);
  renderStatsBody(state.statsInstituto, turno, view);
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

document.querySelectorAll('#stats-turno-toggle .seg').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#stats-turno-toggle .seg').forEach(b => b.classList.toggle('active', b === btn));
    const newTurno = btn.dataset.turno;
    if (state.statsTurno === newTurno) return;
    state.statsTurno = newTurno;
    // Se o instituto atual não tem dados no novo turno, pula para o primeiro disponível
    const hasData = computeInstitutoStats(state.statsInstituto, newTurno) != null;
    if (!hasData) {
      state.statsInstituto = institutos.find(i => computeInstitutoStats(i, newTurno) != null) || institutos[0];
    }
    renderStats();
  });
});

document.querySelectorAll('#stats-view-toggle .seg').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#stats-view-toggle .seg').forEach(b => b.classList.toggle('active', b === btn));
    const newView = btn.dataset.view;
    if (state.statsView === newView) return;
    state.statsView = newView;
    renderStats();
  });
});

// ============================================================
//                       INIT
// ============================================================
renderGeral();
renderMetodologiaGeral();
renderT1();
renderT2();
renderStats();
