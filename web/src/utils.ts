export function colorToCss(color?: string | null) {
  const map: Record<string, string> = {
    grey: '#9CA3AF', blue: '#60A5FA', red: '#F87171', yellow: '#FBBF24', green: '#34D399', purple: '#A78BFA', pink: '#F472B6', cyan: '#22D3EE', orange: '#FB923C',
  }
  return (color && map[color]) || '#D1D5DB'
}

export function displayUrl(url: string) {
  try {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '')
  } catch {
    return url
  }
}

export function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const num = parseInt(full, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return { r, g, b }
}

export function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function readableTextColor(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#111827' : '#FFFFFF'
}
