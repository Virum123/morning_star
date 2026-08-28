import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Settings as SettingsIcon, HelpCircle, X, LayoutDashboard, LogOut, Globe2 } from 'lucide-react';
import { api } from './utils/api';
import { trackEvent, setAnalyticsUser } from './utils/analytics';
import { t } from './utils/i18n';
import './App.css';
import { DYNSUN } from './utils/suns';
import { getCurrentUser, onAuthStateChange, signOut } from './services/authService';
import LoginPage from './components/LoginPage';
import AuthDebugBanner from './components/AuthDebugBanner';

// Components
import Settings from './components/Settings';
import Planner from './components/Planner';
import Archive from './components/Archive';

const MINUTES_IN_DAY = 1440;

const THEME_WINDOWS = [
  { id: 'morning', start: 7 * 60, end: 11 * 60, useDarkChrome: false },
  { id: 'day', start: 11 * 60, end: 15 * 60, useDarkChrome: false },
  { id: 'afternoon', start: 15 * 60, end: 19 * 60, useDarkChrome: false },
  { id: 'evening', start: 19 * 60, end: 23 * 60, useDarkChrome: true },
  { id: 'night', start: 23 * 60, end: 27 * 60, useDarkChrome: true },
  { id: 'dawn', start: 27 * 60, end: 31 * 60, useDarkChrome: true },
];

const ICON_WINDOWS = [
  { id: 'morning_rise', start: 8 * 60, end: 11 * 60, icon: DYNSUN.MORNING_RISE },
  { id: 'high_noon', start: 11 * 60, end: 15 * 60, icon: DYNSUN.HIGH_NOON },
  { id: 'afternoon_descent', start: 15 * 60, end: 18 * 60, icon: DYNSUN.AFTERNOON_DESCENT },
  { id: 'moon_rise', start: 18 * 60, end: 22 * 60, icon: DYNSUN.MOON_RISE },
  { id: 'midnight_arc', start: 22 * 60, end: 27 * 60, icon: DYNSUN.MIDNIGHT_ARC },
  { id: 'dawn_moonset', start: 27 * 60, end: 32 * 60, icon: DYNSUN.DAWN_MOONSET },
];

