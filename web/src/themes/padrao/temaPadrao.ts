/**
 * Tema padrão do TeamControl — paleta escura.
 *
 * Valores herdados do app pessoal de finanças do coordenador (static/app.css):
 *   base #0f1419 · elevação rgba(26,32,44,.85) · bordas em branco translúcido
 *   texto #e6e9ed / #b0b8c4 / #6a7385
 *   accent verde #27ae60 (com #1e8449 no gradiente)
 *   semânticas: #e74c3c vermelho · #3498db azul · #9b59b6 roxo · #f39c12 âmbar
 *
 * Herda estrutura, tipografia e escalas do tema gothic que o CLI copiou, e
 * troca só os tokens de cor — é o que o Astryx chama de camada de tema: muda a
 * identidade visual sem tocar em componente.
 */

import { gothicTheme } from '../gothic/gothicTheme';

/** Paleta base, nomeada como no CSS original. */
export const FIN = {
  bgBase: '#0f1419',
  bgElev1: '#1a202c',
  bgElev2: '#151b23',
  bgCard: '#1a202c',
  bgInput: '#0f1419',
  borderSoft: 'rgba(255, 255, 255, 0.08)',
  borderMid: 'rgba(255, 255, 255, 0.14)',
  textPrimary: '#e6e9ed',
  textSecondary: '#b0b8c4',
  textMuted: '#6a7385',
  textDim: '#5a6478',
  receita: '#27ae60',
  receita2: '#1e8449',
  receitaClara: '#58d68d',
  despesa: '#e74c3c',
  despesa2: '#c0392b',
  despesaClara: '#f1948a',
  sobra: '#3498db',
  sobraClara: '#5dade2',
  investido: '#9b59b6',
  warn: '#f39c12',
  warnClara: '#f4d03f',
} as const;

const tokens = {
  ...gothicTheme.tokens,

  // Superfícies — o fundo levemente azulado é a assinatura da paleta.
  '--color-background-body': 'transparent',
  '--color-background-surface': 'transparent',
  '--color-background-card': 'rgba(26, 32, 44, 0.85)',
  '--color-background-popover': FIN.bgElev1,
  '--color-background-muted': FIN.bgElev2,
  '--color-background-inverted': FIN.textPrimary,
  '--color-overlay': '#0f1419CC',
  '--color-overlay-hover': 'rgba(255,255,255,0.05)',
  '--color-overlay-pressed': 'rgba(255,255,255,0.09)',

  // Accent verde — o botão primário e o item de menu ativo saem daqui.
  '--color-accent': FIN.receita,
  '--color-accent-muted': 'rgba(39,174,96,0.22)',
  '--color-neutral': 'rgba(255,255,255,0.06)',
  '--color-text-accent': FIN.receitaClara,
  '--color-icon-accent': FIN.receita,
  '--color-on-accent': '#0f1419',

  // Texto
  '--color-text-primary': FIN.textPrimary,
  '--color-text-secondary': FIN.textSecondary,
  '--color-text-disabled': FIN.textDim,
  '--color-on-dark': FIN.textPrimary,
  '--color-on-light': FIN.bgBase,
  '--color-on-success': '#0f1419',
  '--color-on-error': '#0f1419',
  '--color-on-warning': '#0f1419',

  // Ícones
  '--color-icon-primary': FIN.textPrimary,
  '--color-icon-secondary': FIN.textSecondary,
  '--color-icon-disabled': FIN.textDim,

  // Semânticas — saturadas de propósito, como no CSS de origem.
  '--color-success': FIN.receita,
  '--color-success-muted': 'rgba(39,174,96,0.18)',
  '--color-error': FIN.despesa,
  '--color-error-muted': 'rgba(231,76,60,0.18)',
  '--color-warning': FIN.warn,
  '--color-warning-muted': 'rgba(243,156,18,0.18)',
  '--color-info': FIN.sobra,
  '--color-info-muted': 'rgba(52,152,219,0.18)',

  // Os fundos categóricos (--color-background-green e irmãos) ficam como o
  // tema base define. Sobrescrevi-os numa primeira tentativa e os rótulos de
  // Token saíram ilegíveis: o fundo virou escuro translúcido, mas a cor de
  // texto correspondente continuou a do tema, calculada para fundo claro.
  // A identidade do tema vem das superfícies e do accent, não daqui.

  // Bordas
  '--color-border-soft': FIN.borderSoft,
  '--color-border': FIN.borderMid,
};

/* ============================================================
   Escalas categóricas.

   O tema base vinha com pastéis empoeirados — o laranja saía em
   rgb(211,184,154), um bege que briga com esta paleta. Token e
   Card escolhem tons dessas escalas, então a correção tem que ser aqui, e não
   nos tokens de fundo (tentei isso antes e quebrou a legibilidade do rótulo,
   porque a cor do texto continuou vindo da escala antiga).

   A rampa é gerada do matiz base: mesma cor, luminosidade variando de 0 a 100.
   Assim fundo claro e texto escuro saem do mesmo matiz e o contraste fecha.
   ============================================================ */

const DEGRAUS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
                 55, 60, 65, 70, 75, 80, 85, 90, 95, 100] as const;

function hexParaHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [((h * 60) + 360) % 360, s * 100, l * 100];
}

function hslParaHex(h: number, s: number, l: number): string {
  const S = s / 100, L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const q = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${q(r)}${q(g)}${q(b)}`;
}

/** Rampa de 21 degraus a partir de um matiz, preservando saturação. */
function rampa(base: string) {
  const [h, s] = hexParaHsl(base);
  const escala: Record<string, string | number> = { hue: Math.round(h), chroma: Math.round(s / 3) };
  for (const d of DEGRAUS) {
    // Dessatura nas pontas para o preto e o branco não ficarem tingidos.
    const satura = d <= 5 || d >= 95 ? s * 0.25 : s;
    escala[d] = hslParaHex(h, satura, d);
  }
  return escala;
}

export const temaPadrao = {
  ...gothicTheme,
  name: 'teamcontrol',
  tokens,
  green: rampa(FIN.receita),
  teal: rampa(FIN.receitaClara),
  red: rampa(FIN.despesa),
  pink: rampa(FIN.despesa2),
  orange: rampa(FIN.warn),
  yellow: rampa(FIN.warnClara),
  blue: rampa(FIN.sobra),
  cyan: rampa(FIN.sobraClara),
  purple: rampa(FIN.investido),
} as typeof gothicTheme;
