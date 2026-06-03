// Tests for the publish bundler's pure seams: the `window.BB_*` globals preamble
// and the `</script` breakout escaping. The full bundlePlayer() does a network
// fetch of display.html and walks the module graph (covered by module-graph
// tests), so here we exercise only the framework- and network-free helpers.

import { test, expect, describe } from './runner.js';
import { buildGlobalLines, escapeScriptBody } from '../admin/publish.js';

describe('publish · escapeScriptBody', () => {
  test('neutralises a literal </script so it cannot close the inline tag', () => {
    const out = escapeScriptBody('var x = "</script>";');
    expect(out).notToContain('</script');
    expect(out).toContain('<\\/script');
  });

  test('is case-insensitive (</SCRIPT, </Script)', () => {
    expect(escapeScriptBody('a</SCRIPT b')).notToContain('</SCRIPT');
    expect(escapeScriptBody('a</Script b')).notToContain('</Script');
  });

  test('leaves ordinary content untouched', () => {
    expect(escapeScriptBody('window.X = 1;')).toBe('window.X = 1;');
  });
});

describe('publish · buildGlobalLines', () => {
  test('always emits BB_READ_URL and BB_STUDIO_VERSION first', () => {
    const lines = buildGlobalLines('https://r.example/abc', {});
    expect(lines[0]).toContain('window.BB_READ_URL');
    expect(lines[0]).toContain('https://r.example/abc');
    expect(lines[1]).toContain('window.BB_STUDIO_VERSION');
  });

  test('passes through well-named BB_ globals, JSON-encoded', () => {
    const lines = buildGlobalLines('', { BB_ORG_BRAND: { font: 'Inter' } });
    const joined = lines.join('');
    expect(joined).toContain('window.BB_ORG_BRAND = {"font":"Inter"};');
  });

  test('ignores badly-named keys and undefined values', () => {
    const lines = buildGlobalLines('', { notBB: 1, 'BB-bad': 2, BB_OK: undefined, BB_GOOD: 3 });
    const joined = lines.join('');
    expect(joined).notToContain('notBB');
    expect(joined).notToContain('BB-bad');
    expect(joined).notToContain('BB_OK'); // undefined value dropped
    expect(joined).toContain('window.BB_GOOD = 3;');
  });

  test('an owner brand value with </script cannot break out once escaped', () => {
    // Real attack shape: a font name that closes the script and opens a new one.
    const evil = '</script><script>alert(1)</script>';
    const lines = buildGlobalLines('', { BB_ORG_BRAND: { font: evil } });
    const scriptBody = escapeScriptBody(lines.join(''));
    // The exact value is still present (JSON-escaped) but no live `</script` remains.
    expect(scriptBody).notToContain('</script');
    expect(scriptBody).toContain('<\\/script');
  });
});
