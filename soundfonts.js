// soundfonts.js — lightweight GM soundfont loader for Strudel
// Uses registerSound (from @strudel/web@1.3.0) to register GM instruments
// as first-class sounds alongside WAV sample banks. Soundfont data loaded
// on-demand from felixroos.github.io/webaudiofontdata.
//
// Usage: loadSoundfonts() — call once after initStrudel resolves.
// Instruments become available as s("gm_violin"), s("gm_acoustic_bass"), etc.

(function() {
  'use strict';

  // CDN base URL for soundfont preset files
  var SF_URL = 'https://felixroos.github.io/webaudiofontdata/sound/';

  // --- GM instrument registry ---
  // Each entry: name -> [preset_id, ...]  (first preset is the default/best)
  var GM = {
    // Pianos / Chromatic
    gm_harpsichord:   ['0060_FluidR3_GM_sf2_file', '0060_JCLive_sf2_file', '0060_Aspirin_sf2_file'],
    gm_celesta:       ['0080_FluidR3_GM_sf2_file', '0080_JCLive_sf2_file'],
    gm_music_box:     ['0100_FluidR3_GM_sf2_file'],
    gm_vibraphone:    ['0110_FluidR3_GM_sf2_file'],
    gm_marimba:       ['0120_FluidR3_GM_sf2_file'],
    gm_glockenspiel:  ['0090_FluidR3_GM_sf2_file'],

    // Organ
    gm_drawbar_organ:    ['0160_FluidR3_GM_sf2_file'],
    gm_rock_organ:       ['0180_FluidR3_GM_sf2_file'],
    gm_church_organ:     ['0190_FluidR3_GM_sf2_file'],
    gm_reed_organ:       ['0200_FluidR3_GM_sf2_file'],

    // Guitar
    gm_acoustic_guitar_nylon: ['0240_FluidR3_GM_sf2_file', '0240_LK_Godin_Nylon_SF2_file'],
    gm_acoustic_guitar_steel: ['0250_FluidR3_GM_sf2_file', '0253_Acoustic_Guitar_sf2_file'],

    // Bass
    gm_acoustic_bass:        ['0320_FluidR3_GM_sf2_file', '0320_JCLive_sf2_file'],
    gm_electric_bass_finger: ['0330_FluidR3_GM_sf2_file'],

    // Strings
    gm_violin:              ['0400_FluidR3_GM_sf2_file', '0400_JCLive_sf2_file'],
    gm_viola:               ['0410_FluidR3_GM_sf2_file'],
    gm_cello:               ['0420_FluidR3_GM_sf2_file'],
    gm_contrabass:          ['0430_FluidR3_GM_sf2_file'],
    gm_string_ensemble_1:   ['0480_FluidR3_GM_sf2_file', '0480_JCLive_sf2_file'],
    gm_tremolo_strings:     ['0440_FluidR3_GM_sf2_file'],
    gm_pizzicato_strings:   ['0450_FluidR3_GM_sf2_file'],
    gm_orchestral_harp:     ['0460_FluidR3_GM_sf2_file'],

    // Brass
    gm_trumpet:         ['0560_FluidR3_GM_sf2_file', '0560_JCLive_sf2_file'],
    gm_trombone:        ['0570_FluidR3_GM_sf2_file'],
    gm_tuba:            ['0580_FluidR3_GM_sf2_file'],
    gm_french_horn:     ['0600_FluidR3_GM_sf2_file'],
    gm_brass_section:   ['0610_FluidR3_GM_sf2_file'],

    // Woodwinds
    gm_flute:           ['0730_FluidR3_GM_sf2_file', '0730_JCLive_sf2_file'],
    gm_clarinet:        ['0710_FluidR3_GM_sf2_file', '0710_JCLive_sf2_file'],
    gm_oboe:            ['0680_FluidR3_GM_sf2_file', '0680_JCLive_sf2_file'],
    gm_bassoon:         ['0700_FluidR3_GM_sf2_file', '0700_JCLive_sf2_file'],
    gm_pan_flute:       ['0750_FluidR3_GM_sf2_file', '0750_JCLive_sf2_file'],
    gm_recorder:        ['0740_FluidR3_GM_sf2_file'],

    // Sax
    gm_soprano_sax:     ['0640_FluidR3_GM_sf2_file', '0640_JCLive_sf2_file'],
    gm_alto_sax:        ['0650_FluidR3_GM_sf2_file', '0650_JCLive_sf2_file'],
    gm_tenor_sax:       ['0660_JCLive_sf2_file', '0660_GeneralUserGS_sf2_file'],

    // Choir / Voice
    gm_choir_aahs:      ['0520_FluidR3_GM_sf2_file'],
    gm_voice_oohs:      ['0530_FluidR3_GM_sf2_file'],

    // Synth
    gm_pad_warm:        ['0890_FluidR3_GM_sf2_file'],
    gm_pad_choir:       ['0910_FluidR3_GM_sf2_file'],
    gm_pad_bowed:       ['0920_JCLive_sf2_file', '0920_GeneralUserGS_sf2_file'],
    gm_pad_halo:        ['0940_FluidR3_GM_sf2_file'],

    // Ethnic
    gm_sitar:           ['1040_FluidR3_GM_sf2_file'],
    gm_koto:            ['1070_FluidR3_GM_sf2_file'],
    gm_kalimba:         ['1080_FluidR3_GM_sf2_file'],
    gm_banjo:           ['1050_FluidR3_GM_sf2_file'],

    // Tuned percussion
    gm_timpani:         ['0470_FluidR3_GM_sf2_file']
  };

  // --- Cache ---
  // presetCache: presetId -> parsed zones array
  var presetCache = {};
  // bufferCache: "presetId:midi" -> AudioBuffer
  var bufferCache = {};
  // registered: set of instrument names already registered
  var registered = {};

  // --- Helpers ---

  function noteToMidi(label) {
    if (typeof label === 'number') return Math.round(label);
    if (typeof label !== 'string') return null;
    var m = label.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
    if (!m) return null;
    var noteMap = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
    var base = noteMap[m[1].toUpperCase()];
    var alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
    var oct = parseInt(m[3]);
    return (oct + 1) * 12 + base + alter;
  }

  function getMidiFromHap(hapValue) {
    if (hapValue == null) return 60;
    // note() produces {note: number} (MIDI) or scale produces {note: "C3"} (string)
    if (hapValue.note != null) {
      if (typeof hapValue.note === 'number') return Math.round(hapValue.note);
      var m = noteToMidi(String(hapValue.note));
      if (m != null) return m;
    }
    // n is semitone offset from C4 (MIDI 60)
    if (hapValue.n != null) return 60 + parseInt(hapValue.n);
    // freq
    if (hapValue.freq) return Math.round(12 * Math.log2(hapValue.freq / 440) + 69);
    // value
    if (hapValue.value != null) {
      if (typeof hapValue.value === 'number') return Math.round(hapValue.value) + 60;
      var mv = noteToMidi(String(hapValue.value));
      if (mv != null) return mv;
    }
    return 60; // default to C4
  }

  // --- Preset loading ---

  function loadPreset(presetId) {
    if (presetCache[presetId]) return presetCache[presetId];
    var promise = fetch(SF_URL + presetId + '.js')
      .then(function(resp) { return resp.text(); })
      .then(function(js) {
        // Each .js file defines: var _tone_NNNN_Name_sf2_file = {...}
        // Extract the variable name and eval in a controlled scope
        var match = js.match(/var\s+(_tone_\w+)\s*=\s*(\{[\s\S]*\})/);
        if (!match) throw new Error('Cannot parse preset: ' + presetId);
        var varName = match[1];
        var objStr = match[2];
        // Eval in a scope that returns the object
        var fn = new Function('return ' + objStr);
        var data = fn();
        presetCache[presetId] = data.zones || [];
        return presetCache[presetId];
      })
      .catch(function(err) {
        console.warn('[soundfonts] failed to load preset ' + presetId + ':', err.message);
        presetCache[presetId] = null; // don't retry
        throw err;
      });
    presetCache[presetId] = promise;
    return promise;
  }

  // --- Zone lookup ---

  function findZone(zones, midi) {
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (midi >= z.keyRangeLow && midi <= z.keyRangeHigh) return z;
    }
    // Fallback: return the zone whose center is closest to the target midi
    var best = null, bestDist = Infinity;
    for (var j = 0; j < zones.length; j++) {
      var z2 = zones[j];
      var center = (z2.keyRangeLow + z2.keyRangeHigh) / 2;
      var dist = Math.abs(center - midi);
      if (dist < bestDist) { bestDist = dist; best = z2; }
    }
    return best;
  }

  // --- Buffer decode ---

  // Returns {buffer: AudioBuffer, origMidi: number}
  function getBufferData(presetId, midi) {
    var key = presetId + ':' + midi;
    if (bufferCache[key]) return bufferCache[key];
    var promise = loadPreset(presetId).then(function(zones) {
      if (!zones || !zones.length) throw new Error('No zones for ' + presetId);
      var zone = findZone(zones, midi);
      if (!zone) throw new Error('No zone for midi ' + midi + ' in ' + presetId);
      return decodeZone(zone).then(function(buf) {
        var origMidi = zone.originalPitch ? zone.originalPitch / 100 : midi;
        return { buffer: buf, origMidi: origMidi };
      });
    });
    bufferCache[key] = promise;
    return promise;
  }

  function decodeZone(zone) {
    // zone.file is base64-encoded WAV (8-bit or 16-bit PCM)
    if (!zone.file) throw new Error('Zone has no file data');
    var binaryStr = atob(zone.file);
    var len = binaryStr.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
    // Must use strudel's AudioContext so buffers are compatible
    var ctx = getSfCtx();
    return ctx.decodeAudioData(bytes.buffer.slice(0));
  }

  // Get strudel's AudioContext. Must NOT shadow the global getAudioContext!
  function getSfCtx() {
    try {
      if (typeof getAudioContext === 'function') {
        var ctx = getAudioContext();
        if (ctx && ctx.state !== 'closed') return ctx;
      }
    } catch(e) {}
    // Fallback: creates a one-off context (note: buffers on this context
    // won't play through strudel's pipeline — only used as last resort)
    return new (window.AudioContext || window.webkitAudioContext)();
  }

  // --- Playback ---

  function playNote(presetIds, midi, deadline, cps) {
    // Get strudel's AudioContext — must succeed or we bail
    var ctx;
    try { ctx = getSfCtx(); } catch(e) {}
    if (!ctx || ctx.state === 'closed') return;

    var when = typeof deadline === 'number' ? deadline : ctx.currentTime;

    var tried = 0;
    function tryNext() {
      if (tried >= presetIds.length) {
        console.warn('[soundfonts] all presets failed for midi', midi);
        return;
      }
      var presetId = presetIds[tried];
      tried++;
      return getBufferData(presetId, midi).then(function(data) {
        var src = ctx.createBufferSource();
        src.buffer = data.buffer;
        var rate = Math.pow(2, (midi - data.origMidi) / 12);
        src.playbackRate.value = rate;

        // Connect directly to destination (strudel effects chain handles gain/room/delay)
        src.connect(ctx.destination);
        src.start(when);

        return function(endTime) {
          var stopAt = endTime || ctx.currentTime + src.buffer.duration / rate;
          try { src.stop(stopAt); } catch(e) {}
        };
      }).catch(function(err) {
        console.warn('[soundfonts] preset ' + presetId + ' failed:', err.message);
        return tryNext();
      });
    }
    return tryNext();
  }

  // --- Registration ---

  function registerSoundfonts() {
    if (typeof registerSound !== 'function') {
      console.warn('[soundfonts] registerSound not available — is @strudel/web@1.3.0 loaded?');
      return;
    }

    // Debug: log first few notes to verify MIDI extraction
    var noteCounts = {};

    Object.keys(GM).forEach(function(name) {
      if (registered[name]) return;
      registered[name] = true;

      var presetIds = GM[name];

      registerSound(name, function(begin, hapValue, deadline, cps) {
        var cnt = (noteCounts[name] || 0) + 1;
        noteCounts[name] = cnt;
        var midi = getMidiFromHap(hapValue);
        if (cnt <= 3) {
          console.log('[soundfonts] ' + name + ' #' + cnt + ': midi=' + midi + ' hap=' + JSON.stringify(hapValue));
        }
        return playNote(presetIds, midi, deadline, cps);
      });
    });

    console.log('[soundfonts] registered ' + Object.keys(GM).length + ' GM instruments');
  }

  // --- Export helper: list soundfont names used in code ---

  function getSoundfontNames() {
    return Object.keys(GM);
  }

  // --- Export helper: pre-warm a specific sf instrument (call before export) ---

  function warmSoundfont(name) {
    var presets = GM[name];
    if (!presets || !presets.length) return Promise.resolve();
    // Pre-load the first preset: decode middle C
    return getBufferData(presets[0], 60).catch(function() {});
  }

  // --- Public API ---
  window.soundfonts = {
    register: registerSoundfonts,
    list: getSoundfontNames,
    warm: warmSoundfont
  };

  console.log('[soundfonts] loader ready — call soundfonts.register() after initStrudel');
})();