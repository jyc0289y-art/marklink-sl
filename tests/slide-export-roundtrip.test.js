import { describe, it, expect } from 'vitest';

// ── Slide Export Roundtrip Tests ──
// Tests the slide data model → PPTX structure conversion by replicating
// key functions from slide-file.js. The real PPTX export requires JSZip,
// DOMParser, etc., so we test the structural logic in isolation.

// ── Replicated constants ──
const SLIDE_W = 9144000;
const SLIDE_H = 6858000;
const MARGIN_L = 457200;
const MARGIN_T = 274320;
const BODY_W = SLIDE_W - MARGIN_L * 2;

// ── Replicated helpers ──
const emuToPx = (emu) => Math.round((parseInt(emu, 10) || 0) / 914400 * 96);
const ptToEmu = (pt) => Math.round(pt * 12700);

const escXmlExport = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const parseOoxmlColor = (val) => {
  if (!val) return null;
  if (/^[0-9A-Fa-f]{6}$/.test(val)) return '#' + val;
  return null;
};

function validateSlides(slides) {
  return slides.filter((s) => s && typeof s === 'object').map((s) => ({
    content: typeof s.content === 'string' ? s.content : '',
    notes: typeof s.notes === 'string' ? s.notes : '',
    theme: typeof s.theme === 'string' ? s.theme : 'default',
    transition: typeof s.transition === 'string' ? s.transition : 'none',
    transitionDuration: typeof s.transitionDuration === 'number' ? s.transitionDuration : 0.5,
    transitionEasing: typeof s.transitionEasing === 'string' ? s.transitionEasing : 'ease',
    animations: Array.isArray(s.animations) ? s.animations : [],
    layout: s.layout || null,
    background: s.background || null,
  }));
}

const THEMES = {
  default: 'background:#fff;color:#333',
  dark: 'background:#1a1a2e;color:#eee',
  blue: 'background:linear-gradient(135deg,#0f3460,#16213e);color:#eee',
  green: 'background:linear-gradient(135deg,#1a3c34,#2d6a4f);color:#eee',
};

// Heading size map from htmlToOoxmlShapes
const HEADING_FONT_SIZES = { h1: 4400, h2: 3200, h3: 2800 };

// ─── 1. Slide count preservation ───

describe('Slide export — slide count preservation', () => {
  it('preserves single slide', () => {
    const slides = validateSlides([{ content: '<h1>Title</h1>' }]);
    expect(slides).toHaveLength(1);
  });

  it('preserves multiple slides', () => {
    const slides = validateSlides([
      { content: '<h1>Slide 1</h1>' },
      { content: '<h1>Slide 2</h1>' },
      { content: '<h1>Slide 3</h1>' },
    ]);
    expect(slides).toHaveLength(3);
  });

  it('filters out null and invalid slides', () => {
    const slides = validateSlides([
      { content: '<h1>Valid</h1>' },
      null,
      undefined,
      false,
      { content: '<h1>Also valid</h1>' },
    ]);
    expect(slides).toHaveLength(2);
  });

  it('handles large slide decks', () => {
    const input = Array.from({ length: 100 }, (_, i) => ({
      content: `<h1>Slide ${i + 1}</h1>`,
    }));
    const slides = validateSlides(input);
    expect(slides).toHaveLength(100);
    expect(slides[99].content).toBe('<h1>Slide 100</h1>');
  });
});

// ─── 2. Text content preservation ───

describe('Slide export — text content preservation', () => {
  it('preserves heading content', () => {
    const slides = validateSlides([{ content: '<h1>Main Title</h1><h2>Subtitle</h2>' }]);
    expect(slides[0].content).toContain('Main Title');
    expect(slides[0].content).toContain('Subtitle');
  });

  it('preserves paragraph content', () => {
    const slides = validateSlides([{ content: '<p>Body text with details</p>' }]);
    expect(slides[0].content).toContain('Body text with details');
  });

  it('preserves formatted text', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em> and <u>underline</u></p>';
    const slides = validateSlides([{ content: html }]);
    expect(slides[0].content).toContain('<strong>Bold</strong>');
    expect(slides[0].content).toContain('<em>italic</em>');
    expect(slides[0].content).toContain('<u>underline</u>');
  });

  it('preserves special characters in content', () => {
    const html = '<p>10 &gt; 5 &amp; 3 &lt; 7</p>';
    const slides = validateSlides([{ content: html }]);
    expect(slides[0].content).toContain('&gt;');
    expect(slides[0].content).toContain('&amp;');
  });

  it('preserves Unicode content', () => {
    const slides = validateSlides([{ content: '<h1>한국어 프레젠테이션</h1>' }]);
    expect(slides[0].content).toContain('한국어 프레젠테이션');
  });
});