const DYNAMIC_PALETTES = {
  morning: {
    bgOrb: 'rgba(255, 231, 170, 0.88)',
    bgBloom: 'rgba(227, 171, 88, 0.18)',
    bgTop: '#f7efe4',
    bgMid: '#eddcc3',
    bgBottom: '#e3ccb0',
    beforeCore: 'rgba(255, 224, 148, 0.32)',
    beforeOuter: 'rgba(216, 157, 38, 0.08)',
    afterCore: 'rgba(194, 114, 47, 0.14)',
    glassBg: 'rgba(255, 250, 243, 0.84)',
    glassBorder: 'rgba(98, 70, 40, 0.08)',
    accentSoft: '#f9de8f',
    accentBase: '#d99b29',
    accentDeep: '#94611a',
    accentGlow: 'rgba(216, 157, 38, 0.22)',
    accentGlowStrong: 'rgba(160, 104, 34, 0.22)',
    textPrimary: '#281e17',
    textSecondary: '#74675b',
    textMuted: '#9d8f83',
    sidebarBg: 'rgba(255, 249, 242, 0.76)',
    sidebarBorder: 'rgba(98, 70, 40, 0.08)',
    sidebarActiveBg: 'rgba(216, 157, 38, 0.12)',
    sidebarActiveText: '#925f17',
    sidebarHoverBg: 'rgba(216, 157, 38, 0.06)',
    cardBg: 'rgba(255, 252, 247, 0.92)',
    cardBorder: 'rgba(98, 70, 40, 0.08)',
    cardStripe: '#d5a446',
    inputBg: 'rgba(255, 255, 255, 0.9)',
    inputBorder: 'rgba(138, 95, 35, 0.18)',
    inputFocus: 'rgba(212, 154, 38, 0.26)',
    divider: 'rgba(98, 70, 40, 0.08)',
    pillActiveBg: 'rgba(216, 157, 38, 0.12)',
    pillActiveBorder: 'rgba(216, 157, 38, 0.28)',
  },
  day: {
    bgOrb: 'rgba(255, 244, 211, 0.9)',
    bgBloom: 'rgba(159, 210, 255, 0.16)',
    bgTop: '#fff9ef',
    bgMid: '#f4ead7',
    bgBottom: '#eadccd',
    beforeCore: 'rgba(255, 236, 184, 0.24)',
    beforeOuter: 'rgba(207, 147, 32, 0.06)',
    afterCore: 'rgba(120, 174, 232, 0.14)',
    glassBg: 'rgba(255, 253, 249, 0.88)',
    glassBorder: 'rgba(98, 70, 40, 0.08)',
    accentSoft: '#f7e39d',
    accentBase: '#cf9320',
    accentDeep: '#8f6a2f',
    accentGlow: 'rgba(207, 147, 32, 0.18)',
    accentGlowStrong: 'rgba(176, 128, 42, 0.2)',
    textPrimary: '#2a211b',
    textSecondary: '#756960',
    textMuted: '#a09388',
    sidebarBg: 'rgba(255, 252, 247, 0.72)',
    sidebarBorder: 'rgba(98, 70, 40, 0.08)',
    sidebarActiveBg: 'rgba(207, 147, 32, 0.12)',
    sidebarActiveText: '#8a641a',
    sidebarHoverBg: 'rgba(207, 147, 32, 0.05)',
    cardBg: 'rgba(255, 254, 251, 0.9)',
    cardBorder: 'rgba(98, 70, 40, 0.08)',
    cardStripe: '#cfa04f',
    inputBg: 'rgba(255, 255, 255, 0.92)',
    inputBorder: 'rgba(128, 102, 60, 0.14)',
    inputFocus: 'rgba(207, 147, 32, 0.22)',
    divider: 'rgba(98, 70, 40, 0.08)',
    pillActiveBg: 'rgba(207, 147, 32, 0.1)',
    pillActiveBorder: 'rgba(207, 147, 32, 0.24)',
  },
  afternoon: {
    bgOrb: 'rgba(255, 214, 154, 0.52)',
    bgBloom: 'rgba(201, 112, 72, 0.2)',
    bgTop: '#f4e0cd',
    bgMid: '#e8c7a8',
    bgBottom: '#d7a887',
    beforeCore: 'rgba(255, 198, 122, 0.28)',
    beforeOuter: 'rgba(232, 126, 52, 0.08)',
    afterCore: 'rgba(180, 86, 52, 0.16)',
    glassBg: 'rgba(255, 245, 236, 0.78)',
    glassBorder: 'rgba(109, 60, 35, 0.1)',
    accentSoft: '#ffd89a',
    accentBase: '#de8a2d',
    accentDeep: '#9e4f1a',
    accentGlow: 'rgba(222, 138, 45, 0.2)',
    accentGlowStrong: 'rgba(171, 89, 35, 0.22)',
    textPrimary: '#321f18',
    textSecondary: '#7f6151',
    textMuted: '#a68776',
    sidebarBg: 'rgba(255, 244, 235, 0.72)',
    sidebarBorder: 'rgba(109, 60, 35, 0.1)',
    sidebarActiveBg: 'rgba(222, 138, 45, 0.13)',
    sidebarActiveText: '#9e5219',
    sidebarHoverBg: 'rgba(222, 138, 45, 0.06)',
    cardBg: 'rgba(255, 247, 241, 0.84)',
    cardBorder: 'rgba(109, 60, 35, 0.1)',
    cardStripe: '#da8b3d',
    inputBg: 'rgba(255, 250, 245, 0.86)',
    inputBorder: 'rgba(181, 100, 48, 0.16)',
    inputFocus: 'rgba(222, 138, 45, 0.24)',
    divider: 'rgba(109, 60, 35, 0.1)',
    pillActiveBg: 'rgba(222, 138, 45, 0.11)',
    pillActiveBorder: 'rgba(222, 138, 45, 0.24)',
  },
  evening: {
    bgOrb: 'rgba(255, 188, 134, 0.26)',
    bgBloom: 'rgba(122, 92, 165, 0.16)',
    bgTop: '#201722',
    bgMid: '#2b1d29',
    bgBottom: '#37212a',
    beforeCore: 'rgba(246, 201, 144, 0.18)',
    beforeOuter: 'rgba(173, 110, 74, 0.04)',
    afterCore: 'rgba(108, 77, 143, 0.16)',
    glassBg: 'rgba(31, 22, 27, 0.76)',
    glassBorder: 'rgba(235, 193, 107, 0.1)',
    accentSoft: '#f8ddb2',
    accentBase: '#e0ac53',
    accentDeep: '#93612b',
    accentGlow: 'rgba(224, 172, 83, 0.2)',
    accentGlowStrong: 'rgba(224, 172, 83, 0.22)',
    textPrimary: '#f3eadf',
    textSecondary: '#b5a596',
    textMuted: '#857769',
    sidebarBg: 'rgba(25, 19, 24, 0.8)',
    sidebarBorder: 'rgba(230, 188, 98, 0.08)',
    sidebarActiveBg: 'rgba(233, 186, 83, 0.11)',
    sidebarActiveText: '#f0cc79',
    sidebarHoverBg: 'rgba(233, 186, 83, 0.05)',
    cardBg: 'rgba(31, 23, 27, 0.8)',
    cardBorder: 'rgba(230, 188, 98, 0.1)',
    cardStripe: '#e0af4c',
    inputBg: 'rgba(23, 18, 20, 0.82)',
    inputBorder: 'rgba(233, 186, 83, 0.14)',
    inputFocus: 'rgba(233, 186, 83, 0.22)',
    divider: 'rgba(230, 188, 98, 0.08)',
    pillActiveBg: 'rgba(233, 186, 83, 0.12)',
    pillActiveBorder: 'rgba(233, 186, 83, 0.24)',
  },
  night: {
    bgOrb: 'rgba(178, 133, 68, 0.16)',
    bgBloom: 'rgba(81, 46, 28, 0.2)',
    bgTop: '#0d0a0d',
    bgMid: '#151016',
    bgBottom: '#1d1518',
    beforeCore: 'rgba(214, 168, 77, 0.14)',
    beforeOuter: 'rgba(214, 168, 77, 0.03)',
    afterCore: 'rgba(112, 58, 33, 0.18)',
    glassBg: 'rgba(28, 21, 23, 0.74)',
    glassBorder: 'rgba(230, 188, 98, 0.08)',
    accentSoft: '#f9e5ae',
    accentBase: '#e9ba53',
    accentDeep: '#9d6a24',
    accentGlow: 'rgba(233, 186, 83, 0.18)',
    accentGlowStrong: 'rgba(233, 186, 83, 0.22)',
    textPrimary: '#f4ebe0',
    textSecondary: '#b7a697',
    textMuted: '#85776b',
    sidebarBg: 'rgba(23, 18, 19, 0.8)',
    sidebarBorder: 'rgba(230, 188, 98, 0.08)',
    sidebarActiveBg: 'rgba(233, 186, 83, 0.11)',
    sidebarActiveText: '#f0cc79',
    sidebarHoverBg: 'rgba(233, 186, 83, 0.05)',
    cardBg: 'rgba(30, 23, 25, 0.8)',
    cardBorder: 'rgba(230, 188, 98, 0.1)',
    cardStripe: '#e0af4c',
    inputBg: 'rgba(22, 17, 19, 0.82)',
    inputBorder: 'rgba(233, 186, 83, 0.14)',
    inputFocus: 'rgba(233, 186, 83, 0.22)',
    divider: 'rgba(230, 188, 98, 0.08)',
    pillActiveBg: 'rgba(233, 186, 83, 0.12)',
    pillActiveBorder: 'rgba(233, 186, 83, 0.24)',
  },
  dawn: {
    bgOrb: 'rgba(214, 183, 136, 0.26)',
    bgBloom: 'rgba(163, 92, 67, 0.2)',
    bgTop: '#17131c',
    bgMid: '#241a23',
    bgBottom: '#352229',
    beforeCore: 'rgba(224, 194, 147, 0.18)',
    beforeOuter: 'rgba(205, 138, 92, 0.05)',
    afterCore: 'rgba(176, 95, 63, 0.16)',
    glassBg: 'rgba(29, 21, 24, 0.76)',
    glassBorder: 'rgba(227, 191, 120, 0.1)',
    accentSoft: '#f6ddb0',
    accentBase: '#d9a15b',
    accentDeep: '#955c34',
    accentGlow: 'rgba(217, 161, 91, 0.2)',
    accentGlowStrong: 'rgba(181, 116, 62, 0.22)',
    textPrimary: '#f1e7dc',
    textSecondary: '#b9aa9f',
    textMuted: '#8c7d72',
    sidebarBg: 'rgba(28, 20, 22, 0.8)',
    sidebarBorder: 'rgba(227, 191, 120, 0.09)',
    sidebarActiveBg: 'rgba(217, 161, 91, 0.12)',
    sidebarActiveText: '#edc981',
    sidebarHoverBg: 'rgba(217, 161, 91, 0.05)',
    cardBg: 'rgba(31, 22, 25, 0.8)',
    cardBorder: 'rgba(227, 191, 120, 0.1)',
    cardStripe: '#da9e63',
    inputBg: 'rgba(24, 18, 20, 0.82)',
    inputBorder: 'rgba(217, 161, 91, 0.16)',
    inputFocus: 'rgba(217, 161, 91, 0.24)',
    divider: 'rgba(227, 191, 120, 0.08)',
    pillActiveBg: 'rgba(217, 161, 91, 0.12)',
    pillActiveBorder: 'rgba(217, 161, 91, 0.24)',
  },
  purple: {
    bgOrb: 'rgba(180, 150, 230, 0.4)',
    bgBloom: 'rgba(140, 100, 200, 0.2)',
    bgTop: '#1e1a24',
    bgMid: '#282033',
    bgBottom: '#352844',
    beforeCore: 'rgba(190, 160, 240, 0.2)',
    beforeOuter: 'rgba(140, 100, 200, 0.08)',
    afterCore: 'rgba(120, 80, 180, 0.16)',
    glassBg: 'rgba(35, 28, 45, 0.76)',
    glassBorder: 'rgba(180, 140, 230, 0.15)',
    accentSoft: '#d8bdf8',
    accentBase: '#a875e5',
    accentDeep: '#6c3ba5',
    accentGlow: 'rgba(168, 117, 229, 0.25)',
    accentGlowStrong: 'rgba(168, 117, 229, 0.35)',
    textPrimary: '#f0ebf5',
    textSecondary: '#b8a8cd',
    textMuted: '#8a78a2',
    sidebarBg: 'rgba(30, 24, 40, 0.8)',
    sidebarBorder: 'rgba(180, 140, 230, 0.1)',
    sidebarActiveBg: 'rgba(168, 117, 229, 0.15)',
    sidebarActiveText: '#d4abf5',
    sidebarHoverBg: 'rgba(168, 117, 229, 0.08)',
    cardBg: 'rgba(35, 28, 45, 0.82)',
    cardBorder: 'rgba(180, 140, 230, 0.12)',
    cardStripe: '#a875e5',
    inputBg: 'rgba(28, 22, 35, 0.85)',
    inputBorder: 'rgba(168, 117, 229, 0.2)',
    inputFocus: 'rgba(168, 117, 229, 0.3)',
    divider: 'rgba(180, 140, 230, 0.12)',
    pillActiveBg: 'rgba(168, 117, 229, 0.15)',
    pillActiveBorder: 'rgba(168, 117, 229, 0.3)',
  },
  blue: {
    bgOrb: 'rgba(120, 180, 240, 0.4)',
    bgBloom: 'rgba(80, 140, 220, 0.2)',
    bgTop: '#161c24',
    bgMid: '#1b2432',
    bgBottom: '#223044',
    beforeCore: 'rgba(140, 190, 250, 0.2)',
    beforeOuter: 'rgba(80, 140, 220, 0.08)',
    afterCore: 'rgba(60, 110, 190, 0.16)',
    glassBg: 'rgba(25, 33, 45, 0.76)',
    glassBorder: 'rgba(120, 170, 240, 0.15)',
    accentSoft: '#b5d8f8',
    accentBase: '#58a6e5',
    accentDeep: '#286ca5',
    accentGlow: 'rgba(88, 166, 229, 0.25)',
    accentGlowStrong: 'rgba(88, 166, 229, 0.35)',
    textPrimary: '#eaf4fa',
    textSecondary: '#a5c0d6',
    textMuted: '#7895af',
    sidebarBg: 'rgba(22, 28, 40, 0.8)',
    sidebarBorder: 'rgba(120, 170, 240, 0.1)',
    sidebarActiveBg: 'rgba(88, 166, 229, 0.15)',
    sidebarActiveText: '#9acbf5',
    sidebarHoverBg: 'rgba(88, 166, 229, 0.08)',
    cardBg: 'rgba(25, 33, 45, 0.82)',
    cardBorder: 'rgba(120, 170, 240, 0.12)',
    cardStripe: '#58a6e5',
    inputBg: 'rgba(20, 26, 35, 0.85)',
    inputBorder: 'rgba(88, 166, 229, 0.2)',
    inputFocus: 'rgba(88, 166, 229, 0.3)',
    divider: 'rgba(120, 170, 240, 0.12)',
    pillActiveBg: 'rgba(88, 166, 229, 0.15)',
    pillActiveBorder: 'rgba(88, 166, 229, 0.3)',
  },
  green: {
    bgOrb: 'rgba(130, 200, 150, 0.4)',
    bgBloom: 'rgba(90, 160, 110, 0.2)',
    bgTop: '#16221a',
    bgMid: '#1d2e23',
    bgBottom: '#253b2d',
    beforeCore: 'rgba(150, 220, 170, 0.2)',
    beforeOuter: 'rgba(90, 160, 110, 0.08)',
    afterCore: 'rgba(60, 130, 80, 0.16)',
    glassBg: 'rgba(28, 40, 32, 0.76)',
    glassBorder: 'rgba(130, 190, 140, 0.15)',
    accentSoft: '#bdf0ce',
    accentBase: '#5dbb7e',
    accentDeep: '#2c824c',
    accentGlow: 'rgba(93, 187, 126, 0.25)',
    accentGlowStrong: 'rgba(93, 187, 126, 0.35)',
    textPrimary: '#eef8f2',
    textSecondary: '#adcbb6',
    textMuted: '#84a48f',
    sidebarBg: 'rgba(24, 35, 28, 0.8)',
    sidebarBorder: 'rgba(130, 190, 140, 0.1)',
    sidebarActiveBg: 'rgba(93, 187, 126, 0.15)',
    sidebarActiveText: '#a1e0b9',
    sidebarHoverBg: 'rgba(93, 187, 126, 0.08)',
    cardBg: 'rgba(28, 40, 32, 0.82)',
    cardBorder: 'rgba(130, 190, 140, 0.12)',
    cardStripe: '#5dbb7e',
    inputBg: 'rgba(22, 32, 25, 0.85)',
    inputBorder: 'rgba(93, 187, 126, 0.2)',
    inputFocus: 'rgba(93, 187, 126, 0.3)',
    divider: 'rgba(130, 190, 140, 0.12)',
    pillActiveBg: 'rgba(93, 187, 126, 0.15)',
    pillActiveBorder: 'rgba(93, 187, 126, 0.3)',
  },
};

