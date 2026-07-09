(function() {
  /* ── DOM refs ── */
  const editor    = document.getElementById('editor');
  const btnPlay   = document.getElementById('btnPlay');
  const btnPause  = document.getElementById('btnPause');
  const btnStop   = document.getElementById('btnStop');
  const btnPreloads = document.getElementById('btnPreloads');
  const btnSidebarClose = document.getElementById('btnSidebarClose');
  const sidebar   = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const preloadList = document.getElementById('preloadList');
  const statusText = document.getElementById('statusText');
  const errorPanel = document.getElementById('errorPanel');

  let repl = null; // Store the Strudel repl instance
  let isPaused = false; // Track pause state
  const punchcardCanvas = document.getElementById('punchcardCanvas');
  const punchcardCtx = punchcardCanvas.getContext('2d');

  let isPlaying = false;
  let activePreload = null;
  let engineReady = false;
  let defaultCps = 0.5; // Strudel default (120 BPM / 2s per cycle), captured at init

  /* ── Sidebar toggle ── */
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('open');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
  }
  btnPreloads.addEventListener('click', openSidebar);
  btnSidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  /* ── Status / errors ── */
  function setStatus(msg, cls) {
    statusText.textContent = msg;
    statusText.className = 'status-text ' + (cls || '');
  }

  function showError(msg) {
    errorPanel.textContent = msg;
    errorPanel.classList.add('visible');
    setStatus('Error', 'error');
  }

  function clearError() {
    errorPanel.classList.remove('visible');
    errorPanel.textContent = '';
  }

  /* ── Punchcard ── */
  var punchcard = window.punchcard = {
    animId: null,
    events: [],     // {time, label} — cycle time + note/sound name
          rows: [],       // unique row labels
          startCycle: 0,
          cycleLen: 1,
          viewRow: 0,
          targetRow: 0,
          _onNote: null,  // event handler ref

    init: function() {
      this.events = [];
      this.rows = [];
      this.resize();
    },

    resize: function() {
      var dpr = window.devicePixelRatio || 1;
      var rect = punchcardCanvas.getBoundingClientRect();
      punchcardCanvas.width = rect.width * dpr;
      punchcardCanvas.height = rect.height * dpr;
      punchcardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    /** Normalize a note label to canonical form: uppercase root + sharps.
     *  "c3" → "C3", "eb3" → "D#3", "Db3" → "C#3". Passes non-notes through. */
          normalizeLabel: function(label) {
            if (typeof label !== 'string') return label;
            var m = label.match(/^([A-Ga-g])(#|b)?(-?\d+)$/);
            if (!m) return label;
            var root = m[1].toUpperCase();
            var acc = m[2] || '';
            var note = root + acc;
            var flatToSharp = {Db:'C#', Eb:'D#', Fb:'E', Gb:'F#', Ab:'G#', Bb:'A#', Cb:'B'};
            if (flatToSharp[note]) note = flatToSharp[note];
            return note + m[3];
          },

          /** Extract a display label from a hap value.
     *  Handles: strings ("bd"), numbers (note midi), objects ({s:"bd"}, {note:"C4"}, {n:0}) */
          labelFromValue: function(v) {
            if (v == null) return null;
            var self = this;
            function norm(s) { return self.normalizeLabel(s); }
            if (typeof v === 'string') return norm(v);
            if (typeof v === 'number') {
              var nn = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
              var midi = Math.round(v) + 60;
              var oct = Math.floor(midi / 12) - 1;
              return norm(nn[((midi % 12) + 12) % 12] + oct);
            }
            if (typeof v !== 'object') return null;
            if (v.note) return norm(String(v.note));
            if (v.s && !v.note) return String(v.s);  // drum/sample labels don't normalize
            if (v.n != null) {
              var nn = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
              var midi = parseInt(v.n) + 60;
              var oct = Math.floor(midi / 12) - 1;
              return norm(nn[((midi % 12) + 12) % 12] + oct);
            }
            if (v.value != null) return norm(String(v.value));
            if (v.freq) return String(Math.round(12 * Math.log2(v.freq / 440) + 69));
            return null;
          },

          /** Convert note label to MIDI number (e.g. "C4" -> 60, "D#3" -> 51).
           *  Returns null if not a valid note name. */
          noteToMidi: function(label) {
            if (typeof label !== 'string') return null;
            var m = label.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
            if (!m) return null;
            var noteMap = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
            var base = noteMap[m[1].toUpperCase()];
            var alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
            var oct = parseInt(m[3]);
            return (oct + 1) * 12 + base + alter;
          },

          /** Check if a MIDI note is a black key. */
          isBlackKey: function(midi) {
            var semitone = midi % 12;
            return semitone === 1 || semitone === 3 || semitone === 6 || semitone === 8 || semitone === 10;
          },

          scrollY: 0,  // Vertical scroll offset (in pixels)

          /** Initialize scroll event listeners. */
          initScroll: function() {
            // Manual scroll disabled; octave tracking is automatic
          },

          start: function() {
            if (this.animId) return;
            this.events = [];
            this.rows = [];
            this.init();
            this.initScroll();

            // Record cycle start
            try { this.startCycle = getTime ? getTime() : 0; } catch(e) { this.startCycle = 0; }
            try { this.cycleLen = cps ? (1 / (cps() || 1)) : 1; } catch(e) { this.cycleLen = 1; }
            if (!isFinite(this.cycleLen) || this.cycleLen <= 0) this.cycleLen = 1;

            var self = this;
            function frame() {
              self.animId = requestAnimationFrame(frame);
              self.draw();
            }
            frame();
          },

          /**
           * Build punchcard data by querying a Pattern.
           * Queries the first cycle (0 to 1) to get the pattern's structure.
           */
          buildFromPattern: function(pattern) {
            if (!pattern || typeof pattern.queryArc !== 'function') return;

            try {
              // Query 128 cycles starting from current playhead position
              // so events are always near the playhead regardless of when
              // the pattern was started (fixes desktop-vs-mobile timing gap).
              var startCycle = 0;
              try { startCycle = Math.floor(getTime ? Number(getTime()) : 0); } catch(e) {}
              if (!isFinite(startCycle) || startCycle < 0) startCycle = 0;
              var haps = pattern.queryArc(startCycle, startCycle + 128);
              this.capturedCycles = 128;

              this.events = [];
              this.rows = [];
              var self = this;
              var seen = {};

              haps.forEach(function(hap) {
                if (!hap.hasOnset || !hap.hasOnset()) return;

                var label = self.labelFromValue(hap.value);
                if (!label) return;

                // Get absolute time position (across cycles)
                var fract = hap.part && hap.part.begin;
                var time = 0;
                try {
                  var f = fract;
                  if (f && typeof f.floor === 'function' && typeof f.sub === 'function') {
                    // Keep the absolute position, don't collapse to 0-1
                    time = Number(f);
                  } else {
                    time = Number(f);
                  }
                } catch (e) {
                  time = Number(fract) || 0;
                }
                if (!isFinite(time)) time = 0;
                if (time < 0) time = 0;

                // Dedup by absolute time and label (not cycle-relative)
                var timeKey = time.toFixed(3);
                var dedupKey = timeKey + ':' + label;
                if (seen[dedupKey]) return;
                seen[dedupKey] = true;

                self.events.push({ time: time, label: String(label) });

                if (self.rows.indexOf(String(label)) === -1) {
                  self.rows.push(String(label));
                }
              });

              // Sort rows by MIDI number (high to low for piano-like orientation)
              // Rows with valid MIDI come first (pitched), followed by non-pitched (drums, etc.)
              var self = this;
              this.rows.sort(function(a, b) {
                var midiA = self.noteToMidi(a);
                var midiB = self.noteToMidi(b);
                var hasA = midiA !== null;
                var hasB = midiB !== null;
                // Pitched notes first, sorted high to low
                if (hasA && !hasB) return -1;
                if (!hasA && hasB) return 1;
                if (hasA && hasB) return midiB - midiA;  // descending MIDI
                // Non-pitched: sort alphabetically
                return a < b ? -1 : a > b ? 1 : 0;
              });

              // Build row metadata for DAW-style layout
              this.rowMeta = [];
              var prevMidi = null;
              for (var r = 0; r < this.rows.length; r++) {
                var label = this.rows[r];
                var midi = this.noteToMidi(label);
                var isBlack = midi !== null ? this.isBlackKey(midi) : false;
                var interval = midi !== null && prevMidi !== null ? prevMidi - midi : 1;
                this.rowMeta.push({
                  label: label,
                  midi: midi,
                  isBlack: isBlack,
                  interval: interval
                });
                if (midi !== null) prevMidi = midi;
              }

            } catch (e) {
              console.error('[pn] buildFromPattern error:', e);
            }
          },

          stop: function() {
            if (this.animId) {
              cancelAnimationFrame(this.animId);
              this.animId = null;
            }
            punchcardCtx.clearRect(0, 0, punchcardCanvas.width, punchcardCanvas.height);
          },

    getPlayhead: function() {
      // Use strudel's getTime() which is cycle-based and immune to tempo changes.
      // It returns the current absolute cycle position (a Fraction-like number).
      try {
        if (typeof getTime === 'function') {
          var t = getTime();
          // Convert Fraction or number to [0, 1) range via floor + sub
          if (t && typeof t.floor === 'function' && typeof t.sub === 'function') {
            var floored = t.floor();
            return Number(t.sub(floored));
          }
          // Plain number fallback
          var n = Number(t);
          return isFinite(n) ? n - Math.floor(n) : 0;
        }
      } catch(e) {}
      // Strudel not initialized yet — use perf.now as last resort
      return (performance.now() / 1000) % 1;
    },

    /** Find the 15-semitone window [top-14, top] with the most notes.
     *  Returns the top MIDI of the best window (integer). */
    findBestWindow: function(events, fallback) {
      var midis = [];
      var self = this;
      events.forEach(function(ev) {
        var m = self.noteToMidi(ev.label);
        if (m !== null) midis.push(m);
      });
      if (midis.length === 0) return fallback;

      var minM = midis[0], maxM = midis[0];
      for (var i = 1; i < midis.length; i++) {
        if (midis[i] < minM) minM = midis[i];
        if (midis[i] > maxM) maxM = midis[i];
      }

      var bestTop = fallback;
      var bestCount = 0;
      // Try every possible 15-semitone window (top from maxM down to minM+14)
      for (var top = maxM; top >= minM + 14; top--) {
        var count = 0;
        for (var j = 0; j < midis.length; j++) {
          if (midis[j] >= top - 14 && midis[j] <= top) count++;
        }
        if (count > bestCount) {
          bestCount = count;
          bestTop = top;
        }
      }
      return bestTop;
    },

    draw: function() {
      var ctx = punchcardCtx;
      var dpr = window.devicePixelRatio || 1;
      var w = punchcardCanvas.width / dpr;
      var h = punchcardCanvas.height / dpr;

      // Dark background
      ctx.fillStyle = '#1a1a1f';
      ctx.fillRect(0, 0, w, h);

      if (!this.events || this.events.length === 0) return;

      // ── Sliding 15-semitone window: follows densest note cluster ──
      var noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      var BLACK_FACTOR = 0.5;
      var WHITES = 9, BLACKS = 6;

      // Initialize displayTopMidi (top of the 15-note window) — default to B4
      if (typeof this.displayTopMidi !== 'number') this.displayTopMidi = 71;

      // Get absolute time
      var absoluteTime = getTime ? getTime() : 0;
      if (absoluteTime && typeof absoluteTime.floor === 'function') {
        absoluteTime = Number(absoluteTime);
      }
      var currentCycle = Math.floor(absoluteTime);
      var ph = absoluteTime - currentCycle;
      var labelW = 60;
      var gridW = w - labelW - 8;
      var PLAYHEAD_X = labelW + 4;

      // Find the best 15-note window from events near the playhead
      var bestTopMidi = Math.round(this.displayTopMidi);
      if (this.events && this.events.length > 0) {
        var capturedLen = this.capturedCycles || 128;
        var wrappedCycle = currentCycle % capturedLen;

        var visibleEvents = this.events.filter(function(ev) {
          var evCycle = Math.floor(ev.time) % capturedLen;
          for (var offset = -2; offset <= 2; offset++) {
            if (evCycle === ((wrappedCycle + offset) % capturedLen + capturedLen) % capturedLen) return true;
          }
          return false;
        });

        if (visibleEvents.length === 0) {
          var nearestDist = Infinity;
          var nearestEv = null;
          this.events.forEach(function(ev) {
            var evCycle = Math.floor(ev.time) % capturedLen;
            var dist = ((evCycle - wrappedCycle) % capturedLen + capturedLen) % capturedLen;
            if (dist < nearestDist) { nearestDist = dist; nearestEv = ev; }
          });
          if (nearestEv) visibleEvents = [nearestEv];
        }

        if (visibleEvents.length > 0) {
          bestTopMidi = this.findBestWindow(visibleEvents, bestTopMidi);
        }
      }

      // Smooth tracking
      if (!isFinite(bestTopMidi)) bestTopMidi = 71;
      this.displayTopMidi += (bestTopMidi - this.displayTopMidi) * 0.12;

      // Generate 30 rows: 15 above the current window + 15 for the window
      // This gives smooth scroll room in both directions
      var topBase = Math.floor(this.displayTopMidi);
      var allRows = [];
      for (var midi = topBase + 14; midi >= topBase - 15; midi--) {
        var oct = Math.floor(midi / 12) - 1;
        var sem = ((midi % 12) + 12) % 12;
        allRows.push(noteNames[sem] + oct);
      }
      var nRows = 30;

      // Size: any 15 consecutive semitones = 9 white + 6 black → same total height
      var unitH = h / (WHITES + BLACKS * BLACK_FACTOR);
      var rowLayout = [];
      var cumY = 0;
      for (var ri = 0; ri < nRows; ri++) {
        var label = allRows[ri];
        var midi = this.noteToMidi(label);
        var isBlack = midi !== null && this.isBlackKey(midi);
        var rh = isBlack ? unitH * BLACK_FACTOR : unitH;
        rowLayout.push({ label: label, midi: midi, isBlack: isBlack, y: cumY, h: rh });
        cumY += rh;
      }
      var totalHeight = cumY;
      var visibleHeight = h;

      // scrollY: align the anchor row (floor of displayTopMidi) to top of view,
      // plus fractional offset for sub-semitone smoothness
      var intPart = Math.floor(this.displayTopMidi);
      var fracPart = this.displayTopMidi - intPart;
      var anchorIdx = -1;
      for (var ri = 0; ri < nRows; ri++) {
        if (rowLayout[ri].midi === intPart) { anchorIdx = ri; break; }
      }
      if (anchorIdx >= 0) {
        this.scrollY = rowLayout[anchorIdx].y - fracPart * rowLayout[anchorIdx].h;
      }

      // Clamp
      this.totalHeight = totalHeight;
      this.visibleHeight = visibleHeight;
      var maxScroll = Math.max(0, totalHeight - visibleHeight);
      this.scrollY = Math.max(0, Math.min(maxScroll, this.scrollY));

      // Debug
      if (!this._lastDrawLog || performance.now() - this._lastDrawLog > 2000) {
        this._lastDrawLog = performance.now();
      }

      // ─── Label column (drawn OUTSIDE grid clip so labels are always visible) ───
      for (var r = 0; r < nRows; r++) {
        var rl = rowLayout[r];
        var y = rl.y - this.scrollY;

        // Skip rows outside visible area
        if (y + rl.h < 0 || y > visibleHeight) continue;

        // Label column background: black keys darker, narrower
        if (rl.isBlack) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          // Only fill a narrower strip for black keys (left side)
          ctx.fillRect(0, y, labelW - 10, rl.h);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(0, y, labelW, rl.h);
        }

        // Label text: black keys indented left, smaller
        if (rl.isBlack) {
          ctx.fillStyle = '#777788';
          ctx.font = '9px monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(rl.label, labelW - 10, y + rl.h / 2);
        } else {
          ctx.fillStyle = '#bbbcc8';
          ctx.font = '11px monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(rl.label, labelW - 6, y + rl.h / 2);
        }
      }

      // ─── Grid area (clipped so notes don't spill over labels) ───
      ctx.save();
      ctx.beginPath();
      ctx.rect(labelW + 4, 0, gridW, h);
      ctx.clip();

      // Row backgrounds and separators
      for (var r = 0; r < nRows; r++) {
        var rl = rowLayout[r];
        var y = rl.y - this.scrollY;

        // Skip rows outside visible area
        if (y + rl.h < 0 || y > visibleHeight) continue;

        // Row background: black keys darker
        if (rl.isBlack) {
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
        }
        ctx.fillRect(labelW + 4, y, gridW, rl.h);

        // Row separator
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(labelW + 4, y + rl.h);
        ctx.lineTo(labelW + 4 + gridW, y + rl.h);
        ctx.stroke();
      }

            // Note events - draw using absolute time positions
      for (var r = 0; r < nRows; r++) {
        var rl = rowLayout[r];
        var y = rl.y - this.scrollY;

        // Skip rows outside visible area
        if (y + rl.h < 0 || y > visibleHeight) continue;

        (this.events || []).forEach(function(ev) {
          if (ev.label !== rl.label) return;
          // Calculate relative position from current playhead position
          var relTime = ev.time - absoluteTime;
          var pixelOffset = relTime * gridW;
          var ex = PLAYHEAD_X + pixelOffset;
          var ew = Math.max(3, gridW / 80);
          var eh = rl.h - 2;

          if (ex + ew < labelW + 4 || ex > labelW + 4 + gridW) return;

          var dist = Math.abs(relTime);
          var alpha = Math.max(0.08, 0.75 - dist * 0.5);
          if (dist > 3) alpha = 0.05;

          ctx.fillStyle = 'rgba(255,140,140,' + alpha.toFixed(2) + ')';
          ctx.beginPath();
          ctx.roundRect(ex, y + 1, ew, eh, 2);
          ctx.fill();
        });
      }

      ctx.restore();

      // Playhead line (stationary, full height, drawn on top of everything)
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PLAYHEAD_X, 0);
      ctx.lineTo(PLAYHEAD_X, h);
      ctx.stroke();

      // Playhead triangle on top
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(PLAYHEAD_X - 5, 0);
      ctx.lineTo(PLAYHEAD_X + 5, 0);
      ctx.lineTo(PLAYHEAD_X, 6);
      ctx.closePath();
      ctx.fill();

      // Beat markers (scroll with grid, clipped to grid area)
      ctx.save();
      ctx.beginPath();
      ctx.rect(labelW + 4, 0, gridW, h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      for (var b = -8; b <= 8; b++) {
        var bx = PLAYHEAD_X + (b / 4 - ph) * gridW;
        if (bx < labelW + 4 || bx > labelW + 4 + gridW) continue;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx, h);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  /* ── Engine init ── */
  async function initEngine() {
    setStatus('Loading samples...');
    try {
      // initStrudel is global from @strudel/web script
      repl = await initStrudel({
        prebake: () => samples('samples/strudel.json'),
      });
      console.log('[repl] initialized, methods:', Object.keys(repl || {}));
      engineReady = true;
      setStatus('Ready');

      // Capture the initial cps so Stop can restore it after user setcps() calls
      try { if (typeof cps === 'function') defaultCps = Number(cps()) || 0.5; } catch(e) {}
      console.log('[repl] defaultCps captured as:', defaultCps);

      // Catch runtime errors from the pattern scheduler
      document.addEventListener('strudel.log', function(e) {
        if (e.detail && e.detail.type === 'error') {
          showError(e.detail.message || 'Runtime error');
        }
      });
    } catch (e) {
      engineReady = false;
      setStatus('Failed to load samples', 'error');
      console.error(e);
    }
  }

  /* ── Play / Pause / Stop ── */
  /* Piano roll: evaluate() returns the Pattern; we queryArc() it directly to get hap events.
   * No code wrapping, no hooks, no CustomEvents needed. */

  async function play() {
    if (!engineReady) {
      setStatus('Samples still loading...', 'error');
      return;
    }
    var code = editor.value.trim();
    if (!code) return;

    clearError();
    try {
      // .punchcard() and .pianoroll() are real Strudel visual functions.
      // Rewrite ._ variants to their non-underscore equivalents so copy-pasted
      // Strudel code works even if the loaded version only has the bare names.
      var shouldVisualize = /\._?(punchcard|pianoroll)\s*\(/.test(code);
      var evalCode = code
        .replace(/\._punchcard\s*\(/g, '.punchcard(')
        .replace(/\._pianoroll\s*\(/g, '.pianoroll(');

      if (shouldVisualize) {
        punchcard.start();
      } else {
        punchcard.stop();
      }

      // scheduler.start() sets lastTick but NOT lastBegin, so lastBegin
      // persists from initEngine time and cycles accumulate across stops.
      // Reset it to the current audio clock so cycle = cps*(now-now)+0 = 0.
      if (repl && repl.scheduler && repl.scheduler.clock) {
        try {
          repl.scheduler.lastBegin = repl.scheduler.clock.now();
        } catch(e) {}
      }

      // Bake cps reset into the evaluated code so setcps() and the pattern
      // run atomically — avoids the cyclist restarting between calls and
      // ticking forward before the pattern starts.
      var fullCode = 'setcps(' + defaultCps + ');\n' + evalCode;
      var evalPattern = await evaluate(fullCode);

      var pattern = null;
      if (repl && repl.pattern) {
        pattern = repl.pattern;
      } else if (repl && typeof repl.getPattern === 'function') {
        pattern = repl.getPattern();
      } else if (evalPattern && typeof evalPattern.queryArc === 'function') {
        pattern = evalPattern;
      }

      isPlaying = true;
      isPaused = false;
      setStatus('Playing', 'playing');

      if (pattern && shouldVisualize) punchcard.buildFromPattern(pattern);
    } catch (e) {
      showError(e.message || String(e));
      isPlaying = false;
    }
  }

  function pause() {
    // Pause just mutes audio but keeps the scheduler running
    // On next play(), it will continue from where it was
    try { evaluate('hush()'); } catch(e) {}
    try { if (typeof hush !== 'undefined') hush(); } catch(e) {}
    isPlaying = false;
    isPaused = true;
    setStatus('Paused');
    punchcard.stop();
  }

  function stop() {
    // Full stop: silence audio via direct hush(), then kill scheduler.
    // (No async evaluate() — it would restart the cyclist after our stop code.)
    try { if (typeof hush !== 'undefined') hush(); } catch(e) {}

    // Stop the scheduler and zero the cycle counter so next start = cycle 0
    if (repl && repl.scheduler) {
      if (typeof repl.scheduler.stop === 'function') {
        repl.scheduler.stop();
      }
      // Zero the cycle accumulator — setcps() adjusts this when cps changes,
      // and it carries over across stop/start cycles. When it's 0 at stop
      // time, the next setcps() keeps it at 0 regardless of tempo changes.
      repl.scheduler.num_cycles_at_cps_change = 0;
    }

    isPlaying = false;
    isPaused = false;
    setStatus('Stopped');
    punchcard.stop();
  }

  btnPlay.addEventListener('click', play);
  btnPause.addEventListener('click', pause);
  btnStop.addEventListener('click', stop);

  // keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Ctrl+Enter / Cmd+Enter to play
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      play();
    }
    // Escape to pause
    if (e.key === 'Escape' && document.activeElement !== editor) {
      pause();
    }
  });

  /* ── Preloads ── */
  const PRELOADS_BASE = 'preloads';

  async function loadPreloads() {
    try {
      const resp = await fetch(PRELOADS_BASE + '/manifest.json');
      if (!resp.ok) throw new Error('manifest: ' + resp.status);

      const preloads = await resp.json();

      if (preloads.length === 0) {
        preloadList.innerHTML = '<div class="preload-loading">No preloads yet</div>';
        return;
      }

      preloadList.innerHTML = '';
      preloads.forEach(function(entry) {
        const item = document.createElement('button');
        item.className = 'preload-item';
        item.innerHTML =
          '<span class="preload-icon">📄</span>' +
          '<span class="preload-name">' + escapeHtml(entry.name) + '</span>';
        item.addEventListener('click', function() {
          loadPreloadFile(PRELOADS_BASE + '/' + entry.file, entry.name);
        });
        preloadList.appendChild(item);
      });
    } catch (e) {
      preloadList.innerHTML =
        '<div class="preload-error">Could not load preloads: ' +
        escapeHtml(e.message) + '</div>';
      console.error(e);
    }
  }

  async function loadPreloadFile(url, name) {
    setStatus('Loading ' + name + '...');
    clearError();
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const code = await resp.text();

      editor.value = code;

      // Update active state in sidebar
      document.querySelectorAll('.preload-item').forEach(function(el) {
        el.classList.remove('active');
      });
      var items = document.querySelectorAll('.preload-item');
      items.forEach(function(el) {
        if (el.querySelector('.preload-name').textContent === name) {
          el.classList.add('active');
        }
      });
      activePreload = name;

      setStatus('Loaded: ' + name);

      // Auto-play on load
      stop();
      setTimeout(function() { play(); }, 100);

      // Close sidebar on mobile
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    } catch (e) {
      showError('Failed to load ' + name + ': ' + e.message);
    }
  }

  /* ── URL param: ?load=filename ── */
  function handleUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var loadFile = params.get('load');
    if (loadFile) {
      loadPreloadFile(PRELOADS_BASE + '/' + loadFile + '.js', loadFile);
    }
  }

  /* ── Helpers ── */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Bootstrap ── */
  initEngine();
  loadPreloads();
  handleUrlParams();

  // Keep punchcard sized on window resize
  window.addEventListener('resize', function() {
    punchcard.resize();
  });

  /* ── Auto-resize editor on window resize ── */
  // (textarea fills flex container, no manual resize needed)

  // Report ready
  console.log('%ccinnamon roll ready %cjoverval.cl/cinnamon-roll',
    'color:#ff8a8a;font-weight:bold', 'color:#888');
  console.log('[build] 189-pc8 -- query from current cycle, playhead back at left');
})();