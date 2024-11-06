export function arrayBufferToString(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  const decodedString = decoder.decode(uint8Array);
  return decodedString;
}