function parseColor(color) {
  const value = color.trim();
  if (value.startsWith('#')) {
    let hex = value.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((part) => part + part).join('');
    }
    if (hex.length === 6) {
      hex += 'ff';
    }
    const int = Number.parseInt(hex, 16);
    return {
      r: (int >> 24) & 255,
      g: (int >> 16) & 255,
      b: (int >> 8) & 255,
      a: (int & 255) / 255,
    };
  }

  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  const [r, g, b, a = '1'] = match[1].split(',').map((part) => part.trim());
  return {
    r: Number.parseFloat(r),
    g: Number.parseFloat(g),
    b: Number.parseFloat(b),
    a: Number.parseFloat(a),
  };
}

function mixColor(from, to, amount) {
  const left = parseColor(from);
  const right = parseColor(to);
  const mix = (start, end) => start + (end - start) * amount;
  return `rgba(${Math.round(mix(left.r, right.r))}, ${Math.round(mix(left.g, right.g))}, ${Math.round(mix(left.b, right.b))}, ${mix(left.a, right.a).toFixed(3)})`;
}

function mixPalette(fromPalette, toPalette, amount) {
  const result = {};
  Object.keys(fromPalette).forEach((key) => {
    result[key] = mixColor(fromPalette[key], toPalette[key], amount);
  });
  return result;
}

