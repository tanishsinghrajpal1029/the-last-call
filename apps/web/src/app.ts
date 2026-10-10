/** Starts one run in a container. Shared by the web app and the Qollab page. */

import { Provider } from "../../../packages/core/src/game.js";
import { NightsFile } from "../../../packages/core/src/nights.js";
import { Audio } from "./audio.js";
import { Controller, Settings } from "./controller.js";
import { Ui, UiMode } from "./ui.js";

export interface Running {
  controller: Controller;
  ui: Ui;
  audio: Audio;
  dispose: () => void;
}

export function defaultSettings(): Settings {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { voice: true, sound: true, gentle: false, meter: true, reducedMotion: reduced };
}

export function startRun(container: HTMLElement, nights: NightsFile, seed: string, provider: Provider, sourceLabel: string,
  settings: Settings, mode: UiMode = "screen"): Running {
  const audio = new Audio();
  audio.voice = settings.voice;
  audio.sound = settings.sound;
  audio.gentle = settings.gentle;
  const controller = new Controller(nights, seed, provider, sourceLabel, settings);
  const ui = new Ui(container, controller, mode, audio);
  if (settings.reducedMotion) ui.root.classList.add("reduced");
  return {
    controller,
    ui,
    audio,
    dispose: () => {
      ui.dispose();
      audio.dispose();
    },
  };
}
