/**
 * BLAST RADIUS — Blast Gauge Component
 * 
 * Hand-written SVG 270° arc gauge with:
 * - Ghost arc showing previous score draining/rising to current score
 * - Number tweening (600ms, ease-out)
 * - Tier badge and color cross-fading
 * - 4-component mini-bars (scope, reversibility, sensitivity, spread) with staggered fill
 * - RED tier 240ms shake animation
 * - Full accessibility attributes (role="meter")
 */

const ARC_TOTAL = 179.07; // 270 deg of radius 38

export class BlastGauge {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentScore = 0;
    this.previousScore = 0;
    this.currentTier = 'GREEN';
    this.rafId = null;
    this.ghostRafId = null;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="gauge-card" role="meter" aria-label="Blast Radius Risk Gauge" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0">
        <div class="gauge-svg-wrap" id="gauge-wrap">
          <svg viewBox="0 0 100 100" class="gauge-svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="gauge-grad-green" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stop-color="var(--safe)" />
                <stop offset="100%" stop-color="var(--accent)" />
              </linearGradient>
            </defs>

            <!-- Background Track (270 deg) -->
            <circle class="gauge-track" cx="50" cy="50" r="38" 
              stroke-dasharray="${ARC_TOTAL} 240" 
              stroke-dashoffset="0" 
              transform="rotate(135 50 50)" />

            <!-- Ghost Arc (Previous Score) -->
            <circle class="gauge-ghost" id="gauge-ghost-arc" cx="50" cy="50" r="38" 
              stroke-dasharray="${ARC_TOTAL} 240" 
              stroke-dashoffset="${ARC_TOTAL}" 
              transform="rotate(135 50 50)" />

            <!-- Active Score Arc -->
            <circle class="gauge-fill" id="gauge-fill-arc" cx="50" cy="50" r="38" 
              stroke-dasharray="${ARC_TOTAL} 240" 
              stroke-dashoffset="${ARC_TOTAL}" 
              transform="rotate(135 50 50)" />

            <!-- Ticks at 0.3 and 0.6 -->
            <!-- 0.3 tick: 135 + 81 = 216 deg -->
            <line class="gauge-tick" x1="50" y1="12" x2="50" y2="16" transform="rotate(81 50 50)" />
            <!-- 0.6 tick: 135 + 162 = 297 deg -->
            <line class="gauge-tick" x1="50" y1="12" x2="50" y2="16" transform="rotate(162 50 50)" />
          </svg>

          <!-- Gauge Center Content -->
          <div class="gauge-center">
            <div class="gauge-score-row">
              <span class="gauge-num" id="gauge-score-num">0.00</span>
              <span class="gauge-badge badge-green" id="gauge-tier-badge">GREEN</span>
            </div>
            <span class="gauge-label">Blast radius</span>
          </div>
        </div>

        <!-- 4-Component Mini Bars -->
        <div class="mini-bars-grid" id="mini-bars">
          <div class="mini-bar-item" tabindex="0" title="Files and paths touched compared to system baseline">
            <div class="mb-header">
              <span class="mb-name">Scope</span>
              <span class="mb-val" id="val-scope">—</span>
            </div>
            <div class="mb-track"><div class="mb-fill" id="fill-scope"></div></div>
          </div>

          <div class="mini-bar-item" tabindex="0" title="Ease of recovery or reverting the mutation">
            <div class="mb-header">
              <span class="mb-name">Reversibility</span>
              <span class="mb-val" id="val-reversibility">—</span>
            </div>
            <div class="mb-track"><div class="mb-fill" id="fill-reversibility"></div></div>
          </div>

          <div class="mini-bar-item" tabindex="0" title="Touches sensitive system configurations or secrets">
            <div class="mb-header">
              <span class="mb-name">Sensitivity</span>
              <span class="mb-val" id="val-sensitivity">—</span>
            </div>
            <div class="mb-track"><div class="mb-fill" id="fill-sensitivity"></div></div>
          </div>

