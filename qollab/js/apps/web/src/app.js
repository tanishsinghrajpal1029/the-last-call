/** Starts one run in a container. Shared by the web app and the Qollab page. */
import { Audio } from "./audio.js";
import { Controller } from "./controller.js";
import { Ui } from "./ui.js";
export function defaultSettings() {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { voice: true, sound: true, gentle: false, meter: true, reducedMotion: reduced };
}
export function startRun(container, nights, seed, provider, sourceLabel, settings, mode = "screen") {
    const audio = new Audio();
    audio.voice = settings.voice;
    audio.sound = settings.sound;
    audio.gentle = settings.gentle;
    const controller = new Controller(nights, seed, provider, sourceLabel, settings);
    const ui = new Ui(container, controller, mode, audio);
    if (settings.reducedMotion)
        ui.root.classList.add("reduced");
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