function normalizeMinutesForCycle(totalMinutes, cycleStart) {
  return totalMinutes < cycleStart ? totalMinutes + MINUTES_IN_DAY : totalMinutes;
}

function getWindowBlend(windows, date = new Date()) {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();
  const normalizedMinutes = normalizeMinutesForCycle(totalMinutes, windows[0].start);
  const currentWindow = windows.find((window) => normalizedMinutes >= window.start && normalizedMinutes < window.end) || windows[0];
  const currentIndex = windows.findIndex((window) => window.id === currentWindow.id);
  const nextWindow = windows[(currentIndex + 1) % windows.length];
  const progress = Math.min(Math.max((normalizedMinutes - currentWindow.start) / (currentWindow.end - currentWindow.start), 0), 1);

  return {
    currentWindow,
    nextWindow,
    progress,
  };
}

function buildDynamicCssVars(bgPalette, colorPalette, useDarkChrome) {
  // bgPalette provides background structures, colorPalette provides accent colors
  return {
    '--bg-gradient': `
      radial-gradient(circle at 18% 16%, ${bgPalette.bgOrb}, transparent 20%),
      radial-gradient(circle at 84% 78%, ${bgPalette.bgBloom}, transparent 26%),
      linear-gradient(148deg, ${bgPalette.bgTop} 0%, ${bgPalette.bgMid} 48%, ${bgPalette.bgBottom} 100%)
    `.replace(/\s+/g, ' ').trim(),
    '--dynamic-before-bg': `radial-gradient(circle, ${bgPalette.beforeCore} 0%, ${bgPalette.beforeOuter} 44%, transparent 72%)`,
    '--dynamic-after-bg': `radial-gradient(circle, ${bgPalette.afterCore} 0%, transparent 65%)`,
    '--glass-bg': bgPalette.glassBg,
    '--glass-border': bgPalette.glassBorder,
    '--accent-color': colorPalette.accentBase,
    '--accent-gradient': `linear-gradient(135deg, ${colorPalette.accentSoft} 0%, ${colorPalette.accentBase} 50%, ${colorPalette.accentDeep} 100%)`,
    '--accent-glow': colorPalette.accentGlow,
    '--accent-glow-strong': colorPalette.accentGlowStrong,
    '--text-primary': colorPalette.textPrimary,
    '--text-secondary': colorPalette.textSecondary,
    '--text-muted': colorPalette.textMuted,
    '--sidebar-bg': bgPalette.sidebarBg,
    '--sidebar-border': colorPalette.sidebarBorder,
    '--sidebar-active-bg': colorPalette.sidebarActiveBg,
    '--sidebar-active-text': colorPalette.sidebarActiveText,
    '--sidebar-hover-bg': colorPalette.sidebarHoverBg,
    '--card-bg': bgPalette.cardBg,
    '--card-border': colorPalette.cardBorder,
    '--card-stripe': colorPalette.cardStripe,
    '--card-shadow': useDarkChrome
      ? '0 10px 28px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(230, 188, 98, 0.04)'
      : '0 12px 34px rgba(108, 74, 44, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
    '--glass-shadow': useDarkChrome
      ? '0 14px 38px rgba(0, 0, 0, 0.54), inset 0 1px 0 rgba(245, 210, 113, 0.03)'
      : '0 18px 42px rgba(96, 67, 38, 0.09), 0 2px 4px rgba(0, 0, 0, 0.03)',
    '--input-bg': bgPalette.inputBg,
    '--input-border': colorPalette.inputBorder,
    '--input-focus': colorPalette.inputFocus,
    '--divider': colorPalette.divider,
    '--pill-active-bg': colorPalette.pillActiveBg,
    '--pill-active-border': colorPalette.pillActiveBorder,
  };
}

