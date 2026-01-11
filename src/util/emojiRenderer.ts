export function getEmojiCodepoints(emoji: string): string[] {
  return Array.from(emoji).map((char) => {
    const cp = char.codePointAt(0)!;
    return cp.toString(16).toLowerCase();
  });
}
export function emojiToSvgFilenames(emoji: string) {
  const codepoints = getEmojiCodepoints(emoji);

    return codepoints.reduce((acc, codepoint, index) => {
      const combCodepoints = codepoints.slice(0, index === 0 ? undefined : -index);

      return [
        ...acc,
        `emoji_u${combCodepoints.join('_')}.svg`
      ]
    }, [] as string[]);
}

// export function emojiToSvgFilename(emoji: string, sliceCodepoints?: number): string {
//   const codepoints = Array.from(emoji)
//     .map((char) => {
//       const cp = char.codePointAt(0)!;
//       return cp.toString(16).toLowerCase();
//     })
//     .slice(0, sliceCodepoints)
//     .join('_');

//   return `emoji_u${codepoints}.svg`;
// }

// export function getEmojiSvgUrl(emoji: string): string {
//   const filename = emojiToSvgFilename(emoji);
//   return `https://raw.githubusercontent.com/googlefonts/noto-emoji/refs/heads/main/svg/${filename}`;
// }

const emojiCache = new Map<string, string>();
export async function renderEmoji(emoji: string) {
  console.log('Rendering emoji:', emoji);

  const filenames = emojiToSvgFilenames(emoji);

  console.log('filenames', filenames);
  

  const cacheKey = getEmojiCodepoints(emoji).join('_');

  if (emojiCache.has(cacheKey)) {
    return emojiCache.get(cacheKey)!;
  }

  for (const filename of filenames) {
    const url = `https://raw.githubusercontent.com/googlefonts/noto-emoji/refs/heads/main/svg/${filename}`;
    try {
      const response = await fetch(url);

      if (response.ok) {
        const svgText = await response.text();
        emojiCache.set(cacheKey, svgText);

        return svgText;
      } else if (response.status === 404){
        console.warn(`Emoji SVG not found: ${emoji} (${filename})`);
        continue;
      } else  {
        console.warn(`Emoji SVG not found: ${emoji} (${filename})`);
        return null;
      }
    } catch (error) {
      console.error(`Failed to load emoji SVG: ${emoji}`, error);
      return null;
    }
  }

  return null;
}

export function getEmojiWidth(emoji: string, fontSize: number): number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  context.font = `${fontSize}px sans-serif`;
  const metrics = context.measureText(emoji);
  return metrics.width;
}
