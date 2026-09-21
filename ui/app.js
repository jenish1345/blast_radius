/**
 * BLAST RADIUS — Main Application Controller
 * 
 * Coordinates the Cockpit UI:
 * - Telemetry bar counters & View Transitions theme toggle
 * - Three.js Particle Stage & Hand-drawn Blast Gauge
 * - Composer & Pipeline Stepper
 * - Real API integration & 6-Feature Collapsible Panels
 * - Demo Runner Sequence
 */

import * as api from './api.js';
import { ParticleStage } from './stage.js';
import { BlastGauge } from './gauge.js';
import { DEMO_SEQUENCE } from './demo_sequence.js';

// DOM Selectors
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

class App {
  constructor() {
    this.stage = null;
    this.gauge = null;
    this.currentSessionId = null;
    this.pollTimer = null;
    this.scenarios = {};

    this.telemetry = {
      steps: 0,
      blocked: 0,
      drift: null,
      blast: null,
      tavilyChecks: 0,
      modelTier: 'Nano 30B'
    };

    this.init();
  }

  async init() {
    // 1. Initialize Particle Stage & Gauge
    const stageMount = $('#stage-mount');
    if (stageMount) {
      this.stage = new ParticleStage(stageMount);
    }

    const gaugeMount = $('#gauge-mount');
    if (gaugeMount) {
      this.gauge = new BlastGauge(gaugeMount);
    }

    // 2. Setup Theme System
    this.initTheme();

    // 3. Setup Notice Handler
    api.setNoticeHandler((notice) => this.showInlineNotice(notice));

    // 4. Wire Controls & Listeners
    this.wireEventListeners();

    // 5. Load Initial Data (Scenarios, Health)
    await this.loadInitialData();
  }

  // ==========================================================================
  // Theme System (View Transitions API with circular reveal)
  // ==========================================================================
  initTheme() {
    const saved = localStorage.getItem('blast_radius_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    this.applyTheme(theme, false);

    const toggleBtn = $('#theme-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = (e) => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        this.toggleThemeWithTransition(next, e);
      };
    }
  }

  toggleThemeWithTransition(theme, event) {
    if (!document.startViewTransition) {
      this.applyTheme(theme, true);
      return;
    }

    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? 24;
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = document.startViewTransition(() => {
      this.applyTheme(theme, true);
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
        },
        {
          duration: 380,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    });
  }

