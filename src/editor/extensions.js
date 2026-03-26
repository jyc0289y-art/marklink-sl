// OfficeLink SL — CodeMirror 6 Extensions
import { keymap, EditorView } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { search } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { bracketMatching } from '@codemirror/language';

/**
 * Custom keymap: auto-continue lists on Enter.
 * Handles: `- `, `* `, `+ `, `1. `, `- [ ] `, `- [x] `, `> `
 * If current list item is empty, removes the prefix (un-indent).
 */
const listContinueKeymap = keymap.of([{
  key: 'Enter',
  run(view) {
    const { head } = view.state.selection.main;
    const line = view.state.doc.lineAt(head);
    // Only run if cursor is at end of line (or very near)
    if (head < line.to) return false;
    const text = line.text;

    // Match list patterns
    const listMatch = text.match(/^(\s*)([-*+])\s(\[[ xX]\]\s)?(.*)$/);
    const orderedMatch = text.match(/^(\s*)(\d+)\.\s(.*)$/);
    const quoteMatch = text.match(/^(\s*)(>\s+)(.*)$/);

    if (listMatch) {
      const [, indent, bullet, checkbox, content] = listMatch;
      // Empty item: remove the prefix
      if (!content.trim()) {
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: '' },
        });
        return true;
      }
      // Continue with same prefix
      const prefix = checkbox ? `${indent}${bullet} ${checkbox}` : `${indent}${bullet} `;
      // Reset checkbox to unchecked
      const newPrefix = prefix.replace(/\[[xX]\]/, '[ ]');
      view.dispatch({
        changes: { from: head, insert: '\n' + newPrefix },
        selection: { anchor: head + 1 + newPrefix.length },
      });
      return true;
    }

    if (orderedMatch) {
      const [, indent, num, content] = orderedMatch;
      if (!content.trim()) {
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: '' },
        });
        return true;
      }
      const nextNum = parseInt(num) + 1;
      const prefix = `${indent}${nextNum}. `;
      view.dispatch({
        changes: { from: head, insert: '\n' + prefix },
        selection: { anchor: head + 1 + prefix.length },
      });
      return true;
    }

    if (quoteMatch) {
      const [, indent, quotePrefix, content] = quoteMatch;
      if (!content.trim()) {
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: '' },
        });
        return true;
      }
      const prefix = `${indent}${quotePrefix}`;
      view.dispatch({
        changes: { from: head, insert: '\n' + prefix },
        selection: { anchor: head + 1 + prefix.length },
      });
      return true;
    }

    return false; // Let default Enter handle it
  },
}]);

/**
 * Returns shared CM6 extensions (keymaps, search, bracket matching, etc.)
 */
export function getExtensions() {
  return [
    keymap.of([indentWithTab, ...closeBracketsKeymap]),
    search(),
    closeBrackets(),
    bracketMatching(),
    listContinueKeymap,
  ];
}
