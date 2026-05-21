const svgToDataUri = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

function createStarPolygonPoints(cx, cy, outerRadius, innerRadius, spikes = 12) {
  const points = [];
  for (let index = 0; index < spikes * 2; index += 1) {
    const angle = ((-90 + (180 / spikes) * index) * Math.PI) / 180;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return points.join(' ');
}

function createDynamicSkyIcon({
  skyTop,
  skyBottom,
  upperGlow,
  lowerGlow,
  celestial,
  celestialX,
  celestialY,
  celestialRadius,
  celestialColor,
  celestialRim,
  haloColor,
  haloOpacity,
  rodStripe,
  horizonTint,
  showHorizon = true,
  horizonLineY = 87,
  horizonLineOpacity = 0.78,
  accentStars = [],
  floatClouds = [],
}) {
  const starPolygon = createStarPolygonPoints(
    celestialX,
    celestialY,
    celestialRadius * 1.42,
    celestialRadius * 0.82,
    12,
  );
  const innerRingRadius = celestialRadius * 0.72;

  const celestialMarkup = celestial === 'moon'
    ? `
      <defs>
        <mask id="moon-cutout-${celestialX}-${celestialY}">
          <rect width="128" height="128" fill="black" />
          <polygon points="${starPolygon}" fill="white" />
          <circle cx="${celestialX}" cy="${celestialY}" r="${innerRingRadius}" fill="black" />
          <circle cx="${celestialX - celestialRadius * 0.1}" cy="${celestialY}" r="${celestialRadius * 0.84}" fill="white" />
          <circle cx="${celestialX + celestialRadius * 0.32}" cy="${celestialY - celestialRadius * 0.08}" r="${celestialRadius * 0.78}" fill="black" />
        </mask>
      </defs>
      <polygon points="${starPolygon}" fill="${celestialColor}" opacity="0.96" mask="url(#moon-cutout-${celestialX}-${celestialY})" />
      <polygon points="${starPolygon}" fill="none" stroke="${celestialRim}" stroke-width="2.1" opacity="0.92" mask="url(#moon-cutout-${celestialX}-${celestialY})" />
    `
    : `
      <polygon points="${starPolygon}" fill="${celestialColor}" />
      <circle cx="${celestialX}" cy="${celestialY}" r="${innerRingRadius}" fill="${skyBottom}" opacity="0.9" />
      <circle cx="${celestialX}" cy="${celestialY}" r="${innerRingRadius * 1.08}" fill="none" stroke="${celestialRim}" stroke-width="2.2" opacity="0.9" />
      <polygon points="${starPolygon}" fill="none" stroke="${celestialRim}" stroke-width="2" opacity="0.84" />
    `;

  const starMarkup = accentStars
    .map(({ x, y, r, opacity = 0.8 }) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff3ce" opacity="${opacity}" />`)
    .join('');

  const cloudMarkup = floatClouds
    .map(({ x, y, width, height, opacity = 0.14 }) => `
      <ellipse cx="${x}" cy="${y}" rx="${width}" ry="${height}" fill="#fff5e6" opacity="${opacity}" />
    `)
    .join('');

  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${skyTop}" />
          <stop offset="100%" stop-color="${skyBottom}" />
        </linearGradient>
        <clipPath id="rounded">
          <rect x="4" y="4" width="120" height="120" rx="30" />
        </clipPath>
      </defs>
      <g clip-path="url(#rounded)">
        <rect width="128" height="128" fill="url(#bg)" />
        <circle cx="${celestialX}" cy="${celestialY}" r="${celestialRadius * 2.6}" fill="${haloColor}" opacity="${haloOpacity}" />
        <circle cx="22" cy="18" r="44" fill="${upperGlow}" opacity="0.16" />
        <circle cx="100" cy="106" r="52" fill="${lowerGlow}" opacity="0.18" />
        <rect x="0" y="80" width="128" height="48" fill="${horizonTint}" opacity="0.16" />
        ${cloudMarkup}
        ${starMarkup}
        ${celestialMarkup}
        ${showHorizon ? `
          <path
            d="M 18 ${horizonLineY} Q 64 ${horizonLineY + 3} 110 ${horizonLineY}"
            fill="none"
            stroke="#fbf5ea"
            stroke-width="2.2"
            stroke-linecap="round"
            opacity="${horizonLineOpacity}"
          />
          <path
            d="M 24 ${horizonLineY + 4} Q 64 ${horizonLineY + 6} 104 ${horizonLineY + 4}"
            fill="none"
            stroke="${rodStripe}"
            stroke-width="1.5"
            stroke-linecap="round"
            opacity="0.78"
          />
        ` : ''}
      </g>
      <rect x="4.5" y="4.5" width="119" height="119" rx="29.5" fill="none" stroke="rgba(255,255,255,0.26)" />
      <rect x="12" y="12" width="104" height="104" rx="24" fill="none" stroke="rgba(245,210,113,0.16)" />
    </svg>
  `);
}

export const DYNSUN = {
  MORNING_RISE: createDynamicSkyIcon({
    skyTop: '#23151a',
    skyBottom: '#3a221f',
    upperGlow: '#ffcc77',
    lowerGlow: '#a8582c',
    celestial: 'sun',
    celestialX: 38,
    celestialY: 42,
    celestialRadius: 19,
    celestialColor: '#ffe39a',
    celestialRim: '#f3c86f',
    haloColor: '#ffd980',
    haloOpacity: 0.2,
    rodStripe: '#c59639',
    horizonTint: '#ffbe71',
    floatClouds: [
      { x: 85, y: 28, width: 15, height: 5 },
      { x: 96, y: 34, width: 11, height: 4, opacity: 0.1 },
    ],
  }),
  HIGH_NOON: createDynamicSkyIcon({
    skyTop: '#22171b',
    skyBottom: '#35251f',
    upperGlow: '#ffe5a6',
    lowerGlow: '#cf8a34',
    celestial: 'sun',
    celestialX: 64,
    celestialY: 64,
    celestialRadius: 24,
    celestialColor: '#fff0b6',
    celestialRim: '#f3cf75',
    haloColor: '#fff1b8',
    haloOpacity: 0.14,
    rodStripe: '#c39a47',
    horizonTint: '#efc688',
    showHorizon: false,
    horizonLineY: 92,
    horizonLineOpacity: 0.62,
  }),
  AFTERNOON_DESCENT: createDynamicSkyIcon({
    skyTop: '#24161c',
    skyBottom: '#3a221d',
    upperGlow: '#ffcf87',
    lowerGlow: '#bc6034',
    celestial: 'sun',
    celestialX: 88,
    celestialY: 46,
    celestialRadius: 19,
    celestialColor: '#ffe19b',
    celestialRim: '#ebb25a',
    haloColor: '#ffcf7a',
    haloOpacity: 0.18,
    rodStripe: '#c19342',
    horizonTint: '#de8755',
    floatClouds: [
      { x: 28, y: 30, width: 16, height: 5, opacity: 0.1 },
    ],
  }),
  MOON_RISE: createDynamicSkyIcon({
    skyTop: '#17121d',
    skyBottom: '#291a24',
    upperGlow: '#f2b86f',
    lowerGlow: '#6b3554',
    celestial: 'moon',
    celestialX: 40,
    celestialY: 46,
    celestialRadius: 21,
    celestialColor: '#f8e8bf',
    celestialRim: '#e7d39b',
    haloColor: '#f6ddb2',
    haloOpacity: 0.14,
    rodStripe: '#b38b56',
    horizonTint: '#7d425d',
    accentStars: [
      { x: 88, y: 24, r: 1.8 },
      { x: 100, y: 34, r: 1.3, opacity: 0.64 },
    ],
  }),
  MIDNIGHT_ARC: createDynamicSkyIcon({
    skyTop: '#10131f',
    skyBottom: '#191722',
    upperGlow: '#d0c6a1',
    lowerGlow: '#3b2940',
    celestial: 'moon',
    celestialX: 64,
    celestialY: 64,
    celestialRadius: 24,
    celestialColor: '#f6ecc9',
    celestialRim: '#e4d39d',
    haloColor: '#ece0bb',
    haloOpacity: 0.12,
    rodStripe: '#8f7ca8',
    horizonTint: '#37253c',
    showHorizon: false,
    horizonLineY: 92,
    horizonLineOpacity: 0.5,
  }),
  DAWN_MOONSET: createDynamicSkyIcon({
    skyTop: '#15131d',
    skyBottom: '#2d1f28',
    upperGlow: '#cbb58d',
    lowerGlow: '#925a46',
    celestial: 'moon',
    celestialX: 92,
    celestialY: 48,
    celestialRadius: 19,
    celestialColor: '#f3e8c4',
    celestialRim: '#dec891',
    haloColor: '#efe0bd',
    haloOpacity: 0.1,
    rodStripe: '#a07d6d',
    horizonTint: '#d48b5b',
    accentStars: [
      { x: 30, y: 24, r: 1.2, opacity: 0.5 },
      { x: 42, y: 30, r: 1.4, opacity: 0.6 },
    ],
    floatClouds: [
      { x: 34, y: 48, width: 12, height: 4, opacity: 0.08 },
    ],
  }),
};
