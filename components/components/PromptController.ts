/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { MidiDispatcher } from '../utils/MidiDispatcher';
import type { Prompt, ControlChange } from '../types';

/** A single prompt input associated with a MIDI CC. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  static override styles = css`
    .prompt {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      position: relative;
    }

    .slider-container {
      width: 40%;
      height: 70%;
      background-color: #0003;
      border-radius: 1vmin;
      cursor: ns-resize;
      position: relative;
      overflow: hidden;
      border: 0.15vmin solid #fff4;
      touch-action: none;
    }

    .slider-track {
      position: absolute;
      bottom: 0;
      width: 100%;
      background-color: var(--prompt-color, #888);
      border-radius: 1vmin;
    }
    
    .slider-thumb {
      position: absolute;
      width: 120%;
      left: -10%;
      height: 0.8vmin;
      background-color: #fff;
      border-radius: 0.2vmin;
      box-shadow: 0 0 1vmin #0008;
      pointer-events: none; /* important for dragging */
    }

    #midi {
      font-family: monospace;
      text-align: center;
      font-size: 1.5vmin;
      border: 0.2vmin solid #fff;
      border-radius: 0.5vmin;
      padding: 2px 5px;
      color: #fff;
      background: #0006;
      cursor: pointer;
      visibility: hidden;
      user-select: none;
      margin-top: 0.75vmin;
    }
    
    .learn-mode #midi {
      color: orange;
      border-color: orange;
    }
    
    .show-cc #midi {
      visibility: visible;
    }

    #text {
      font-weight: 500;
      font-size: 1.8vmin;
      max-width: 17vmin;
      min-width: 2vmin;
      padding: 0.1em 0.3em;
      margin-top: 1vmin;
      flex-shrink: 0;
      border-radius: 0.25vmin;
      text-align: center;
      white-space: pre;
      overflow: hidden;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      background: #000;
      color: #fff;
    }
    
    #text:not(:focus) {
      text-overflow: ellipsis;
    }

    :host([filtered]) .slider-track {
      background-color: #888;
      opacity: 0.5;
    }
    
    :host([filtered]) #text {
      background: #da2000;
      z-index: 1;
    }

    @media only screen and (max-width: 600px) {
      #text {
        font-size: 2.3vmin;
      }
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '';
  @property({ type: Boolean, reflect: true }) filtered = false;

  @property({ type: Number }) cc = 0;
  @property({ type: Number }) channel = 0; // Not currently used

  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;

  @query('.slider-container') private sliderContainer!: HTMLDivElement;
  @query('#text') private textInput!: HTMLInputElement;

  @property({ type: Object })
  midiDispatcher: MidiDispatcher | null = null;

  private lastValidText!: string;

  constructor() {
    super();
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  override connectedCallback() {
    super.connectedCallback();
    this.midiDispatcher?.addEventListener('cc-message', (e: Event) => {
      const customEvent = e as CustomEvent<ControlChange>;
      const { channel, cc, value } = customEvent.detail;
      if (this.learnMode) {
        this.cc = cc;
        this.channel = channel;
        this.learnMode = false;
        this.dispatchPromptChange();
      } else if (cc === this.cc) {
        this.weight = (value / 127) * 2;
        this.dispatchPromptChange();
      }
    });
  }

  override firstUpdated() {
    // contenteditable is applied to textInput so we can "shrink-wrap" to text width
    // It's set here and not render() because Lit doesn't believe it's a valid attribute.
    this.textInput.setAttribute('contenteditable', 'plaintext-only');

    // contenteditable will do weird things if this is part of the template.
    this.textInput.textContent = this.text;
    this.lastValidText = this.text;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('showCC') && !this.showCC) {
      this.learnMode = false;
    }
    if (changedProperties.has('text') && this.textInput) {
      this.textInput.textContent = this.text;
    }
    super.update(changedProperties);
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          cc: this.cc,
          color: this.color,
        },
      }),
    );
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.textInput.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.resetText();
      this.textInput.blur();
    }
  }

  private resetText() {
    this.text = this.lastValidText;
    this.textInput.textContent = this.lastValidText;
  }

  private async updateText() {
    const newText = this.textInput.textContent?.trim();
    if (!newText) {
      this.resetText();
    } else {
      this.text = newText;
      this.lastValidText = newText;
    }
    this.dispatchPromptChange();
    // Show the prompt from the beginning if it's cropped
    this.textInput.scrollLeft = 0;
  }

  private onFocus() {
    // .select() for contenteditable doesn't work.
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(this.textInput);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    document.body.classList.add('dragging');
    this.updateWeightFromEvent(e);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove(e: PointerEvent) {
    this.updateWeightFromEvent(e);
  }

  private handlePointerUp() {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.body.classList.remove('dragging');
  }

  private updateWeightFromEvent(e: PointerEvent) {
    const rect = this.sliderContainer.getBoundingClientRect();
    const rawY = (e.clientY - rect.top) / rect.height;
    // rawY is 0 at top, 1 at bottom. We want the opposite.
    const normalizedY = 1 - rawY; 
    
    // Weight is from 0 to 2
    this.weight = Math.max(0, Math.min(2, normalizedY * 2));
    this.dispatchPromptChange();
  }


  private toggleLearnMode() {
    this.learnMode = !this.learnMode;
  }

  override render() {
    const classes = classMap({
      'prompt': true,
      'learn-mode': this.learnMode,
      'show-cc': this.showCC,
    });

    const weightPercent = (this.weight / 2) * 100;
    
    const sliderTrackStyle = styleMap({
      'height': `${weightPercent}%`,
      '--prompt-color': this.color,
    });

    const sliderThumbStyle = styleMap({
       'bottom': `${weightPercent}%`
    });

    return html`
      <div class=${classes}>
        <div class="slider-container" @pointerdown=${this.handlePointerDown}>
          <div class="slider-track" style=${sliderTrackStyle}></div>
          <div class="slider-thumb" style=${sliderThumbStyle}></div>
        </div>
        <span
          id="text"
          spellcheck="false"
          @focus=${this.onFocus}
          @keydown=${this.onKeyDown}
          @blur=${this.updateText}></span>
        <div id="midi" @click=${this.toggleLearnMode}>
          ${this.learnMode ? 'Learn' : `CC:${this.cc}`}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}
