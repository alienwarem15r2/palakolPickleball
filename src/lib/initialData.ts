import { Player, Pool } from "./types";

// Preloaded roster + default skill-balanced split from the tournament doc.
// Organizer can edit names, pools, and skill during Setup.
const A: [string, "novice" | "intermediate"][] = [
  ["Ina", "intermediate"], ["Kaye", "intermediate"], ["Mauie", "novice"],
  ["Richard", "intermediate"], ["Tsiki", "novice"], ["Kye", "novice"],
  ["Charm", "novice"], ["Lai", "novice"], ["Raphy", "novice"],
  ["Jaja", "novice"], ["Goody", "novice"], ["Coy", "novice"],
];
const B: [string, "novice" | "intermediate"][] = [
  ["Igi", "intermediate"], ["Yas", "intermediate"], ["Ma-ann", "novice"],
  ["May", "novice"], ["Ten", "novice"], ["Ruben", "novice"],
  ["Bot", "novice"], ["Hans", "novice"], ["There", "novice"],
  ["Ayma", "novice"], ["Kathy", "novice"],
];

export function initialPlayers(): Player[] {
  const players: Player[] = [];
  let n = 1;
  const push = (list: typeof A, pool: Pool) => {
    for (const [name, skill] of list) {
      players.push({ id: `p${n++}`, name, pool, skill });
    }
  };
  push(A, "A");
  push(B, "B");
  return players;
}
