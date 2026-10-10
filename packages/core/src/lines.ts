/**
 * Authored fiction. The circuit never produces words: each measured outcome
 * only selects which prepared fragment is shown and spoken. The same lines are
 * used whoever is calling, so the text never gives the caller away.
 */

export const INTRO: Record<number, string> = {
  1: "11:52 pm. The storm took the street lights. Mira went out to check the car twenty minutes ago. The intercom crackles: both door cameras show her, at the front door and the side door, at the same time. One call, two entrances.",
  2: "12:20 am. She calls again. Same coat, same voice, both doors. Before she went out she said: “If anything weird happens, don't open until you're sure.”",
  3: "1:05 am. The porch light on one side flickers. Another call. Tonight the call leans toward one of the doors.",
  4: "3:33 am. The intercom battery is almost gone. One more call, and then the line is dead.",
};

export const CLEAR_LINES: string[] = [
  "It's me. Open the door.",
  "I'm freezing out here.",
  "The car wouldn't start.",
  "Please. It's so dark.",
  "Why aren't you opening?",
  "I can hear you on the line.",
  "It's really me. Open the door.",
  "Don't make me wait out here.",
  "You know my voice.",
  "I'm right here.",
  "Please.",
  "Open the door.",
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
  saved: "The lock turns. Mira stumbles in, soaked and furious and alive. “Took you long enough.”",
  wrongDoor: "You open the door. The step is empty. Her voice, from the other door: “Wrong one.” By the time you get there she has let herself in, shaking.",
  abandoned: "You hang up. At dawn you find her asleep in the car, coat over her head. She doesn't speak to you for a week.",
  refused: "You hang up. The intercom stays lit. In Mira's voice, very softly: “Next time.” Your phone buzzes. A text from the real Mira: “Still at the car. DON'T open the door.”",
  letIn: "The lock turns. Nothing comes in. Then every light in the house goes out, and the voice says, from the hallway behind you: “Thank you.”",
} as const;

export type ResultKind = keyof typeof RESULT_TEXT;

export function endingText(results: ResultKind[]): { title: string; text: string } {
  const letIn = results.filter((r) => r === "letIn").length;
  const good = results.filter((r) => r === "saved" || r === "refused").length;
  if (letIn > 0) {
    return { title: "Something is inside", text: "You let it in. Somewhere in the house, it is practising her laugh." };
  }
  if (good === results.length) {
    return { title: "Morning", text: "The storm passes. Mira makes coffee and refuses to talk about last night. The intercom never rings again." };
  }
  return { title: "A long night", text: "Nothing got in, but not everyone who needed a door got one. Next time, listen more carefully." };
}
