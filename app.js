/* Atviras biudžetas: skaičiai skaitomi iš budget.json, nieko nesiunčiama į serverį. */
(function () {
  'use strict';

  // Čia įrašykite tik oficialaus valstybės institucijos aukojimo puslapio adresą.
  // Jei tuščia, mygtukas nerodomas ir puslapis nieko nerenka.
  const OFFICIAL_DONATION_URL = '';

  const PALETTE = ['#1f8a5b', '#2b6cb0', '#c2410c', '#7c3aed', '#b7791f', '#0e7490', '#be185d', '#4d7c0f'];
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';

  let data = null;
  let activeId = null;

  const sum = (arr) => arr.reduce((s, x) => s + x.amount, 0);
  const fmtMln = (v) => `${Number(v).toLocaleString('lt-LT')} mln. €`;
  const fmtEur = (v) => `${Math.round(v).toLocaleString('lt-LT')} €`;
  const fmtPct = (v) => `${(Math.round(v * 10) / 10).toLocaleString('lt-LT')} %`;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Įkėlimas ---------- */
  async function load() {
    try {
      const res = await fetch('budget.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
      $('status').hidden = true;
      init();
    } catch (err) {
      $('status').textContent = 'Nepavyko įkelti duomenų. Atidarykite puslapį per interneto adresą (ne tiesiai iš failo).';
    }
  }

  function init() {
    const m = data.meta;
    $('subtitle').textContent = `${m.title} ${m.year} · ${m.unit}`;
    $('source').textContent = `Šaltinis: ${m.source} Atnaujinta: ${m.updated}.`;
    ['cards', 'expenses-sec', 'income-sec', 'donate-sec', 'data-sec'].forEach((id) => { $(id).hidden = false; });
    renderKpis();
    renderDonut();
    renderLegend('');
    renderIncome();
    renderDonateOptions();
    renderDonation();
    if (OFFICIAL_DONATION_URL) {
      const a = $('official');
      a.href = OFFICIAL_DONATION_URL;
      a.hidden = false;
      $('official-note').textContent = 'Paaukojimas vyksta oficialiu valstybės kanalu, ne šiame puslapyje.';
    }
  }

  /* ---------- Rodikliai ---------- */
  function totals() {
    const inc = sum(data.income);
    const out = sum(data.expenses);
    return { inc, out, bal: inc - out, perCapita: (out * 1e6) / data.meta.population };
  }

  function renderKpis() {
    const t = totals();
    $('kpi-in').textContent = fmtMln(t.inc);
    $('kpi-out').textContent = fmtMln(t.out);
    $('kpi-bal').textContent = `${t.bal >= 0 ? '+' : ''}${fmtMln(t.bal)}`;
    $('kpi-pc').textContent = fmtEur(t.perCapita);
  }

  /* ---------- Skritulinė diagrama ---------- */
  function arcPath(cx, cy, r, a0, a1) {
    const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  }

  function renderDonut() {
    const svg = $('donut');
    svg.textContent = '';
    const total = sum(data.expenses);
    let angle = -Math.PI / 2;
    data.expenses.forEach((cat, i) => {
      const span = (cat.amount / total) * Math.PI * 2;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', arcPath(100, 100, 98, angle, angle + span));
      path.setAttribute('fill', PALETTE[i % PALETTE.length]);
      path.dataset.id = cat.id;
      path.setAttribute('role', 'button');
      path.setAttribute('tabindex', '0');
      path.setAttribute('aria-label', `${cat.name}: ${fmtMln(cat.amount)}`);
      path.addEventListener('click', () => selectCategory(cat.id));
      path.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectCategory(cat.id); });
      svg.appendChild(path);
      angle += span;
    });
    const hole = document.createElementNS(NS, 'circle');
    hole.setAttribute('cx', 100); hole.setAttribute('cy', 100); hole.setAttribute('r', 58);
    hole.setAttribute('fill', getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#fff');
    svg.appendChild(hole);
    $('donut-center').innerHTML = `<b>${fmtMln(total)}</b><span>iš viso išlaidų</span>`;
  }

  /* ---------- Išlaidų sąrašas ---------- */
  function renderLegend(query) {
    const q = query.trim().toLowerCase();
    const total = sum(data.expenses);
    const list = $('legend');
    list.textContent = '';
    const cats = data.expenses.filter((c) => !q || c.name.toLowerCase().includes(q) ||
      c.items.some((it) => it.name.toLowerCase().includes(q)));
    if (!cats.length) {
      list.innerHTML = '<li class="muted">Nieko nerasta.</li>';
      return;
    }
    cats.forEach((cat) => {
      const i = data.expenses.indexOf(cat);
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-expanded', String(cat.id === activeId));
      li.className = cat.id === activeId ? 'active' : '';
      li.innerHTML = `
        <span class="sw" style="background:${PALETTE[i % PALETTE.length]}"></span>
        <span>${esc(cat.name)}</span>
        <span class="val">${fmtMln(cat.amount)}</span>
        <span class="pct">${fmtPct((cat.amount / total) * 100)}</span>`;
      li.addEventListener('click', () => selectCategory(cat.id));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectCategory(cat.id); });
      list.appendChild(li);
    });
  }

  function selectCategory(id) {
    activeId = activeId === id ? null : id;
    document.querySelectorAll('#donut path').forEach((p) => p.classList.toggle('active', p.dataset.id === activeId));
    renderLegend($('search').value);
    renderDrill();
  }

  function renderDrill() {
    const drill = $('drill');
    const cat = data.expenses.find((c) => c.id === activeId);
    if (!cat) { drill.hidden = true; return; }
    $('drill-t').textContent = `${cat.name}: smulkesnės išlaidos`;
    $('drill-items').innerHTML = cat.items.map((it) =>
      `<li><span>${esc(it.name)}</span><span>${fmtMln(it.amount)} · ${fmtPct((it.amount / cat.amount) * 100)}</span></li>`
    ).join('');
    drill.hidden = false;
  }

  /* ---------- Pajamos ---------- */
  function renderIncome() {
    const total = sum(data.income);
    $('income-bars').innerHTML = data.income.map((inc) => `
      <li>
        <span>${esc(inc.name)}</span>
        <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${((inc.amount / total) * 100).toFixed(1)}%"></div></div>
        <span class="amt">${fmtMln(inc.amount)}</span>
      </li>`).join('');
  }

  /* ---------- Paaukojimo skaičiuoklė (nieko nerenka) ---------- */
  function renderDonateOptions() {
    const sel = $('area');
    sel.innerHTML = `<option value="">Visa valstybė</option>` +
      data.expenses.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  }

  function renderDonation() {
    const amount = Math.max(0, parseFloat($('amount').value) || 0);
    const t = totals();
    const areaId = $('area').value;
    const area = data.expenses.find((c) => c.id === areaId);
    const base = area ? area.amount * 1e6 : t.out * 1e6;
    const label = area ? `sričiai „${area.name}“` : 'visai valstybės biudžetui';
    const pct = base ? (amount / base) * 100 : 0;
    const shareOfCitizen = t.perCapita ? (amount / t.perCapita) * 100 : 0;

    $('result').innerHTML = amount
      ? `Tavo <strong>${fmtEur(amount)}</strong> sudarytų <strong>${fmtPct(pct)}</strong> metinių išlaidų ${label}. ` +
        `Tai lygu <strong>${fmtPct(shareOfCitizen)}</strong> vieno gyventojo metinių valstybės išlaidų.`
      : 'Įveskite sumą, kad pamatytumėte, ką ji reiškia biudžete.';
  }

  /* ---------- CSV ---------- */
  function exportCsv() {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Tipas', 'Kategorija', 'Punktas', `Suma (${data.meta.unit})`].join(';')];
    data.income.forEach((x) => rows.push(['Pajamos', q(x.name), '', x.amount].join(';')));
    data.expenses.forEach((c) => {
      rows.push(['Išlaidos', q(c.name), '', c.amount].join(';'));
      c.items.forEach((it) => rows.push(['Išlaidos', q(c.name), q(it.name), it.amount].join(';')));
    });
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biudzetas-${data.meta.year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Tema ---------- */
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('biudzetas.tema', t); } catch (e) {}
    $('theme').textContent = t === 'dark' ? 'Šviesi tema' : 'Tamsi tema';
    $('theme').setAttribute('aria-pressed', String(t === 'dark'));
    if (data) renderDonut();
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('biudzetas.tema'); } catch (e) {}
    const dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(saved || (dark ? 'dark' : 'light'));
  }

  /* ---------- Įvykiai ---------- */
  $('search').addEventListener('input', (e) => renderLegend(e.target.value));
  $('drill-close').addEventListener('click', () => selectCategory(activeId));
  $('amount').addEventListener('input', renderDonation);
  $('area').addEventListener('change', renderDonation);
  $('csv').addEventListener('click', exportCsv);
  $('theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));


  /* ---------- Skirtukai ---------- */
  function showView(name) {
    document.querySelectorAll('[data-view-panel]').forEach((p) => { p.hidden = p.dataset.viewPanel !== name; });
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === name)));
  }

  /* ---------- Skundai ---------- */
  const SKUNDAI_KEY = 'biudzetas.skundai';
  const DAY = 86400000;
  const STATUS_LABEL = { gauta: 'Gauta', nagrinejama: 'Nagrinėjama', atsakyta: 'Atsakyta' };
  let complaints = loadComplaints();

  function seedComplaints() {
    const now = Date.now();
    return [
      { id: 'c1', topic: 'Keliai ir transportas', text: 'Duobė prie mokyklos, vaikai eina per važiuojamąją dalį.', status: 'atsakyta',
        created: now - 40 * DAY, answered: now - 31 * DAY, answer: 'Duobė įtraukta į remonto planą. Darbai numatyti kitą mėnesį.' },
      { id: 'c2', topic: 'Statyba ir leidimai', text: 'Nežinau, kiek laiko trunka leidimo išdavimas ir kur tai matyti.', status: 'nagrinejama',
        created: now - 21 * DAY, answered: null, answer: '' },
      { id: 'c3', topic: 'Švietimas', text: 'Pasiūlymas: skelbti mokyklų remonto planą viešai, kad tėvai matytų eilę.', status: 'gauta',
        created: now - 3 * DAY, answered: null, answer: '' },
    ];
  }

  function loadComplaints() {
    try {
      const s = JSON.parse(localStorage.getItem(SKUNDAI_KEY));
      if (Array.isArray(s)) return s;
    } catch (e) {}
    const seeded = seedComplaints();
    saveComplaints(seeded);
    return seeded;
  }

  function saveComplaints(list) {
    try { localStorage.setItem(SKUNDAI_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function daysBetween(a, b) { return Math.floor((b - a) / DAY); }

  function renderComplaints() {
    const now = Date.now();
    const done = complaints.filter((c) => c.status === 'atsakyta');
    const avg = done.length ? Math.round(done.reduce((s, c) => s + daysBetween(c.created, c.answered), 0) / done.length) : null;
    const late = complaints.filter((c) => c.status !== 'atsakyta' && daysBetween(c.created, now) > 14).length;
    $('cs-total').textContent = complaints.length;
    $('cs-done').textContent = done.length;
    $('cs-avg').textContent = avg === null ? '–' : `${avg} d.`;
    $('cs-late').textContent = late;

    const list = $('complaint-list');
    if (!complaints.length) {
      list.innerHTML = '<li class="muted">Skundų dar nėra.</li>';
      return;
    }
    list.innerHTML = [...complaints].sort((a, b) => b.created - a.created).map((c) => {
      const age = c.status === 'atsakyta'
        ? `Atsakyta per ${daysBetween(c.created, c.answered)} d.`
        : `Laukia ${daysBetween(c.created, now)} d.`;
      const actions = c.status === 'gauta'
        ? `<button class="btn ghost small" type="button" data-act="take" data-id="${esc(c.id)}">Priimti (demo)</button>`
        : c.status === 'nagrinejama'
          ? `<button class="btn ghost small" type="button" data-act="answer" data-id="${esc(c.id)}">Atsakyti (demo)</button>`
          : '';
      const answer = c.answer ? `<p class="answer"><strong>Atsakymas:</strong> ${esc(c.answer)}</p>` : '';
      return `
        <li class="complaint s-${esc(c.status)}">
          <div class="c-head">
            <strong>${esc(c.topic)}</strong>
            <span class="chip">${STATUS_LABEL[c.status]}</span>
          </div>
          <p>${esc(c.text)}</p>
          ${answer}
          <div class="c-foot">
            <span class="muted small">${esc(new Date(c.created).toLocaleDateString('lt-LT'))} · ${age}</span>
            ${actions}
          </div>
        </li>`;
    }).join('');
  }

  function onComplaintAction(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const c = complaints.find((x) => x.id === b.dataset.id);
    if (!c) return;
    if (b.dataset.act === 'take') {
      c.status = 'nagrinejama';
    } else if (b.dataset.act === 'answer') {
      const answer = window.prompt('Įrašykite institucijos atsakymą (demonstracija):', '');
      if (!answer || !answer.trim()) return;
      c.status = 'atsakyta';
      c.answered = Date.now();
      c.answer = answer.trim().slice(0, 400);
    }
    saveComplaints(complaints);
    renderComplaints();
  }

  function onComplaintSubmit(e) {
    e.preventDefault();
    const topic = $('c-topic').value;
    const text = $('c-text').value.trim();
    if (!topic || !text) {
      $('c-error').hidden = false;
      return;
    }
    $('c-error').hidden = true;
    complaints.push({ id: 'c' + Date.now().toString(36), topic, text, status: 'gauta', created: Date.now(), answered: null, answer: '' });
    saveComplaints(complaints);
    $('complaint-form').reset();
    renderComplaints();
  }

  /* ---------- Paleidimas (papildomi skyriai) ---------- */
  function initExtras() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
    $('complaint-form').addEventListener('submit', onComplaintSubmit);
    $('complaint-list').addEventListener('click', onComplaintAction);
    renderComplaints();
  }

  initExtras();
  initTheme();
  load();
})();
