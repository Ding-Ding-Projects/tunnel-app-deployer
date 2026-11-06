'use strict';
// Small, escape-first Markdown renderer shared by the in-app guide and the website.
// Supports headings, paragraphs, lists, tables, bold, inline code and links. Raw HTML is never passed through.
(function (root) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function inline(text) {
    let s = esc(text);
    s = s.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\(article:([a-z0-9-]+)\)/g, '<a href="#article/$2" data-article="$2">$1</a>');
    s = s.replace(/(^|[\s(])(https:\/\/[^\s<)]+[^\s<).,])/g, '$1<a href="$2" data-external="true" rel="noopener">$2</a>');
    return s;
  }
  function render(markdown) {
    const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { const level = h[1].length + 1; const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); html.push(`<h${level} id="h-${id}">${inline(h[2])}</h${level}>`); i++; continue; }
      if (/^\|/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const head = cells(rows[0]);
        const body = rows.slice(rows[1] && /^\|[\s:|-]+\|?$/.test(rows[1]) ? 2 : 1).map(cells);
        html.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) { items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, '')); i++; }
        const tag = ordered ? 'ol' : 'ul';
        html.push(`<${tag}>${items.map(it => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\||\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) { para.push(lines[i].trim()); i++; }
      html.push(`<p>${inline(para.join(' '))}</p>`);
    }
    return html.join('\n');
  }
  function plain(markdown) { return String(markdown).replace(/[#*`|]/g, ' ').replace(/\s+/g, ' ').trim(); }
  const api = { render, plain, escape: esc };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Markdown = api;
})(typeof window === 'undefined' ? globalThis : window);
