/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaybackState, Prompt } from './types';
import { GoogleGenAI, LiveMusicFilteredPrompt } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { LiveMusicHelper } from './utils/LiveMusicHelper';
import { AudioAnalyser } from './utils/AudioAnalyser';

const model = 'lyria-realtime-exp';

function createApiKeyDialog(): Promise<string> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '1000';
    overlay.style.fontFamily = `'Google Sans', sans-serif`;

    const dialog = document.createElement('div');
    dialog.style.background = '#333';
    dialog.style.color = '#fff';
    dialog.style.padding = '2em';
    dialog.style.borderRadius = '8px';
    dialog.style.width = 'min(400px, 90vw)';
    dialog.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5)';
    dialog.style.textAlign = 'center';

    dialog.innerHTML = `
      <h2 style="margin-top: 0; font-weight: 500;">Enter Gemini API Key</h2>
      <p style="color: #ccc; margin-bottom: 1.5em; line-height: 1.5;">To use this application, please provide your API key. It will be stored securely in your browser's session storage and will not be shared.</p>
      <input type="password" id="apiKeyInput" placeholder="Enter your API Key here" style="width: 100%; padding: 0.8em; margin-bottom: 1.5em; border-radius: 4px; border: 1px solid #555; background: #222; color: #fff; font-size: 1em; box-sizing: border-box;">
      <button id="apiKeySubmit" style="width: 100%; padding: 0.8em; border: none; border-radius: 4px; background: #fff; color: #000; font-size: 1em; font-weight: 600; cursor: pointer;">Save and Start</button>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const input = document.getElementById('apiKeyInput') as HTMLInputElement;
    const button = document.getElementById('apiKeySubmit');
    
    if (button && input) {
        button.onclick = () => {
          const key = input.value.trim();
          if (key) {
            sessionStorage.setItem('gemini-api-key', key);
            document.body.removeChild(overlay);
            resolve(key);
          } else {
            input.placeholder = "API Key cannot be empty!";
            input.style.borderColor = 'red';
          }
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                button.click();
            }
        }
    }
  });
}

async function getApiKey(): Promise<string> {
  let key = sessionStorage.getItem('gemini-api-key');
  if (!key) {
    key = await createApiKeyDialog();
  }
  return key;
}


async function main() {

  const apiKey = await getApiKey();

  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });

  const initialPrompts = buildInitialPrompts();

  const pdjMidi = new PromptDjMidi(initialPrompts);
  document.body.appendChild(pdjMidi);

  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage);

  const liveMusicHelper = new LiveMusicHelper(ai, model);
  liveMusicHelper.setWeightedPrompts(initialPrompts);

  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.extraDestination = audioAnalyser.node;

  pdjMidi.addEventListener('prompts-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<Map<string, Prompt>>;
    const prompts = customEvent.detail;
    liveMusicHelper.setWeightedPrompts(prompts);
  }));

  pdjMidi.addEventListener('play-pause', () => {
    liveMusicHelper.playPause();
  });

  pdjMidi.addEventListener('start-recording', () => {
    liveMusicHelper.startRecording();
  });

  pdjMidi.addEventListener('stop-recording', async () => {
    const audioBlob = await liveMusicHelper.stopRecording();
    if (audioBlob) {
      pdjMidi.downloadRecording(audioBlob);
    }
  });

  liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<PlaybackState>;
    const playbackState = customEvent.detail;
    pdjMidi.playbackState = playbackState;
    playbackState === 'playing' ? audioAnalyser.start() : audioAnalyser.stop();
  }));

  liveMusicHelper.addEventListener('filtered-prompt', ((e: Event) => {
    const customEvent = e as CustomEvent<LiveMusicFilteredPrompt>;
    const filteredPrompt = customEvent.detail;
    toastMessage.show(filteredPrompt.filteredReason!)
    pdjMidi.addFilteredPrompt(filteredPrompt.text!);
  }));

  const infoToast = ((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const message = customEvent.detail;
    toastMessage.show(message);
  });

  const errorToast = ((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const error = customEvent.detail;
    toastMessage.show(error);
  });

  liveMusicHelper.addEventListener('error', errorToast);
  pdjMidi.addEventListener('error', errorToast);
  pdjMidi.addEventListener('info', infoToast);

  audioAnalyser.addEventListener('audio-level-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<number>;
    const level = customEvent.detail;
    pdjMidi.audioLevel = level;
  }));

}

function buildInitialPrompts() {
  // Pick 3 random prompts to start at weight = 1
  const startOn = [...DEFAULT_PROMPTS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const prompts = new Map<string, Prompt>();

  for (let i = 0; i < DEFAULT_PROMPTS.length; i++) {
    const promptId = `prompt-${i}`;
    const prompt = DEFAULT_PROMPTS[i];
    const { text, color } = prompt;
    prompts.set(promptId, {
      promptId,
      text,
      weight: startOn.includes(prompt) ? 1 : 0,
      cc: i,
      color,
    });
  }

  return prompts;
}

const DEFAULT_PROMPTS = [
  { color: '#9900ff', text: 'Bossa Nova' },
  { color: '#5200ff', text: 'Chillwave' },
  { color: '#ff25f6', text: 'Drum and Bass' },
  { color: '#2af6de', text: 'Post Punk' },
  { color: '#ffdd28', text: 'Shoegaze' },
  { color: '#2af6de', text: 'Funk' },
  { color: '#9900ff', text: 'Chiptune' },
  { color: '#3dffab', text: 'Lush Strings' },
  { color: '#d8ff3e', text: 'Sparkling Arpeggios' },
  { color: '#d9b2ff', text: 'Staccato Rhythms' },
  { color: '#3dffab', text: 'Punchy Kick' },
  { color: '#ffdd28', text: 'Dubstep' },
  { color: '#ff25f6', text: 'K Pop' },
  { color: '#d8ff3e', text: 'Neo Soul' },
  { color: '#5200ff', text: 'Trip Hop' },
  { color: '#d9b2ff', text: 'Thrash' },
];

main();
