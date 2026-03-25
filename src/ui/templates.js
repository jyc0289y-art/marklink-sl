// OfficeLink SL — Template System
// Provides pre-built templates for Document, Sheet, and Slide editors

import { setDocContent } from '../document/doc-editor.js';
import { setSheetsData } from '../sheet/sheet-ui.js';
import { setSlidesData } from '../slide/slide-editor.js';
import { setContent as setMarkdownContent } from '../editor/editor.js';
import { createSheetData, setCell } from '../sheet/sheet-engine.js';
import { switchTab } from './tabs.js';

/* ================================================================
   Document Templates
   ================================================================ */

const DOC_TEMPLATES = [
  {
    id: 'doc-blank',
    name: 'Blank Document',
    icon: '📄',
    desc: 'Start from scratch',
    preview: 'blank',
    content: '<p><br></p>',
  },
  {
    id: 'doc-meeting',
    name: 'Meeting Notes',
    icon: '📋',
    desc: 'Date, attendees, agenda, action items',
    preview: 'meeting',
    content: () => {
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      return `<h1 style="margin-bottom:4px">Meeting Notes</h1>
<p style="color:#666;margin:0 0 16px"><strong>Date:</strong> ${today} &nbsp; | &nbsp; <strong>Time:</strong> __:__ AM/PM</p>
<h2>Attendees</h2>
<ul><li>Name 1 (Role)</li><li>Name 2 (Role)</li><li>Name 3 (Role)</li></ul>
<h2>Agenda</h2>
<ol><li>Opening &amp; Roll Call</li><li>Review of Previous Action Items</li><li>Discussion Topic 1</li><li>Discussion Topic 2</li><li>New Business</li></ol>
<h2>Discussion Notes</h2>
<p><br></p>
<h2>Action Items</h2>
<table style="width:100%;border-collapse:collapse;border:1px solid #ddd">
<tr style="background:#f5f5f5"><th style="padding:8px;border:1px solid #ddd;text-align:left">Action</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Owner</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Due Date</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Status</th></tr>
<tr><td style="padding:8px;border:1px solid #ddd">&nbsp;</td><td style="padding:8px;border:1px solid #ddd">&nbsp;</td><td style="padding:8px;border:1px solid #ddd">&nbsp;</td><td style="padding:8px;border:1px solid #ddd">&nbsp;</td></tr>
<tr><td style="padding:8px;border:1px solid #ddd">&nbsp;</td><td style="padding:8px;border:1px solid #ddd">&nbsp;</td><td style="padding:8px;border:1px solid #ddd">&nbsp;</td><td style="padding:8px;border:1px solid #ddd">&nbsp;</td></tr>
</table>
<h2>Next Meeting</h2>
<p><strong>Date:</strong> __________ &nbsp; | &nbsp; <strong>Location:</strong> __________</p>`;
    },
  },
  {
    id: 'doc-letter',
    name: 'Letter',
    icon: '✉️',
    desc: 'Formal letter with sender/recipient blocks',
    preview: 'letter',
    content: () => {
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      return `<div style="max-width:680px;margin:0 auto;font-family:Georgia,serif">
<div style="text-align:right;margin-bottom:32px">
<p style="margin:0"><strong>Your Name</strong></p>
<p style="margin:0;color:#666">123 Your Street</p>
<p style="margin:0;color:#666">City, State ZIP</p>
<p style="margin:0;color:#666">your.email@example.com</p>
<p style="margin:0;color:#666">(555) 123-4567</p>
</div>
<p style="margin-bottom:24px">${today}</p>
<div style="margin-bottom:24px">
<p style="margin:0"><strong>Recipient Name</strong></p>
<p style="margin:0;color:#666">Title / Company</p>
<p style="margin:0;color:#666">456 Their Street</p>
<p style="margin:0;color:#666">City, State ZIP</p>
</div>
<p>Dear Recipient Name,</p>
<p>I am writing to you regarding __________. This letter serves to __________.</p>
<p>In the first paragraph, introduce the purpose of your letter clearly and concisely.</p>
<p>In the body paragraphs, provide details, supporting information, or your request.</p>
<p>In the closing paragraph, summarize your main point and include any call to action.</p>
<p style="margin-top:32px">Sincerely,</p>
<p style="margin-top:48px"><strong>Your Name</strong></p>
</div>`;
    },
  },
  {
    id: 'doc-report',
    name: 'Report',
    icon: '📊',
    desc: 'Title page, table of contents, sections',
    preview: 'report',
    content: `<div style="text-align:center;padding:80px 0 60px">
<h1 style="font-size:36px;margin-bottom:8px">Report Title</h1>
<p style="font-size:18px;color:#666;margin:0">Subtitle or Description</p>
<p style="margin-top:24px;color:#999">Prepared by: Your Name</p>
<p style="color:#999">Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
</div>
<hr style="border:none;border-top:2px solid #ddd;margin:32px 0">
<h2>Table of Contents</h2>
<ol style="font-size:15px;line-height:2">
<li>Executive Summary</li>
<li>Introduction</li>
<li>Methodology</li>
<li>Findings</li>
<li>Analysis</li>
<li>Recommendations</li>
<li>Conclusion</li>
<li>Appendix</li>
</ol>
<hr style="border:none;border-top:2px solid #ddd;margin:32px 0">
<h2>1. Executive Summary</h2>
<p>Provide a brief overview of the report's key findings and recommendations.</p>
<h2>2. Introduction</h2>
<p>Describe the background, objectives, and scope of this report.</p>
<h2>3. Methodology</h2>
<p>Explain the research methods, data sources, and analytical approaches used.</p>
<h2>4. Findings</h2>
<p>Present the data and observations gathered during the research.</p>
<h2>5. Analysis</h2>
<p>Interpret the findings and discuss their implications.</p>
<h2>6. Recommendations</h2>
<ul><li>Recommendation 1</li><li>Recommendation 2</li><li>Recommendation 3</li></ul>
<h2>7. Conclusion</h2>
<p>Summarize the report and restate key points.</p>
<h2>8. Appendix</h2>
<p>Include supplementary material, charts, or raw data here.</p>`,
  },
  {
    id: 'doc-resume',
    name: 'Resume',
    icon: '👤',
    desc: 'Education, experience, skills sections',
    preview: 'resume',
    content: `<div style="max-width:700px;margin:0 auto">
<div style="text-align:center;margin-bottom:20px;border-bottom:3px solid #2a5aa7;padding-bottom:16px">
<h1 style="margin:0;font-size:28px;color:#2a5aa7">Your Full Name</h1>
<p style="margin:4px 0 0;color:#666;font-size:14px">your.email@example.com &nbsp;|&nbsp; (555) 123-4567 &nbsp;|&nbsp; City, State &nbsp;|&nbsp; linkedin.com/in/yourname</p>
</div>

<h2 style="color:#2a5aa7;border-bottom:1px solid #ddd;padding-bottom:4px;font-size:16px;text-transform:uppercase;letter-spacing:1px">Professional Summary</h2>
<p style="font-size:14px">Results-driven professional with X+ years of experience in __________. Skilled in __________ with a proven track record of __________.</p>

<h2 style="color:#2a5aa7;border-bottom:1px solid #ddd;padding-bottom:4px;font-size:16px;text-transform:uppercase;letter-spacing:1px">Experience</h2>
<div style="margin-bottom:16px">
<p style="margin:0"><strong>Job Title</strong> &mdash; Company Name</p>
<p style="margin:0;color:#999;font-size:13px">Month Year &ndash; Present &nbsp;|&nbsp; City, State</p>
<ul style="font-size:14px;margin-top:6px"><li>Accomplishment or responsibility 1</li><li>Accomplishment or responsibility 2</li><li>Accomplishment or responsibility 3</li></ul>
</div>
<div style="margin-bottom:16px">
<p style="margin:0"><strong>Previous Job Title</strong> &mdash; Previous Company</p>
<p style="margin:0;color:#999;font-size:13px">Month Year &ndash; Month Year &nbsp;|&nbsp; City, State</p>
<ul style="font-size:14px;margin-top:6px"><li>Accomplishment or responsibility 1</li><li>Accomplishment or responsibility 2</li></ul>
</div>

<h2 style="color:#2a5aa7;border-bottom:1px solid #ddd;padding-bottom:4px;font-size:16px;text-transform:uppercase;letter-spacing:1px">Education</h2>
<p style="margin:0"><strong>Degree, Major</strong> &mdash; University Name</p>
<p style="margin:0;color:#999;font-size:13px">Graduation Year &nbsp;|&nbsp; GPA: X.XX (if applicable)</p>

<h2 style="color:#2a5aa7;border-bottom:1px solid #ddd;padding-bottom:4px;font-size:16px;text-transform:uppercase;letter-spacing:1px">Skills</h2>
<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:13px">
<span style="background:#e8f0fe;color:#2a5aa7;padding:4px 10px;border-radius:12px">Skill 1</span>
<span style="background:#e8f0fe;color:#2a5aa7;padding:4px 10px;border-radius:12px">Skill 2</span>
<span style="background:#e8f0fe;color:#2a5aa7;padding:4px 10px;border-radius:12px">Skill 3</span>
<span style="background:#e8f0fe;color:#2a5aa7;padding:4px 10px;border-radius:12px">Skill 4</span>
<span style="background:#e8f0fe;color:#2a5aa7;padding:4px 10px;border-radius:12px">Skill 5</span>
<span style="background:#e8f0fe;color:#2a5aa7;padding:4px 10px;border-radius:12px">Skill 6</span>
</div>

<h2 style="color:#2a5aa7;border-bottom:1px solid #ddd;padding-bottom:4px;font-size:16px;text-transform:uppercase;letter-spacing:1px">Certifications</h2>
<ul style="font-size:14px"><li>Certification Name &mdash; Issuing Organization (Year)</li></ul>
</div>`,
  },
];