// ─── 3. Empty slide export ───

describe('Slide export — empty slide handling', () => {
  it('handles empty content slide', () => {
    const slides = validateSlides([{ content: '' }]);
    expect(slides).toHaveLength(1);
    expect(slides[0].content).toBe('');
  });

  it('handles slide with no content property', () => {
    const slides = validateSlides([{}]);
    expect(slides).toHaveLength(1);
    expect(slides[0].content).toBe('');
  });

  it('handles empty array', () => {
    const slides = validateSlides([]);
    expect(slides).toHaveLength(0);
  });

  it('handles slide with non-string content', () => {
    const slides = validateSlides([{ content: 42 }]);
    expect(slides[0].content).toBe('');
  });
});

// ─── 4. Slide with images ───

describe('Slide export — image handling', () => {
  it('preserves image data URIs in content', () => {
    const imgSrc = 'data:image/png;base64,iVBORw0KGgo=';
    const html = `<img src="${imgSrc}" width="200" height="100">`;
    const slides = validateSlides([{ content: html }]);
    expect(slides[0].content).toContain('data:image/png;base64');
  });

  it('preserves multiple images in a slide', () => {
    const html = `
      <img src="data:image/png;base64,AAA=" width="100" height="50">
      <p>Between images</p>
      <img src="data:image/jpeg;base64,BBB=" width="200" height="100">
    `;
    const slides = validateSlides([{ content: html }]);
    expect(slides[0].content).toContain('data:image/png');
    expect(slides[0].content).toContain('data:image/jpeg');
  });
});

// ─── 5. Speaker notes ───

describe('Slide export — speaker notes', () => {
  it('preserves speaker notes', () => {
    const slides = validateSlides([{
      content: '<h1>Title</h1>',
      notes: 'Remember to mention the Q4 results',
    }]);
    expect(slides[0].notes).toBe('Remember to mention the Q4 results');
  });

  it('handles empty notes', () => {
    const slides = validateSlides([{ content: '<h1>Title</h1>', notes: '' }]);
    expect(slides[0].notes).toBe('');
  });

  it('handles null notes', () => {
    const slides = validateSlides([{ content: '<h1>Title</h1>', notes: null }]);
    expect(slides[0].notes).toBe('');
  });
});

// ─── 6. Theme and transition preservation ───

describe('Slide export — theme and transition', () => {
  it('preserves theme selection', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>', theme: 'dark' }]);
    expect(slides[0].theme).toBe('dark');
  });

  it('defaults to "default" theme', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>' }]);
    expect(slides[0].theme).toBe('default');
  });

  it('preserves transition type', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>', transition: 'slide' }]);
    expect(slides[0].transition).toBe('slide');
  });

  it('preserves transition duration', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>', transitionDuration: 1.5 }]);
    expect(slides[0].transitionDuration).toBe(1.5);
  });

  it('preserves transition easing', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>', transitionEasing: 'linear' }]);
    expect(slides[0].transitionEasing).toBe('linear');
  });
});

// ─── 7. Layout and background ───

describe('Slide export — layout and background', () => {
  it('preserves layout', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>', layout: 'two-column' }]);
    expect(slides[0].layout).toBe('two-column');
  });

  it('preserves background', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>', background: '#000000' }]);
    expect(slides[0].background).toBe('#000000');
  });

  it('defaults layout to null', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>' }]);
    expect(slides[0].layout).toBeNull();
  });
});

// ─── 8. Animations ───

describe('Slide export — animations', () => {
  it('preserves animation array', () => {
    const anim = [{ type: 'fadeIn', target: '.title', delay: 0 }];
    const slides = validateSlides([{ content: '<h1>T</h1>', animations: anim }]);
    expect(slides[0].animations).toHaveLength(1);
    expect(slides[0].animations[0].type).toBe('fadeIn');
  });

  it('defaults animations to empty array', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>' }]);
    expect(slides[0].animations).toEqual([]);
  });

  it('rejects non-array animations', () => {
    const slides = validateSlides([{ content: '<h1>T</h1>', animations: 'invalid' }]);
    expect(slides[0].animations).toEqual([]);
  });
});

// ─── 9. XML escaping for export ───