          <div class="mini-bar-item" tabindex="0" title="Cross-directory blast spread and hierarchy depth">
            <div class="mb-header">
              <span class="mb-name">Spread</span>
              <span class="mb-val" id="val-spread">—</span>
            </div>
            <div class="mb-track"><div class="mb-fill" id="fill-spread"></div></div>
          </div>
        </div>
      </div>
    `;

    this.fillArc = this.container.querySelector('#gauge-fill-arc');
    this.ghostArc = this.container.querySelector('#gauge-ghost-arc');
    this.scoreNum = this.container.querySelector('#gauge-score-num');
    this.tierBadge = this.container.querySelector('#gauge-tier-badge');
    this.gaugeWrap = this.container.querySelector('#gauge-wrap');
    this.meter = this.container.querySelector('[role="meter"]');
  }

  setScore(newScore, tier = 'GREEN', breakdown = null) {
    const target = Math.max(0, Math.min(1, Number(newScore || 0)));
    const startScore = this.currentScore;
    this.previousScore = startScore;
    this.currentScore = target;
    this.currentTier = tier.toUpperCase();

    // Update ARIA
    if (this.meter) {
      this.meter.setAttribute('aria-valuenow', target.toFixed(3));
      this.meter.setAttribute('aria-valuetext', `${target.toFixed(3)} ${this.currentTier}`);
    }

    // Set Ghost Arc to the previous score first, then animate ghost draining toward new
    const prevOffset = ARC_TOTAL * (1 - this.previousScore);
    const targetOffset = ARC_TOTAL * (1 - target);

    if (this.ghostArc) {
      this.ghostArc.style.strokeDashoffset = `${prevOffset}`;
      // Delayed ghost drain
      clearTimeout(this.ghostTimeout);
      this.ghostTimeout = setTimeout(() => {
        if (this.ghostArc) {
          this.ghostArc.style.transition = 'stroke-dashoffset 900ms cubic-bezier(0.2, 0.8, 0.2, 1)';
          this.ghostArc.style.strokeDashoffset = `${targetOffset}`;
        }
      }, 300);
    }

    // Update active arc
    if (this.fillArc) {
      this.fillArc.style.strokeDashoffset = `${targetOffset}`;
      this.fillArc.className.baseVal = `gauge-fill tier-${this.currentTier.toLowerCase()}`;
    }

    // Update tier badge
    if (this.tierBadge) {
      this.tierBadge.textContent = this.currentTier;
      this.tierBadge.className = `gauge-badge badge-${this.currentTier.toLowerCase()}`;
    }

    // Trigger RED shake (skipped if reduced motion)
    if (this.currentTier === 'RED' && this.gaugeWrap) {
      this.gaugeWrap.classList.remove('shake-horizontal');
      void this.gaugeWrap.offsetWidth; // Reflow
      this.gaugeWrap.classList.add('shake-horizontal');
    }

    // Tween the score number readout (600ms)
    this.tweenNumber(startScore, target, 600);

    // Update mini-bars with breakdown if provided
    if (breakdown) {
      this.setBreakdown(breakdown);
    }
  }

  tweenNumber(from, to, duration) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const start = performance.now();

    const frame = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1.0);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const val = from + (to - from) * ease;
      if (this.scoreNum) {
        this.scoreNum.textContent = val.toFixed(2);
      }
      if (progress < 1.0) {
        this.rafId = requestAnimationFrame(frame);
      } else {
        if (this.scoreNum) this.scoreNum.textContent = to.toFixed(2);
      }
    };

    this.rafId = requestAnimationFrame(frame);
  }

  setBreakdown(breakdown) {
    const items = [
      { key: 'scope', val: breakdown.scope ?? breakdown.file_count },
      { key: 'reversibility', val: breakdown.reversibility ?? breakdown.write_ratio },
      { key: 'sensitivity', val: breakdown.sensitivity ?? breakdown.sensitive_path },
      { key: 'spread', val: breakdown.spread ?? breakdown.root_escalation }
    ];

    items.forEach((item, idx) => {
      const fillEl = this.container.querySelector(`#fill-${item.key}`);
      const valEl = this.container.querySelector(`#val-${item.key}`);
      const num = typeof item.val === 'number' ? item.val : null;

      if (valEl) {
        valEl.textContent = num !== null ? num.toFixed(2) : '—';
      }

      if (fillEl) {
        const pct = num !== null ? Math.round(Math.min(100, Math.max(0, num * 100))) : 0;
        // Stagger fill by 100ms per bar
        setTimeout(() => {
          fillEl.style.width = `${pct}%`;
          fillEl.className = `mb-fill tier-${this.currentTier.toLowerCase()}`;
        }, idx * 100);
      }
    });
  }
}
