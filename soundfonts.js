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
    if (presetCache[presetId] === null) return Promise.reject(new Error('Preset ' + presetId + ' previously failed'));
    if (presetCache[presetId]) return Promise.resolve(presetCache[presetId]);
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

  function getAdsrDefaults(hapValue) {
    // Replicates @strudel/soundfonts getADSRValues behavior
    var a = hapValue && hapValue.attack;
    var d = hapValue && hapValue.decay;
    var s = hapValue && hapValue.sustain;
    var r = hapValue && hapValue.release;
    if (a == null && d == null && s == null && r == null) return [0.001, 0.001, 1, 0.01];
    var sustain = s != null ? s : (a != null && d == null) || (a == null && d == null) ? 1 : 0.001;
    return [Math.max(a || 0, 0.001), Math.max(d || 0, 0.001), Math.min(sustain, 1), Math.max(r || 0, 0.01)];
  }

  function applyAdsr(gainParam, adsr, max, begin, end) {
    // Replicates @strudel/webaudio getParamADSR with linear ramps
    var attack = adsr[0], decay = adsr[1], sustain = adsr[2], release = adsr[3];
    var min = 0.00001;  // near zero (strudel uses 0, but 0 causes issues with linear)
    var range = max - min;
    var sustainGain = min + sustain * range;
    var noteDur = end - begin;

    gainParam.setValueAtTime(min, begin);

    if (attack > noteDur) {
      // Attack longer than note: ramp partway to max
      var partial = min + (noteDur / attack) * range;
      gainParam.linearRampToValueAtTime(partial, end);
    } else if (attack + decay > noteDur) {
      // Attack+decay exceeds note: attack ramp, then partial decay
      gainParam.linearRampToValueAtTime(max, begin + attack);
      var decayFrac = (noteDur - attack) / decay;
      var decayGain = max - decayFrac * (max - sustainGain);
      gainParam.linearRampToValueAtTime(decayGain, end);
    } else {
      // Full ADSR
      gainParam.linearRampToValueAtTime(max, begin + attack);
      gainParam.linearRampToValueAtTime(sustainGain, begin + attack + decay);
      gainParam.setValueAtTime(sustainGain, end);
    }

    // Release
    gainParam.linearRampToValueAtTime(min, end + release);

    return end + release + 0.01;  // stop time
  }

  // --- Playback ---

  function playNote(presetIds, midi, beginTime, cps, hapValue) {
    var ctx;
    try { ctx = getSfCtx(); } catch(e) {}
    if (!ctx || ctx.state === 'closed') return;

    var begin = typeof beginTime === 'number' ? beginTime : ctx.currentTime;
    var duration = (hapValue && typeof hapValue.duration === 'number')
      ? hapValue.duration / (cps || 0.5)
      : 2;
    var gainVal = (hapValue && typeof hapValue.gain === 'number') ? hapValue.gain : 1;
    var adsr = getAdsrDefaults(hapValue);

    var tried = 0;
    function tryNext() {
      if (tried >= presetIds.length) { return; }
      var presetId = presetIds[tried];
      tried++;
      return getBufferData(presetId, midi).then(function(data) {
        var src = ctx.createBufferSource();
        src.buffer = data.buffer;
        var rate = Math.pow(2, (midi - data.origMidi) / 12);
        src.playbackRate.value = rate;

        var gainNode = ctx.createGain();
        var stopTime = applyAdsr(gainNode.gain, adsr, gainVal, begin, begin + duration);

        // DEBUG: log every note's timing
        console.log('[sf] note=' + (hapValue && hapValue.note) + ' midi=' + midi +
          ' begin=' + begin.toFixed(3) + ' dur=' + duration.toFixed(2) +
          's end=' + (begin + duration).toFixed(3) +
          ' release=' + adsr[3].toFixed(3) +
          ' stop=' + stopTime.toFixed(3) +
          ' sustain=' + adsr[2].toFixed(3) +
          ' a/d=' + adsr[0].toFixed(3) + '/' + adsr[1].toFixed(3));

        try {
          if (typeof connectToDestination === 'function') {
            connectToDestination(gainNode, 2);
          } else {
            gainNode.connect(ctx.destination);
          }
        } catch(e) {
          gainNode.connect(ctx.destination);
        }
        src.connect(gainNode);
        src.start(begin);
        src.stop(stopTime);

        return function() {};  // no cleanup needed, envelope handles fade
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

    Object.keys(GM).forEach(function(name) {
      if (registered[name]) return;
      registered[name] = true;

      var presetIds = GM[name];

      registerSound(name, function(begin, hapValue, deadline, cps) {
        var midi = getMidiFromHap(hapValue);
        return playNote(presetIds, midi, begin, cps, hapValue);
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