'use strict';
// Regex helpers shared by every search box: explanation, validation and bounded matching.
(function (root) {
  const MAX_PATTERN = 300;
  const MAX_TEXT = 20000;
  const FLAGS = ['i', 'm', 's', 'u'];
  const classes = { d: 'any digit', D: 'any non-digit', w: 'any word character', W: 'any non-word character', s: 'any whitespace', S: 'any non-whitespace', b: 'word boundary', B: 'not a word boundary', n: 'newline', t: 'tab', r: 'carriage return' };

  function explain(pattern) {
    const out = [];
    let i = 0;
    const push = (text, kind, desc) => out.push({ text, kind, desc });
    while (i < pattern.length) {
      const c = pattern[i];
      if (c === '\\') {
        const n = pattern[i + 1] ?? '';
        if (/[1-9]/.test(n)) { push(c + n, 'ref', `same text as group ${n}`); i += 2; continue; }
        push(c + n, 'class', classes[n] || `the literal character "${n}"`); i += 2; continue;
      }
      if (c === '[') {
        let j = i + 1;
        if (pattern[j] === '^') j++;
        if (pattern[j] === ']') j++;
        while (j < pattern.length && pattern[j] !== ']') j += pattern[j] === '\\' ? 2 : 1;
        const text = pattern.slice(i, j + 1);
        push(text, 'set', text[1] === '^' ? `one character not in ${text.slice(2, -1) || 'the set'}` : `one character from ${text.slice(1, -1) || 'the set'}`);
        i = j + 1; continue;
      }
      if (c === '(') {
        const m = pattern.slice(i).match(/^\(\?(?:<([A-Za-z_]\w*)>|([:=!])|<([=!]))/);
        if (m) {
          const kind = m[1] ? `start of group "${m[1]}"` : m[2] === ':' ? 'start of a group that is not captured' : m[2] === '=' ? 'start of a look-ahead' : m[2] === '!' ? 'start of a negative look-ahead' : m[3] === '=' ? 'start of a look-behind' : 'start of a negative look-behind';
          push(m[0], 'group', kind); i += m[0].length; continue;
        }
        push(c, 'group', 'start of a captured group'); i++; continue;
      }
      if (c === ')') { push(c, 'group', 'end of group'); i++; continue; }
      if (c === '{') {
        const m = pattern.slice(i).match(/^\{(\d+)(,(\d*))?\}\??/);
        if (m) { push(m[0], 'quant', m[2] === undefined ? `exactly ${m[1]} times` : m[3] ? `${m[1]} to ${m[3]} times` : `${m[1]} or more times`); i += m[0].length; continue; }
      }
      if ('*+?'.includes(c)) {
        const lazy = pattern[i + 1] === '?' && c !== '?' ? '?' : '';
        const base = c === '*' ? 'zero or more times' : c === '+' ? 'one or more times' : 'optional';
        push(c + lazy, 'quant', lazy ? `${base}, as few as possible` : base); i += 1 + lazy.length; continue;
      }
      if (c === '^') { push(c, 'anchor', 'start of text (or line with m)'); i++; continue; }
      if (c === '$') { push(c, 'anchor', 'end of text (or line with m)'); i++; continue; }
      if (c === '|') { push(c, 'alt', 'or'); i++; continue; }
      if (c === '.') { push(c, 'class', 'any character except newline (any at all with s)'); i++; continue; }
      let j = i;
      while (j < pattern.length && !'\\[](){}*+?^$|.'.includes(pattern[j])) j++;
      if (j === i) j = i + 1;
      push(pattern.slice(i, j), 'literal', `the text "${pattern.slice(i, j)}"`);
      i = j;
    }
    return out;
  }

  // Blocks the classic catastrophic shapes: a repeated group whose body is itself repeated.
  function unsafe(pattern) {
    return /\((?:[^()\\]|\\.)*[*+](?:[^()\\]|\\.)*\)\s*(?:[*+]|\{\d+,\d*\})/.test(pattern) || /(\.\*){3,}/.test(pattern);
  }

  function compile(pattern, flags = '') {
    if (typeof pattern !== 'string' || !pattern) return { ok: false, reason: 'empty' };
    if (pattern.length > MAX_PATTERN) return { ok: false, reason: 'tooLong' };
    if (unsafe(pattern)) return { ok: false, reason: 'unsafe' };
    const clean = [...new Set(String(flags).split(''))].filter(f => FLAGS.includes(f)).join('');
    try { return { ok: true, regex: new RegExp(pattern, clean), flags: clean }; }
    catch (error) { return { ok: false, reason: 'invalid', message: error.message }; }
  }

  function test(compiled, text) {
    if (!compiled?.ok) return false;
    compiled.regex.lastIndex = 0;
    return compiled.regex.test(String(text ?? '').slice(0, MAX_TEXT));
  }

  function count(compiled, text) {
    if (!compiled?.ok) return 0;
    const re = new RegExp(compiled.regex.source, compiled.flags.includes('g') ? compiled.flags : compiled.flags + 'g');
    let n = 0, m;
    const s = String(text ?? '').slice(0, MAX_TEXT);
    while ((m = re.exec(s)) && n < 1000) { n++; if (m[0] === '') re.lastIndex++; }
    return n;
  }

  // One matcher for plain or regex search, used by every search surface.
  function matcher(query, { regex = false, flags = 'i' } = {}) {
    if (!query) return { ok: true, test: () => true };
    if (!regex) { const q = query.toLowerCase(); return { ok: true, test: text => String(text ?? '').toLowerCase().includes(q) }; }
    const compiled = compile(query, flags);
    if (!compiled.ok) return { ok: false, reason: compiled.reason, message: compiled.message, test: () => false };
    return { ok: true, test: text => test(compiled, text) };
  }

  const api = { explain, unsafe, compile, test, count, matcher, MAX_PATTERN, MAX_TEXT, FLAGS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RegexTools = api;
})(typeof window === 'undefined' ? globalThis : window);