function getDynamicThemeSnapshot(date = new Date(), colorTheme = 'default') {
  const { currentWindow, nextWindow, progress } = getWindowBlend(THEME_WINDOWS, date);
  const currentPalette = DYNAMIC_PALETTES[currentWindow.id];
  const nextPalette = DYNAMIC_PALETTES[nextWindow.id];
  const bgMixedPalette = mixPalette(currentPalette, nextPalette, progress);
  const useDarkChrome = currentWindow.useDarkChrome;
  
  const cTheme = colorTheme === 'default' ? currentWindow.id : colorTheme;
  const colorPalette = DYNAMIC_PALETTES[cTheme] || DYNAMIC_PALETTES['day'];

  return {
    phase: currentWindow.id,
    progress,
    useDarkChrome,
    cssVars: buildDynamicCssVars(bgMixedPalette, colorPalette, useDarkChrome),
  };
}

function getDynamicThemePhase(date = new Date()) {
  return getWindowBlend(THEME_WINDOWS, date).currentWindow.id;
}

function getMsUntilNextThemePhaseChange(date = new Date()) {
  const nextTick = new Date(date);
  nextTick.setSeconds(0, 0);
  nextTick.setMinutes(nextTick.getMinutes() + 1);
  return Math.max(nextTick - date, 60_000);
}

