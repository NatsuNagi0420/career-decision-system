/** 青穗集 · 日文字符流帧：平假名与片假名稳定三字词槽，错峰逐字变换与解码；纯装饰，不生成模型思考内容。 */
const WORDS = ["ミライ", "ヒカリ", "ココロ", "キオク", "セカイ", "キズナ", "ねがい", "こたえ", "こころ", "ひかり"];
const KANA = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモラリルレロ";
export function effortWordFrame(tick: number, row: number): string[] {
  return Array.from({ length: 8 }, (_, slot) => {
    const local = Math.max(0, tick) + slot * 3 + row * 7;
    const cycle = Math.floor(local / 30);
    const phase = local % 30;
    const source = WORDS[(slot + row * 3 + cycle) % WORDS.length]!;
    const target = WORDS[(slot + row * 3 + cycle + 1) % WORDS.length]!;
    if (phase < 20) return source;
    return [...target].map((char, index) => phase >= 23 + index * 2 ? char : KANA[(local * 7 + slot * 11 + index * 13) % KANA.length]).join("");
  });
}
