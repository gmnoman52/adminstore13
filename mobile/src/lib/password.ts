export function validateNewPassword(password: string) {
  let bytes = 0;
  let characters = 0;
  for (const character of password) {
    characters++;
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  if (characters < 12) throw new Error('Use a password with at least 12 characters');
  if (bytes > 72) throw new Error('Use a password of no more than 72 UTF-8 bytes');
}