function applyThemeMode(themeMode, colorTheme, date = new Date()) {
  const mode = themeMode || 'light';
  const cTheme = colorTheme || 'default';
  const { body } = document;
  
  const dynamicSnapshot = mode === 'dynamic' ? getDynamicThemeSnapshot(date, cTheme) : null;
  const useDarkChrome = mode === 'dark' || (mode === 'dynamic' && dynamicSnapshot?.useDarkChrome);

  body.classList.toggle('theme-dark', useDarkChrome);
  body.classList.toggle('theme-dynamic', mode === 'dynamic');

  if (mode === 'dynamic') {
    body.dataset.dynamicPhase = dynamicSnapshot.phase;
    Object.entries(dynamicSnapshot.cssVars).forEach(([cssVarName, cssVarValue]) => {
      body.style.setProperty(cssVarName, cssVarValue);
    });
  } else {
    // static light/dark
    const bgPalette = mode === 'dark' ? DYNAMIC_PALETTES['night'] : DYNAMIC_PALETTES['day'];
    let cPalette = DYNAMIC_PALETTES[cTheme];
    if (!cPalette || cTheme === 'default') {
      cPalette = mode === 'dark' ? DYNAMIC_PALETTES['night'] : DYNAMIC_PALETTES['day'];
    } else if (mode === 'light') {
      // Light mode + color theme: use day palette text/bg, only override accent colors
      const dayPalette = DYNAMIC_PALETTES['day'];
      cPalette = {
        ...cPalette,
        // Override dark-designed text colors with light-mode legible colors
        textPrimary: dayPalette.textPrimary,
        textSecondary: dayPalette.textSecondary,
        textMuted: dayPalette.textMuted,
        sidebarBg: dayPalette.sidebarBg,
        sidebarHoverBg: cPalette.sidebarHoverBg,
        sidebarActiveBg: cPalette.sidebarActiveBg,
        cardBg: dayPalette.cardBg,
        inputBg: dayPalette.inputBg,
        // Keep accent colors from the color palette
      };
    }
    const cssVars = buildDynamicCssVars(bgPalette, cPalette, useDarkChrome);
    body.dataset.dynamicPhase = mode;
    Object.entries(cssVars).forEach(([cssVarName, cssVarValue]) => {
      body.style.setProperty(cssVarName, cssVarValue);
    });
  }
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const currentUserId = currentUser?.id || null;

  useEffect(() => {
    let isMounted = true;

    getCurrentUser()
      .then((user) => {
        if (isMounted) {
          setCurrentUser(user);
        }
      })
      .catch((error) => {
        console.error('Failed to check auth state:', error);
        if (isMounted) {
          setCurrentUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsAuthChecking(false);
        }
      });

    const subscription = onAuthStateChange((user, event) => {
      if (isMounted) {
        setCurrentUser(user);
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        } else if (event === 'SIGNED_OUT') {
          setIsPasswordRecovery(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setAnalyticsUser(currentUserId);
  }, [currentUserId]);

  const [activeTab, setActiveTab] = useState('planner');
  const [appConfig, setAppConfig] = useState(null);
  const [themeMode, setThemeMode] = useState('light');
  const [colorTheme, setColorTheme] = useState('default');
  const [lang, setLang] = useState('ko');
  const [isReady, setIsReady] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isPromptCopied, setIsPromptCopied] = useState(false);
  const [nickname, setNickname] = useState('Alex');
  const [plannerRefreshSignal, setPlannerRefreshSignal] = useState(0);
  const [archiveKey, setArchiveKey] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const activeTabRef = useRef(activeTab);
  const lastRefreshAtRef = useRef(0);
  const appliedThemeRef = useRef({ mode: null, color: null, phase: null });

  const syncThemeMode = useCallback((modeVal, colorVal, { force = false } = {}) => {
    const mode = modeVal || 'light';
    const color = colorVal || 'default';
    const nextPhase = mode === 'dynamic' ? getDynamicThemePhase(new Date()) : null;
    const applied = appliedThemeRef.current;

    if (!force && applied.mode === mode && applied.color === color && applied.phase === nextPhase) {
      return;
    }

    applyThemeMode(mode, color);
    appliedThemeRef.current = { mode, color, phase: nextPhase };
  }, []);

  const applyConfigSnapshot = useCallback((config) => {
    let mode = config?.themeMode;
    let color = config?.colorTheme;

    // Migrate old config if needed
    if (config?.theme && !mode) {
      if (['purple', 'blue', 'green'].includes(config.theme)) {
        mode = 'dark';
        color = config.theme;
      } else {
        mode = config.theme;
        color = 'default';
      }
    }

    if (!mode) mode = 'light';
    if (!color) color = 'default';

    syncThemeMode(mode, color, { force: true });
    setThemeMode(mode);
    setColorTheme(color);
    setLang(config?.language || 'ko');
    setNickname(config?.nickname || 'Alex');
    setAppConfig(config || null);
  }, [syncThemeMode]);

  const refreshActiveTabData = useCallback((tab = activeTabRef.current) => {
    if (tab === 'planner') setPlannerRefreshSignal((currentSignal) => currentSignal + 1);
    if (tab === 'archive') setArchiveKey((currentKey) => currentKey + 1);
  }, []);

  const refreshFromHost = useCallback(async ({ refreshActiveTab = true } = {}) => {
    const config = await api.getConfig();
    applyConfigSnapshot(config);
    if (refreshActiveTab) {
      refreshActiveTabData();
    }
    return config;
  }, [applyConfigSnapshot, refreshActiveTabData]);

  const handleConfigSaved = useCallback(async (nextConfig) => {
    const mergedConfig = { ...(appConfig || {}), ...nextConfig };
    applyConfigSnapshot(mergedConfig);
    return mergedConfig;
  }, [appConfig, applyConfigSnapshot]);

  const handleLanguageChange = useCallback(async (nextLanguage) => {
    setLang(nextLanguage);
    setAppConfig((currentConfig) => ({ ...(currentConfig || {}), language: nextLanguage }));
    try {
      await api.saveConfig({ language: nextLanguage });
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'jp' ? 'ja' : lang;
  }, [lang]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    let timeoutId;

    const scheduleNextMinute = () => {
      const now = new Date();
      const msUntilNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      timeoutId = window.setTimeout(() => {
        setCurrentTime(new Date());
        scheduleNextMinute();
      }, Math.max(msUntilNextMinute, 1000));
    };

    setCurrentTime(new Date());
    scheduleNextMinute();

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (isAuthChecking || !currentUserId) return undefined;

    let poll;
    let isMounted = true;
    let initDone = false;

    const initApp = async () => {
      if (initDone || !isMounted) return;
      initDone = true;
      try {
        await refreshFromHost({ refreshActiveTab: false });
        if (!isMounted) return;
        refreshActiveTabData('planner');
        trackEvent('app_open');
      } catch (e) {
        console.error('Failed to load config:', e);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    };

    const isBrowserRuntime = import.meta.env.PROD
      && ['http:', 'https:'].includes(window.location.protocol);

    if (window.pywebview || isBrowserRuntime) {
      initApp();
    } else {
      let attempts = 0;
      poll = setInterval(() => {
        attempts++;
        if (window.pywebview) {
          clearInterval(poll);
          initApp();
        } else if (attempts >= 100) {
          clearInterval(poll);
          initApp();
        }
      }, 100);
    }

    const handleResume = () => {
      if (!isMounted) return;
      if (document.visibilityState === 'hidden') return;
      if (activeTabRef.current === 'settings') return;

      const now = Date.now();
      if (now - lastRefreshAtRef.current < 5000) return;
      lastRefreshAtRef.current = now;

      refreshFromHost().catch((error) => {
        console.error('Failed to refresh app state:', error);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleResume();
      }
    };

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      if (poll) clearInterval(poll);
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUserId, isAuthChecking, refreshFromHost, refreshActiveTabData]);

  useEffect(() => {
    syncThemeMode(themeMode, colorTheme, { force: true });
    if (themeMode !== 'dynamic') return undefined;

    let timeoutId;

    const scheduleNextThemeRefresh = () => {
      const delay = getMsUntilNextThemePhaseChange(new Date());
      timeoutId = window.setTimeout(() => {
        syncThemeMode('dynamic', colorTheme, { force: true });
        scheduleNextThemeRefresh();
      }, delay);
    };

    scheduleNextThemeRefresh();

    return () => window.clearTimeout(timeoutId);
  }, [themeMode, colorTheme, syncThemeMode]);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour >= 7 && hour < 12) return `${t(lang, 'goodMorning')}, ${nickname}! ☀️`;
    if (hour >= 12 && hour < 18) return `${t(lang, 'goodAfternoon')}, ${nickname}!`;
    if (hour >= 18 && hour < 23) return `${t(lang, 'goodEvening')}, ${nickname}! 🌙`;
    return `${t(lang, 'goodNight')}, ${nickname}! 🌙`;
  };

  const getDynamicSun = () => {
    const { currentWindow } = getWindowBlend(ICON_WINDOWS, currentTime);
    return currentWindow.icon;
  };

  const getIconFilter = () => {
    if (colorTheme === 'purple') return 'hue-rotate(250deg) saturate(1.2)';
    if (colorTheme === 'blue') return 'hue-rotate(195deg) saturate(1.1)';
    if (colorTheme === 'green') return 'hue-rotate(80deg) saturate(1.2)';
    return 'none';
  };

  const renderContent = () => {
    if (!isReady) {
      return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{t(lang, 'loadingApp')}</div>;
    }

    const wrapper = (children) => (
      <div className="main-content-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="app-header-greeting">
          <h1 className="tab-title">{getGreeting()}</h1>
          <p>{t(lang, 'greetingDesc')}</p>
        </div>
        {children}
      </div>
    );

    switch (activeTab) {
      case 'planner': return wrapper(<Planner lang={lang} refreshSignal={plannerRefreshSignal} />);
      case 'archive': return wrapper(<Archive key={archiveKey} lang={lang} />);
      case 'settings': return wrapper(<Settings lang={lang} configSnapshot={appConfig} onConfigSaved={handleConfigSaved} />);
      default: return wrapper(<Planner lang={lang} refreshSignal={plannerRefreshSignal} />);
    }
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => e.preventDefault();
  const handleSignOut = async () => {
    try {
      await signOut();
      setCurrentUser(null);
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  const navItems = [
    { id: 'planner', icon: <LayoutDashboard size={18} />, label: t(lang, 'planner') || 'Planner' },
    { id: 'archive', icon: <FileText size={18} />, label: t(lang, 'archive') || 'Archive' },
    { id: 'settings', icon: <SettingsIcon size={18} />, label: t(lang, 'settings') },
  ];

  if (isAuthChecking) {
    return (
      <>
        {import.meta.env.DEV && <AuthDebugBanner />}
        <div style={{ padding: '24px' }}>{t(lang, 'checkingLogin')}</div>
      </>
    );
  }

  if (isPasswordRecovery) {
    return (
      <>
        {import.meta.env.DEV && <AuthDebugBanner />}
        <LoginPage
          isPasswordRecovery
          onPasswordRecoveryComplete={() => setIsPasswordRecovery(false)}
        />
      </>
    );
  }

  if (!currentUser) {
    return (
      <>
        {import.meta.env.DEV && <AuthDebugBanner />}
        <LoginPage
          onAuthSuccess={async () => {
            try {
              const user = await getCurrentUser();
              setCurrentUser(user);
            } catch (error) {
              console.error('Failed to refresh auth state:', error);
              setCurrentUser(null);
            }
          }}
        />
      </>
    );
  }

  return (
    <div className="app-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      {import.meta.env.DEV && <AuthDebugBanner />}
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img 
            src={getDynamicSun()} 
            alt="Morning Star app icon" 
            className="sidebar-brand-image" 
            style={{ filter: getIconFilter(), transition: 'filter 0.5s ease' }} 
          />
          <div>
            <h1 className="sidebar-title">Morning Star</h1>
            <p className="sidebar-subtitle">{t(lang, 'brandTagline')}</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ id, icon, label }) => (
            <button
              type="button"
              key={id}
              className={`nav-item ${activeTab === id ? 'active' : ''}`}
              aria-label={label}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => {
                activeTabRef.current = id;
                setActiveTab(id);
                if (id === 'planner') setPlannerRefreshSignal((currentSignal) => currentSignal + 1);
                if (id === 'archive') setArchiveKey((currentKey) => currentKey + 1);
                trackEvent('tab_view', { tab_name: id });
              }}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}


          <div style={{ flexGrow: 1 }} />

          <div className="sidebar-language" role="group" aria-label={t(lang, 'languageSwitcherLabel')}>
            <div className="sidebar-language-label">
              <Globe2 size={14} />
              <span>{t(lang, 'languageSwitcherLabel')}</span>
            </div>
            <div className="sidebar-language-options">
              {[
                { id: 'ko', label: '한' },
                { id: 'en', label: 'EN' },
                { id: 'jp', label: '日' },
              ].map((language) => (
                <button
                  type="button"
                  key={language.id}
                  className={lang === language.id ? 'active' : ''}
                  onClick={() => handleLanguageChange(language.id)}
                  aria-pressed={lang === language.id}
                  aria-label={language.id === 'ko' ? '한국어' : language.id === 'en' ? 'English' : '日本語'}
                  title={language.id === 'ko' ? '한국어' : language.id === 'en' ? 'English' : '日本語'}
                >
                  {language.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="nav-item"
            aria-label={t(lang, 'howToUse')}
            onClick={() => {
              setIsPromptCopied(false);
              setIsHelpOpen(true);
              trackEvent('onboarding_view');
            }}
          >
            <HelpCircle size={18} />
            <span>{t(lang, 'howToUse')}</span>
          </button>

          <button type="button" className="nav-item" onClick={handleSignOut} aria-label={t(lang, 'signOut')}>
            <LogOut size={18} />
            <span>{t(lang, 'signOut')}</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content fade-in">
        {renderContent()}
      </main>

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="modal-overlay fade-in" onClick={() => setIsHelpOpen(false)}>
          <div
            className="modal-content glass-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-dialog-title"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '560px', maxHeight: '88vh', overflowY: 'auto' }}
          >
            <button type="button" className="icon-btn close-modal-btn" onClick={() => setIsHelpOpen(false)} aria-label={t(lang, 'freqCancel')}>
              <X size={20} />
            </button>
            <h2 id="help-dialog-title" className="modal-title">{t(lang, 'helpTitle')}</h2>

            <div className="onboarding-steps">
              <div className="step-item">
                <div className="step-number">1</div>
                <div className="step-text">
                  <strong>{t(lang, 'helpStep1Title')}</strong>
                  <p>{t(lang, 'helpStep1Desc')}</p>
                </div>
              </div>
              <div className="step-item">
                <div className="step-number">2</div>
                <div className="step-text">
                  <strong>{t(lang, 'helpStep2Title')}</strong>
                  <p>{t(lang, 'helpStep2Desc')}</p>
                </div>
              </div>
              <div className="step-item">
                <div className="step-number">3</div>
                <div className="step-text">
                  <strong>{t(lang, 'helpStep3Title')}</strong>
                  <p>{t(lang, 'helpStep3Desc')}</p>
                </div>
              </div>
            </div>

            {/* ── AI Prompt Template ── */}
            <div style={{ marginTop: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>✦ {t(lang, 'aiTaskGeneratorTitle')}</strong>
                <button
                  className="btn btn-outline-primary"
                  style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                  onClick={() => {
                    const prompt = document.getElementById('ms-prompt-box').value;
                    const copyOperation = navigator.clipboard?.writeText
                      ? navigator.clipboard.writeText(prompt)
                      : Promise.reject(new Error('Clipboard API unavailable'));
                    copyOperation.then(() => {
                      setIsPromptCopied(true);
                      window.setTimeout(() => setIsPromptCopied(false), 1600);
                    }).catch(() => {
                      document.getElementById('ms-prompt-box').select();
                      document.execCommand('copy');
                      setIsPromptCopied(true);
                      window.setTimeout(() => setIsPromptCopied(false), 1600);
                    });
                  }}
                >
                  {t(lang, isPromptCopied ? 'copiedPrompt' : 'copyPrompt')}
                </button>
              </div>
              <textarea
                id="ms-prompt-box"
                readOnly
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: '140px',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '10px',
                  padding: '12px',
                  resize: 'none',
                  lineHeight: '1.55',
                }}
                value={t(lang, 'aiPromptTemplate')}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
                {t(lang, 'aiPromptGuide')}
              </p>
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: '20px', width: '100%' }}
              onClick={() => setIsHelpOpen(false)}
            >
              {t(lang, 'helpStart')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


export default App;