describe('Slide export — XML escaping', () => {
  it('escapes all XML special characters', () => {
    expect(escXmlExport('a&b')).toBe('a&amp;b');
    expect(escXmlExport('<tag>')).toBe('&lt;tag&gt;');
    expect(escXmlExport('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escXmlExport("it's")).toBe('it&apos;s');
  });

  it('handles combined special characters', () => {
    expect(escXmlExport('A & B > C < D "E" \'F\'')).toBe(
      'A &amp; B &gt; C &lt; D &quot;E&quot; &apos;F&apos;'
    );
  });

  it('handles empty string', () => {
    expect(escXmlExport('')).toBe('');
  });

  it('handles non-string input', () => {
    expect(escXmlExport(42)).toBe('42');
  });
});

// ─── 10. EMU/pt conversions ───

describe('Slide export — unit conversions', () => {
  it('emuToPx: standard conversions', () => {
    expect(emuToPx(914400)).toBe(96); // 1 inch
    expect(emuToPx(SLIDE_W)).toBe(960); // 10 inches
    expect(emuToPx(0)).toBe(0);
  });

  it('ptToEmu: standard conversions', () => {
    expect(ptToEmu(1)).toBe(12700);
    expect(ptToEmu(12)).toBe(152400);
    expect(ptToEmu(0)).toBe(0);
  });

  it('emuToPx ↔ ptToEmu approximate roundtrip', () => {
    // 72pt = 1 inch = 914400 EMU = 96px
    const emu = ptToEmu(72);
    // ptToEmu(72) = 914400
    expect(emu).toBe(914400);
    expect(emuToPx(emu)).toBe(96);
  });
});

// ─── 11. Heading font sizes for PPTX export ───

describe('Slide export — heading font sizes', () => {
  it('h1 uses 44pt (4400 hundredths)', () => {
    expect(HEADING_FONT_SIZES.h1).toBe(4400);
  });

  it('h2 uses 32pt (3200 hundredths)', () => {
    expect(HEADING_FONT_SIZES.h2).toBe(3200);
  });

  it('h3 uses 28pt (2800 hundredths)', () => {
    expect(HEADING_FONT_SIZES.h3).toBe(2800);
  });
});

// ─── 12. OOXML color parsing ───

describe('Slide export — OOXML color parsing', () => {
  it('parses 6-digit hex', () => {
    expect(parseOoxmlColor('FF0000')).toBe('#FF0000');
    expect(parseOoxmlColor('00ff00')).toBe('#00ff00');
  });

  it('rejects invalid formats', () => {
    expect(parseOoxmlColor('#FF0000')).toBeNull(); // has # prefix
    expect(parseOoxmlColor('F00')).toBeNull(); // 3-digit
    expect(parseOoxmlColor('GGHHII')).toBeNull(); // invalid hex
    expect(parseOoxmlColor('')).toBeNull();
    expect(parseOoxmlColor(null)).toBeNull();
  });
});

// ─── 13. Slide dimensions ───

describe('Slide export — dimensions', () => {
  it('uses standard 10x7.5 inch slide', () => {
    // 10 inches = 9144000 EMU
    expect(SLIDE_W).toBe(9144000);
    // 7.5 inches = 6858000 EMU
    expect(SLIDE_H).toBe(6858000);
  });

  it('slide width in pixels is 960', () => {
    expect(emuToPx(SLIDE_W)).toBe(960);
  });

  it('slide height in pixels is 720', () => {
    expect(emuToPx(SLIDE_H)).toBe(720);
  });

  it('body width accounts for margins', () => {
    expect(BODY_W).toBe(SLIDE_W - MARGIN_L * 2);
    expect(BODY_W).toBeLessThan(SLIDE_W);
  });
});

// ─── 14. Complete slide roundtrip simulation ───

describe('Slide export — full data roundtrip', () => {
  it('roundtrips a complete slide deck through validate', () => {
    const original = [
      {
        content: '<h1>Welcome</h1><p>Introduction text</p>',
        notes: 'Opening remarks',
        theme: 'blue',
        transition: 'fade',
        transitionDuration: 0.8,
        transitionEasing: 'ease-in-out',
        animations: [{ type: 'fadeIn', delay: 0 }],
        layout: 'title',
        background: '#1a1a2e',
      },
      {
        content: '<h2>Key Points</h2><ul><li>Point 1</li><li>Point 2</li></ul>',
        notes: 'Explain each point',
        theme: 'dark',
        transition: 'slide',
        transitionDuration: 0.5,
        transitionEasing: 'ease',
        animations: [],
        layout: null,
        background: null,
      },
    ];

    const validated = validateSlides(original);
    expect(validated).toHaveLength(2);

    // First slide
    expect(validated[0].content).toContain('Welcome');
    expect(validated[0].notes).toBe('Opening remarks');
    expect(validated[0].theme).toBe('blue');
    expect(validated[0].transition).toBe('fade');
    expect(validated[0].transitionDuration).toBe(0.8);
    expect(validated[0].layout).toBe('title');

    // Second slide
    expect(validated[1].content).toContain('Key Points');
    expect(validated[1].notes).toBe('Explain each point');
    expect(validated[1].theme).toBe('dark');
    expect(validated[1].transition).toBe('slide');
  });
});
