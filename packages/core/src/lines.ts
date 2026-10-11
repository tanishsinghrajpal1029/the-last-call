/**
 * Authored fiction. The circuit never produces words: each measured outcome
 * only selects which prepared fragment is shown and spoken. The same lines are
 * used whoever is calling, so the text never gives the caller away.
 */

export const INTRO: Record<number, string> = {
  1: "11:52 pm. Mum and Dad are stuck across town in the storm, and you're watching your little sister Mira. Twenty minutes ago she slipped outside after the cat. Now the intercom crackles: both door cameras show the same dark, hooded shape, at the front door and the side door, at the same time. The night vision can't make out a face. One call, two doors.",
  2: "12:20 am. She calls again. Same dark shape, same little voice, both doors. Mum's rule, taped to the fridge: “Never open the door at night unless you're sure who it is.” Whatever is copying her has learned her voice better: its pattern is closer to hers now, and the line will only hold four calls.",
  3: "1:05 am. The porch light on one side won't stop flickering, and tonight the call leans toward one of the doors. Six calls, and two questions to answer with them.",
  4: "3:33 am. The intercom battery is almost dead, and the damaged handset now records the door on every call. Her voiceprint is gone: every listen is a coin flip. Unless you erase the record. Somewhere out in the rain, something has learned exactly how she says your name.",
};

export const CLEAR_LINES: string[] = [
  "It's me. It's Mira. Open the door.",
  "I'm cold. I'm really cold.",
  "I couldn't find the cat.",
  "Please. It's so dark out here.",
  "Why aren't you opening?",
  "I can hear you breathing.",
  "It's really me. I promise.",
  "Don't leave me out here.",
  "You know my voice.",
  "I'm right here. Right by the door.",
  "Please.",
  "Let me in.",
];

export const STATIC_LINES: string[] = [
  "—pen th— —oor—",
  "—s me— —ssshh—",
  "(only static)",
  "—old out— —ere—",
  "—hy aren't— —ou—",
  "—ease—",
];

export const RESULT_TEXT = {
  saved: "The lock turns. Mira runs in, soaked to the bone, and wraps herself around your legs. “You took forever.”",
  wrongDoor: "You open the door. The step is empty. A small voice from the other door: “Wrong one.” By the time you get there she has squeezed in through the cat flap, shaking.",
  abandoned: "You hang up. At dawn you find her asleep in the garden shed, hugging the cat. She won't look at you all day.",
  refused: "You hang up. The camera stays on. The hooded shape lifts its head, slowly, and looks straight into the camera. In Mira's voice: “Next time.” Then you hear the real Mira knocking at the back window, crying.",
  letIn: "The lock turns. Nothing comes in. Then every light in the house goes out, and a small wet voice says, from the hallway right behind you: “Thank you.”",
} as const;

export type ResultKind = keyof typeof RESULT_TEXT;

export function endingText(results: ResultKind[]): { title: string; text: string } {
  const letIn = results.filter((r) => r === "letIn").length;
  const good = results.filter((r) => r === "saved" || r === "refused").length;
  if (letIn > 0) {
    return { title: "Something is inside", text: "You let it in. Mira is safe in the shed, but somewhere in your house, something small is practising her laugh." };
  }
  if (good === results.length) {
    return { title: "Morning", text: "The storm passes. Mira falls asleep on the sofa with the cat. The intercom never rings again, but the small wet handprints on the camera glass don't wipe off." };
  }
  return { title: "A long night", text: "Nothing got in, but not everyone who needed a door got one. Next time, listen more carefully." };
}