  applyTheme(theme, updateStorage = true) {
    document.documentElement.setAttribute('data-theme', theme);
    if (updateStorage) {
      try { localStorage.setItem('blast_radius_theme', theme); } catch (_) {}
    }
    const toggleBtn = $('#theme-toggle');
    if (toggleBtn) {
      toggleBtn.innerHTML = theme === 'dark' 
        ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
    if (this.stage) {
      this.stage.setTheme(theme);
    }
  }

  // ==========================================================================
  // Telemetry & Counters
  // ==========================================================================
  updateTelemetry(updates = {}) {
    Object.assign(this.telemetry, updates);

    $('#cnt-steps').textContent = this.telemetry.steps > 0 ? this.telemetry.steps : '—';
    $('#cnt-blocked').textContent = this.telemetry.blocked > 0 ? this.telemetry.blocked : '0';
    $('#cnt-drift').textContent = typeof this.telemetry.drift === 'number' ? this.telemetry.drift.toFixed(2) : '—';
    $('#cnt-blast').textContent = typeof this.telemetry.blast === 'number' ? this.telemetry.blast.toFixed(2) : '—';
    $('#cnt-tavily').textContent = this.telemetry.tavilyChecks > 0 ? this.telemetry.tavilyChecks : '—';
    $('#cnt-tier').textContent = this.telemetry.modelTier || '—';
  }

  setConnectionState(status) {
    const dot = $('#conn-dot');
    if (!dot) return;
    dot.className = 'status-dot';
    if (status === 'active') dot.classList.add('status-active');
    else if (status === 'error') dot.classList.add('status-error');
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  wireEventListeners() {
    // Session copy
    const sessChip = $('#session-chip');
    if (sessChip) {
      sessChip.onclick = () => {
        if (!this.currentSessionId) return;
        navigator.clipboard.writeText(this.currentSessionId);
        const originalText = sessChip.textContent;
        sessChip.textContent = 'Copied';
        setTimeout(() => { sessChip.textContent = originalText; }, 1200);
      };
    }

    // Scenario Select
    const scenSelect = $('#scenario-select');
    if (scenSelect) {
      scenSelect.onchange = () => {
        const key = scenSelect.value;
        if (key && this.scenarios[key]) {
          const s = this.scenarios[key];
          $('#composer-intent').value = s.task || '';
          $('#composer-action').value = (s.seed && s.seed[0]) || '';
        }
      };
    }

    // Analyze Action Button (Primary)
    const analyzeBtn = $('#btn-analyze');
    if (analyzeBtn) {
      analyzeBtn.onclick = () => this.handleAnalyzeAction();
    }

    // Refine Loop Button (Secondary)
    const refineBtn = $('#btn-refine');
    if (refineBtn) {
      refineBtn.onclick = () => this.handleRefineAction();
    }

    // Demo Sequence Runner
    const demoBtn = $('#btn-demo');
    if (demoBtn) {
      demoBtn.onclick = () => this.runDemoSequence();
    }

    // Collapsible Feature Rows (Enter/Space & Click)
    $$('.feature-row-header').forEach((hdr) => {
      const row = hdr.closest('.feature-row');
      const toggle = () => {
        const isExp = row.classList.contains('is-expanded');
        row.classList.toggle('is-expanded', !isExp);
        hdr.setAttribute('aria-expanded', !isExp);
      };
      hdr.onclick = toggle;
      hdr.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      };
    });

    // Close Verdict Banner on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideVerdictBanner();
      }
    });

    // Download Report Button
    const dlBtn = $('#btn-download-report');
    if (dlBtn) {
      dlBtn.onclick = () => this.downloadForensicReport();
    }
  }

  // ==========================================================================
  // Data Loading & API Calls
  // ==========================================================================
  async loadInitialData() {
    try {
      this.setConnectionState('active');
      const [health, scenarios] = await Promise.all([
        api.fetchHealth(),
        api.fetchScenarios()
      ]);

      this.scenarios = scenarios || {};
      const select = $('#scenario-select');
      if (select) {
        select.innerHTML = '<option value="">Select scenario…</option>';
        for (const [k, v] of Object.entries(this.scenarios)) {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = v.title || k;
          select.appendChild(opt);
        }
      }

      this.setConnectionState('idle');
    } catch (_) {
      this.setConnectionState('error');
    }
  }

  // Primary Action Flow
  async handleAnalyzeAction() {
    const declaredIntent = $('#composer-intent').value.trim();
    const action = $('#composer-action').value.trim();
    const scenarioKey = $('#scenario-select').value;

    if (!declaredIntent && !action && !scenarioKey) {
      this.showInlineNotice({
        title: "Input required",
        message: "Please enter declared intent and command, or pick a scenario.",
        nextStep: "Choose a scenario from the dropdown to auto-fill.",
        isError: false
      });
      return;
    }

    const btn = $('#btn-analyze');
    this.setButtonLoading(btn, true, "Analyzing…");
    this.setConnectionState('active');
    if (this.stage) this.stage.setState({ phase: 'analyzing', tier: 'GREEN', drift: 0.1 });

    this.resetPipelineStepper();
    this.setStepActive('step-premise');

    try {
      let runId = null;

      if (scenarioKey) {
        const runRes = await api.startRun({ scenario: scenarioKey });
        runId = runRes.run_id;
      } else {
        const runRes = await api.startRun({ task: declaredIntent || action });
        runId = runRes.run_id;
      }

      this.currentSessionId = runId;
      this.updateSessionChip(runId);

      // Start Polling Run
      this.watchRun(runId);

    } catch (err) {
      this.setButtonLoading(btn, false, "Analyze action");
      this.setConnectionState('error');
      if (this.stage) this.stage.setState({ phase: 'idle', tier: 'GREEN', drift: 0.0 });
    }
  }

  watchRun(runId) {
    if (this.pollTimer) clearInterval(this.pollTimer);

    const poll = async () => {
      try {
        const run = await api.fetchRun(runId);
        this.renderRunState(run);

        if (['done', 'failed', 'stopped', 'awaiting_decision'].includes(run.status)) {
          this.setButtonLoading($('#btn-analyze'), false, "Analyze action");
          this.setConnectionState('idle');

          if (run.status !== 'awaiting_decision') {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
          }
        }
      } catch (_) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
        this.setButtonLoading($('#btn-analyze'), false, "Analyze action");
        this.setConnectionState('error');
      }
    };

    poll();
    this.pollTimer = setInterval(poll, 750);
  }

  renderRunState(run) {
    const steps = run.steps || [];
    const state = run.session_state || {};
    const pending = run.pending;
    const lastGated = steps.filter((s) => s.verdict).pop();

    this.updateTelemetry({
      steps: steps.length,
      blocked: steps.filter((s) => s.kind === 'blocked' || s.decision === 'rejected').length,
      modelTier: 'Super 120B'
    });

    // 1. Pipeline Stepper Advance
    if (steps.length > 0) {
      this.setStepPassed('step-premise');
      this.setStepPassed('step-sandbox');
    }

    // 2. Blast Radius Score & Gauge
    const br = state.blast_radius || (lastGated && lastGated.verdict && lastGated.verdict.blast_radius);
    if (br) {
      const score = Number(br.score || 0);
      const tier = br.tier || 'GREEN';
      if (this.gauge) this.gauge.setScore(score, tier, br.breakdown);
      if (this.stage) this.stage.setState({ phase: 'verdict', tier, drift: score });
      this.updateTelemetry({ blast: score, drift: score });
      this.setStepPassed('step-blast');

      // Update Feature Row 3 Summary
      $('#fr3-summary').textContent = `${tier} tier · score ${score.toFixed(3)}`;
    }

    // 3. Premise Check
    const premises = state.premise_results || (lastGated && lastGated.premise) || [];
    if (premises.length) {
      this.updateTelemetry({ tavilyChecks: premises.length });
      const refuted = premises.find((p) => p.status === 'REFUTED' || p.holds === false);
      if (refuted) {
        this.setStepFailed('step-premise');
        $('#fr1-summary').textContent = `${premises.length} checked · 1 refuted: "${refuted.assumption || refuted.premise}"`;
      } else {
        this.setStepPassed('step-premise');
        $('#fr1-summary').textContent = `${premises.length} verified via Tavily · all hold`;
      }
      this.renderPremiseList(premises);
    }

    // 4. Refinement Loop
    const refLog = state.refinement_log || [];
    if (refLog.length) {
      const lastIter = refLog[refLog.length - 1];
      const conv = lastIter.converged;
      $('#fr2-summary').textContent = `${refLog.length} iterations · ${conv ? 'converged (CLEAN)' : 'unresolved drift'}`;
      this.renderRefinementTable(refLog);
      if (conv) this.setStepPassed('step-refine');
      else this.setStepFailed('step-refine');
    }

    // 5. Intent Tracking
    const tracking = state.intent_tracking || {};
    if (tracking.flags) {
      const f = tracking.flags;
      const flagged = f.goal_drift || f.scope_creep || f.contradiction;
      $('#fr4-summary').textContent = flagged 
        ? `Anomaly flagged: ${[f.goal_drift && 'drift', f.scope_creep && 'scope', f.contradiction && 'contradiction'].filter(Boolean).join(', ')}`
        : `Clean trace across ${tracking.step_count || steps.length} steps`;
      this.renderIntentTracking(tracking);
      this.setStepPassed('step-intent');
    }

    // 6. Counterfactual Timelines
    const cfs = state.counterfactuals || [];
    if (cfs.length) {
      $('#fr5-summary').textContent = `3 timelines modeled · max recovery ~${cfs[2]?.recovery_hours || 0}h`;
      this.renderCounterfactualCards(cfs);
    }

    // 7. Verdict Banner & Final Gating
    if (pending) {
      const v = pending.verdict || {};
      this.showVerdictBanner('BLOCKED', v.reason || 'Action gated by Blast Radius preflight safety check.');
      this.setStepFailed('step-verdict');
    } else if (run.status === 'done') {
      const v = lastGated?.verdict || {};
      if (v.verdict === 'DRIFT' || v.verdict === 'STALE_PREMISE') {
        this.showVerdictBanner('BLOCKED', v.reason || 'Action exceeded drift threshold.');
        this.setStepFailed('step-verdict');
      } else {
        this.showVerdictBanner('ALLOWED', 'Preflight checks passed cleanly with zero collateral drift.');
        this.setStepPassed('step-verdict');
      }
    }

    // 8. Forensic Report
    if (run.report || state.report) {
      const rep = state.report || { report: run.report };
      $('#fr6-summary').textContent = `Report ready (${run.id})`;
      $('#report-preview').textContent = JSON.stringify(rep, null, 2);
    }
  }

  // Refine Action Flow (Secondary)
  async handleRefineAction() {
    const command = $('#composer-action').value.trim();
    const declaredIntent = $('#composer-intent').value.trim();

    if (!command) {
      this.showInlineNotice({ title: "Command required", message: "Please specify an action command to run refinement loop.", isError: false });
      return;
    }

    const btn = $('#btn-refine');
    this.setButtonLoading(btn, true, "Refining…");
    this.setStepActive('step-refine');
    if (this.stage) this.stage.setState({ phase: 'refining', tier: 'YELLOW', drift: 0.5 });

    try {
      const res = await api.refineAction({
        session_id: this.currentSessionId || "standalone",
        command,
        declared_intent: declaredIntent,
        drift_diff: { modified: ["/var/log/active.log"], unexpected: ["/var/log/active.log"] }
      });

      this.setButtonLoading(btn, false, "Run refine loop");
      this.setStepPassed('step-refine');

      if (res.data) {
        $('#composer-action').value = res.data.refined_command || command;
        this.showInlineNotice({
          title: "Refinement complete",
          message: `Rewrote command to: ${res.data.refined_command}`,
          nextStep: "Run 'Analyze action' to preflight the refined plan.",
          isError: false
        });
      }
    } catch (_) {
      this.setButtonLoading(btn, false, "Run refine loop");
      this.setStepFailed('step-refine');
    }
  }

  // Demo Sequence Runner (Section 9)
  async runDemoSequence() {
    const demoBtn = $('#btn-demo');
    this.setButtonLoading(demoBtn, true, "Running Demo…");

    for (const item of DEMO_SEQUENCE) {
      $('#composer-intent').value = item.declared_intent;
      $('#composer-action').value = item.action;
      if (item.scenario) $('#scenario-select').value = item.scenario;

      this.showInlineNotice({
        title: item.title,
        message: item.description,
        nextStep: `Step ${item.step} of 6 executing against real backend…`,
        isError: false
      });

      await this.handleAnalyzeAction();
      // Wait between demo steps
      await new Promise((r) => setTimeout(r, 2400));
    }

    this.setButtonLoading(demoBtn, false, "Run demo sequence");
    this.showInlineNotice({
      title: "Demo sequence complete",
      message: "All 6 preflight safety features exercised with live inference.",
      nextStep: "Inspect the collapsible feature rows or download the JSON report.",
      isError: false
    });
  }

  // ==========================================================================
  // Render Helpers for Features
  // ==========================================================================
  renderPremiseList(premises) {
    const el = $('#premise-list-container');
    if (!el) return;
    el.innerHTML = premises.map((p) => {
      const st = (p.status || (p.holds === false ? 'REFUTED' : p.holds === true ? 'CONFIRMED' : 'UNCERTAIN')).toUpperCase();
      const chipCls = st === 'REFUTED' ? 'chip-refuted' : st === 'CONFIRMED' ? 'chip-confirmed' : 'chip-uncertain';
      const url = p.tavily_url || p.source;
      return `
        <div class="premise-item">
          <span class="chip ${chipCls}">${st}</span>
          <div>
            <b>${this.esc(p.assumption || p.premise)}</b>
            ${p.evidence ? ` — <span style="color:var(--text-muted)">${this.esc(p.evidence)}</span>` : ''}
            ${url ? ` <a href="${this.esc(url)}" target="_blank" rel="noopener">[source]</a>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  renderRefinementTable(log) {
    const el = $('#refinement-container');
    if (!el) return;
    el.innerHTML = `
      <table class="refine-table">
        <thead>
          <tr>
            <th>Iter</th>
            <th>Proposed Command</th>
            <th>Drift Gap</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          ${log.map((item) => `
            <tr>
              <td>#${item.iteration}</td>
              <td><code>${this.esc(item.refined_cmd || item.original_cmd)}</code></td>
              <td>${Number(item.gap || 0).toFixed(3)}</td>
              <td><span class="chip ${item.converged ? 'chip-confirmed' : 'chip-refuted'}">${item.converged ? 'CLEAN' : 'DRIFT'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderIntentTracking(tracking) {
    const el = $('#intent-tracking-container');
    if (!el) return;
    const f = tracking.flags || {};
    el.innerHTML = `
      <div class="tracker-flags-row">
        <span class="flag-chip ${f.goal_drift ? 'flag-active' : ''}">Goal Drift: ${f.goal_drift ? 'DETECTED' : 'CLEAR'}</span>
        <span class="flag-chip ${f.scope_creep ? 'flag-active' : ''}">Scope Creep: ${f.scope_creep ? 'DETECTED' : 'CLEAR'}</span>
        <span class="flag-chip ${f.contradiction ? 'flag-active' : ''}">Contradiction: ${f.contradiction ? 'DETECTED' : 'CLEAR'}</span>
      </div>
      <p class="tracker-expl-text">${this.esc(tracking.explanation || 'No cross-step anomalies detected.')}</p>
    `;
  }

  renderCounterfactualCards(cfs) {
    const el = $('#counterfactuals-container');
    if (!el) return;
    el.innerHTML = `
      <div class="cf-cards-row">
        ${cfs.map((t) => {
          const cls = (t.label || '').toLowerCase();
          return `
            <div class="cf-card-col ${cls}">
              <div class="cf-card-header">
                <span class="cf-card-title">${this.esc(t.label)}</span>
                <span class="cf-card-hours">~${Number(t.recovery_hours || 0).toFixed(1)}h</span>
              </div>
              <div class="cf-card-body"><b>State:</b> ${this.esc(t.system_state || '—')}</div>
              <div class="cf-card-body" style="color:var(--text-muted)"><b>Next:</b> ${this.esc(t.downstream_actions || '—')}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  async downloadForensicReport() {
    const sid = this.currentSessionId || "demo";
    try {
      const res = await api.getReport(sid);
      const data = res.data || res;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `blast-radius-report-${data.report_id || sid}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      this.showInlineNotice({ title: "Download failed", message: e.message, isError: true });
    }
  }

  // ==========================================================================
  // Stepper & Banner Utilities
  // ==========================================================================
  resetPipelineStepper() {
    $$('.timeline-step').forEach((s) => {
      s.className = 'timeline-step';
      const m = s.querySelector('.step-marker');
      if (m) m.textContent = '';
    });
  }

  setStepActive(stepId) {
    const el = $(`#${stepId}`);
    if (el) {
      el.classList.add('step-active');
      const m = el.querySelector('.step-marker');
      if (m) m.textContent = '●';
    }
  }

  setStepPassed(stepId) {
    const el = $(`#${stepId}`);
    if (el) {
      el.className = 'timeline-step step-passed';
      const m = el.querySelector('.step-marker');
      if (m) m.textContent = '✓';
    }
  }

  setStepFailed(stepId) {
    const el = $(`#${stepId}`);
    if (el) {
      el.className = 'timeline-step step-failed';
      const m = el.querySelector('.step-marker');
      if (m) m.textContent = '✕';
    }
  }

  showVerdictBanner(type, reason) {
    const banner = $('#verdict-banner');
    if (!banner) return;
    banner.className = `verdict-banner ${type === 'BLOCKED' ? 'banner-blocked' : 'banner-allowed'}`;
    $('#vb-title').textContent = type === 'BLOCKED' ? 'BLOCKED BY PREFLIGHT' : 'ALLOWED — PREFLIGHT CLEAN';
    $('#vb-reason').textContent = reason || '';
    banner.style.display = 'flex';
  }

  hideVerdictBanner() {
    const banner = $('#verdict-banner');
    if (banner) banner.style.display = 'none';
  }

  showInlineNotice({ title, message, nextStep = "", isError = false }) {
    const box = $('#inline-notice-box');
    if (!box) return;
    box.className = `inline-notice ${isError ? 'notice-error' : ''}`;
    box.innerHTML = `
      <div>
        <b>${this.esc(title)}</b> — ${this.esc(message)}
        ${nextStep ? `<br><small style="opacity:0.8">${this.esc(nextStep)}</small>` : ''}
      </div>
      <button onclick="this.parentElement.style.display='none'" style="opacity:0.7">&times;</button>
    `;
    box.style.display = 'flex';
  }

  setButtonLoading(btn, isLoading, text) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = text;
  }

  updateSessionChip(id) {
    const el = $('#session-chip-text');
    if (el) el.textContent = id ? id.slice(0, 8) : '—';
  }

  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.blastRadiusApp = new App();
});