/* ================================================================
   Sheet Templates
   ================================================================ */

const SHEET_TEMPLATES = [
  {
    id: 'sheet-blank',
    name: 'Blank Spreadsheet',
    icon: '📊',
    desc: 'Empty spreadsheet',
    preview: 'blank',
    build: () => [createSheetData()],
  },
  {
    id: 'sheet-budget',
    name: 'Budget Tracker',
    icon: '💰',
    desc: 'Income/expense categories, monthly totals',
    preview: 'budget',
    build: () => {
      const s = createSheetData(20, 15, 'Budget');
      const headers = ['Category', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Total'];
      headers.forEach((h, c) => setCell(s, 0, c, h));
      const incomeRows = ['Salary', 'Freelance', 'Investments', 'Other Income'];
      const expenseRows = ['Rent/Mortgage', 'Utilities', 'Groceries', 'Transportation', 'Insurance', 'Entertainment', 'Savings', 'Other Expenses'];
      setCell(s, 1, 0, '--- INCOME ---');
      incomeRows.forEach((label, i) => setCell(s, 2 + i, 0, label));
      const incomeEnd = 2 + incomeRows.length;
      setCell(s, incomeEnd, 0, 'Total Income');
      for (let c = 1; c <= 12; c++) {
        setCell(s, incomeEnd, c, `=SUM(${colLetter(c)}3:${colLetter(c)}${incomeEnd})`);
      }
      setCell(s, incomeEnd + 1, 0, '--- EXPENSES ---');
      expenseRows.forEach((label, i) => setCell(s, incomeEnd + 2 + i, 0, label));
      const expenseEnd = incomeEnd + 2 + expenseRows.length;
      setCell(s, expenseEnd, 0, 'Total Expenses');
      for (let c = 1; c <= 12; c++) {
        setCell(s, expenseEnd, c, `=SUM(${colLetter(c)}${incomeEnd + 3}:${colLetter(c)}${expenseEnd})`);
      }
      setCell(s, expenseEnd + 1, 0, 'NET');
      for (let c = 1; c <= 12; c++) {
        setCell(s, expenseEnd + 1, c, `=${colLetter(c)}${incomeEnd + 1}-${colLetter(c)}${expenseEnd + 1}`);
      }
      // Row totals
      for (let r = 2; r < incomeEnd; r++) {
        setCell(s, r, 13, `=SUM(B${r + 1}:M${r + 1})`);
      }
      setCell(s, incomeEnd, 13, `=SUM(B${incomeEnd + 1}:M${incomeEnd + 1})`);
      for (let r = incomeEnd + 2; r < expenseEnd; r++) {
        setCell(s, r, 13, `=SUM(B${r + 1}:M${r + 1})`);
      }
      setCell(s, expenseEnd, 13, `=SUM(B${expenseEnd + 1}:M${expenseEnd + 1})`);
      setCell(s, expenseEnd + 1, 13, `=SUM(B${expenseEnd + 2}:M${expenseEnd + 2})`);
      return [s];
    },
  },
  {
    id: 'sheet-timeline',
    name: 'Project Timeline',
    icon: '📅',
    desc: 'Tasks, dates, status, progress tracking',
    preview: 'timeline',
    build: () => {
      const s = createSheetData(25, 7, 'Timeline');
      const headers = ['Task', 'Owner', 'Start Date', 'End Date', 'Status', 'Progress %', 'Notes'];
      headers.forEach((h, c) => setCell(s, 0, c, h));
      const sampleTasks = [
        ['Project Kickoff', 'Team Lead', '2026-01-15', '2026-01-15', 'Complete', '100', ''],
        ['Requirements Gathering', 'Analyst', '2026-01-16', '2026-01-30', 'Complete', '100', ''],
        ['Design Phase', 'Designer', '2026-02-01', '2026-02-15', 'In Progress', '75', ''],
        ['Development Sprint 1', 'Dev Team', '2026-02-16', '2026-03-01', 'In Progress', '50', ''],
        ['Development Sprint 2', 'Dev Team', '2026-03-02', '2026-03-15', 'Not Started', '0', ''],
        ['Testing', 'QA Team', '2026-03-16', '2026-03-25', 'Not Started', '0', ''],
        ['Deployment', 'DevOps', '2026-03-26', '2026-03-28', 'Not Started', '0', ''],
        ['Review & Retrospective', 'Team Lead', '2026-03-29', '2026-03-30', 'Not Started', '0', ''],
      ];
      sampleTasks.forEach((row, r) => row.forEach((val, c) => setCell(s, r + 1, c, val)));
      return [s];
    },
  },
  {
    id: 'sheet-invoice',
    name: 'Invoice',
    icon: '🧾',
    desc: 'Line items with quantity, price, totals',
    preview: 'invoice',
    build: () => {
      const s = createSheetData(25, 6, 'Invoice');
      setCell(s, 0, 0, 'INVOICE');
      setCell(s, 1, 0, 'Invoice #:'); setCell(s, 1, 1, 'INV-001');
      setCell(s, 2, 0, 'Date:'); setCell(s, 2, 1, new Date().toISOString().split('T')[0]);
      setCell(s, 3, 0, 'Due Date:'); setCell(s, 3, 1, '');
      setCell(s, 1, 3, 'Bill To:');
      setCell(s, 2, 3, 'Client Name');
      setCell(s, 3, 3, 'Client Address');
      setCell(s, 4, 3, 'City, State ZIP');
      const headerRow = 6;
      ['Item', 'Description', 'Quantity', 'Unit Price', 'Discount %', 'Total'].forEach((h, c) => setCell(s, headerRow, c, h));
      for (let r = 7; r <= 14; r++) {
        setCell(s, r, 5, `=IF(C${r + 1}="","",C${r + 1}*D${r + 1}*(1-E${r + 1}/100))`);
      }
      setCell(s, 7, 0, 'Item 1'); setCell(s, 7, 1, 'Description'); setCell(s, 7, 2, '1'); setCell(s, 7, 3, '100'); setCell(s, 7, 4, '0');
      setCell(s, 8, 0, 'Item 2'); setCell(s, 8, 1, 'Description'); setCell(s, 8, 2, '2'); setCell(s, 8, 3, '50'); setCell(s, 8, 4, '0');
      const totalRow = 16;
      setCell(s, totalRow, 4, 'Subtotal:');
      setCell(s, totalRow, 5, '=SUM(F8:F15)');
      setCell(s, totalRow + 1, 4, 'Tax (10%):');
      setCell(s, totalRow + 1, 5, `=F${totalRow + 1}*0.1`);
      setCell(s, totalRow + 2, 4, 'TOTAL:');
      setCell(s, totalRow + 2, 5, `=F${totalRow + 1}+F${totalRow + 2}`);
      setCell(s, 20, 0, 'Notes:');
      setCell(s, 21, 0, 'Payment due within 30 days. Thank you for your business!');
      return [s];
    },
  },
  {
    id: 'sheet-gradebook',
    name: 'Grade Book',
    icon: '🎓',
    desc: 'Students, assignments, averages',
    preview: 'gradebook',
    build: () => {
      const s = createSheetData(20, 9, 'Grades');
      const headers = ['Student Name', 'HW 1', 'HW 2', 'HW 3', 'Quiz 1', 'Midterm', 'Quiz 2', 'Final', 'Average'];
      headers.forEach((h, c) => setCell(s, 0, c, h));
      const students = ['Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Wilson', 'Eva Martinez', 'Frank Brown', 'Grace Lee', 'Henry Kim'];
      students.forEach((name, i) => {
        setCell(s, i + 1, 0, name);
        setCell(s, i + 1, 8, `=AVERAGE(B${i + 2}:H${i + 2})`);
      });
      // Class average row
      setCell(s, students.length + 1, 0, 'Class Average');
      for (let c = 1; c <= 8; c++) {
        setCell(s, students.length + 1, c, `=AVERAGE(${colLetter(c)}2:${colLetter(c)}${students.length + 1})`);
      }
      // Max/Min rows
      setCell(s, students.length + 2, 0, 'Highest');
      setCell(s, students.length + 3, 0, 'Lowest');
      for (let c = 1; c <= 8; c++) {
        setCell(s, students.length + 2, c, `=MAX(${colLetter(c)}2:${colLetter(c)}${students.length + 1})`);
        setCell(s, students.length + 3, c, `=MIN(${colLetter(c)}2:${colLetter(c)}${students.length + 1})`);
      }
      return [s];
    },
  },
];

/* ================================================================
   Slide Templates
   ================================================================ */

const SLIDE_TEMPLATES = [
  {
    id: 'slide-blank',
    name: 'Blank Presentation',
    icon: '🖥️',
    desc: 'Empty slide deck',
    preview: 'blank',
    slides: [{ content: '<p>&nbsp;</p>', notes: '', theme: 'default', transition: 'none' }],
  },
  {
    id: 'slide-title',
    name: 'Title Slide',
    icon: '🎬',
    desc: 'Large title with subtitle',
    preview: 'title',
    slides: [
      { content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 style="font-size:52px;margin:0 0 16px">Presentation Title</h1><p style="font-size:24px;opacity:0.6;margin:0">Your Name &mdash; Date</p></div>', notes: '', theme: 'default', transition: 'none' },
    ],
  },
  {
    id: 'slide-content',
    name: 'Content Slide',
    icon: '📝',
    desc: 'Title with bullet points',
    preview: 'content',
    slides: [
      { content: '<h1 style="font-size:44px;text-align:center;margin-bottom:24px">Presentation Title</h1><p style="text-align:center;font-size:20px;opacity:0.6">Your Name &mdash; Date</p>', notes: '', theme: 'default', transition: 'none' },
      { content: '<h2 style="margin-bottom:16px">Agenda</h2><ul style="font-size:20px;line-height:2"><li>Introduction</li><li>Key Findings</li><li>Analysis</li><li>Recommendations</li><li>Q&amp;A</li></ul>', notes: '', theme: 'default', transition: 'fade' },
      { content: '<h2 style="margin-bottom:16px">Key Points</h2><ul style="font-size:20px;line-height:2"><li>Point 1: Description</li><li>Point 2: Description</li><li>Point 3: Description</li></ul>', notes: 'Elaborate on each point during presentation', theme: 'default', transition: 'slide' },
      { content: '<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;text-align:center"><h1 style="font-size:44px;margin:0 0 24px">Thank You!</h1><p style="font-size:20px;opacity:0.6">Questions?</p></div>', notes: '', theme: 'default', transition: 'fade' },
    ],
  },
  {
    id: 'slide-image',
    name: 'Image Slide',
    icon: '🖼️',
    desc: 'Title with image placeholder',
    preview: 'image',
    slides: [
      { content: '<h2 style="margin-bottom:20px">Image Presentation</h2><div style="width:100%;aspect-ratio:16/9;background:rgba(128,128,128,0.08);border:2px dashed rgba(128,128,128,0.3);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">Click to add image</div>', notes: '', theme: 'default', transition: 'none' },
    ],
  },
  {
    id: 'slide-twocol',
    name: 'Two Column',
    icon: '⬛⬛',
    desc: 'Title with two content areas',
    preview: 'twocol',
    slides: [
      { content: '<h2 style="margin-bottom:20px">Comparison</h2><div style="display:flex;gap:32px"><div style="flex:1;border:1px solid rgba(128,128,128,0.2);border-radius:8px;padding:20px"><h3>Column A</h3><ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul></div><div style="flex:1;border:1px solid rgba(128,128,128,0.2);border-radius:8px;padding:20px"><h3>Column B</h3><ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul></div></div>', notes: '', theme: 'default', transition: 'none' },
    ],
  },
];

/* ================================================================
   Helper: column letter from 0-indexed column number
   ================================================================ */

function colLetter(c) {
  let result = '';
  let n = c;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/* ================================================================
   Template Picker Modal
   ================================================================ */

function showTemplatePicker(category) {
  let templates;
  let categoryLabel;
  switch (category) {
    case 'document':
      templates = DOC_TEMPLATES;
      categoryLabel = 'Document';
      break;
    case 'sheet':
      templates = SHEET_TEMPLATES;
      categoryLabel = 'Spreadsheet';
      break;
    case 'slide':
      templates = SLIDE_TEMPLATES;
      categoryLabel = 'Presentation';
      break;
    default:
      templates = [...DOC_TEMPLATES, ...SHEET_TEMPLATES, ...SLIDE_TEMPLATES];
      categoryLabel = 'All';
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';

  const modal = document.createElement('div');
  modal.className = 'modal-content';
  modal.style.cssText = 'width:700px;max-width:95vw;max-height:85vh;overflow:auto;background:var(--bg-primary);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);padding:24px';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:20px';
  header.innerHTML = `<h2 style="margin:0;font-size:20px;color:var(--text-primary)">Choose a ${categoryLabel} Template</h2>`;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715';
  closeBtn.style.cssText = 'border:none;background:none;font-size:20px;cursor:pointer;color:var(--text-secondary);padding:4px 8px';
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(closeBtn);
  modal.appendChild(header);

  // Category tabs (only in "all" mode)
  if (!category) {
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:8px;margin-bottom:16px';
    ['All', 'Document', 'Sheet', 'Slide'].forEach((tab) => {
      const btn = document.createElement('button');
      btn.textContent = tab;
      btn.className = 'toolbar-btn';
      btn.style.cssText = 'padding:6px 16px;border-radius:16px;font-size:13px';
      if (tab === 'All') btn.style.background = 'var(--accent-color)';
      btn.onclick = () => {
        tabBar.querySelectorAll('button').forEach((b) => { b.style.background = ''; });
        btn.style.background = 'var(--accent-color)';
        renderTemplateGrid(tab === 'All' ? null : tab.toLowerCase());
      };
      tabBar.appendChild(btn);
    });
    modal.appendChild(tabBar);
  }

  // Template grid container
  const gridContainer = document.createElement('div');
  gridContainer.id = 'template-grid';
  modal.appendChild(gridContainer);

  const renderTemplateGrid = (filterCategory) => {
    let filtered;
    if (filterCategory === 'document') filtered = DOC_TEMPLATES;
    else if (filterCategory === 'sheet') filtered = SHEET_TEMPLATES;
    else if (filterCategory === 'slide') filtered = SLIDE_TEMPLATES;
    else filtered = templates;

    gridContainer.innerHTML = '';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px';

    filtered.forEach((tmpl) => {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid var(--border-color);border-radius:10px;padding:16px;cursor:pointer;transition:all 0.2s;text-align:center;background:var(--bg-secondary,var(--bg-primary))';
      card.onmouseenter = () => { card.style.borderColor = 'var(--accent-color)'; card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; };
      card.onmouseleave = () => { card.style.borderColor = 'var(--border-color)'; card.style.transform = ''; card.style.boxShadow = ''; };

      // Preview thumbnail
      const thumbDiv = document.createElement('div');
      thumbDiv.style.cssText = 'width:100%;aspect-ratio:4/3;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:6px;margin-bottom:10px;display:flex;align-items:center;justify-content:center;font-size:36px;overflow:hidden';
      thumbDiv.innerHTML = renderTemplateThumbnail(tmpl);
      card.appendChild(thumbDiv);

      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'font-weight:600;font-size:13px;margin-bottom:4px;color:var(--text-primary)';
      nameEl.textContent = tmpl.name;
      card.appendChild(nameEl);

      const descEl = document.createElement('div');
      descEl.style.cssText = 'font-size:11px;color:var(--text-secondary);line-height:1.3';
      descEl.textContent = tmpl.desc;
      card.appendChild(descEl);

      card.onclick = () => {
        applyTemplate(tmpl);
        overlay.remove();
      };
      grid.appendChild(card);
    });
    gridContainer.appendChild(grid);
  };

  renderTemplateGrid(category || null);
  overlay.appendChild(modal);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

/* ================================================================
   Template Thumbnails (mini preview SVGs)
   ================================================================ */

function renderTemplateThumbnail(tmpl) {
  if (tmpl.preview === 'blank') return tmpl.icon;

  const thumbMap = {
    meeting: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="10" y="10" width="100" height="6" rx="2" fill="var(--text-primary)" opacity="0.7"/><rect x="10" y="22" width="60" height="4" rx="1" fill="var(--text-secondary)" opacity="0.4"/><rect x="10" y="32" width="80" height="3" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="10" y="38" width="70" height="3" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="10" y="48" width="90" height="5" rx="1" fill="var(--accent-color,#4285f4)" opacity="0.5"/><rect x="10" y="58" width="100" height="25" rx="3" fill="var(--border-color)" opacity="0.3"/></svg>`,
    letter: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="60" y="8" width="50" height="3" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="60" y="14" width="40" height="3" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="10" y="28" width="30" height="3" rx="1" fill="var(--text-primary)" opacity="0.5"/><rect x="10" y="34" width="50" height="3" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="10" y="46" width="100" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/><rect x="10" y="52" width="95" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/><rect x="10" y="58" width="85" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/><rect x="10" y="74" width="40" height="3" rx="1" fill="var(--text-primary)" opacity="0.4"/></svg>`,
    report: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="25" y="10" width="70" height="8" rx="2" fill="var(--text-primary)" opacity="0.7"/><rect x="35" y="22" width="50" height="4" rx="1" fill="var(--text-secondary)" opacity="0.3"/><line x1="20" y1="32" x2="100" y2="32" stroke="var(--border-color)" stroke-width="1"/><rect x="15" y="38" width="40" height="4" rx="1" fill="var(--accent-color,#4285f4)" opacity="0.5"/><rect x="20" y="46" width="80" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/><rect x="15" y="55" width="40" height="4" rx="1" fill="var(--accent-color,#4285f4)" opacity="0.5"/><rect x="20" y="63" width="75" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/><rect x="15" y="72" width="40" height="4" rx="1" fill="var(--accent-color,#4285f4)" opacity="0.5"/><rect x="20" y="80" width="85" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/></svg>`,
    resume: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="25" y="6" width="70" height="7" rx="2" fill="#2a5aa7" opacity="0.8"/><rect x="30" y="16" width="60" height="3" rx="1" fill="var(--text-secondary)" opacity="0.3"/><line x1="10" y1="23" x2="110" y2="23" stroke="#2a5aa7" stroke-width="1.5"/><rect x="10" y="28" width="30" height="4" rx="1" fill="#2a5aa7" opacity="0.5"/><rect x="10" y="35" width="90" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/><rect x="10" y="44" width="30" height="4" rx="1" fill="#2a5aa7" opacity="0.5"/><rect x="10" y="51" width="80" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/><rect x="10" y="57" width="70" height="3" rx="1" fill="var(--text-secondary)" opacity="0.2"/><rect x="10" y="66" width="30" height="4" rx="1" fill="#2a5aa7" opacity="0.5"/><circle cx="20" cy="77" r="5" fill="#e8f0fe"/><circle cx="35" cy="77" r="5" fill="#e8f0fe"/><circle cx="50" cy="77" r="5" fill="#e8f0fe"/></svg>`,
    budget: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="5" y="5" width="110" height="80" rx="3" fill="none" stroke="var(--border-color)" stroke-width="1"/><line x1="30" y1="5" x2="30" y2="85" stroke="var(--border-color)" stroke-width="0.5"/><line x1="55" y1="5" x2="55" y2="85" stroke="var(--border-color)" stroke-width="0.5"/><line x1="80" y1="5" x2="80" y2="85" stroke="var(--border-color)" stroke-width="0.5"/><rect x="6" y="6" width="108" height="10" fill="var(--accent-color,#4285f4)" opacity="0.2"/><rect x="31" y="20" width="15" height="6" rx="1" fill="#34a853" opacity="0.5"/><rect x="56" y="20" width="12" height="6" rx="1" fill="#34a853" opacity="0.5"/><rect x="31" y="40" width="18" height="6" rx="1" fill="#ea4335" opacity="0.5"/><rect x="56" y="40" width="14" height="6" rx="1" fill="#ea4335" opacity="0.5"/></svg>`,
    timeline: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="5" y="5" width="110" height="10" fill="var(--accent-color,#4285f4)" opacity="0.15" rx="2"/><rect x="8" y="7" width="20" height="6" rx="1" fill="var(--text-primary)" opacity="0.3"/><rect x="8" y="20" width="40" height="6" rx="2" fill="#34a853" opacity="0.6"/><rect x="8" y="30" width="55" height="6" rx="2" fill="#34a853" opacity="0.6"/><rect x="8" y="40" width="35" height="6" rx="2" fill="#fbbc05" opacity="0.6"/><rect x="8" y="50" width="25" height="6" rx="2" fill="#fbbc05" opacity="0.4"/><rect x="8" y="60" width="45" height="6" rx="2" fill="var(--border-color)" opacity="0.4"/><rect x="8" y="70" width="30" height="6" rx="2" fill="var(--border-color)" opacity="0.4"/></svg>`,
    invoice: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="10" y="6" width="40" height="8" rx="2" fill="var(--text-primary)" opacity="0.7"/><rect x="70" y="8" width="40" height="3" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="70" y="14" width="35" height="3" rx="1" fill="var(--text-secondary)" opacity="0.3"/><line x1="10" y1="26" x2="110" y2="26" stroke="var(--border-color)" stroke-width="1"/><rect x="10" y="30" width="100" height="8" fill="var(--accent-color,#4285f4)" opacity="0.1"/><rect x="10" y="42" width="100" height="5" fill="none" stroke="var(--border-color)" stroke-width="0.5"/><rect x="10" y="50" width="100" height="5" fill="none" stroke="var(--border-color)" stroke-width="0.5"/><rect x="70" y="65" width="40" height="4" rx="1" fill="var(--text-primary)" opacity="0.5"/><rect x="70" y="72" width="40" height="6" rx="2" fill="var(--accent-color,#4285f4)" opacity="0.6"/></svg>`,
    gradebook: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="5" y="5" width="110" height="80" rx="3" fill="none" stroke="var(--border-color)" stroke-width="1"/><rect x="6" y="6" width="108" height="10" fill="#2a5aa7" opacity="0.2"/><line x1="35" y1="5" x2="35" y2="85" stroke="var(--border-color)" stroke-width="0.5"/><rect x="7" y="20" width="26" height="6" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="38" y="20" width="10" height="6" rx="1" fill="#34a853" opacity="0.5"/><rect x="7" y="30" width="26" height="6" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="38" y="30" width="8" height="6" rx="1" fill="#fbbc05" opacity="0.5"/><rect x="7" y="40" width="26" height="6" rx="1" fill="var(--text-secondary)" opacity="0.3"/><rect x="38" y="40" width="12" height="6" rx="1" fill="#34a853" opacity="0.5"/></svg>`,
    title: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="5" y="5" width="110" height="80" rx="4" fill="var(--bg-primary)" stroke="var(--border-color)" stroke-width="1"/><rect x="20" y="30" width="80" height="10" rx="2" fill="var(--text-primary)" opacity="0.6"/><rect x="30" y="48" width="60" height="5" rx="1" fill="var(--text-secondary)" opacity="0.3"/></svg>`,
    content: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="5" y="5" width="110" height="80" rx="4" fill="var(--bg-primary)" stroke="var(--border-color)" stroke-width="1"/><rect x="15" y="12" width="60" height="7" rx="2" fill="var(--text-primary)" opacity="0.5"/><circle cx="18" cy="30" r="2" fill="var(--accent-color,#4285f4)"/><rect x="25" y="28" width="70" height="4" rx="1" fill="var(--text-secondary)" opacity="0.3"/><circle cx="18" cy="40" r="2" fill="var(--accent-color,#4285f4)"/><rect x="25" y="38" width="65" height="4" rx="1" fill="var(--text-secondary)" opacity="0.3"/><circle cx="18" cy="50" r="2" fill="var(--accent-color,#4285f4)"/><rect x="25" y="48" width="50" height="4" rx="1" fill="var(--text-secondary)" opacity="0.3"/></svg>`,
    image: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="5" y="5" width="110" height="80" rx="4" fill="var(--bg-primary)" stroke="var(--border-color)" stroke-width="1"/><rect x="15" y="12" width="60" height="7" rx="2" fill="var(--text-primary)" opacity="0.5"/><rect x="15" y="25" width="90" height="50" rx="4" fill="var(--border-color)" opacity="0.2" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4 2"/><text x="60" y="55" text-anchor="middle" font-size="16" fill="var(--text-secondary)" opacity="0.3">IMG</text></svg>`,
    twocol: `<svg viewBox="0 0 120 90" style="width:80%;height:80%"><rect x="5" y="5" width="110" height="80" rx="4" fill="var(--bg-primary)" stroke="var(--border-color)" stroke-width="1"/><rect x="15" y="12" width="50" height="7" rx="2" fill="var(--text-primary)" opacity="0.5"/><rect x="10" y="25" width="48" height="52" rx="3" fill="var(--border-color)" opacity="0.15"/><rect x="62" y="25" width="48" height="52" rx="3" fill="var(--border-color)" opacity="0.15"/></svg>`,
  };
  return thumbMap[tmpl.preview] || tmpl.icon;
}

/* ================================================================
   Apply Template
   ================================================================ */

function applyTemplate(tmpl) {
  // Document templates
  if (tmpl.content !== undefined) {
    switchTab('document');
    const html = typeof tmpl.content === 'function' ? tmpl.content() : tmpl.content;
    setDocContent(html);
    return;
  }

  // Sheet templates
  if (tmpl.build) {
    switchTab('sheet');
    const sheets = tmpl.build();
    setSheetsData(sheets);
    return;
  }

  // Slide templates
  if (tmpl.slides) {
    switchTab('slide');
    setSlidesData(JSON.parse(JSON.stringify(tmpl.slides)));
    return;
  }
}

/* ================================================================
   Init — Bind template buttons in toolbars
   ================================================================ */

export function initTemplates() {
  // Document toolbar template button
  document.getElementById('doc-templates-btn')?.addEventListener('click', () => showTemplatePicker('document'));

  // Sheet toolbar template button
  document.getElementById('sheet-templates-btn')?.addEventListener('click', () => showTemplatePicker('sheet'));

  // Slide toolbar template button
  document.getElementById('slide-templates-btn')?.addEventListener('click', () => showTemplatePicker('slide'));

  // Global/sidebar template button (shows all categories)
  document.getElementById('btn-templates')?.addEventListener('click', () => showTemplatePicker(null));
}

export { showTemplatePicker };
