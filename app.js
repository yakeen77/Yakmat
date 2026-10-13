(() => {
  'use strict';
  const STORAGE_KEY = 'daymark.entries.v1';
  const symptomNames = ['Headache', 'Fatigue', 'Bloating', 'Nausea', 'Cramps', 'Low mood', 'Anxiety', 'Joint pain', 'Skin changes', 'Other'];
  const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  const byDate = (a, b) => b.date.localeCompare(a.date);
  const safeText = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  let entries = loadEntries();
  let editingId = null;
  let toastTimer;

  function loadEntries() {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(saved) ? saved.filter((entry) => entry && typeof entry.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && Array.isArray(entry.symptoms)) : []; }
    catch { return []; }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); return true; }
    catch { showToast('Could not save. Check this browser’s storage settings.'); return false; }
  }
  function formatDate(value, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
  }
  function prettyDate(value) { return value === today() ? 'Today' : formatDate(value); }
  function showToast(message) {
    const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function weekDates() {
    const current = new Date(); const mondayOffset = (current.getDay() + 6) % 7;
    const monday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, index) => { const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; });
  }
  function currentStreak() {
    const logged = new Set(entries.map((entry) => entry.date)); const cursor = new Date();
    const keyFor = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!logged.has(keyFor(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0; while (logged.has(keyFor(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); } return streak;
  }
  function getInsights() {
    const results = []; const symptomDays = entries.filter((entry) => entry.symptoms.length > 0);
    if (symptomDays.length >= 3) {
      const counts = {}; symptomDays.forEach((entry) => entry.symptoms.forEach((symptom) => { counts[symptom] = (counts[symptom] || 0) + 1; }));
      const [symptom, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
      if (symptom && count >= 2) results.push({ title: `${symptom} appears most often`, body: `You noted ${symptom.toLowerCase()} on ${count} of ${symptomDays.length} days with symptoms.`, note: 'Frequency in your notes, not a medical conclusion.' });
    }
    const sleepEntries = entries.filter((entry) => entry.sleep !== '' && entry.sleep != null && entry.severity > 0);
    const shortSleep = sleepEntries.filter((entry) => Number(entry.sleep) < 7); const longerSleep = sleepEntries.filter((entry) => Number(entry.sleep) >= 7);
    if (shortSleep.length >= 2 && longerSleep.length >= 2) {
      const shortAvg = shortSleep.reduce((sum, entry) => sum + Number(entry.severity), 0) / shortSleep.length; const longAvg = longerSleep.reduce((sum, entry) => sum + Number(entry.severity), 0) / longerSleep.length;
      results.push({ title: 'Sleep and symptom intensity', body: `Average intensity was ${shortAvg.toFixed(1)} / 5 after under 7 hours of sleep and ${longAvg.toFixed(1)} / 5 after 7 or more hours.`, note: `Based on ${shortSleep.length} shorter-sleep and ${longerSleep.length} longer-sleep days. This is a comparison, not proof of a link.` });
    }
    const stressEntries = entries.filter((entry) => entry.stress !== '' && entry.stress != null && entry.severity > 0);
    const highStress = stressEntries.filter((entry) => Number(entry.stress) >= 4); const lowerStress = stressEntries.filter((entry) => Number(entry.stress) <= 2);
    if (highStress.length >= 2 && lowerStress.length >= 2) {
      const highAvg = highStress.reduce((sum, entry) => sum + Number(entry.severity), 0) / highStress.length; const lowAvg = lowerStress.reduce((sum, entry) => sum + Number(entry.severity), 0) / lowerStress.length;
      results.push({ title: 'Stress and symptom intensity', body: `Average intensity was ${highAvg.toFixed(1)} / 5 on higher-stress days and ${lowAvg.toFixed(1)} / 5 on lower-stress days.`, note: `Based on ${highStress.length} higher-stress and ${lowerStress.length} lower-stress days. This is a comparison, not proof of a link.` });
    }
    const cycleEntries = entries.filter((entry) => entry.cycle && entry.cycle !== 'Not sure' && entry.severity > 0); const groups = {};
    cycleEntries.forEach((entry) => { (groups[entry.cycle] ||= []).push(Number(entry.severity)); });
    Object.entries(groups).filter(([, values]) => values.length >= 2).forEach(([phase, values]) => { const average = values.reduce((sum, value) => sum + value, 0) / values.length; results.push({ title: `Notes during the ${phase.toLowerCase()} phase`, body: `Your average symptom intensity was ${average.toFixed(1)} / 5 across ${values.length} logged days in this phase.`, note: 'Based on your logged cycle phase and reported intensity.' }); });
    return results;
  }
  function insightMarkup(insight) { return `<article class="insight-card"><h3>${safeText(insight.title)}</h3><p>${safeText(insight.body)}</p><p class="insight-caveat">${safeText(insight.note)}</p></article>`; }
  function renderInsights() {
    const insights = getInsights(); const dashboard = document.getElementById('dashboard-insights');
    dashboard.innerHTML = insights.length ? insights.slice(0, 2).map(insightMarkup).join('') : '<div class="insight-placeholder"><span class="insight-glyph" aria-hidden="true">⌁</span><p>Your patterns will appear as you log. Comparisons need a few entries in each group.</p></div>';
    document.getElementById('all-insights').innerHTML = insights.length ? insights.map(insightMarkup).join('') : '<div class="no-insights"><span class="empty-spark" aria-hidden="true">✳</span><strong>Your notes will tell their story in time.</strong><p>Log at least a few days to start seeing gentle comparisons here.</p></div>';
  }
  function renderChart() {
    const canvas = document.getElementById('rhythm-chart'); const rect = canvas.parentElement.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1; canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext('2d'); context.scale(ratio, ratio); const width = rect.width; const height = rect.height; const dates = weekDates();
    const byDay = new Map(entries.map((entry) => [entry.date, entry])); const values = dates.map((date) => byDay.get(date)?.severity ?? null);
    const hasValue = values.some((value) => value !== null && value > 0); document.getElementById('chart-empty').hidden = hasValue; if (!hasValue) return;
    const left = 25; const right = width - 12; const top = 12; const bottom = height - 24;
    context.font = '9px "DM Sans", sans-serif'; context.textAlign = 'right'; context.textBaseline = 'middle';
    for (let tick = 0; tick <= 5; tick += 1) { const y = bottom - (tick / 5) * (bottom - top); context.strokeStyle = '#edf0ec'; context.lineWidth = 1; context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke(); context.fillStyle = '#a0aaa3'; context.fillText(String(tick), left - 8, y); }
    const points = values.map((value, index) => ({ x: left + index * ((right - left) / 6), y: value == null ? null : bottom - (Math.max(0, Math.min(5, value)) / 5) * (bottom - top) }));
    if (points.filter((point) => point.y !== null).length > 1) { context.beginPath(); let started = false; points.forEach((point) => { if (point.y === null) { started = false; return; } if (!started) { context.moveTo(point.x, point.y); started = true; } else context.lineTo(point.x, point.y); }); context.strokeStyle = '#d77967'; context.lineWidth = 2; context.lineJoin = 'round'; context.lineCap = 'round'; context.stroke(); }
    points.forEach((point, index) => { if (point.y !== null) { context.beginPath(); context.arc(point.x, point.y, 3.5, 0, Math.PI * 2); context.fillStyle = '#d77967'; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke(); } context.fillStyle = '#8d9991'; context.textAlign = 'center'; context.textBaseline = 'top'; context.fillText(formatDate(dates[index], { weekday: 'short' }), point.x, bottom + 10); });
  }
  function entryTags(entry) {
    const tags = entry.symptoms.slice(0, 4).map((symptom) => `<span class="tag tag-coral">${safeText(symptom)}</span>`);
    if (entry.symptoms.length > 4) tags.push(`<span class="tag">+${entry.symptoms.length - 4}</span>`); if (entry.cycle) tags.push(`<span class="tag">${safeText(entry.cycle)}</span>`); return tags.length ? tags.join('') : '<span class="tag">No symptoms noted</span>';
  }
  function entryDescription(entry) {
    const details = []; if (entry.severity > 0) details.push(`Intensity ${entry.severity}/5`); if (entry.sleep !== '' && entry.sleep != null) details.push(`${safeText(entry.sleep)}h sleep`);
    if (entry.stress) details.push(`Stress ${['', 'low', 'a little', 'moderate', 'high', 'very high'][Number(entry.stress)] || ''}`); if (entry.food) details.push(safeText(entry.food)); if (entry.notes) details.push(safeText(entry.notes)); return details.join(' · ') || 'A check-in, just as it was.';
  }
  function renderEntries() {
    const sorted = [...entries].sort(byDate); const recent = document.getElementById('recent-entries');
    recent.innerHTML = sorted.length ? sorted.slice(0, 4).map((entry) => `<article class="entry-row"><div class="entry-date">${safeText(prettyDate(entry.date))}<span>${safeText(formatDate(entry.date, { year: 'numeric', month: 'long', day: 'numeric' }))}</span></div><div class="entry-tags">${entryTags(entry)}</div><div class="entry-meta">${entry.severity > 0 ? `Intensity ${safeText(entry.severity)} / 5` : 'Check-in'}</div></article>`).join('') : '<div class="journal-empty"><p>No check-ins yet. Your first note can be as simple as it needs to be.</p><button class="button button-secondary" id="empty-log-button">＋ Add an entry</button></div>';
    const query = document.getElementById('history-search').value.trim().toLowerCase(); const filtered = sorted.filter((entry) => !query || [entry.date, ...entry.symptoms, entry.food, entry.notes, entry.cycle].join(' ').toLowerCase().includes(query));
    document.getElementById('history-count').textContent = String(sorted.length);
    document.getElementById('history-entries').innerHTML = filtered.map((entry) => `<article class="history-row"><div class="entry-date">${safeText(prettyDate(entry.date))}<span>${safeText(formatDate(entry.date, { year: 'numeric', month: 'short', day: 'numeric' }))}</span></div><div class="history-details"><div class="entry-tags">${entryTags(entry)}</div><div class="history-description">${entryDescription(entry)}</div></div><div class="history-actions"><button class="history-action" data-edit="${safeText(entry.id)}" title="Edit entry" aria-label="Edit entry for ${safeText(prettyDate(entry.date))}">✎</button><button class="history-action" data-delete="${safeText(entry.id)}" title="Delete entry" aria-label="Delete entry for ${safeText(prettyDate(entry.date))}">×</button></div></article>`).join('');
    document.getElementById('history-empty').hidden = sorted.length > 0;
    if (sorted.length && query && !filtered.length) document.getElementById('history-entries').innerHTML = '<div class="empty-state"><h3>No matching notes.</h3><p>Try another symptom or search term.</p></div>';
  }
  function renderStats() {
    const currentWeek = new Set(weekDates()); const weekCount = new Set(entries.filter((entry) => currentWeek.has(entry.date)).map((entry) => entry.date)).size; const counts = {};
    entries.forEach((entry) => entry.symptoms.forEach((symptom) => { counts[symptom] = (counts[symptom] || 0) + 1; })); const mostNoted = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    document.getElementById('stat-days').textContent = String(new Set(entries.map((entry) => entry.date)).size); document.getElementById('stat-week').innerHTML = `${weekCount}<span class="stat-unit"> / 7</span>`;
    document.getElementById('stat-symptom').textContent = mostNoted; document.getElementById('stat-streak').innerHTML = `${currentStreak()}<span class="stat-unit"> days</span>`;
    document.getElementById('today-label').textContent = formatDate(today(), { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  }
  function render() { renderStats(); renderEntries(); renderInsights(); renderChart(); }
  function openEntry(entry = null) {
    editingId = entry?.id || null; const form = document.getElementById('entry-form'); form.reset();
    document.getElementById('dialog-title').innerHTML = entry ? 'Edit your <em>check-in.</em>' : 'How are you <em>today?</em>'; document.getElementById('save-entry-button').textContent = entry ? 'Save changes' : 'Save check-in';
    document.getElementById('entry-date').value = entry?.date || today(); document.getElementById('entry-severity').value = entry?.severity ?? 0; document.getElementById('severity-value').textContent = `${entry?.severity ?? 0} / 5`;
    document.getElementById('entry-sleep-quality').value = entry?.sleepQuality ?? 3; document.getElementById('sleep-value').textContent = `${entry?.sleepQuality ?? 3} / 5`;
    document.getElementById('entry-sleep').value = entry?.sleep ?? ''; document.getElementById('entry-stress').value = entry?.stress ?? ''; document.getElementById('entry-cycle').value = entry?.cycle ?? '';
    document.getElementById('entry-food').value = entry?.food ?? ''; document.getElementById('entry-notes').value = entry?.notes ?? '';
    document.querySelectorAll('#symptom-options input').forEach((input) => { input.checked = Boolean(entry?.symptoms.includes(input.value)); }); document.getElementById('entry-dialog').showModal();
  }
  function saveEntry(event) {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const data = new FormData(form);
    const entry = { id: editingId || (window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`), date: data.get('date'), symptoms: [...document.querySelectorAll('#symptom-options input:checked')].map((input) => input.value), severity: Number(data.get('severity')), sleep: data.get('sleep'), sleepQuality: Number(data.get('sleepQuality')), stress: data.get('stress'), cycle: data.get('cycle'), food: data.get('food').trim(), notes: data.get('notes').trim() };
    if (entries.some((item) => item.date === entry.date && item.id !== entry.id)) { showToast('There is already a check-in for that date. Edit it from your journal.'); return; }
    const previous = entries; entries = entries.filter((item) => item.id !== entry.id); entries.push(entry); if (!persist()) { entries = previous; return; }
    document.getElementById('entry-dialog').close(); render(); showToast(editingId ? 'Your check-in has been updated.' : 'Your check-in is saved on this device.'); editingId = null;
  }
  function downloadData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries: [...entries].sort(byDate) }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `daymark-journal-${today()}.json`; link.click(); URL.revokeObjectURL(url); showToast('Your journal export is ready.');
  }
  function makeSharePreview() {
    const sorted = [...entries].sort(byDate); const dateRange = sorted.length ? `${formatDate(sorted.at(-1).date, { month: 'short', day: 'numeric', year: 'numeric' })} – ${formatDate(sorted[0].date, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No entries yet';
    const counts = {}; sorted.forEach((entry) => entry.symptoms.forEach((symptom) => { counts[symptom] = (counts[symptom] || 0) + 1; })); const topSymptoms = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5); const insights = getInsights();
    document.getElementById('share-preview').innerHTML = `<h3>Symptom & wellbeing journal</h3><div class="preview-date">Prepared ${safeText(formatDate(today(), { month: 'long', day: 'numeric', year: 'numeric' }))} · ${sorted.length} check-in${sorted.length === 1 ? '' : 's'} · ${safeText(dateRange)}</div><h4>MOST NOTED SYMPTOMS</h4>${topSymptoms.length ? `<ul>${topSymptoms.map(([name, count]) => `<li>${safeText(name)}: noted on ${count} day${count === 1 ? '' : 's'}</li>`).join('')}</ul>` : '<p>No symptoms noted in this date range.</p>'}<h4>OBSERVATIONS FROM MY NOTES</h4>${insights.length ? `<ul>${insights.map((insight) => `<li><strong>${safeText(insight.title)}:</strong> ${safeText(insight.body)} <em>${safeText(insight.note)}</em></li>`).join('')}</ul>` : '<p>Not enough entries for a comparison yet.</p>'}<h4>DAILY CHECK-INS</h4>${sorted.length ? `<ul>${sorted.map((entry) => `<li><strong>${safeText(formatDate(entry.date, { month: 'short', day: 'numeric', year: 'numeric' }))}:</strong> ${safeText(entry.symptoms.join(', ') || 'No symptoms noted')}${entry.severity > 0 ? ` · Intensity ${safeText(entry.severity)}/5` : ''}${entry.sleep !== '' && entry.sleep != null ? ` · ${safeText(entry.sleep)}h sleep` : ''}${entry.stress ? ` · Stress ${safeText(['', 'low', 'a little', 'moderate', 'high', 'very high'][Number(entry.stress)])}` : ''}${entry.cycle ? ` · ${safeText(entry.cycle)} phase` : ''}${entry.food ? ` · Food: ${safeText(entry.food)}` : ''}${entry.notes ? ` · Note: ${safeText(entry.notes)}` : ''}</li>`).join('')}</ul>` : '<p>No check-ins yet.</p>'}<p><em>Personal observations for discussion with a healthcare professional. Not a diagnosis or medical advice.</em></p>`;
  }
  function switchView(view) { document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `${view}-view`)); document.querySelectorAll('.nav-link[data-view]').forEach((link) => link.classList.toggle('active', link.dataset.view === view)); document.getElementById('breadcrumb-view').textContent = view.toUpperCase(); if (view === 'dashboard') requestAnimationFrame(renderChart); }
  function initialize() {
    document.getElementById('symptom-options').innerHTML = symptomNames.map((name) => `<label class="symptom-option"><input type="checkbox" name="symptoms" value="${safeText(name)}"><span>${safeText(name)}</span></label>`).join('');
    document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
    ['new-entry-button', 'chart-log-button', 'history-new-button', 'history-empty-button'].forEach((id) => document.getElementById(id)?.addEventListener('click', () => openEntry()));
    document.getElementById('recent-entries').addEventListener('click', (event) => { if (event.target.closest('#empty-log-button')) openEntry(); });
    document.getElementById('entry-form').addEventListener('submit', saveEntry); document.getElementById('close-dialog').addEventListener('click', () => document.getElementById('entry-dialog').close()); document.getElementById('cancel-entry').addEventListener('click', () => document.getElementById('entry-dialog').close());
    document.getElementById('entry-severity').addEventListener('input', (event) => { document.getElementById('severity-value').textContent = `${event.target.value} / 5`; }); document.getElementById('entry-sleep-quality').addEventListener('input', (event) => { document.getElementById('sleep-value').textContent = `${event.target.value} / 5`; });
    document.getElementById('history-search').addEventListener('input', renderEntries);
    document.getElementById('history-entries').addEventListener('click', (event) => {
      const editId = event.target.closest('[data-edit]')?.dataset.edit; const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
      if (editId) openEntry(entries.find((entry) => entry.id === editId));
      if (deleteId) { const entry = entries.find((item) => item.id === deleteId); if (!entry || !window.confirm(`Delete your check-in from ${prettyDate(entry.date)}? This cannot be undone.`)) return; const previous = entries; entries = entries.filter((item) => item.id !== deleteId); if (!persist()) { entries = previous; return; } render(); showToast('Check-in deleted from this device.'); }
    });
    document.getElementById('export-button').addEventListener('click', downloadData); document.getElementById('print-summary-button').addEventListener('click', () => { makeSharePreview(); document.getElementById('share-dialog').showModal(); });
    document.getElementById('close-share').addEventListener('click', () => document.getElementById('share-dialog').close()); document.getElementById('cancel-share').addEventListener('click', () => document.getElementById('share-dialog').close()); document.getElementById('print-button').addEventListener('click', () => window.print());
    document.getElementById('entry-date').max = today(); window.addEventListener('resize', () => requestAnimationFrame(renderChart)); render();
  }
  initialize();
})();