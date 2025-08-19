import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

function App() {
  // All our state
  const [filterType, setFilterType] = useState('none');
  const [volume, setVolume] = useState(0.5);
  const [detune, setDetune] = useState(1.01);
  const [sustain, setSustain] = useState(0.5);
  const [octaver, setOctaver] = useState('off');
  const [pressedKey, setPressedKey] = useState('');
  
  // Individual waveforms for each oscillator
  const [osc1Waveform, setOsc1Waveform] = useState('sine');
  const [osc2Waveform, setOsc2Waveform] = useState('sine');
  const [osc3Waveform, setOsc3Waveform] = useState('square');
  const [osc4Waveform, setOsc4Waveform] = useState('sawtooth');
  
  // Oscillator toggles
  const [osc1Enabled, setOsc1Enabled] = useState(true);
  const [osc2Enabled, setOsc2Enabled] = useState(true);
  const [osc3Enabled, setOsc3Enabled] = useState(false);
  const [osc4Enabled, setOsc4Enabled] = useState(false);
  
  // Sequencer state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [sequence, setSequence] = useState(Array(24).fill(''));
  const [tempo, setTempo] = useState(120); // BPM
  const [sequenceLength, setSequenceLength] = useState(8); // How many steps to play
  const [selectedStep, setSelectedStep] = useState(-1); // Which step we're editing (-1 = no selection)
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const pressedKeys = useRef(new Set());
  const sequencerInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    audioContextRef.current = new AudioContext();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (sequencerInterval.current) {
        clearInterval(sequencerInterval.current);
      }
    };
  }, []);

  const frequencies = {
    'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13, 'E': 329.63,
    'F': 349.23, 'F#': 369.99, 'G': 392.00, 'G#': 415.30, 'A': 440.00,
    'A#': 466.16, 'B': 493.88, 'C2': 523.25, 'C#2': 554.37, 'D2': 587.33,
    'D#2': 622.25, 'E2': 659.25, 'F2': 698.46, 'F#2': 739.99, 'G2': 783.99,
    'G#2': 830.61, 'A2': 880.00, 'A#2': 932.33, 'B2': 987.77
  };

  const keyMapping = {
    'a': 'C', 'w': 'C#', 's': 'D', 'e': 'D#', 'd': 'E', 'f': 'F',
    't': 'F#', 'g': 'G', 'y': 'G#', 'h': 'A', 'u': 'A#', 'j': 'B',
    'k': 'C2', 'o': 'C#2', 'l': 'D2', 'p': 'D#2', ';': 'E2'
  };

  const playNote = useCallback((note: string) => {
    if (!audioContextRef.current || !note) return;
    
    setPressedKey(note);
    setTimeout(() => setPressedKey(''), 200);

    const audioContext = audioContextRef.current;
    
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const mainGainNode = audioContext.createGain();
    mainGainNode.gain.value = volume;
    
    const createOscillator = (baseFreq: number, detuneAmount: number, enabled: boolean, waveform: string) => {
      if (!enabled) return null;
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.frequency.value = baseFreq * detuneAmount;
      oscillator.type = waveform as OscillatorType;
      gainNode.gain.value = 0.25;
      
      oscillator.connect(gainNode);
      return { oscillator, gainNode };
    };
    
    const baseFreq = frequencies[note as keyof typeof frequencies];
    const oscillators = [];
    
    // Create main note oscillators with individual waveforms
    if (osc1Enabled) oscillators.push(createOscillator(baseFreq, 1.000, true, osc1Waveform));
    if (osc2Enabled) oscillators.push(createOscillator(baseFreq, detune, true, osc2Waveform));
    if (osc3Enabled) oscillators.push(createOscillator(baseFreq, 0.998, true, osc3Waveform));
    if (osc4Enabled) oscillators.push(createOscillator(baseFreq, 1.002, true, osc4Waveform));
    
    // Add octave oscillators if octaver is active
    if (octaver === 'up') {
      if (osc1Enabled) oscillators.push(createOscillator(baseFreq * 2, 1.000, true, osc1Waveform));
      if (osc2Enabled) oscillators.push(createOscillator(baseFreq * 2, detune, true, osc2Waveform));
    } else if (octaver === 'down') {
      if (osc1Enabled) oscillators.push(createOscillator(baseFreq * 0.5, 1.000, true, osc1Waveform));
      if (osc2Enabled) oscillators.push(createOscillator(baseFreq * 0.5, detune, true, osc2Waveform));
    }
    
    // Connect all oscillators through filter chain
    oscillators.forEach(osc => {
      if (!osc) return;
      
      if (filterType === 'none') {
        osc.gainNode.connect(mainGainNode);
      } else {
        const filter = audioContext.createBiquadFilter();
        
        osc.gainNode.connect(filter);
        filter.connect(mainGainNode);
        
        if (filterType === 'lowpass') {
          filter.type = 'lowpass';
          filter.frequency.value = 800;
          filter.Q.value = 10;
        } else if (filterType === 'highpass') {
          filter.type = 'highpass';
          filter.frequency.value = 600;
          filter.Q.value = 10;
        } else if (filterType === 'sweep') {
          filter.type = 'lowpass';
          filter.Q.value = 15;
          filter.frequency.setValueAtTime(2000, audioContext.currentTime);
          filter.frequency.linearRampToValueAtTime(200, audioContext.currentTime + 0.5);
        }
      }
      
      osc.oscillator.start();
      osc.oscillator.stop(audioContext.currentTime + sustain);
    });
    
    mainGainNode.connect(audioContext.destination);
  }, [filterType, volume, detune, sustain, octaver, osc1Enabled, osc2Enabled, osc3Enabled, osc4Enabled, osc1Waveform, osc2Waveform, osc3Waveform, osc4Waveform]);

  // Sequencer functions
  const startSequencer = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (sequencerInterval.current) {
        clearInterval(sequencerInterval.current);
      }
      return;
    }

    setIsPlaying(true);
    const stepDuration = (60 / tempo / 4) * 1000; // 16th notes

    sequencerInterval.current = setInterval(() => {
      setCurrentStep(prev => {
        const nextStep = (prev + 1) % sequenceLength;
        const note = sequence[nextStep];
        if (note) {
          playNote(note);
        }
        return nextStep;
      });
    }, stepDuration);
  };

  const deselectStep = () => {
    setSelectedStep(-1); // Use -1 to indicate no selection
  };

  const toggleSequenceStep = (stepIndex: number) => {
    // If clicking the already selected step, deselect it
    if (selectedStep === stepIndex) {
      setSelectedStep(-1);
      return;
    }
    
    // Otherwise select this step and toggle its note
    setSelectedStep(stepIndex);
    
    const newSequence = [...sequence];
    if (newSequence[stepIndex]) {
      // If step has a note, clear it
      newSequence[stepIndex] = '';
    } else {
      // If step is empty, add default note
      newSequence[stepIndex] = 'C';
    }
    setSequence(newSequence);
  };

  const setStepNote = (stepIndex: number, note: string) => {
    const newSequence = [...sequence];
    newSequence[stepIndex] = note;
    setSequence(newSequence);
  };

  const clearSequence = () => {
    setSequence(Array(24).fill(''));
    setCurrentStep(0);
    setSelectedStep(-1); // Also deselect when clearing
  };

  const cycleSequenceLength = () => {
    const lengths = [4, 8, 12, 16, 24];
    const currentIndex = lengths.indexOf(sequenceLength);
    setSequenceLength(lengths[(currentIndex + 1) % lengths.length]);
    setCurrentStep(0); // Reset to beginning when changing length
  };

  // Handle piano key clicks to set sequence step notes
  const handlePianoKeyClick = useCallback((note: string) => {
    // If we have a selected step (not -1), set that step's note
    if (selectedStep >= 0) {
      setStepNote(selectedStep, note);
      // Auto-advance to next step for easier programming
      const nextStep = (selectedStep + 1) % sequenceLength;
      setSelectedStep(nextStep);
    }
    // Always play the note
    playNote(note);
  }, [selectedStep, sequenceLength, playNote]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (pressedKeys.current.has(key)) return;
      
      if (keyMapping[key as keyof typeof keyMapping]) {
        event.preventDefault();
        pressedKeys.current.add(key);
        handlePianoKeyClick(keyMapping[key as keyof typeof keyMapping]);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      pressedKeys.current.delete(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handlePianoKeyClick]);

  // Control functions
  const cycleFilter = () => {
    const filters = ['none', 'lowpass', 'highpass', 'sweep'];
    const currentIndex = filters.indexOf(filterType);
    setFilterType(filters[(currentIndex + 1) % filters.length]);
  };

  const cycleDetune = () => {
    const detuneValues = [1.00, 1.005, 1.01, 1.02, 1.03];
    const currentIndex = detuneValues.indexOf(detune);
    setDetune(detuneValues[(currentIndex + 1) % detuneValues.length]);
  };

  const adjustVolume = () => {
    const volumes = [0.1, 0.3, 0.5, 0.7, 1.0];
    const currentIndex = volumes.indexOf(volume);
    setVolume(volumes[(currentIndex + 1) % volumes.length]);
  };

  const adjustSustain = () => {
    const sustainValues = [0.1, 0.3, 0.5, 1.0, 2.0, 4.0];
    const currentIndex = sustainValues.indexOf(sustain);
    setSustain(sustainValues[(currentIndex + 1) % sustainValues.length]);
  };

  const adjustTempo = () => {
    const tempos = [80, 100, 120, 140, 160];
    const currentIndex = tempos.indexOf(tempo);
    setTempo(tempos[(currentIndex + 1) % tempos.length]);
  };

  const cycleOctaver = () => {
    const positions = ['down', 'off', 'up'];
    const currentIndex = positions.indexOf(octaver);
    setOctaver(positions[(currentIndex + 1) % positions.length]);
  };

  // Waveform cycling functions
  const cycleOsc1Waveform = () => {
    const waveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    const currentIndex = waveforms.indexOf(osc1Waveform);
    setOsc1Waveform(waveforms[(currentIndex + 1) % waveforms.length]);
  };

  const cycleOsc2Waveform = () => {
    const waveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    const currentIndex = waveforms.indexOf(osc2Waveform);
    setOsc2Waveform(waveforms[(currentIndex + 1) % waveforms.length]);
  };

  const cycleOsc3Waveform = () => {
    const waveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    const currentIndex = waveforms.indexOf(osc3Waveform);
    setOsc3Waveform(waveforms[(currentIndex + 1) % waveforms.length]);
  };

  const cycleOsc4Waveform = () => {
    const waveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    const currentIndex = waveforms.indexOf(osc4Waveform);
    setOsc4Waveform(waveforms[(currentIndex + 1) % waveforms.length]);
  };

  // Rotation calculations
  const getFilterRotation = () => {
    const filters = ['none', 'lowpass', 'highpass', 'sweep'];
    return filters.indexOf(filterType) * 45;
  };

  const getDetuneRotation = () => {
    const detuneValues = [1.00, 1.005, 1.01, 1.02, 1.03];
    return detuneValues.indexOf(detune) * 36;
  };

  const getVolumeRotation = () => {
    const volumes = [0.1, 0.3, 0.5, 0.7, 1.0];
    return volumes.indexOf(volume) * 36;
  };

  const getSustainRotation = () => {
    const sustainValues = [0.1, 0.3, 0.5, 1.0, 2.0, 4.0];
    return sustainValues.indexOf(sustain) * 30;
  };

  const getTempoRotation = () => {
    const tempos = [80, 100, 120, 140, 160];
    return tempos.indexOf(tempo) * 36;
  };

  const getWaveformRotation = (waveform: string) => {
    const waveforms = ['sine', 'square', 'sawtooth', 'triangle'];
    return waveforms.indexOf(waveform) * 45;
  };

  const getSwitchPosition = () => {
    if (octaver === 'up') return 'translate(-50%, -8px)';
    if (octaver === 'down') return 'translate(-50%, 8px)';
    return 'translate(-50%, 0px)';
  };

  const getWaveformSymbol = (waveform: string) => {
    const symbols = {
      'sine': '∿',
      'square': '⊏',
      'sawtooth': '⟋',
      'triangle': '△'
    };
    return symbols[waveform as keyof typeof symbols] || '?';
  };

  return (
    <div className="App">
      <div className="op1-container">
        {/* Top Section - Main Controls */}
        <div className="top-section">
          <div className="modern-speaker"></div>
          <div className="screen-area">
            <div className="screen">
              <div>Filter: {filterType.toUpperCase()}</div>
              <div>Seq Step: {selectedStep >= 0 ? `${selectedStep + 1} (${sequence[selectedStep] || 'Empty'})` : 'None Selected'}</div>
              <div>Length: {sequenceLength} Tempo: {tempo}</div>
              <div>Oct: {octaver.toUpperCase()}</div>
            </div>
          </div>
          <div className="control-knobs">
            <div className="knob-container">
              <div 
                className="knob orange clickable" 
                onClick={cycleFilter}
                title="Filter Type"
              >
                <div 
                  className="knob-indicator"
                  style={{ transform: `translateX(-50%) rotate(${getFilterRotation()}deg)` }}
                ></div>
              </div>
              <div className="knob-label">FILTER</div>
            </div>
            
            <div className="knob-container">
              <div 
                className="knob orange clickable"
                onClick={cycleDetune}
                title="Detune"
              >
                <div 
                  className="knob-indicator"
                  style={{ transform: `translateX(-50%) rotate(${getDetuneRotation()}deg)` }}
                ></div>
              </div>
              <div className="knob-label">DETUNE</div>
            </div>
            
            <div className="knob-container">
              <div 
                className="knob orange clickable"
                onClick={adjustSustain}
                title="Sustain"
              >
                <div 
                  className="knob-indicator"
                  style={{ transform: `translateX(-50%) rotate(${getSustainRotation()}deg)` }}
                ></div>
              </div>
              <div className="knob-label">SUSTAIN</div>
            </div>
            
            <div className="knob-container">
              <div 
                className="knob orange clickable"
                onClick={adjustVolume}
                title="Volume"
              >
                <div 
                  className="knob-indicator"
                  style={{ transform: `translateX(-50%) rotate(${getVolumeRotation()}deg)` }}
                ></div>
              </div>
              <div className="knob-label">VOLUME</div>
            </div>
          </div>
        </div>

        {/* Oscillator Controls Section */}
        <div className="oscillator-controls-section">
          <div className="oscillator-panel">
            <div className="panel-title">OSCILLATORS</div>
            
            <div className="oscillator-grid">
              {/* OSC 1 */}
              <div className="oscillator-control">
                <button 
                  className={`toggle-btn ${osc1Enabled ? 'active' : ''}`}
                  onClick={() => setOsc1Enabled(!osc1Enabled)}
                >
                  1
                </button>
                <div 
                  className="mini-knob clickable"
                  onClick={cycleOsc1Waveform}
                  title={`OSC1: ${osc1Waveform}`}
                >
                  <div 
                    className="mini-knob-indicator"
                    style={{ transform: `translateX(-50%) rotate(${getWaveformRotation(osc1Waveform)}deg)` }}
                  ></div>
                </div>
                <div className="wave-display">{getWaveformSymbol(osc1Waveform)}</div>
              </div>

              {/* OSC 2 */}
              <div className="oscillator-control">
                <button 
                  className={`toggle-btn ${osc2Enabled ? 'active' : ''}`}
                  onClick={() => setOsc2Enabled(!osc2Enabled)}
                >
                  2
                </button>
                <div 
                  className="mini-knob clickable"
                  onClick={cycleOsc2Waveform}
                  title={`OSC2: ${osc2Waveform}`}
                >
                  <div 
                    className="mini-knob-indicator"
                    style={{ transform: `translateX(-50%) rotate(${getWaveformRotation(osc2Waveform)}deg)` }}
                  ></div>
                </div>
                <div className="wave-display">{getWaveformSymbol(osc2Waveform)}</div>
              </div>

              {/* OSC 3 */}
              <div className="oscillator-control">
                <button 
                  className={`toggle-btn ${osc3Enabled ? 'active' : ''}`}
                  onClick={() => setOsc3Enabled(!osc3Enabled)}
                >
                  3
                </button>
                <div 
                  className="mini-knob clickable"
                  onClick={cycleOsc3Waveform}
                  title={`OSC3: ${osc3Waveform}`}
                >
                  <div 
                    className="mini-knob-indicator"
                    style={{ transform: `translateX(-50%) rotate(${getWaveformRotation(osc3Waveform)}deg)` }}
                  ></div>
                </div>
                <div className="wave-display">{getWaveformSymbol(osc3Waveform)}</div>
              </div>

              {/* OSC 4 */}
              <div className="oscillator-control">
                <button 
                  className={`toggle-btn ${osc4Enabled ? 'active' : ''}`}
                  onClick={() => setOsc4Enabled(!osc4Enabled)}
                >
                  4
                </button>
                <div 
                  className="mini-knob clickable"
                  onClick={cycleOsc4Waveform}
                  title={`OSC4: ${osc4Waveform}`}
                >
                  <div 
                    className="mini-knob-indicator"
                    style={{ transform: `translateX(-50%) rotate(${getWaveformRotation(osc4Waveform)}deg)` }}
                  ></div>
                </div>
                <div className="wave-display">{getWaveformSymbol(osc4Waveform)}</div>
              </div>
            </div>
          </div>

          {/* Sequencer Controls */}
          <div className="sequencer-panel">
            <div className="panel-title">SEQUENCER</div>
            <div className="sequencer-controls">
              <button 
                className={`seq-btn ${isPlaying ? 'playing' : ''}`}
                onClick={startSequencer}
                title="Play/Pause"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button 
                className="seq-btn" 
                onClick={clearSequence}
                title="Clear sequence"
              >
                ⏹
              </button>
              <button 
                className="seq-btn" 
                onClick={deselectStep}
                title="Deselect step - play piano freely"
              >
                ◯
              </button>
              <button 
                className="seq-btn" 
                onClick={cycleSequenceLength}
                title={`Length: ${sequenceLength} steps`}
              >
                {sequenceLength}
              </button>
              <div 
                className="mini-knob clickable"
                onClick={adjustTempo}
                title={`Tempo: ${tempo} BPM`}
              >
                <div 
                  className="mini-knob-indicator"
                  style={{ transform: `translateX(-50%) rotate(${getTempoRotation()}deg)` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Octaver Switch */}
          <div className="octaver-container">
            <div className="switch-label">OCTAVER</div>
            <div className="switch-track" onClick={cycleOctaver}>
              <div 
                className="switch-handle"
                style={{ transform: getSwitchPosition() }}
              ></div>
              <div className="switch-labels">
                <span className="switch-up">+</span>
                <span className="switch-center">•</span>
                <span className="switch-down">-</span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Section - Function Buttons (Now Sequencer Steps) */}
        <div className="middle-section">
          <div className="function-buttons">
            {Array.from({length: 24}, (_, i) => (
              <button 
                key={i} 
                className={`function-btn ${
                  currentStep === i && isPlaying ? 'current-step' : ''
                } ${
                  sequence[i] ? 'has-note' : ''
                } ${
                  selectedStep === i ? 'selected-step' : ''
                } ${
                  i >= sequenceLength ? 'disabled-step' : ''
                }`}
                onClick={() => {
                  if (i < sequenceLength) {
                    toggleSequenceStep(i);
                  }
                }}
                title={`Step ${i + 1}: ${sequence[i] || 'Empty'} ${i >= sequenceLength ? '(Disabled)' : ''}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          
          {/* Black keys moved down more */}
          <div className="black-keys-row">
            <button onClick={() => handlePianoKeyClick('C#')} className={`black-key ${pressedKey === 'C#' ? 'pressed' : ''}`}>•</button>
            <button onClick={() => handlePianoKeyClick('D#')} className={`black-key ${pressedKey === 'D#' ? 'pressed' : ''}`}>•</button>
            <div className="black-key-spacer"></div>
            <button onClick={() => handlePianoKeyClick('F#')} className={`black-key ${pressedKey === 'F#' ? 'pressed' : ''}`}>•</button>
            <button onClick={() => handlePianoKeyClick('G#')} className={`black-key ${pressedKey === 'G#' ? 'pressed' : ''}`}>•</button>
            <button onClick={() => handlePianoKeyClick('A#')} className={`black-key ${pressedKey === 'A#' ? 'pressed' : ''}`}>•</button>
            <div className="black-key-spacer"></div>
            <button onClick={() => handlePianoKeyClick('C#2')} className={`black-key ${pressedKey === 'C#2' ? 'pressed' : ''}`}>•</button>
            <button onClick={() => handlePianoKeyClick('D#2')} className={`black-key ${pressedKey === 'D#2' ? 'pressed' : ''}`}>•</button>
            <div className="black-key-spacer"></div>
            <button onClick={() => handlePianoKeyClick('F#2')} className={`black-key ${pressedKey === 'F#2' ? 'pressed' : ''}`}>•</button>
            <button onClick={() => handlePianoKeyClick('G#2')} className={`black-key ${pressedKey === 'G#2' ? 'pressed' : ''}`}>•</button>
            <button onClick={() => handlePianoKeyClick('A#2')} className={`black-key ${pressedKey === 'A#2' ? 'pressed' : ''}`}>•</button>
          </div>
        </div>

        {/* Bottom Section - Piano Keys (Now also sequence note input) */}
        <div className="bottom-section">
          <div className="piano-keys">
            {['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2'].map(note => (
              <button 
                key={note}
                onClick={() => handlePianoKeyClick(note)} 
                className={`piano-key ${pressedKey === note ? 'pressed' : ''}`}
                title={selectedStep >= 0 ? `Set step ${selectedStep + 1} to ${note}` : `Play ${note}`}
              >
                {note}
              </button>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="instructions">
          <small>
            Select steps (1-24) • ◯ to deselect • Piano keys set notes/play
          </small>
        </div>
      </div>
    </div>
  );
}

export default App;