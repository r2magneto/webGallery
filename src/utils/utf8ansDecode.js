const CP437_TABLE = (() => {
  const hi =
    'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»' +
    '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌' +
    '█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '
  const t = new Array(256)
  for (let i = 0; i < 128; i += 1) t[i] = String.fromCharCode(i)
  for (let i = 0; i < 128; i += 1) t[128 + i] = hi[i] ?? ''
  return t
})()

function decodeCp437(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) out += CP437_TABLE[bytes[i]]
  return out
}

/** UTF-8 first; falls back to CP437 when replacement chars appear. */
export function decodeBestEffort(bytes) {
  try {
    const utf = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    if (utf.includes('\uFFFD')) return decodeCp437(bytes)
    return utf
  } catch {
    return decodeCp437(bytes)
  }
}
