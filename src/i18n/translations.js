// OfficeLink SL — Complete Translation Dictionary
// 7 core languages: en, ko, ja, zh, es, fr, de
// All UI text must have entries for all 7 languages

export const TRANSLATIONS = {
  // ===== TAB NAMES =====
  'tab.document': { en: 'Document', ko: '문서', ja: 'ドキュメント', zh: '文档', es: 'Documento', fr: 'Document', de: 'Dokument' },
  'tab.sheet': { en: 'Sheet', ko: '시트', ja: 'シート', zh: '表格', es: 'Hoja', fr: 'Feuille', de: 'Tabelle' },
  'tab.slide': { en: 'Slide', ko: '슬라이드', ja: 'スライド', zh: '幻灯片', es: 'Diapositiva', fr: 'Diapositive', de: 'Folie' },
  'tab.pdf': { en: 'PDF', ko: 'PDF', ja: 'PDF', zh: 'PDF', es: 'PDF', fr: 'PDF', de: 'PDF' },
  'tab.markdown': { en: 'Markdown', ko: '마크다운', ja: 'マークダウン', zh: 'Markdown', es: 'Markdown', fr: 'Markdown', de: 'Markdown' },
  'tab.photo': { en: 'Photo', ko: '사진', ja: '写真', zh: '照片', es: 'Foto', fr: 'Photo', de: 'Foto' },
  'tab.calc': { en: 'Calc', ko: '계산기', ja: '計算機', zh: '计算器', es: 'Calc', fr: 'Calc', de: 'Rechner' },
  'tab.cad': { en: '3D CAD', ko: '3D CAD', ja: '3D CAD', zh: '3D CAD', es: '3D CAD', fr: '3D CAO', de: '3D CAD' },
  'tab.ai': { en: 'AI', ko: 'AI', ja: 'AI', zh: 'AI', es: 'IA', fr: 'IA', de: 'KI' },

  // ===== MAIN TOOLBAR =====
  'tip.open': {
    en: 'Open file', ko: '파일 열기', ja: 'ファイルを開く', zh: '打开文件',
    es: 'Abrir archivo', fr: 'Ouvrir un fichier', de: 'Datei öffnen',
  },
  'tip.save': {
    en: 'Save', ko: '저장하기', ja: '保存', zh: '保存',
    es: 'Guardar', fr: 'Enregistrer', de: 'Speichern',
  },
  'tip.versionHistory': {
    en: 'Version History', ko: '버전 기록', ja: 'バージョン履歴', zh: '版本历史',
    es: 'Historial de versiones', fr: 'Historique des versions', de: 'Versionsverlauf',
  },
  'tip.undo': {
    en: 'Undo', ko: '실행 취소', ja: '元に戻す', zh: '撤销',
    es: 'Deshacer', fr: 'Annuler', de: 'Rückgängig',
  },
  'tip.redo': {
    en: 'Redo', ko: '다시 실행', ja: 'やり直す', zh: '重做',
    es: 'Rehacer', fr: 'Rétablir', de: 'Wiederholen',
  },
  'tip.sidebar': {
    en: 'Toggle Sidebar', ko: '사이드바 열기/닫기', ja: 'サイドバー切替', zh: '切换侧边栏',
    es: 'Barra lateral', fr: 'Barre latérale', de: 'Seitenleiste',
  },
  'tip.export': {
    en: 'Export', ko: '내보내기', ja: 'エクスポート', zh: '导出',
    es: 'Exportar', fr: 'Exporter', de: 'Exportieren',
  },
  'tip.ai': {
    en: 'AI Assistant', ko: 'AI 어시스턴트', ja: 'AIアシスタント', zh: 'AI助手',
    es: 'Asistente IA', fr: 'Assistant IA', de: 'KI-Assistent',
  },
  'tip.lang': {
    en: 'Change Language', ko: '언어 변경', ja: '言語変更', zh: '更改语言',
    es: 'Cambiar idioma', fr: 'Changer la langue', de: 'Sprache ändern',
  },
  'tip.tutorial': {
    en: 'View app tutorial again', ko: '앱 사용법 다시 보기', ja: 'チュートリアルを再表示',
    zh: '重新查看教程', es: 'Ver tutorial de nuevo', fr: 'Revoir le tutoriel', de: 'Tutorial erneut ansehen',
  },
  'tip.install': {
    en: 'Install App', ko: '앱 설치', ja: 'アプリをインストール', zh: '安装应用',
    es: 'Instalar App', fr: 'Installer', de: 'App installieren',
  },
  'tip.templates': {
    en: 'Templates', ko: '템플릿', ja: 'テンプレート', zh: '模板',
    es: 'Plantillas', fr: 'Modèles', de: 'Vorlagen',
  },
  'tip.feedback': {
    en: 'Feedback', ko: '의견 보내기', ja: 'フィードバック', zh: '反馈',
    es: 'Comentarios', fr: 'Avis', de: 'Feedback',
  },
  'tip.fullscreen': {
    en: 'Fullscreen', ko: '전체 화면', ja: '全画面', zh: '全屏',
    es: 'Pantalla completa', fr: 'Plein écran', de: 'Vollbild',
  },
  'tip.theme': {
    en: 'Toggle Theme', ko: '테마 전환', ja: 'テーマ切替', zh: '切换主题',
    es: 'Cambiar tema', fr: 'Changer le thème', de: 'Design wechseln',
  },
  'tip.zoomIn': {
    en: 'Zoom In', ko: '확대', ja: '拡大', zh: '放大',
    es: 'Acercar', fr: 'Zoom avant', de: 'Vergrößern',
  },
  'tip.zoomOut': {
    en: 'Zoom Out', ko: '축소', ja: '縮小', zh: '缩小',
    es: 'Alejar', fr: 'Zoom arrière', de: 'Verkleinern',
  },
  'tip.zoomReset': {
    en: 'Click to reset', ko: '클릭하여 초기화', ja: 'クリックでリセット', zh: '点击重置',
    es: 'Clic para restablecer', fr: 'Cliquer pour réinitialiser', de: 'Klicken zum Zurücksetzen',
  },
  'tip.unsaved': {
    en: 'Unsaved changes', ko: '저장하지 않은 변경사항', ja: '未保存の変更', zh: '未保存的更改',
    es: 'Cambios sin guardar', fr: 'Modifications non enregistrées', de: 'Ungespeicherte Änderungen',
  },

  // ===== SIDEBAR =====
  'sidebar.files': {
    en: 'Files', ko: '파일', ja: 'ファイル', zh: '文件',
    es: 'Archivos', fr: 'Fichiers', de: 'Dateien',
  },
  'sidebar.openFolder': {
    en: 'Open Folder', ko: '폴더 열기', ja: 'フォルダを開く', zh: '打开文件夹',
    es: 'Abrir carpeta', fr: 'Ouvrir un dossier', de: 'Ordner öffnen',
  },
  'sidebar.recent': {
    en: 'Recent', ko: '최근', ja: '最近', zh: '最近',
    es: 'Reciente', fr: 'Récent', de: 'Kürzlich',
  },

  // ===== MARKDOWN TOOLBAR =====
  'tip.bold': {
    en: 'Bold', ko: '굵게', ja: '太字', zh: '加粗',
    es: 'Negrita', fr: 'Gras', de: 'Fett',
  },
  'tip.italic': {
    en: 'Italic', ko: '기울임', ja: '斜体', zh: '斜体',
    es: 'Cursiva', fr: 'Italique', de: 'Kursiv',
  },
  'tip.heading': {
    en: 'Heading', ko: '제목', ja: '見出し', zh: '标题',
    es: 'Encabezado', fr: 'Titre', de: 'Überschrift',
  },
  'tip.code': {
    en: 'Code Block', ko: '코드 블록', ja: 'コードブロック', zh: '代码块',
    es: 'Bloque de código', fr: 'Bloc de code', de: 'Codeblock',
  },
  'tip.list': {
    en: 'List', ko: '목록', ja: 'リスト', zh: '列表',
    es: 'Lista', fr: 'Liste', de: 'Liste',
  },
  'tip.link': {
    en: 'Link', ko: '링크', ja: 'リンク', zh: '链接',
    es: 'Enlace', fr: 'Lien', de: 'Link',
  },
  'tip.table': {
    en: 'Table', ko: '표', ja: 'テーブル', zh: '表格',
    es: 'Tabla', fr: 'Tableau', de: 'Tabelle',
  },
  'tip.taskList': {
    en: 'Task List', ko: '작업 목록', ja: 'タスクリスト', zh: '任务列表',
    es: 'Lista de tareas', fr: 'Liste de tâches', de: 'Aufgabenliste',
  },
  'tip.blockquote': {
    en: 'Blockquote', ko: '인용문', ja: '引用', zh: '引用',
    es: 'Cita', fr: 'Citation', de: 'Zitat',
  },
  'tip.hr': {
    en: 'Horizontal Rule', ko: '구분선', ja: '水平線', zh: '水平线',
    es: 'Línea horizontal', fr: 'Ligne horizontale', de: 'Horizontale Linie',
  },
  'tip.insertImage': {
    en: 'Insert Image', ko: '이미지 삽입', ja: '画像を挿入', zh: '插入图片',
    es: 'Insertar imagen', fr: 'Insérer une image', de: 'Bild einfügen',
  },
  'tip.emoji': {
    en: 'Emoji', ko: '이모지', ja: '絵文字', zh: '表情',
    es: 'Emoji', fr: 'Emoji', de: 'Emoji',
  },
  'tip.mdImport': {
    en: 'Import .md file', ko: '.md 파일 가져오기', ja: '.mdファイルをインポート', zh: '导入.md文件',
    es: 'Importar archivo .md', fr: 'Importer un fichier .md', de: '.md-Datei importieren',
  },
  'tip.mdExport': {
    en: 'Export .md file', ko: '.md 파일 내보내기', ja: '.mdファイルをエクスポート', zh: '导出.md文件',
    es: 'Exportar archivo .md', fr: 'Exporter un fichier .md', de: '.md-Datei exportieren',
  },
  'tip.mathInline': {
    en: 'Inline Math ($...$)', ko: '인라인 수식', ja: 'インライン数式', zh: '行内公式',
    es: 'Matemática en línea', fr: 'Math en ligne', de: 'Inline-Formel',
  },
  'tip.mathBlock': {
    en: 'Block Math ($$...$$)', ko: '블록 수식', ja: 'ブロック数式', zh: '块级公式',
    es: 'Bloque matemático', fr: 'Bloc math', de: 'Block-Formel',
  },
  'tip.mermaid': {
    en: 'Mermaid Diagram', ko: 'Mermaid 다이어그램', ja: 'Mermaidダイアグラム', zh: 'Mermaid图表',
    es: 'Diagrama Mermaid', fr: 'Diagramme Mermaid', de: 'Mermaid-Diagramm',
  },
  'tip.togglePreview': {
    en: 'Toggle Preview', ko: '미리보기 전환', ja: 'プレビュー切替', zh: '切换预览',
    es: 'Alternar vista previa', fr: 'Basculer l\'aperçu', de: 'Vorschau umschalten',
  },
  'tip.toggleOutline': {
    en: 'Toggle Outline (TOC)', ko: '개요 전환', ja: 'アウトライン切替', zh: '切换大纲',
    es: 'Alternar esquema', fr: 'Basculer le plan', de: 'Gliederung umschalten',
  },
  'tip.copyRichText': {
    en: 'Copy as Rich Text', ko: '서식 있는 텍스트로 복사', ja: 'リッチテキストとしてコピー', zh: '复制为富文本',
    es: 'Copiar como texto enriquecido', fr: 'Copier en texte enrichi', de: 'Als Rich Text kopieren',
  },
  'md.editor': {
    en: 'Editor', ko: '편집기', ja: 'エディタ', zh: '编辑器',
    es: 'Editor', fr: 'Éditeur', de: 'Editor',
  },
  'md.preview': {
    en: 'Preview', ko: '미리보기', ja: 'プレビュー', zh: '预览',
    es: 'Vista previa', fr: 'Aperçu', de: 'Vorschau',
  },
  'md.outline': {
    en: 'Outline', ko: '개요', ja: 'アウトライン', zh: '大纲',
    es: 'Esquema', fr: 'Plan', de: 'Gliederung',
  },

  // ===== DOCUMENT TOOLBAR =====
  'doc.font': {
    en: 'Font', ko: '글꼴', ja: 'フォント', zh: '字体',
    es: 'Fuente', fr: 'Police', de: 'Schriftart',
  },
  'doc.fontSize': {
    en: 'Font Size', ko: '글꼴 크기', ja: 'フォントサイズ', zh: '字号',
    es: 'Tamaño de fuente', fr: 'Taille de police', de: 'Schriftgröße',
  },
  'doc.bold': {
    en: 'Bold', ko: '굵게', ja: '太字', zh: '加粗',
    es: 'Negrita', fr: 'Gras', de: 'Fett',
  },
  'doc.italic': {
    en: 'Italic', ko: '기울임', ja: '斜体', zh: '斜体',
    es: 'Cursiva', fr: 'Italique', de: 'Kursiv',
  },
  'doc.underline': {
    en: 'Underline', ko: '밑줄', ja: '下線', zh: '下划线',
    es: 'Subrayado', fr: 'Souligné', de: 'Unterstrichen',
  },
  'doc.strikethrough': {
    en: 'Strikethrough', ko: '취소선', ja: '取消線', zh: '删除线',
    es: 'Tachado', fr: 'Barré', de: 'Durchgestrichen',
  },
  'doc.superscript': {
    en: 'Superscript', ko: '위 첨자', ja: '上付き文字', zh: '上标',
    es: 'Superíndice', fr: 'Exposant', de: 'Hochgestellt',
  },
  'doc.subscript': {
    en: 'Subscript', ko: '아래 첨자', ja: '下付き文字', zh: '下标',
    es: 'Subíndice', fr: 'Indice', de: 'Tiefgestellt',
  },
  'doc.alignLeft': {
    en: 'Align Left', ko: '왼쪽 정렬', ja: '左揃え', zh: '左对齐',
    es: 'Alinear a la izquierda', fr: 'Aligner à gauche', de: 'Linksbündig',
  },
  'doc.alignCenter': {
    en: 'Align Center', ko: '가운데 정렬', ja: '中央揃え', zh: '居中',
    es: 'Centrar', fr: 'Centrer', de: 'Zentriert',
  },
  'doc.alignRight': {
    en: 'Align Right', ko: '오른쪽 정렬', ja: '右揃え', zh: '右对齐',
    es: 'Alinear a la derecha', fr: 'Aligner à droite', de: 'Rechtsbündig',
  },
  'doc.justify': {
    en: 'Justify', ko: '양쪽 정렬', ja: '両端揃え', zh: '两端对齐',
    es: 'Justificar', fr: 'Justifier', de: 'Blocksatz',
  },
  'doc.indent': {
    en: 'Increase Indent', ko: '들여쓰기 증가', ja: 'インデント増加', zh: '增加缩进',
    es: 'Aumentar sangría', fr: 'Augmenter le retrait', de: 'Einzug vergrößern',
  },
  'doc.outdent': {
    en: 'Decrease Indent', ko: '들여쓰기 감소', ja: 'インデント減少', zh: '减少缩进',
    es: 'Disminuir sangría', fr: 'Diminuer le retrait', de: 'Einzug verkleinern',
  },
  'doc.bulletList': {
    en: 'Bullet List', ko: '글머리 기호', ja: '箇条書き', zh: '项目符号列表',
    es: 'Lista con viñetas', fr: 'Liste à puces', de: 'Aufzählung',
  },
  'doc.numberedList': {
    en: 'Numbered List', ko: '번호 목록', ja: '番号付きリスト', zh: '编号列表',
    es: 'Lista numerada', fr: 'Liste numérotée', de: 'Nummerierte Liste',
  },
  'doc.heading': {
    en: 'Heading', ko: '제목', ja: '見出し', zh: '标题',
    es: 'Encabezado', fr: 'Titre', de: 'Überschrift',
  },
  'doc.paragraph': {
    en: 'Paragraph', ko: '본문', ja: '段落', zh: '段落',
    es: 'Párrafo', fr: 'Paragraphe', de: 'Absatz',
  },
  'doc.lineSpacing': {
    en: 'Line Spacing', ko: '줄 간격', ja: '行間隔', zh: '行距',
    es: 'Interlineado', fr: 'Interligne', de: 'Zeilenabstand',
  },
  'doc.paraSpacing': {
    en: 'Paragraph Spacing', ko: '단락 간격', ja: '段落間隔', zh: '段落间距',
    es: 'Espaciado de párrafo', fr: 'Espacement des paragraphes', de: 'Absatzabstand',
  },
  'doc.clearFormat': {
    en: 'Clear Formatting', ko: '서식 지우기', ja: '書式をクリア', zh: '清除格式',
    es: 'Borrar formato', fr: 'Effacer la mise en forme', de: 'Formatierung löschen',
  },
  'doc.styles': {
    en: 'Quick Styles', ko: '빠른 스타일', ja: 'クイックスタイル', zh: '快速样式',
    es: 'Estilos rápidos', fr: 'Styles rapides', de: 'Schnellformatvorlagen',
  },
  'doc.sectionBreak': {
    en: 'Section Break', ko: '구역 나누기', ja: 'セクション区切り', zh: '分节符',
    es: 'Salto de sección', fr: 'Saut de section', de: 'Abschnittsumbruch',
  },
  'doc.columns': {
    en: 'Columns Layout', ko: '단 나누기', ja: '段組み', zh: '分栏',
    es: 'Diseño de columnas', fr: 'Mise en colonnes', de: 'Spaltenlayout',
  },
  'doc.textColor': {
    en: 'Text Color', ko: '글자 색', ja: '文字色', zh: '文字颜色',
    es: 'Color de texto', fr: 'Couleur du texte', de: 'Textfarbe',
  },
  'doc.highlightColor': {
    en: 'Highlight Color', ko: '강조 색', ja: 'ハイライト色', zh: '突出颜色',
    es: 'Color de resaltado', fr: 'Couleur de surlignage', de: 'Hervorhebungsfarbe',
  },
  'doc.quickHighlight': {
    en: 'Quick Highlight', ko: '빠른 강조', ja: 'クイックハイライト', zh: '快速高亮',
    es: 'Resaltado rápido', fr: 'Surlignage rapide', de: 'Schnellhervorhebung',
  },
  'doc.insertLink': {
    en: 'Insert Link', ko: '링크 삽입', ja: 'リンクを挿入', zh: '插入链接',
    es: 'Insertar enlace', fr: 'Insérer un lien', de: 'Link einfügen',
  },
  'doc.insertImage': {
    en: 'Insert Image', ko: '이미지 삽입', ja: '画像を挿入', zh: '插入图片',
    es: 'Insertar imagen', fr: 'Insérer une image', de: 'Bild einfügen',
  },
  'doc.insertTable': {
    en: 'Insert Table', ko: '표 삽입', ja: 'テーブルを挿入', zh: '插入表格',
    es: 'Insertar tabla', fr: 'Insérer un tableau', de: 'Tabelle einfügen',
  },
  'doc.insertHR': {
    en: 'Horizontal Rule', ko: '구분선', ja: '水平線', zh: '水平线',
    es: 'Línea horizontal', fr: 'Ligne horizontale', de: 'Horizontale Linie',
  },
  'doc.toc': {
    en: 'Table of Contents', ko: '목차', ja: '目次', zh: '目录',
    es: 'Tabla de contenidos', fr: 'Table des matières', de: 'Inhaltsverzeichnis',
  },
  'doc.pageNumbers': {
    en: 'Toggle Page Numbers', ko: '페이지 번호 전환', ja: 'ページ番号切替', zh: '切换页码',
    es: 'Alternar números de página', fr: 'Basculer les numéros de page', de: 'Seitenzahlen umschalten',
  },
  'doc.headerFooter': {
    en: 'Header & Footer', ko: '머리글/바닥글', ja: 'ヘッダー・フッター', zh: '页眉页脚',
    es: 'Encabezado y pie de página', fr: 'En-tête et pied de page', de: 'Kopf- und Fußzeile',
  },
  'doc.pageSetup': {
    en: 'Page Layout', ko: '페이지 설정', ja: 'ページレイアウト', zh: '页面布局',
    es: 'Diseño de página', fr: 'Mise en page', de: 'Seitenlayout',
  },
  'doc.footnote': {
    en: 'Insert Footnote', ko: '각주 삽입', ja: '脚注を挿入', zh: '插入脚注',
    es: 'Insertar nota al pie', fr: 'Insérer une note de bas de page', de: 'Fußnote einfügen',
  },
  'doc.endnote': {
    en: 'Insert Endnote', ko: '미주 삽입', ja: '文末脚注を挿入', zh: '插入尾注',
    es: 'Insertar nota final', fr: 'Insérer une note de fin', de: 'Endnote einfügen',
  },
  'doc.watermark': {
    en: 'Watermark', ko: '워터마크', ja: '透かし', zh: '水印',
    es: 'Marca de agua', fr: 'Filigrane', de: 'Wasserzeichen',
  },
  'doc.mailMerge': {
    en: 'Mail Merge', ko: '메일 병합', ja: '差し込み印刷', zh: '邮件合并',
    es: 'Combinar correspondencia', fr: 'Publipostage', de: 'Serienbriefe',
  },
  'doc.print': {
    en: 'Print', ko: '인쇄', ja: '印刷', zh: '打印',
    es: 'Imprimir', fr: 'Imprimer', de: 'Drucken',
  },
  'doc.outline': {
    en: 'Document Outline', ko: '문서 개요', ja: 'ドキュメントアウトライン', zh: '文档大纲',
    es: 'Esquema del documento', fr: 'Plan du document', de: 'Dokumentgliederung',
  },
  'doc.dateTime': {
    en: 'Insert Date/Time', ko: '날짜/시간 삽입', ja: '日付/時刻を挿入', zh: '插入日期/时间',
    es: 'Insertar fecha/hora', fr: 'Insérer date/heure', de: 'Datum/Uhrzeit einfügen',
  },
  'doc.comment': {
    en: 'Add Comment', ko: '댓글 추가', ja: 'コメントを追加', zh: '添加批注',
    es: 'Agregar comentario', fr: 'Ajouter un commentaire', de: 'Kommentar hinzufügen',
  },
  'doc.pageBreak': {
    en: 'Page Break', ko: '페이지 나누기', ja: 'ページ区切り', zh: '分页符',
    es: 'Salto de página', fr: 'Saut de page', de: 'Seitenumbruch',
  },
  'doc.equation': {
    en: 'Insert Equation', ko: '수식 삽입', ja: '数式を挿入', zh: '插入公式',
    es: 'Insertar ecuación', fr: 'Insérer une équation', de: 'Gleichung einfügen',
  },
  'doc.trackChanges': {
    en: 'Track Changes', ko: '변경 사항 추적', ja: '変更の追跡', zh: '跟踪修订',
    es: 'Control de cambios', fr: 'Suivi des modifications', de: 'Änderungen nachverfolgen',
  },
  'doc.changesPanel': {
    en: 'Changes Panel', ko: '변경 패널', ja: '変更パネル', zh: '修订面板',
    es: 'Panel de cambios', fr: 'Panneau des modifications', de: 'Änderungsbereich',
  },
  'doc.acceptAll': {
    en: 'Accept All Changes', ko: '모든 변경 적용', ja: 'すべての変更を承認', zh: '接受所有修订',
    es: 'Aceptar todos los cambios', fr: 'Accepter toutes les modifications', de: 'Alle Änderungen annehmen',
  },
  'doc.rejectAll': {
    en: 'Reject All Changes', ko: '모든 변경 거부', ja: 'すべての変更を拒否', zh: '拒绝所有修订',
    es: 'Rechazar todos los cambios', fr: 'Rejeter toutes les modifications', de: 'Alle Änderungen ablehnen',
  },
  'doc.spellCheck': {
    en: 'Spell Check', ko: '맞춤법 검사', ja: 'スペルチェック', zh: '拼写检查',
    es: 'Revisión ortográfica', fr: 'Vérification orthographique', de: 'Rechtschreibprüfung',
  },
  'doc.commentsPanel': {
    en: 'Comments Panel', ko: '댓글 패널', ja: 'コメントパネル', zh: '批注面板',
    es: 'Panel de comentarios', fr: 'Panneau des commentaires', de: 'Kommentarbereich',
  },
  'doc.bookmark': {
    en: 'Insert Bookmark', ko: '북마크 삽입', ja: 'ブックマークを挿入', zh: '插入书签',
    es: 'Insertar marcador', fr: 'Insérer un signet', de: 'Lesezeichen einfügen',
  },
  'doc.compare': {
    en: 'Compare Documents', ko: '문서 비교', ja: 'ドキュメント比較', zh: '比较文档',
    es: 'Comparar documentos', fr: 'Comparer des documents', de: 'Dokumente vergleichen',
  },
  'doc.focusMode': {
    en: 'Focus Mode (Zen)', ko: '집중 모드', ja: '集中モード', zh: '专注模式',
    es: 'Modo enfoque', fr: 'Mode concentration', de: 'Fokusmodus',
  },
  'doc.readingMode': {
    en: 'Reading Mode', ko: '읽기 모드', ja: '読み取りモード', zh: '阅读模式',
    es: 'Modo lectura', fr: 'Mode lecture', de: 'Lesemodus',
  },
  'doc.multiColumn': {
    en: 'Multi-Column Layout', ko: '다단 레이아웃', ja: '複数列レイアウト', zh: '多栏布局',
    es: 'Diseño multicolumna', fr: 'Mise en colonnes multiples', de: 'Mehrspaltenlayout',
  },
  'doc.dragReorder': {
    en: 'Toggle Paragraph Drag Reorder', ko: '단락 드래그 재정렬', ja: '段落のドラッグ並べ替え', zh: '拖拽重排段落',
    es: 'Arrastrar y reordenar párrafos', fr: 'Réorganiser les paragraphes par glisser', de: 'Absätze per Drag umsortieren',
  },
  'doc.tableOps': {
    en: 'Smart Table Operations', ko: '스마트 표 작업', ja: 'スマートテーブル操作', zh: '智能表格操作',
    es: 'Operaciones de tabla inteligentes', fr: 'Opérations de tableau intelligentes', de: 'Intelligente Tabellenoperationen',
  },
  'doc.docTemplates': {
    en: 'Document Templates', ko: '문서 템플릿', ja: 'ドキュメントテンプレート', zh: '文档模板',
    es: 'Plantillas de documentos', fr: 'Modèles de documents', de: 'Dokumentvorlagen',
  },
  'doc.citation': {
    en: 'Insert Citation', ko: '인용 삽입', ja: '引用を挿入', zh: '插入引用',
    es: 'Insertar cita', fr: 'Insérer une citation', de: 'Zitat einfügen',
  },
  'doc.importHwpx': {
    en: 'Import HWPX', ko: 'HWPX 가져오기', ja: 'HWPXインポート', zh: '导入HWPX',
    es: 'Importar HWPX', fr: 'Importer HWPX', de: 'HWPX importieren',
  },
  'doc.exportHwpx': {
    en: 'Export HWPX', ko: 'HWPX 내보내기', ja: 'HWPXエクスポート', zh: '导出HWPX',
    es: 'Exportar HWPX', fr: 'Exporter HWPX', de: 'HWPX exportieren',
  },
  'doc.importDocx': {
    en: 'Import DOCX', ko: 'DOCX 가져오기', ja: 'DOCXインポート', zh: '导入DOCX',
    es: 'Importar DOCX', fr: 'Importer DOCX', de: 'DOCX importieren',
  },
  'doc.exportDocx': {
    en: 'Export DOCX', ko: 'DOCX 내보내기', ja: 'DOCXエクスポート', zh: '导出DOCX',
    es: 'Exportar DOCX', fr: 'Exporter DOCX', de: 'DOCX exportieren',
  },

  // Document Find/Replace
  'doc.find': {
    en: 'Find...', ko: '찾기...', ja: '検索...', zh: '查找...',
    es: 'Buscar...', fr: 'Rechercher...', de: 'Suchen...',
  },
  'doc.replaceWith': {
    en: 'Replace with...', ko: '바꿀 내용...', ja: '置換...', zh: '替换为...',
    es: 'Reemplazar con...', fr: 'Remplacer par...', de: 'Ersetzen durch...',
  },
  'doc.replace': {
    en: 'Replace', ko: '바꾸기', ja: '置換', zh: '替换',
    es: 'Reemplazar', fr: 'Remplacer', de: 'Ersetzen',
  },
  'doc.replaceAll': {
    en: 'All', ko: '모두', ja: 'すべて', zh: '全部',
    es: 'Todo', fr: 'Tout', de: 'Alle',
  },
  'doc.useRegex': {
    en: 'Use Regular Expression', ko: '정규식 사용', ja: '正規表現を使用', zh: '使用正则表达式',
    es: 'Usar expresión regular', fr: 'Utiliser une expression régulière', de: 'Regulären Ausdruck verwenden',
  },
  'doc.matchCase': {
    en: 'Match Case', ko: '대소문자 구분', ja: '大小文字を区別', zh: '区分大小写',
    es: 'Coincidir mayúsculas', fr: 'Respecter la casse', de: 'Groß-/Kleinschreibung beachten',
  },
  'doc.previous': {
    en: 'Previous', ko: '이전', ja: '前へ', zh: '上一个',
    es: 'Anterior', fr: 'Précédent', de: 'Vorheriges',
  },
  'doc.next': {
    en: 'Next', ko: '다음', ja: '次へ', zh: '下一个',
    es: 'Siguiente', fr: 'Suivant', de: 'Nächstes',
  },

  // Document status bar
  'doc.words': {
    en: 'Words', ko: '단어', ja: '単語', zh: '字数',
    es: 'Palabras', fr: 'Mots', de: 'Wörter',
  },
  'doc.characters': {
    en: 'Characters', ko: '글자', ja: '文字', zh: '字符',
    es: 'Caracteres', fr: 'Caractères', de: 'Zeichen',
  },
  'doc.paragraphs': {
    en: 'Paragraphs', ko: '단락', ja: '段落', zh: '段落',
    es: 'Párrafos', fr: 'Paragraphes', de: 'Absätze',
  },

  // Document placeholders
  'doc.untitled': {
    en: 'Untitled Document', ko: '제목 없는 문서', ja: '無題のドキュメント', zh: '无标题文档',
    es: 'Documento sin título', fr: 'Document sans titre', de: 'Unbenanntes Dokument',
  },
  'doc.startTyping': {
    en: 'Start typing here...', ko: '여기에 입력하세요...', ja: 'ここに入力してください...', zh: '在此处输入...',
    es: 'Empiece a escribir aquí...', fr: 'Commencez à écrire ici...', de: 'Hier eingeben...',
  },

  // Document panels
  'doc.outlineTitle': {
    en: 'Outline', ko: '개요', ja: 'アウトライン', zh: '大纲',
    es: 'Esquema', fr: 'Plan', de: 'Gliederung',
  },
  'doc.trackChangesTitle': {
    en: 'Track Changes', ko: '변경 추적', ja: '変更の追跡', zh: '跟踪修订',
    es: 'Control de cambios', fr: 'Suivi des modifications', de: 'Änderungen nachverfolgen',
  },
  'doc.commentsTitle': {
    en: 'Comments', ko: '댓글', ja: 'コメント', zh: '批注',
    es: 'Comentarios', fr: 'Commentaires', de: 'Kommentare',
  },

  // ===== SHEET TOOLBAR =====
  'sheet.formulaPlaceholder': {
    en: 'Enter value or formula (e.g. =SUM(A1:A10))', ko: '값 또는 수식 입력 (예: =SUM(A1:A10))', ja: '値または数式を入力 (例: =SUM(A1:A10))', zh: '输入值或公式（例如 =SUM(A1:A10)）',
    es: 'Ingrese valor o fórmula (ej. =SUM(A1:A10))', fr: 'Entrez une valeur ou une formule (ex. =SUM(A1:A10))', de: 'Wert oder Formel eingeben (z.B. =SUM(A1:A10))',
  },
  'sheet.font': {
    en: 'Font', ko: '글꼴', ja: 'フォント', zh: '字体',
    es: 'Fuente', fr: 'Police', de: 'Schriftart',
  },
  'sheet.fontSize': {
    en: 'Font Size', ko: '글꼴 크기', ja: 'フォントサイズ', zh: '字号',
    es: 'Tamaño', fr: 'Taille', de: 'Schriftgröße',
  },
  'sheet.bold': {
    en: 'Bold', ko: '굵게', ja: '太字', zh: '加粗',
    es: 'Negrita', fr: 'Gras', de: 'Fett',
  },
  'sheet.italic': {
    en: 'Italic', ko: '기울임', ja: '斜体', zh: '斜体',
    es: 'Cursiva', fr: 'Italique', de: 'Kursiv',
  },
  'sheet.underline': {
    en: 'Underline', ko: '밑줄', ja: '下線', zh: '下划线',
    es: 'Subrayado', fr: 'Souligné', de: 'Unterstrichen',
  },
  'sheet.strikethrough': {
    en: 'Strikethrough', ko: '취소선', ja: '取消線', zh: '删除线',
    es: 'Tachado', fr: 'Barré', de: 'Durchgestrichen',
  },
  'sheet.formatPainter': {
    en: 'Format Painter', ko: '서식 복사', ja: '書式のコピー', zh: '格式刷',
    es: 'Copiar formato', fr: 'Reproduire la mise en forme', de: 'Format übertragen',
  },
  'sheet.wrapText': {
    en: 'Wrap Text', ko: '텍스트 줄 바꿈', ja: 'テキストの折り返し', zh: '自动换行',
    es: 'Ajustar texto', fr: 'Renvoyer à la ligne', de: 'Textumbruch',
  },
  'sheet.alignLeft': {
    en: 'Align Left', ko: '왼쪽 정렬', ja: '左揃え', zh: '左对齐',
    es: 'Alinear a la izquierda', fr: 'Aligner à gauche', de: 'Linksbündig',
  },
  'sheet.alignCenter': {
    en: 'Align Center', ko: '가운데 정렬', ja: '中央揃え', zh: '居中',
    es: 'Centrar', fr: 'Centrer', de: 'Zentriert',
  },
  'sheet.alignRight': {
    en: 'Align Right', ko: '오른쪽 정렬', ja: '右揃え', zh: '右对齐',
    es: 'Alinear a la derecha', fr: 'Aligner à droite', de: 'Rechtsbündig',
  },
  'sheet.indentInc': {
    en: 'Increase Indent', ko: '들여쓰기 증가', ja: 'インデント増加', zh: '增加缩进',
    es: 'Aumentar sangría', fr: 'Augmenter le retrait', de: 'Einzug vergrößern',
  },
  'sheet.indentDec': {
    en: 'Decrease Indent', ko: '들여쓰기 감소', ja: 'インデント減少', zh: '减少缩进',
    es: 'Disminuir sangría', fr: 'Diminuer le retrait', de: 'Einzug verkleinern',
  },
  'sheet.clearFormat': {
    en: 'Clear Formatting', ko: '서식 지우기', ja: '書式をクリア', zh: '清除格式',
    es: 'Borrar formato', fr: 'Effacer la mise en forme', de: 'Formatierung löschen',
  },
  'sheet.bgColor': {
    en: 'Cell Background', ko: '셀 배경색', ja: 'セルの背景色', zh: '单元格背景',
    es: 'Fondo de celda', fr: 'Arrière-plan de cellule', de: 'Zellhintergrund',
  },
  'sheet.textColor': {
    en: 'Text Color', ko: '글자 색', ja: '文字色', zh: '文字颜色',
    es: 'Color de texto', fr: 'Couleur du texte', de: 'Textfarbe',
  },
  'sheet.borders': {
    en: 'Cell Borders', ko: '셀 테두리', ja: 'セルの罫線', zh: '单元格边框',
    es: 'Bordes de celda', fr: 'Bordures de cellule', de: 'Zellrahmen',
  },
  'sheet.addRow': {
    en: 'Add Row', ko: '행 추가', ja: '行を追加', zh: '添加行',
    es: 'Agregar fila', fr: 'Ajouter une ligne', de: 'Zeile hinzufügen',
  },
  'sheet.addCol': {
    en: 'Add Column', ko: '열 추가', ja: '列を追加', zh: '添加列',
    es: 'Agregar columna', fr: 'Ajouter une colonne', de: 'Spalte hinzufügen',
  },
  'sheet.delRow': {
    en: 'Delete Row', ko: '행 삭제', ja: '行を削除', zh: '删除行',
    es: 'Eliminar fila', fr: 'Supprimer la ligne', de: 'Zeile löschen',
  },
  'sheet.delCol': {
    en: 'Delete Column', ko: '열 삭제', ja: '列を削除', zh: '删除列',
    es: 'Eliminar columna', fr: 'Supprimer la colonne', de: 'Spalte löschen',
  },
  'sheet.sortAsc': {
    en: 'Sort Ascending', ko: '오름차순 정렬', ja: '昇順で並べ替え', zh: '升序排列',
    es: 'Ordenar ascendente', fr: 'Tri croissant', de: 'Aufsteigend sortieren',
  },
  'sheet.sortDesc': {
    en: 'Sort Descending', ko: '내림차순 정렬', ja: '降順で並べ替え', zh: '降序排列',
    es: 'Ordenar descendente', fr: 'Tri décroissant', de: 'Absteigend sortieren',
  },
  'sheet.freeze': {
    en: 'Freeze Rows/Columns', ko: '행/열 고정', ja: '行/列の固定', zh: '冻结行/列',
    es: 'Inmovilizar filas/columnas', fr: 'Figer les volets', de: 'Zeilen/Spalten fixieren',
  },
  'sheet.merge': {
    en: 'Merge Cells', ko: '셀 병합', ja: 'セルの結合', zh: '合并单元格',
    es: 'Combinar celdas', fr: 'Fusionner les cellules', de: 'Zellen verbinden',
  },
  'sheet.condFormat': {
    en: 'Conditional Formatting', ko: '조건부 서식', ja: '条件付き書式', zh: '条件格式',
    es: 'Formato condicional', fr: 'Mise en forme conditionnelle', de: 'Bedingte Formatierung',
  },
  'sheet.chart': {
    en: 'Insert Chart', ko: '차트 삽입', ja: 'グラフを挿入', zh: '插入图表',
    es: 'Insertar gráfico', fr: 'Insérer un graphique', de: 'Diagramm einfügen',
  },
  'sheet.filter': {
    en: 'Auto Filter', ko: '자동 필터', ja: 'オートフィルター', zh: '自动筛选',
    es: 'Autofiltro', fr: 'Filtre automatique', de: 'AutoFilter',
  },
  'sheet.find': {
    en: 'Find in sheet...', ko: '시트에서 찾기...', ja: 'シート内検索...', zh: '在表中查找...',
    es: 'Buscar en hoja...', fr: 'Rechercher dans la feuille...', de: 'In Tabelle suchen...',
  },
  'sheet.replaceWith': {
    en: 'Replace with...', ko: '바꿀 내용...', ja: '置換...', zh: '替换为...',
    es: 'Reemplazar con...', fr: 'Remplacer par...', de: 'Ersetzen durch...',
  },
  'sheet.replace': {
    en: 'Replace', ko: '바꾸기', ja: '置換', zh: '替换',
    es: 'Reemplazar', fr: 'Remplacer', de: 'Ersetzen',
  },
  'sheet.importCsv': {
    en: 'Import CSV', ko: 'CSV 가져오기', ja: 'CSVインポート', zh: '导入CSV',
    es: 'Importar CSV', fr: 'Importer CSV', de: 'CSV importieren',
  },
  'sheet.exportCsv': {
    en: 'Export CSV', ko: 'CSV 내보내기', ja: 'CSVエクスポート', zh: '导出CSV',
    es: 'Exportar CSV', fr: 'Exporter CSV', de: 'CSV exportieren',
  },
  'sheet.exportXlsx': {
    en: 'Export XLSX', ko: 'XLSX 내보내기', ja: 'XLSXエクスポート', zh: '导出XLSX',
    es: 'Exportar XLSX', fr: 'Exporter XLSX', de: 'XLSX exportieren',
  },
  'sheet.ready': {
    en: 'Ready', ko: '준비', ja: '準備完了', zh: '就绪',
    es: 'Listo', fr: 'Prêt', de: 'Bereit',
  },
  'sheet.pivot': {
    en: 'Pivot Table', ko: '피벗 테이블', ja: 'ピボットテーブル', zh: '数据透视表',
    es: 'Tabla dinámica', fr: 'Tableau croisé dynamique', de: 'Pivottabelle',
  },
  'sheet.protect': {
    en: 'Protect Sheet', ko: '시트 보호', ja: 'シートの保護', zh: '保护工作表',
    es: 'Proteger hoja', fr: 'Protéger la feuille', de: 'Blatt schützen',
  },

  // ===== SLIDE TOOLBAR =====
  'slide.newSlide': {
    en: 'New Slide', ko: '새 슬라이드', ja: '新しいスライド', zh: '新建幻灯片',
    es: 'Nueva diapositiva', fr: 'Nouvelle diapositive', de: 'Neue Folie',
  },
  'slide.deleteSlide': {
    en: 'Delete Slide', ko: '슬라이드 삭제', ja: 'スライドを削除', zh: '删除幻灯片',
    es: 'Eliminar diapositiva', fr: 'Supprimer la diapositive', de: 'Folie löschen',
  },
  'slide.duplicateSlide': {
    en: 'Duplicate Slide', ko: '슬라이드 복제', ja: 'スライドを複製', zh: '复制幻灯片',
    es: 'Duplicar diapositiva', fr: 'Dupliquer la diapositive', de: 'Folie duplizieren',
  },
  'slide.layout': {
    en: 'Layout', ko: '레이아웃', ja: 'レイアウト', zh: '布局',
    es: 'Diseño', fr: 'Disposition', de: 'Layout',
  },
  'slide.theme': {
    en: 'Theme', ko: '테마', ja: 'テーマ', zh: '主题',
    es: 'Tema', fr: 'Thème', de: 'Design',
  },
  'slide.transition': {
    en: 'Transition', ko: '전환', ja: 'トランジション', zh: '过渡',
    es: 'Transición', fr: 'Transition', de: 'Übergang',
  },
  'slide.present': {
    en: 'Present', ko: '발표', ja: 'プレゼンテーション', zh: '演示',
    es: 'Presentar', fr: 'Présenter', de: 'Präsentieren',
  },
  'slide.speakerNotes': {
    en: 'Speaker Notes', ko: '발표자 노트', ja: '発表者ノート', zh: '演讲者备注',
    es: 'Notas del orador', fr: 'Notes du présentateur', de: 'Sprechernotizen',
  },
  'slide.untitledPresentation': {
    en: 'Untitled Presentation', ko: '제목 없는 프레젠테이션', ja: '無題のプレゼンテーション', zh: '无标题演示文稿',
    es: 'Presentación sin título', fr: 'Présentation sans titre', de: 'Unbenannte Präsentation',
  },
  'slide.clickToAddSubtitle': {
    en: 'Click to add subtitle', ko: '부제를 입력하려면 클릭', ja: 'サブタイトルを追加するにはクリック', zh: '单击添加副标题',
    es: 'Haga clic para agregar subtítulo', fr: 'Cliquez pour ajouter un sous-titre', de: 'Klicken Sie, um einen Untertitel hinzuzufügen',
  },
  'slide.insertImage': {
    en: 'Insert Image', ko: '이미지 삽입', ja: '画像を挿入', zh: '插入图片',
    es: 'Insertar imagen', fr: 'Insérer une image', de: 'Bild einfügen',
  },
  'slide.insertShape': {
    en: 'Insert Shape', ko: '도형 삽입', ja: '図形を挿入', zh: '插入形状',
    es: 'Insertar forma', fr: 'Insérer une forme', de: 'Form einfügen',
  },
  'slide.insertTable': {
    en: 'Insert Table', ko: '표 삽입', ja: 'テーブルを挿入', zh: '插入表格',
    es: 'Insertar tabla', fr: 'Insérer un tableau', de: 'Tabelle einfügen',
  },
  'slide.animations': {
    en: 'Animations', ko: '애니메이션', ja: 'アニメーション', zh: '动画',
    es: 'Animaciones', fr: 'Animations', de: 'Animationen',
  },
  'slide.exportPptx': {
    en: 'Export as PPTX', ko: 'PPTX로 내보내기', ja: 'PPTXとしてエクスポート', zh: '导出为PPTX',
    es: 'Exportar como PPTX', fr: 'Exporter en PPTX', de: 'Als PPTX exportieren',
  },

  // ===== PDF TOOLBAR =====
  'pdf.openPdf': {
    en: 'Open PDF', ko: 'PDF 열기', ja: 'PDFを開く', zh: '打开PDF',
    es: 'Abrir PDF', fr: 'Ouvrir un PDF', de: 'PDF öffnen',
  },
  'pdf.previousPage': {
    en: 'Previous Page', ko: '이전 페이지', ja: '前のページ', zh: '上一页',
    es: 'Página anterior', fr: 'Page précédente', de: 'Vorherige Seite',
  },
  'pdf.nextPage': {
    en: 'Next Page', ko: '다음 페이지', ja: '次のページ', zh: '下一页',
    es: 'Página siguiente', fr: 'Page suivante', de: 'Nächste Seite',
  },
  'pdf.fitWidth': {
    en: 'Fit Width', ko: '너비에 맞추기', ja: '幅に合わせる', zh: '适合宽度',
    es: 'Ajustar ancho', fr: 'Ajuster à la largeur', de: 'An Breite anpassen',
  },
  'pdf.mdToPdf': {
    en: 'Convert Markdown to PDF', ko: 'Markdown → PDF 변환', ja: 'MarkdownをPDFに変換', zh: '将Markdown转换为PDF',
    es: 'Convertir Markdown a PDF', fr: 'Convertir Markdown en PDF', de: 'Markdown in PDF konvertieren',
  },
  'pdf.docToPdf': {
    en: 'Convert Document to PDF', ko: '문서 → PDF 변환', ja: 'ドキュメントをPDFに変換', zh: '将文档转换为PDF',
    es: 'Convertir documento a PDF', fr: 'Convertir document en PDF', de: 'Dokument in PDF konvertieren',
  },
  'pdf.rotate': {
    en: 'Rotate Page 90°', ko: '페이지 90° 회전', ja: 'ページを90°回転', zh: '旋转页面90°',
    es: 'Rotar página 90°', fr: 'Pivoter la page de 90°', de: 'Seite um 90° drehen',
  },
  'pdf.highlight': {
    en: 'Highlight Text', ko: '텍스트 강조', ja: 'テキストをハイライト', zh: '高亮文本',
    es: 'Resaltar texto', fr: 'Surligner le texte', de: 'Text hervorheben',
  },
  'pdf.ocr': {
    en: 'OCR (Recognize Text)', ko: 'OCR (문자 인식)', ja: 'OCR（文字認識）', zh: 'OCR（识别文字）',
    es: 'OCR (Reconocer texto)', fr: 'OCR (Reconnaître le texte)', de: 'OCR (Text erkennen)',
  },
  'pdf.ocrProgress': {
    en: 'Recognizing text...', ko: '텍스트 인식 중...', ja: 'テキスト認識中...', zh: '正在识别文字...',
    es: 'Reconociendo texto...', fr: 'Reconnaissance du texte...', de: 'Text wird erkannt...',
  },
  'pdf.bookmarks': {
    en: 'Bookmarks', ko: '북마크', ja: 'ブックマーク', zh: '书签',
    es: 'Marcadores', fr: 'Signets', de: 'Lesezeichen',
  },
  'pdf.pages': {
    en: 'Pages', ko: '페이지', ja: 'ページ', zh: '页面',
    es: 'Páginas', fr: 'Pages', de: 'Seiten',
  },
  'pdf.emptyMessage': {
    en: 'Open a PDF file or convert from Markdown/Document', ko: 'PDF 파일을 열거나 마크다운/문서에서 변환하세요', ja: 'PDFファイルを開くか、Markdown/ドキュメントから変換', zh: '打开PDF文件或从Markdown/文档转换',
    es: 'Abra un archivo PDF o convierta desde Markdown/Documento', fr: 'Ouvrez un fichier PDF ou convertissez depuis Markdown/Document', de: 'PDF-Datei öffnen oder aus Markdown/Dokument konvertieren',
  },
  'pdf.searchText': {
    en: 'Search text...', ko: '텍스트 검색...', ja: 'テキスト検索...', zh: '搜索文本...',
    es: 'Buscar texto...', fr: 'Rechercher du texte...', de: 'Text suchen...',
  },
  'pdf.signature': {
    en: 'Digital Signature', ko: '디지털 서명', ja: 'デジタル署名', zh: '电子签名',
    es: 'Firma digital', fr: 'Signature numérique', de: 'Digitale Signatur',
  },
  'pdf.draw': {
    en: 'Draw', ko: '그리기', ja: '描画', zh: '绘图',
    es: 'Dibujar', fr: 'Dessiner', de: 'Zeichnen',
  },
  'pdf.type': {
    en: 'Type', ko: '입력', ja: '入力', zh: '输入',
    es: 'Escribir', fr: 'Taper', de: 'Eingeben',
  },
  'pdf.upload': {
    en: 'Upload', ko: '업로드', ja: 'アップロード', zh: '上传',
    es: 'Subir', fr: 'Téléverser', de: 'Hochladen',
  },
  'pdf.saved': {
    en: 'Saved', ko: '저장됨', ja: '保存済み', zh: '已保存',
    es: 'Guardado', fr: 'Enregistré', de: 'Gespeichert',
  },
  'pdf.clear': {
    en: 'Clear', ko: '지우기', ja: 'クリア', zh: '清除',
    es: 'Borrar', fr: 'Effacer', de: 'Löschen',
  },
  'pdf.saveAndUse': {
    en: 'Save & Use', ko: '저장 후 사용', ja: '保存して使用', zh: '保存并使用',
    es: 'Guardar y usar', fr: 'Enregistrer et utiliser', de: 'Speichern und verwenden',
  },
  'pdf.useOnce': {
    en: 'Use Once', ko: '한 번만 사용', ja: '一度だけ使用', zh: '仅使用一次',
    es: 'Usar una vez', fr: 'Utiliser une fois', de: 'Einmal verwenden',
  },
  'pdf.noSavedSignatures': {
    en: 'No saved signatures', ko: '저장된 서명 없음', ja: '保存された署名はありません', zh: '没有保存的签名',
    es: 'Sin firmas guardadas', fr: 'Aucune signature enregistrée', de: 'Keine gespeicherten Signaturen',
  },
  'pdf.customStamp': {
    en: 'Custom stamp...', ko: '사용자 정의 스탬프...', ja: 'カスタムスタンプ...', zh: '自定义印章...',
    es: 'Sello personalizado...', fr: 'Tampon personnalisé...', de: 'Benutzerdefinierter Stempel...',
  },
  'pdf.addCustom': {
    en: 'Add Custom', ko: '사용자 추가', ja: 'カスタム追加', zh: '添加自定义',
    es: 'Agregar personalizado', fr: 'Ajouter personnalisé', de: 'Benutzerdefiniert hinzufügen',
  },
  'pdf.merge': {
    en: 'Merge PDFs', ko: 'PDF 병합', ja: 'PDF結合', zh: '合并PDF',
    es: 'Fusionar PDFs', fr: 'Fusionner les PDF', de: 'PDFs zusammenführen',
  },
  'pdf.split': {
    en: 'Split PDF', ko: 'PDF 분할', ja: 'PDF分割', zh: '拆分PDF',
    es: 'Dividir PDF', fr: 'Diviser le PDF', de: 'PDF teilen',
  },
  'pdf.compare': {
    en: 'Compare PDFs', ko: 'PDF 비교', ja: 'PDF比較', zh: '比较PDF',
    es: 'Comparar PDFs', fr: 'Comparer les PDF', de: 'PDFs vergleichen',
  },
  'pdf.typeName': {
    en: 'Type your name...', ko: '이름을 입력하세요...', ja: '名前を入力してください...', zh: '请输入您的姓名...',
    es: 'Escriba su nombre...', fr: 'Tapez votre nom...', de: 'Geben Sie Ihren Namen ein...',
  },
  'pdf.redact': {
    en: 'Redact', ko: '편집', ja: '墨消し', zh: '涂黑',
    es: 'Redactar', fr: 'Masquer', de: 'Schwärzen',
  },
  'pdf.forms': {
    en: 'Forms', ko: '양식', ja: 'フォーム', zh: '表单',
    es: 'Formularios', fr: 'Formulaires', de: 'Formulare',
  },
  'pdf.stamp': {
    en: 'Stamp', ko: '스탬프', ja: 'スタンプ', zh: '印章',
    es: 'Sello', fr: 'Tampon', de: 'Stempel',
  },

  // ===== PHOTO EDITOR =====
  'photo.open': {
    en: 'Open Image', ko: '이미지 열기', ja: '画像を開く', zh: '打开图片',
    es: 'Abrir imagen', fr: 'Ouvrir une image', de: 'Bild öffnen',
  },
  'photo.reset': {
    en: 'Reset', ko: '초기화', ja: 'リセット', zh: '重置',
    es: 'Restablecer', fr: 'Réinitialiser', de: 'Zurücksetzen',
  },
  'photo.compare': {
    en: 'Compare (hold)', ko: '비교 (길게 누르기)', ja: '比較（長押し）', zh: '比较（按住）',
    es: 'Comparar (mantener)', fr: 'Comparer (maintenir)', de: 'Vergleichen (halten)',
  },
  'photo.crop': {
    en: 'Crop', ko: '자르기', ja: 'トリミング', zh: '裁剪',
    es: 'Recortar', fr: 'Rogner', de: 'Zuschneiden',
  },
  'photo.resize': {
    en: 'Resize', ko: '크기 조정', ja: 'リサイズ', zh: '调整大小',
    es: 'Redimensionar', fr: 'Redimensionner', de: 'Größe ändern',
  },
  'photo.text': {
    en: 'Text Overlay', ko: '텍스트 오버레이', ja: 'テキストオーバーレイ', zh: '文字叠加',
    es: 'Superposición de texto', fr: 'Superposition de texte', de: 'Textüberlagerung',
  },
  'photo.draw': {
    en: 'Draw', ko: '그리기', ja: '描画', zh: '绘图',
    es: 'Dibujar', fr: 'Dessiner', de: 'Zeichnen',
  },
  'photo.filters': {
    en: 'Filters', ko: '필터', ja: 'フィルター', zh: '滤镜',
    es: 'Filtros', fr: 'Filtres', de: 'Filter',
  },
  'photo.batch': {
    en: 'Batch', ko: '일괄 처리', ja: 'バッチ', zh: '批量',
    es: 'Lote', fr: 'Lot', de: 'Stapel',
  },
  'photo.export': {
    en: 'Export', ko: '내보내기', ja: 'エクスポート', zh: '导出',
    es: 'Exportar', fr: 'Exporter', de: 'Exportieren',
  },
  'photo.dropHere': {
    en: 'Drop an image here or click to open', ko: '이미지를 끌어다 놓거나 클릭하여 열기', ja: '画像をここにドロップまたはクリックして開く', zh: '拖拽图片到此处或点击打开',
    es: 'Arrastre una imagen aquí o haga clic para abrir', fr: 'Déposez une image ici ou cliquez pour ouvrir', de: 'Bild hierher ziehen oder klicken zum Öffnen',
  },
  'photo.supportedFormats': {
    en: 'Supports JPEG, PNG, WebP, HEIC', ko: 'JPEG, PNG, WebP, HEIC 지원', ja: 'JPEG, PNG, WebP, HEIC対応', zh: '支持JPEG、PNG、WebP、HEIC',
    es: 'Compatible con JPEG, PNG, WebP, HEIC', fr: 'Prend en charge JPEG, PNG, WebP, HEIC', de: 'Unterstützt JPEG, PNG, WebP, HEIC',
  },
  'photo.infoBar': {
    en: 'Photo Editor — Open an image to start editing', ko: '사진 편집기 — 이미지를 열어 편집 시작', ja: '写真エディタ — 画像を開いて編集開始', zh: '照片编辑器 — 打开图片开始编辑',
    es: 'Editor de fotos — Abra una imagen para comenzar', fr: 'Éditeur photo — Ouvrez une image pour commencer', de: 'Foto-Editor — Öffnen Sie ein Bild zum Bearbeiten',
  },

  // Photo panel sections
  'photo.layers': {
    en: 'Layers', ko: '레이어', ja: 'レイヤー', zh: '图层',
    es: 'Capas', fr: 'Calques', de: 'Ebenen',
  },
  'photo.history': {
    en: 'History', ko: '기록', ja: '履歴', zh: '历史',
    es: 'Historial', fr: 'Historique', de: 'Verlauf',
  },
  'photo.adjustmentLayer': {
    en: '+ Adjustment Layer', ko: '+ 조정 레이어', ja: '+ 調整レイヤー', zh: '+ 调整图层',
    es: '+ Capa de ajuste', fr: '+ Calque de réglage', de: '+ Einstellungsebene',
  },
  'photo.aiAutoEdit': {
    en: 'AI Auto-Edit', ko: 'AI 자동 편집', ja: 'AI自動編集', zh: 'AI自动编辑',
    es: 'Edición automática IA', fr: 'Édition automatique IA', de: 'KI-Automatikbearbeitung',
  },
  'photo.basic': {
    en: 'Basic', ko: '기본', ja: '基本', zh: '基本',
    es: 'Básico', fr: 'Basique', de: 'Basis',
  },
  'photo.exposure': {
    en: 'Exposure', ko: '노출', ja: '露出', zh: '曝光',
    es: 'Exposición', fr: 'Exposition', de: 'Belichtung',
  },
  'photo.contrast': {
    en: 'Contrast', ko: '대비', ja: 'コントラスト', zh: '对比度',
    es: 'Contraste', fr: 'Contraste', de: 'Kontrast',
  },
  'photo.highlights': {
    en: 'Highlights', ko: '하이라이트', ja: 'ハイライト', zh: '高光',
    es: 'Luces', fr: 'Hautes lumières', de: 'Lichter',
  },
  'photo.shadows': {
    en: 'Shadows', ko: '그림자', ja: 'シャドウ', zh: '阴影',
    es: 'Sombras', fr: 'Ombres', de: 'Schatten',
  },
  'photo.colorTemp': {
    en: 'Color Temp', ko: '색온도', ja: '色温度', zh: '色温',
    es: 'Temp. de color', fr: 'Temp. couleur', de: 'Farbtemperatur',
  },
  'photo.saturation': {
    en: 'Saturation', ko: '채도', ja: '彩度', zh: '饱和度',
    es: 'Saturación', fr: 'Saturation', de: 'Sättigung',
  },
  'photo.vibrance': {
    en: 'Vibrance', ko: '활기', ja: 'バイブランス', zh: '自然饱和度',
    es: 'Intensidad', fr: 'Vibrance', de: 'Dynamik',
  },
  'photo.clarity': {
    en: 'Clarity', ko: '선명도', ja: 'クラリティ', zh: '清晰度',
    es: 'Claridad', fr: 'Clarté', de: 'Klarheit',
  },
  'photo.vignette': {
    en: 'Vignette', ko: '비네팅', ja: 'ビネット', zh: '暗角',
    es: 'Viñeta', fr: 'Vignette', de: 'Vignette',
  },
  'photo.hslColor': {
    en: 'HSL / Color', ko: 'HSL / 색상', ja: 'HSL / カラー', zh: 'HSL / 颜色',
    es: 'HSL / Color', fr: 'HSL / Couleur', de: 'HSL / Farbe',
  },
  'photo.toneCurve': {
    en: 'Tone Curve', ko: '톤 커브', ja: 'トーンカーブ', zh: '色调曲线',
    es: 'Curva de tonos', fr: 'Courbe de tonalité', de: 'Gradationskurve',
  },
  'photo.detail': {
    en: 'Detail', ko: '디테일', ja: 'ディテール', zh: '细节',
    es: 'Detalle', fr: 'Détail', de: 'Detail',
  },
  'photo.sharpen': {
    en: 'Sharpen', ko: '선명하게', ja: 'シャープ', zh: '锐化',
    es: 'Nitidez', fr: 'Netteté', de: 'Schärfen',
  },
  'photo.denoise': {
    en: 'Denoise', ko: '노이즈 제거', ja: 'ノイズ除去', zh: '降噪',
    es: 'Reducir ruido', fr: 'Réduction du bruit', de: 'Entrauschen',
  },
  'photo.lensCorrection': {
    en: 'Lens Correction', ko: '렌즈 보정', ja: 'レンズ補正', zh: '镜头校正',
    es: 'Corrección de lente', fr: 'Correction de l\'objectif', de: 'Objektivkorrektur',
  },
  'photo.grain': {
    en: 'Grain', ko: '그레인', ja: '粒子', zh: '颗粒',
    es: 'Grano', fr: 'Grain', de: 'Korn',
  },
  'photo.splitToning': {
    en: 'Split Toning', ko: '분할 톤', ja: 'スプリットトーニング', zh: '分离色调',
    es: 'Tono dividido', fr: 'Virage partiel', de: 'Teiltonung',
  },
  'photo.colorSplash': {
    en: 'Color Splash', ko: '컬러 스플래시', ja: 'カラースプラッシュ', zh: '色彩飞溅',
    es: 'Salpicadura de color', fr: 'Touche de couleur', de: 'Farbspritzer',
  },
  'photo.opacity': {
    en: 'Opacity', ko: '불투명도', ja: '不透明度', zh: '不透明度',
    es: 'Opacidad', fr: 'Opacité', de: 'Deckkraft',
  },
  'photo.blend': {
    en: 'Blend', ko: '혼합', ja: 'ブレンド', zh: '混合',
    es: 'Mezcla', fr: 'Mode de fusion', de: 'Mischmodus',
  },
  'photo.amount': {
    en: 'Amount', ko: '양', ja: '量', zh: '量',
    es: 'Cantidad', fr: 'Quantité', de: 'Menge',
  },
  'photo.apply': {
    en: 'Apply', ko: '적용', ja: '適用', zh: '应用',
    es: 'Aplicar', fr: 'Appliquer', de: 'Anwenden',
  },
  'photo.cancel': {
    en: 'Cancel', ko: '취소', ja: 'キャンセル', zh: '取消',
    es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen',
  },

  // ===== CALCULATOR =====
  'calc.calculator': {
    en: 'Calculator', ko: '계산기', ja: '計算機', zh: '计算器',
    es: 'Calculadora', fr: 'Calculatrice', de: 'Rechner',
  },
  'calc.graph': {
    en: 'Graph', ko: '그래프', ja: 'グラフ', zh: '图表',
    es: 'Gráfico', fr: 'Graphique', de: 'Graph',
  },
  'calc.unitConvert': {
    en: 'Unit Convert', ko: '단위 변환', ja: '単位変換', zh: '单位转换',
    es: 'Conversión de unidades', fr: 'Conversion d\'unités', de: 'Einheitenumrechnung',
  },
  'calc.saved': {
    en: 'Saved', ko: '저장됨', ja: '保存済み', zh: '已保存',
    es: 'Guardado', fr: 'Enregistré', de: 'Gespeichert',
  },
  'calc.matrix': {
    en: 'Matrix', ko: '행렬', ja: '行列', zh: '矩阵',
    es: 'Matriz', fr: 'Matrice', de: 'Matrix',
  },
  'calc.statistics': {
    en: 'Statistics', ko: '통계', ja: '統計', zh: '统计',
    es: 'Estadísticas', fr: 'Statistiques', de: 'Statistik',
  },
  'calc.financial': {
    en: 'Financial', ko: '금융', ja: '金融', zh: '金融',
    es: 'Financiero', fr: 'Financier', de: 'Finanzen',
  },
  'calc.programmer': {
    en: 'Programmer', ko: '프로그래머', ja: 'プログラマー', zh: '程序员',
    es: 'Programador', fr: 'Programmeur', de: 'Programmierer',
  },
  'calc.date': {
    en: 'Date', ko: '날짜', ja: '日付', zh: '日期',
    es: 'Fecha', fr: 'Date', de: 'Datum',
  },
  'calc.equation': {
    en: 'Equation', ko: '방정식', ja: '方程式', zh: '方程',
    es: 'Ecuación', fr: 'Équation', de: 'Gleichung',
  },
  'calc.constants': {
    en: 'Constants', ko: '상수', ja: '定数', zh: '常数',
    es: 'Constantes', fr: 'Constantes', de: 'Konstanten',
  },
  'calc.history': {
    en: 'History', ko: '기록', ja: '履歴', zh: '历史',
    es: 'Historial', fr: 'Historique', de: 'Verlauf',
  },
  'calc.compute': {
    en: 'Compute', ko: '계산', ja: '計算', zh: '计算',
    es: 'Calcular', fr: 'Calculer', de: 'Berechnen',
  },
  'calc.analyze': {
    en: 'Analyze', ko: '분석', ja: '分析', zh: '分析',
    es: 'Analizar', fr: 'Analyser', de: 'Analysieren',
  },
  'calc.result': {
    en: 'Result', ko: '결과', ja: '結果', zh: '结果',
    es: 'Resultado', fr: 'Résultat', de: 'Ergebnis',
  },
  'calc.calculate': {
    en: 'Calculate', ko: '계산', ja: '計算', zh: '计算',
    es: 'Calcular', fr: 'Calculer', de: 'Berechnen',
  },
  'calc.solve': {
    en: 'Solve', ko: '풀기', ja: '解く', zh: '求解',
    es: 'Resolver', fr: 'Résoudre', de: 'Lösen',
  },
  'calc.plot': {
    en: 'Plot', ko: '그리기', ja: '描画', zh: '绘制',
    es: 'Trazar', fr: 'Tracer', de: 'Zeichnen',
  },
  'calc.savedFormulas': {
    en: 'Saved Formulas', ko: '저장된 수식', ja: '保存された数式', zh: '已保存的公式',
    es: 'Fórmulas guardadas', fr: 'Formules enregistrées', de: 'Gespeicherte Formeln',
  },
  'calc.matrixCalc': {
    en: 'Matrix Calculator', ko: '행렬 계산기', ja: '行列計算機', zh: '矩阵计算器',
    es: 'Calculadora de matrices', fr: 'Calculateur de matrices', de: 'Matrixrechner',
  },
  'calc.statsCalc': {
    en: 'Statistics Calculator', ko: '통계 계산기', ja: '統計計算機', zh: '统计计算器',
    es: 'Calculadora estadística', fr: 'Calculateur statistique', de: 'Statistikrechner',
  },
  'calc.finCalc': {
    en: 'Financial Calculator', ko: '금융 계산기', ja: '金融計算機', zh: '金融计算器',
    es: 'Calculadora financiera', fr: 'Calculateur financier', de: 'Finanzrechner',
  },
  'calc.progCalc': {
    en: 'Programmer Calculator', ko: '프로그래머 계산기', ja: 'プログラマー計算機', zh: '程序员计算器',
    es: 'Calculadora de programador', fr: 'Calculateur programmeur', de: 'Programmiererrechner',
  },
  'calc.dateCalc': {
    en: 'Date Calculator', ko: '날짜 계산기', ja: '日付計算機', zh: '日期计算器',
    es: 'Calculadora de fechas', fr: 'Calculateur de dates', de: 'Datumsrechner',
  },
  'calc.eqSolver': {
    en: 'Equation Solver', ko: '방정식 풀기', ja: '方程式ソルバー', zh: '方程求解器',
    es: 'Solucionador de ecuaciones', fr: 'Solveur d\'équations', de: 'Gleichungslöser',
  },
  'calc.constLib': {
    en: 'Constants Library', ko: '상수 라이브러리', ja: '定数ライブラリ', zh: '常数库',
    es: 'Biblioteca de constantes', fr: 'Bibliothèque de constantes', de: 'Konstantenbibliothek',
  },
  'calc.searchConstants': {
    en: 'Search constants...', ko: '상수 검색...', ja: '定数を検索...', zh: '搜索常数...',
    es: 'Buscar constantes...', fr: 'Rechercher des constantes...', de: 'Konstanten suchen...',
  },

  // ===== AI =====
  'ai.title': {
    en: 'OfficeLink AI', ko: 'OfficeLink AI', ja: 'OfficeLink AI', zh: 'OfficeLink AI',
    es: 'OfficeLink IA', fr: 'OfficeLink IA', de: 'OfficeLink KI',
  },
  'ai.subtitle': {
    en: 'Free AI on your PC — no cloud, no subscription', ko: '내 PC에서 무료로 동작하는 AI — 클라우드 전송·구독료 없음', ja: 'PCで無料で動作するAI — クラウド・サブスクリプション不要', zh: '在您的电脑上免费运行的AI — 无需云端，无需订阅',
    es: 'IA gratuita en tu PC — sin nube, sin suscripción', fr: 'IA gratuite sur votre PC — pas de cloud, pas d\'abonnement', de: 'Kostenlose KI auf Ihrem PC — kein Cloud, kein Abo',
  },
  'ai.checkingOllama': {
    en: 'Checking Ollama...', ko: 'Ollama 확인 중...', ja: 'Ollamaを確認中...', zh: '正在检查Ollama...',
    es: 'Verificando Ollama...', fr: 'Vérification d\'Ollama...', de: 'Ollama wird überprüft...',
  },
  'ai.checking': {
    en: 'Checking...', ko: '확인 중...', ja: '確認中...', zh: '检查中...',
    es: 'Verificando...', fr: 'Vérification...', de: 'Überprüfe...',
  },
  'ai.features.title': {
    en: 'What can AI do?', ko: 'AI로 무엇을 할 수 있나요?', ja: 'AIでできること', zh: 'AI能做什么？',
    es: '¿Qué puede hacer la IA?', fr: 'Que peut faire l\'IA ?', de: 'Was kann KI?',
  },
  'ai.feat.write': {
    en: 'Write & Edit', ko: '작성 & 편집', ja: '作成・編集', zh: '写作和编辑',
    es: 'Escribir y editar', fr: 'Écrire et éditer', de: 'Schreiben & Bearbeiten',
  },
  'ai.feat.write.desc': {
    en: 'Draft, proofread, and improve documents', ko: '문서 작성, 교정, 개선', ja: '文書の作成・校正・改善', zh: '起草、校对和改进文档',
    es: 'Redactar, corregir y mejorar documentos', fr: 'Rédiger, relire et améliorer des documents', de: 'Entwerfen, Korrekturlesen und Verbessern von Dokumenten',
  },
  'ai.feat.translate': {
    en: 'Translate', ko: '번역', ja: '翻訳', zh: '翻译',
    es: 'Traducir', fr: 'Traduire', de: 'Übersetzen',
  },
  'ai.feat.translate.desc': {
    en: 'Translate text between 30+ languages', ko: '30개 이상 언어 간 번역', ja: '30以上の言語間で翻訳', zh: '在30多种语言之间翻译',
    es: 'Traducir texto entre más de 30 idiomas', fr: 'Traduire du texte entre plus de 30 langues', de: 'Text in über 30 Sprachen übersetzen',
  },
  'ai.feat.analyze': {
    en: 'Analyze', ko: '분석', ja: '分析', zh: '分析',
    es: 'Analizar', fr: 'Analyser', de: 'Analysieren',
  },
  'ai.feat.analyze.desc': {
    en: 'Summarize, extract data, suggest formulas', ko: '요약, 데이터 추출, 수식 추천', ja: '要約・データ抽出・数式提案', zh: '总结、提取数据、建议公式',
    es: 'Resumir, extraer datos, sugerir fórmulas', fr: 'Résumer, extraire des données, suggérer des formules', de: 'Zusammenfassen, Daten extrahieren, Formeln vorschlagen',
  },
  'ai.feat.vision': {
    en: 'Vision (PDF)', ko: '비전 (PDF)', ja: 'ビジョン（PDF）', zh: '视觉（PDF）',
    es: 'Visión (PDF)', fr: 'Vision (PDF)', de: 'Vision (PDF)',
  },
  'ai.feat.vision.desc': {
    en: 'Analyze formulas, tables, and images in PDFs', ko: 'PDF 내 수식, 표, 이미지 분석', ja: 'PDFの数式・表・画像を分析', zh: '分析PDF中的公式、表格和图像',
    es: 'Analizar fórmulas, tablas e imágenes en PDFs', fr: 'Analyser les formules, tableaux et images des PDF', de: 'Formeln, Tabellen und Bilder in PDFs analysieren',
  },
  'ai.feat.privacy': {
    en: '100% Private', ko: '100% 프라이버시', ja: '100%プライベート', zh: '100%隐私',
    es: '100% Privado', fr: '100% Privé', de: '100% Privat',
  },
  'ai.feat.privacy.desc': {
    en: 'Everything runs locally — your data never leaves your PC', ko: '모든 처리가 내 PC에서 — 데이터가 외부로 전송되지 않습니다', ja: 'すべてローカルで動作 — データがPCから外に出ません', zh: '一切在本地运行 — 您的数据永远不会离开您的电脑',
    es: 'Todo funciona localmente — tus datos nunca salen de tu PC', fr: 'Tout fonctionne localement — vos données ne quittent jamais votre PC', de: 'Alles läuft lokal — Ihre Daten verlassen nie Ihren PC',
  },
  'ai.tab.setup': {
    en: 'Install & Setup AI', ko: 'AI 설치 및 설정', ja: 'AIのインストールと設定', zh: '安装和设置AI',
    es: 'Instalar y configurar IA', fr: 'Installer et configurer l\'IA', de: 'KI installieren & einrichten',
  },
  'ai.tab.sessions': {
    en: 'Chat Sessions', ko: '대화 기록', ja: 'チャット履歴', zh: '聊天记录',
    es: 'Sesiones de chat', fr: 'Sessions de chat', de: 'Chat-Sitzungen',
  },
  'ai.monthlyCost': {
    en: 'Monthly cost', ko: '월 비용', ja: '月額料金', zh: '月费',
    es: 'Costo mensual', fr: 'Coût mensuel', de: 'Monatliche Kosten',
  },
  'ai.free': {
    en: 'Free', ko: '무료', ja: '無料', zh: '免费',
    es: 'Gratis', fr: 'Gratuit', de: 'Kostenlos',
  },
  'ai.yourData': {
    en: 'Your data', ko: '내 데이터', ja: 'あなたのデータ', zh: '您的数据',
    es: 'Tus datos', fr: 'Vos données', de: 'Ihre Daten',
  },
  'ai.staysOnPc': {
    en: 'Stays on PC', ko: 'PC에 보관', ja: 'PC内に保持', zh: '留在电脑上',
    es: 'Permanece en tu PC', fr: 'Reste sur votre PC', de: 'Bleibt auf dem PC',
  },
  'ai.sentToServers': {
    en: 'Sent to servers', ko: '서버로 전송', ja: 'サーバーに送信', zh: '发送到服务器',
    es: 'Enviado a servidores', fr: 'Envoyé aux serveurs', de: 'An Server gesendet',
  },
  'ai.offlineUse': {
    en: 'Offline use', ko: '오프라인 사용', ja: 'オフライン使用', zh: '离线使用',
    es: 'Uso sin conexión', fr: 'Utilisation hors ligne', de: 'Offline-Nutzung',
  },
  'ai.yes': {
    en: 'Yes', ko: '가능', ja: 'はい', zh: '是',
    es: 'Sí', fr: 'Oui', de: 'Ja',
  },
  'ai.no': {
    en: 'No', ko: '불가', ja: 'いいえ', zh: '否',
    es: 'No', fr: 'Non', de: 'Nein',
  },
  'ai.setupTime': {
    en: 'Setup time', ko: '설치 시간', ja: 'セットアップ時間', zh: '设置时间',
    es: 'Tiempo de configuración', fr: 'Temps de configuration', de: 'Einrichtungszeit',
  },
  'ai.fiveMinInstall': {
    en: '~5 min install', ko: '~5분 설치', ja: '約5分でインストール', zh: '约5分钟安装',
    es: 'Instalación de ~5 min', fr: 'Installation ~5 min', de: '~5 Min. Installation',
  },
  'ai.signUpPay': {
    en: 'Sign up + pay', ko: '가입 + 결제', ja: 'サインアップ + 支払い', zh: '注册 + 付费',
    es: 'Registrarse + pagar', fr: 'S\'inscrire + payer', de: 'Registrieren + bezahlen',
  },
  'ai.systemMsg': {
    en: 'AI assistant powered by local LLM. Your data stays on your device.', ko: '로컬 LLM 기반 AI 어시스턴트. 데이터는 기기에 보관됩니다.', ja: 'ローカルLLMによるAIアシスタント。データはデバイスに保持されます。', zh: 'AI助手由本地LLM驱动。您的数据保留在设备上。',
    es: 'Asistente IA con LLM local. Tus datos permanecen en tu dispositivo.', fr: 'Assistant IA alimenté par un LLM local. Vos données restent sur votre appareil.', de: 'KI-Assistent mit lokalem LLM. Ihre Daten bleiben auf Ihrem Gerät.',
  },
  'ai.ctx.doc': {
    en: '+ Document', ko: '+ 문서', ja: '+ ドキュメント', zh: '+ 文档',
    es: '+ Documento', fr: '+ Document', de: '+ Dokument',
  },
  'ai.ctx.sheet': {
    en: '+ Sheet', ko: '+ 시트', ja: '+ シート', zh: '+ 表格',
    es: '+ Hoja', fr: '+ Feuille', de: '+ Tabelle',
  },
  'ai.ctx.pdf': {
    en: '+ PDF', ko: '+ PDF', ja: '+ PDF', zh: '+ PDF',
    es: '+ PDF', fr: '+ PDF', de: '+ PDF',
  },
  'ai.ctx.selection': {
    en: '+ Selection', ko: '+ 선택', ja: '+ 選択', zh: '+ 选择',
    es: '+ Selección', fr: '+ Sélection', de: '+ Auswahl',
  },
  'ai.input.placeholder': {
    en: 'Ask AI anything — analysis, translation, summary, formulas...', ko: 'AI에게 질문하세요 — 문서 분석, 번역, 요약, 수식 등', ja: 'AIに質問 — 文書分析、翻訳、要約、数式など', zh: '向AI提问 — 文档分析、翻译、摘要、公式等',
    es: 'Pregunta al AI — análisis, traducción, resumen, fórmulas...', fr: 'Demandez à l\'IA — analyse, traduction, résumé, formules...', de: 'Fragen Sie die KI — Analyse, Übersetzung, Zusammenfassung, Formeln...',
  },
  'ai.insert': {
    en: 'Insert', ko: '삽입', ja: '挿入', zh: '插入',
    es: 'Insertar', fr: 'Insérer', de: 'Einfügen',
  },
  'ai.sessions': {
    en: 'Sessions', ko: '세션', ja: 'セッション', zh: '会话',
    es: 'Sesiones', fr: 'Sessions', de: 'Sitzungen',
  },
  'ai.setup': {
    en: 'Setup', ko: '설정', ja: '設定', zh: '设置',
    es: 'Configurar', fr: 'Configurer', de: 'Einrichten',
  },
  'ai.clearChat': {
    en: 'Clear', ko: '지우기', ja: 'クリア', zh: '清除',
    es: 'Borrar', fr: 'Effacer', de: 'Löschen',
  },
  'ai.ollamaUrl': {
    en: 'Ollama URL:', ko: 'Ollama URL:', ja: 'Ollama URL:', zh: 'Ollama URL:',
    es: 'URL de Ollama:', fr: 'URL d\'Ollama :', de: 'Ollama-URL:',
  },
  'ai.save': {
    en: 'Save', ko: '저장', ja: '保存', zh: '保存',
    es: 'Guardar', fr: 'Enregistrer', de: 'Speichern',
  },
  'ai.reset': {
    en: 'Reset', ko: '초기화', ja: 'リセット', zh: '重置',
    es: 'Restablecer', fr: 'Réinitialiser', de: 'Zurücksetzen',
  },
  'ai.close': {
    en: 'Close', ko: '닫기', ja: '閉じる', zh: '关闭',
    es: 'Cerrar', fr: 'Fermer', de: 'Schließen',
  },

  // AI tooltip descriptions (long form) - keep from original
  'ai.send': {
    en: 'Send message (also press Enter)', ko: '메시지 전송 (Enter키로도 전송 가능)', ja: 'メッセージ送信（Enterキーでも送信可能）', zh: '发送消息（也可按Enter发送）',
    es: 'Enviar mensaje (también presiona Enter)', fr: 'Envoyer le message (aussi avec Entrée)', de: 'Nachricht senden (auch Enter drücken)',
  },

  // ===== LANGUAGE PICKER =====
  'lang.title': {
    en: 'Choose Your Language', ko: '언어 선택', ja: '言語を選択', zh: '选择语言',
    es: 'Elige tu idioma', fr: 'Choisissez votre langue', de: 'Sprache wählen',
  },
  'lang.search': {
    en: 'Search in any language...', ko: '아무 언어로 검색...', ja: 'どの言語でも検索...',
    zh: '用任何语言搜索...', es: 'Buscar en cualquier idioma...', fr: 'Rechercher dans n\'importe quelle langue...', de: 'In jeder Sprache suchen...',
  },
  'lang.recommend': {
    en: 'We detected you might prefer:', ko: '이 언어를 사용하시는 것 같습니다:', ja: 'この言語がお好みかもしれません:', zh: '我们检测到您可能更喜欢:',
    es: 'Detectamos que podría preferir:', fr: 'Nous avons détecté que vous pourriez préférer :', de: 'Wir haben erkannt, dass Sie möglicherweise bevorzugen:',
  },
  'lang.switch': {
    en: 'Switch to', ko: '전환', ja: '切り替え', zh: '切换到',
    es: 'Cambiar a', fr: 'Passer à', de: 'Wechseln zu',
  },
  'lang.keepEnglish': {
    en: 'Keep English', ko: '영어 유지', ja: '英語のまま', zh: '保持英语',
    es: 'Mantener inglés', fr: 'Garder l\'anglais', de: 'Englisch beibehalten',
  },

  // ===== DROP ZONE =====
  'drop.message': {
    en: 'Drop .md file here', ko: '.md 파일을 여기에 놓으세요', ja: '.mdファイルをここにドロップ', zh: '将.md文件拖放到此处',
    es: 'Suelte el archivo .md aquí', fr: 'Déposez le fichier .md ici', de: '.md-Datei hier ablegen',
  },

  // ===== COMMON =====
  'common.ok': {
    en: 'OK', ko: '확인', ja: 'OK', zh: '确定',
    es: 'Aceptar', fr: 'OK', de: 'OK',
  },
  'common.cancel': {
    en: 'Cancel', ko: '취소', ja: 'キャンセル', zh: '取消',
    es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen',
  },
  'common.delete': {
    en: 'Delete', ko: '삭제', ja: '削除', zh: '删除',
    es: 'Eliminar', fr: 'Supprimer', de: 'Löschen',
  },
  'common.close': {
    en: 'Close', ko: '닫기', ja: '閉じる', zh: '关闭',
    es: 'Cerrar', fr: 'Fermer', de: 'Schließen',
  },
  'common.save': {
    en: 'Save', ko: '저장', ja: '保存', zh: '保存',
    es: 'Guardar', fr: 'Enregistrer', de: 'Speichern',
  },
  'common.yes': {
    en: 'Yes', ko: '예', ja: 'はい', zh: '是',
    es: 'Sí', fr: 'Oui', de: 'Ja',
  },
  'common.no': {
    en: 'No', ko: '아니요', ja: 'いいえ', zh: '否',
    es: 'No', fr: 'Non', de: 'Nein',
  },

  // ===== ADDITIONAL MISSING KEYS =====

  // --- AI ---
  'ai.clear': {
    en: 'Clear', ko: '지우기', ja: 'クリア', zh: '清除',
    es: 'Borrar', fr: 'Effacer', de: 'Löschen',
  },

  // --- Document (additional) ---
  'doc.datetime': {
    en: 'Insert Date/Time', ko: '날짜/시간 삽입', ja: '日付/時刻の挿入', zh: '插入日期/时间',
    es: 'Insertar fecha/hora', fr: 'Insérer date/heure', de: 'Datum/Uhrzeit einfügen',
  },
  'doc.findCase': {
    en: 'Match Case', ko: '대소문자 구분', ja: '大文字小文字を区別', zh: '区分大小写',
    es: 'Coincidir mayúsculas', fr: 'Respecter la casse', de: 'Groß-/Kleinschreibung',
  },
  'doc.findRegex': {
    en: 'Use Regular Expression', ko: '정규식 사용', ja: '正規表現を使用', zh: '使用正则表达式',
    es: 'Usar expresión regular', fr: 'Utiliser une expression régulière', de: 'Regulären Ausdruck verwenden',
  },
  'doc.horizontalRule': {
    en: 'Horizontal Rule', ko: '구분선', ja: '水平線', zh: '水平线',
    es: 'Línea horizontal', fr: 'Ligne horizontale', de: 'Horizontale Linie',
  },
  'doc.outlineNav': {
    en: 'Outline Navigator', ko: '개요 탐색기', ja: 'アウトラインナビ', zh: '大纲导航',
    es: 'Navegador de esquema', fr: 'Navigateur de plan', de: 'Gliederungsnavigator',
  },
  'doc.quickHighlight': {
    en: 'Quick Highlight', ko: '빠른 형광펜', ja: 'クイックハイライト', zh: '快速高亮',
    es: 'Resaltado rápido', fr: 'Surlignage rapide', de: 'Schnelles Hervorheben',
  },
  'doc.smartStyles': {
    en: 'Smart Styles Gallery', ko: '스마트 스타일 갤러리', ja: 'スマートスタイルギャラリー', zh: '智能样式库',
    es: 'Galería de estilos inteligentes', fr: 'Galerie de styles intelligents', de: 'Intelligente Stilgalerie',
  },
  'doc.statusBar': {
    en: 'Words: 0  |  Characters: 0  |  Paragraphs: 0', ko: '단어: 0  |  글자: 0  |  단락: 0',
    ja: '語数: 0  |  文字数: 0  |  段落: 0', zh: '词数: 0  |  字符: 0  |  段落: 0',
    es: 'Palabras: 0  |  Caracteres: 0  |  Párrafos: 0', fr: 'Mots : 0  |  Caractères : 0  |  Paragraphes : 0',
    de: 'Wörter: 0  |  Zeichen: 0  |  Absätze: 0',
  },
  'doc.templates': {
    en: 'Document Templates', ko: '문서 템플릿', ja: 'ドキュメントテンプレート', zh: '文档模板',
    es: 'Plantillas de documento', fr: 'Modèles de document', de: 'Dokumentvorlagen',
  },
  'doc.versionDiff': {
    en: 'Version Compare/Diff', ko: '버전 비교/차이', ja: 'バージョン比較/差分', zh: '版本比较/差异',
    es: 'Comparar versiones', fr: 'Comparer les versions', de: 'Versionsvergleich',
  },
  'doc.writingStats': {
    en: 'Writing Stats & Goals', ko: '글쓰기 통계 및 목표', ja: 'ライティング統計と目標', zh: '写作统计与目标',
    es: 'Estadísticas de escritura', fr: 'Statistiques d\'écriture', de: 'Schreibstatistiken & Ziele',
  },

  // --- PDF (additional) ---
  'pdf.addSignature': {
    en: 'Add Signature', ko: '서명 추가', ja: '署名を追加', zh: '添加签名',
    es: 'Añadir firma', fr: 'Ajouter une signature', de: 'Unterschrift hinzufügen',
  },
  'pdf.addStamp': {
    en: 'Add Stamp', ko: '도장 추가', ja: 'スタンプを追加', zh: '添加印章',
    es: 'Añadir sello', fr: 'Ajouter un tampon', de: 'Stempel hinzufügen',
  },
  'pdf.bookmarkAdd': {
    en: 'Add Bookmark', ko: '책갈피 추가', ja: 'ブックマークを追加', zh: '添加书签',
    es: 'Añadir marcador', fr: 'Ajouter un signet', de: 'Lesezeichen hinzufügen',
  },
  'pdf.bookmarksToggle': {
    en: 'Toggle Bookmarks Panel', ko: '책갈피 패널 열기/닫기', ja: 'ブックマークパネル切替', zh: '切换书签面板',
    es: 'Panel de marcadores', fr: 'Panneau des signets', de: 'Lesezeichen-Panel',
  },
  'pdf.clearAnnot': {
    en: 'Clear Annotations', ko: '주석 지우기', ja: '注釈をクリア', zh: '清除注释',
    es: 'Borrar anotaciones', fr: 'Effacer les annotations', de: 'Anmerkungen löschen',
  },
  'pdf.convertDoc': {
    en: 'Convert Document to PDF', ko: '문서를 PDF로 변환', ja: 'ドキュメントをPDFに変換', zh: '文档转PDF',
    es: 'Convertir documento a PDF', fr: 'Convertir document en PDF', de: 'Dokument in PDF umwandeln',
  },
  'pdf.convertMd': {
    en: 'Convert Markdown to PDF', ko: '마크다운을 PDF로 변환', ja: 'MarkdownをPDFに変換', zh: 'Markdown转PDF',
    es: 'Convertir Markdown a PDF', fr: 'Convertir Markdown en PDF', de: 'Markdown in PDF umwandeln',
  },
  'pdf.deletePage': {
    en: 'Delete Current Page', ko: '현재 페이지 삭제', ja: '現在のページを削除', zh: '删除当前页面',
    es: 'Eliminar página actual', fr: 'Supprimer la page actuelle', de: 'Aktuelle Seite löschen',
  },
  'pdf.deskew': {
    en: 'Auto-straighten Page', ko: '자동 보정', ja: '自動補正', zh: '自动校正',
    es: 'Corregir inclinación', fr: 'Corriger l\'inclinaison', de: 'Automatisch begradigen',
  },
  'pdf.extract': {
    en: 'Extract Page as PDF', ko: '페이지를 PDF로 추출', ja: 'ページをPDFとして抽出', zh: '提取页面为PDF',
    es: 'Extraer página como PDF', fr: 'Extraire la page en PDF', de: 'Seite als PDF extrahieren',
  },
  'pdf.fitWidth': {
    en: 'Fit Width', ko: '너비 맞춤', ja: '幅に合わせる', zh: '适合宽度',
    es: 'Ajustar al ancho', fr: 'Ajuster à la largeur', de: 'An Breite anpassen',
  },
  'pdf.formFill': {
    en: 'Detect & Fill Form Fields', ko: '양식 필드 감지 및 채우기', ja: 'フォームフィールドの検出と入力', zh: '检测并填写表单',
    es: 'Detectar y rellenar campos', fr: 'Détecter et remplir les champs', de: 'Formularfelder erkennen & ausfüllen',
  },
  'pdf.freehand': {
    en: 'Freehand Drawing', ko: '자유 그리기', ja: 'フリーハンド描画', zh: '自由绘画',
    es: 'Dibujo a mano alzada', fr: 'Dessin à main levée', de: 'Freihandzeichnung',
  },
  'pdf.highlight': {
    en: 'Highlight Text', ko: '텍스트 강조', ja: 'テキストをハイライト', zh: '高亮文本',
    es: 'Resaltar texto', fr: 'Surligner le texte', de: 'Text hervorheben',
  },
  'pdf.insertBlank': {
    en: 'Insert Blank Page', ko: '빈 페이지 삽입', ja: '空白ページを挿入', zh: '插入空白页',
    es: 'Insertar página en blanco', fr: 'Insérer une page vierge', de: 'Leere Seite einfügen',
  },
  'pdf.nextPage': {
    en: 'Next Page', ko: '다음 페이지', ja: '次のページ', zh: '下一页',
    es: 'Página siguiente', fr: 'Page suivante', de: 'Nächste Seite',
  },
  'pdf.prevPage': {
    en: 'Previous Page', ko: '이전 페이지', ja: '前のページ', zh: '上一页',
    es: 'Página anterior', fr: 'Page précédente', de: 'Vorherige Seite',
  },
  'pdf.redactApply': {
    en: 'Apply Redactions', ko: '편집 적용', ja: '墨消しを適用', zh: '应用涂黑',
    es: 'Aplicar redacciones', fr: 'Appliquer les caviardages', de: 'Schwärzungen anwenden',
  },
  'pdf.rotate': {
    en: 'Rotate Page 90°', ko: '페이지 90° 회전', ja: 'ページを90°回転', zh: '旋转页面90°',
    es: 'Rotar página 90°', fr: 'Pivoter la page de 90°', de: 'Seite um 90° drehen',
  },
  'pdf.stickyNote': {
    en: 'Add Sticky Note', ko: '메모 추가', ja: '付箋を追加', zh: '添加便签',
    es: 'Añadir nota adhesiva', fr: 'Ajouter une note', de: 'Haftnotiz hinzufügen',
  },
  'pdf.strikethrough': {
    en: 'Strikethrough Text', ko: '텍스트 취소선', ja: 'テキスト取り消し線', zh: '删除线文本',
    es: 'Tachar texto', fr: 'Texte barré', de: 'Text durchstreichen',
  },
  'pdf.underline': {
    en: 'Underline Text', ko: '텍스트 밑줄', ja: 'テキスト下線', zh: '下划线文本',
    es: 'Subrayar texto', fr: 'Souligner le texte', de: 'Text unterstreichen',
  },

  // --- Photo (additional) ---
  'photo.clone': {
    en: 'Clone/Stamp', ko: '복제/도장', ja: 'クローン/スタンプ', zh: '克隆/印章',
    es: 'Clonar/Sello', fr: 'Cloner/Tampon', de: 'Klonen/Stempel',
  },
  'photo.compare': {
    en: 'Compare (hold)', ko: '비교 (길게 누르기)', ja: '比較（長押し）', zh: '比较（按住）',
    es: 'Comparar (mantener)', fr: 'Comparer (maintenir)', de: 'Vergleichen (halten)',
  },
  'photo.createGif': {
    en: 'Create GIF', ko: 'GIF 만들기', ja: 'GIF作成', zh: '创建GIF',
    es: 'Crear GIF', fr: 'Créer un GIF', de: 'GIF erstellen',
  },
  'photo.flipH': {
    en: 'Flip Horizontal', ko: '좌우 반전', ja: '左右反転', zh: '水平翻转',
    es: 'Voltear horizontal', fr: 'Retourner horizontalement', de: 'Horizontal spiegeln',
  },
  'photo.flipV': {
    en: 'Flip Vertical', ko: '상하 반전', ja: '上下反転', zh: '垂直翻转',
    es: 'Voltear vertical', fr: 'Retourner verticalement', de: 'Vertikal spiegeln',
  },
  'photo.histogram': {
    en: 'Toggle Histogram', ko: '히스토그램 표시/숨기기', ja: 'ヒストグラム切替', zh: '切换直方图',
    es: 'Histograma', fr: 'Histogramme', de: 'Histogramm umschalten',
  },
  'photo.open': {
    en: 'Open Image', ko: '이미지 열기', ja: '画像を開く', zh: '打开图片',
    es: 'Abrir imagen', fr: 'Ouvrir une image', de: 'Bild öffnen',
  },
  'photo.perspective': {
    en: 'Perspective Transform', ko: '원근 변환', ja: 'パース変換', zh: '透视变换',
    es: 'Transformación de perspectiva', fr: 'Transformation de perspective', de: 'Perspektive transformieren',
  },
  'photo.reset': {
    en: 'Reset', ko: '초기화', ja: 'リセット', zh: '重置',
    es: 'Restablecer', fr: 'Réinitialiser', de: 'Zurücksetzen',
  },
  'photo.rotate': {
    en: 'Rotate 90°', ko: '90° 회전', ja: '90°回転', zh: '旋转90°',
    es: 'Rotar 90°', fr: 'Pivoter 90°', de: 'Um 90° drehen',
  },
  'photo.splitView': {
    en: 'Before/After Split View', ko: '전후 분할 보기', ja: '前後分割表示', zh: '前后对比视图',
    es: 'Vista dividida antes/después', fr: 'Vue fractionnée avant/après', de: 'Vorher/Nachher Ansicht',
  },
  'photo.spotHeal': {
    en: 'Spot Healing', ko: '스팟 힐링', ja: 'スポット修正', zh: '污点修复',
    es: 'Corrección puntual', fr: 'Correction de défaut', de: 'Bereichsreparatur',
  },
  'photo.textOverlay': {
    en: 'Text Overlay', ko: '텍스트 오버레이', ja: 'テキストオーバーレイ', zh: '文字叠加',
    es: 'Superposición de texto', fr: 'Superposition de texte', de: 'Textüberlagerung',
  },
  'photo.watermark': {
    en: 'Add Watermark', ko: '워터마크 추가', ja: '透かしを追加', zh: '添加水印',
    es: 'Añadir marca de agua', fr: 'Ajouter un filigrane', de: 'Wasserzeichen hinzufügen',
  },

  // --- Sheet (additional) ---
  'sheet.bandedRows': {
    en: 'Alternating Row Colors', ko: '교대 행 색상', ja: '交互行の色', zh: '交替行颜色',
    es: 'Colores alternos de fila', fr: 'Couleurs de lignes alternées', de: 'Wechselnde Zeilenfarben',
  },
  'sheet.cellBg': {
    en: 'Cell Background', ko: '셀 배경색', ja: 'セル背景色', zh: '单元格背景',
    es: 'Fondo de celda', fr: 'Arrière-plan de cellule', de: 'Zellhintergrund',
  },
  'sheet.cfManager': {
    en: 'Manage CF Rules', ko: '조건부 서식 규칙 관리', ja: '条件付き書式ルール管理', zh: '管理条件格式规则',
    es: 'Administrar reglas CF', fr: 'Gérer les règles FC', de: 'BF-Regeln verwalten',
  },
  'sheet.clearArrows': {
    en: 'Clear Trace Arrows', ko: '추적 화살표 지우기', ja: 'トレース矢印をクリア', zh: '清除追踪箭头',
    es: 'Borrar flechas de rastreo', fr: 'Effacer les flèches de traçage', de: 'Spurpfeile löschen',
  },
  'sheet.dataValid': {
    en: 'Data Validation', ko: '데이터 유효성 검사', ja: 'データ検証', zh: '数据验证',
    es: 'Validación de datos', fr: 'Validation des données', de: 'Datenvalidierung',
  },
  'sheet.exportDialog': {
    en: 'Export (CSV/JSON)', ko: '내보내기 (CSV/JSON)', ja: 'エクスポート (CSV/JSON)', zh: '导出 (CSV/JSON)',
    es: 'Exportar (CSV/JSON)', fr: 'Exporter (CSV/JSON)', de: 'Exportieren (CSV/JSON)',
  },
  'sheet.findReplace': {
    en: 'Find & Replace', ko: '찾기 및 바꾸기', ja: '検索と置換', zh: '查找和替换',
    es: 'Buscar y reemplazar', fr: 'Rechercher et remplacer', de: 'Suchen und Ersetzen',
  },
  'sheet.flashFill': {
    en: 'Flash Fill', ko: '빠른 채우기', ja: 'フラッシュフィル', zh: '快速填充',
    es: 'Relleno rápido', fr: 'Remplissage instantané', de: 'Blitzvorschau',
  },
  'sheet.freezeCol': {
    en: 'Freeze First Column', ko: '첫 열 고정', ja: '先頭列を固定', zh: '冻结首列',
    es: 'Inmovilizar primera columna', fr: 'Figer la première colonne', de: 'Erste Spalte fixieren',
  },
  'sheet.freezeRow': {
    en: 'Freeze Top Row', ko: '상단 행 고정', ja: '先頭行を固定', zh: '冻结首行',
    es: 'Inmovilizar fila superior', fr: 'Figer la ligne supérieure', de: 'Oberste Zeile fixieren',
  },
  'sheet.goalSeek': {
    en: 'Goal Seek (What-If)', ko: '목표값 찾기', ja: 'ゴールシーク', zh: '目标值求解',
    es: 'Buscar objetivo', fr: 'Valeur cible', de: 'Zielwertsuche',
  },
  'sheet.groupRows': {
    en: 'Group/Ungroup Rows', ko: '행 그룹화/해제', ja: '行のグループ化/解除', zh: '行分组/取消分组',
    es: 'Agrupar/Desagrupar filas', fr: 'Grouper/Dégrouper les lignes', de: 'Zeilen gruppieren/aufheben',
  },
  'sheet.namedRange': {
    en: 'Named Ranges', ko: '이름 범위', ja: '名前付き範囲', zh: '命名范围',
    es: 'Rangos con nombre', fr: 'Plages nommées', de: 'Benannte Bereiche',
  },
  'sheet.pivotRefresh': {
    en: 'Refresh Pivot Table', ko: '피벗 테이블 새로고침', ja: 'ピボットテーブルを更新', zh: '刷新透视表',
    es: 'Actualizar tabla dinámica', fr: 'Actualiser le tableau croisé', de: 'Pivot-Tabelle aktualisieren',
  },
  'sheet.print': {
    en: 'Print Sheet', ko: '시트 인쇄', ja: 'シートを印刷', zh: '打印工作表',
    es: 'Imprimir hoja', fr: 'Imprimer la feuille', de: 'Tabelle drucken',
  },
  'sheet.protect': {
    en: 'Protect Sheet', ko: '시트 보호', ja: 'シートを保護', zh: '保护工作表',
    es: 'Proteger hoja', fr: 'Protéger la feuille', de: 'Tabelle schützen',
  },
  'sheet.removeDups': {
    en: 'Remove Duplicates', ko: '중복 제거', ja: '重複の削除', zh: '删除重复项',
    es: 'Quitar duplicados', fr: 'Supprimer les doublons', de: 'Duplikate entfernen',
  },
  'sheet.slicer': {
    en: 'Insert Slicer', ko: '슬라이서 삽입', ja: 'スライサーを挿入', zh: '插入切片器',
    es: 'Insertar segmentación', fr: 'Insérer un segment', de: 'Datenschnitt einfügen',
  },
  'sheet.sortCustom': {
    en: 'Custom Sort', ko: '사용자 지정 정렬', ja: 'カスタムソート', zh: '自定义排序',
    es: 'Orden personalizado', fr: 'Tri personnalisé', de: 'Benutzerdefinierte Sortierung',
  },
  'sheet.sparkline': {
    en: 'Insert Sparkline', ko: '스파크라인 삽입', ja: 'スパークラインを挿入', zh: '插入迷你图',
    es: 'Insertar minigráfico', fr: 'Insérer un graphique sparkline', de: 'Sparkline einfügen',
  },
  'sheet.subtotals': {
    en: 'Subtotals', ko: '부분합', ja: '小計', zh: '分类汇总',
    es: 'Subtotales', fr: 'Sous-totaux', de: 'Teilergebnisse',
  },
  'sheet.textToCols': {
    en: 'Text to Columns', ko: '텍스트 나누기', ja: 'テキストを列に分割', zh: '分列',
    es: 'Texto en columnas', fr: 'Texte en colonnes', de: 'Text in Spalten',
  },
  'sheet.traceDependents': {
    en: 'Trace Dependents', ko: '종속 항목 추적', ja: '従属セルのトレース', zh: '追踪从属单元格',
    es: 'Rastrear dependientes', fr: 'Tracer les dépendants', de: 'Abhängige verfolgen',
  },
  'sheet.tracePrecedents': {
    en: 'Trace Precedents', ko: '선행 항목 추적', ja: '参照元のトレース', zh: '追踪引用单元格',
    es: 'Rastrear precedentes', fr: 'Tracer les précédents', de: 'Vorgänger verfolgen',
  },
  'sheet.transpose': {
    en: 'Transpose Selection', ko: '선택 영역 전치', ja: '選択範囲の転置', zh: '转置选区',
    es: 'Transponer selección', fr: 'Transposer la sélection', de: 'Auswahl transponieren',
  },

  // --- Slide (additional) ---
  'slide.addSlide': {
    en: 'New Slide', ko: '새 슬라이드', ja: '新しいスライド', zh: '新幻灯片',
    es: 'Nueva diapositiva', fr: 'Nouvelle diapositive', de: 'Neue Folie',
  },
  'slide.alignObjects': {
    en: 'Align Objects', ko: '개체 정렬', ja: 'オブジェクトの整列', zh: '对齐对象',
    es: 'Alinear objetos', fr: 'Aligner les objets', de: 'Objekte ausrichten',
  },
  'slide.animTimeline': {
    en: 'Animation Timeline', ko: '애니메이션 타임라인', ja: 'アニメーションタイムライン', zh: '动画时间线',
    es: 'Línea de tiempo de animación', fr: 'Chronologie d\'animation', de: 'Animations-Zeitleiste',
  },
  'slide.bringForward': {
    en: 'Bring Forward', ko: '앞으로 가져오기', ja: '前面へ移動', zh: '上移一层',
    es: 'Traer adelante', fr: 'Avancer', de: 'Eine Ebene nach vorne',
  },
  'slide.deleteSlide': {
    en: 'Delete Slide', ko: '슬라이드 삭제', ja: 'スライドを削除', zh: '删除幻灯片',
    es: 'Eliminar diapositiva', fr: 'Supprimer la diapositive', de: 'Folie löschen',
  },
  'slide.drawTools': {
    en: 'Drawing Tools', ko: '그리기 도구', ja: '描画ツール', zh: '绘图工具',
    es: 'Herramientas de dibujo', fr: 'Outils de dessin', de: 'Zeichenwerkzeuge',
  },
  'slide.dupSlide': {
    en: 'Duplicate Slide', ko: '슬라이드 복제', ja: 'スライドを複製', zh: '复制幻灯片',
    es: 'Duplicar diapositiva', fr: 'Dupliquer la diapositive', de: 'Folie duplizieren',
  },
  'slide.exportImg': {
    en: 'Export as Image', ko: '이미지로 내보내기', ja: '画像としてエクスポート', zh: '导出为图片',
    es: 'Exportar como imagen', fr: 'Exporter en image', de: 'Als Bild exportieren',
  },
  'slide.exportPptx': {
    en: 'Export as PPTX', ko: 'PPTX로 내보내기', ja: 'PPTXとしてエクスポート', zh: '导出为PPTX',
    es: 'Exportar como PPTX', fr: 'Exporter en PPTX', de: 'Als PPTX exportieren',
  },
  'slide.gradientBg': {
    en: 'Gradient Background', ko: '그라데이션 배경', ja: 'グラデーション背景', zh: '渐变背景',
    es: 'Fondo degradado', fr: 'Arrière-plan dégradé', de: 'Verlaufshintergrund',
  },
  'slide.grid': {
    en: 'Toggle Grid', ko: '격자 표시/숨기기', ja: 'グリッド切替', zh: '切换网格',
    es: 'Alternar cuadrícula', fr: 'Basculer la grille', de: 'Raster umschalten',
  },
  'slide.group': {
    en: 'Group Selected', ko: '선택 항목 그룹화', ja: '選択をグループ化', zh: '组合选区',
    es: 'Agrupar selección', fr: 'Grouper la sélection', de: 'Auswahl gruppieren',
  },
  'slide.insertVideo': {
    en: 'Insert Video', ko: '비디오 삽입', ja: '動画を挿入', zh: '插入视频',
    es: 'Insertar vídeo', fr: 'Insérer une vidéo', de: 'Video einfügen',
  },
  'slide.layoutGallery': {
    en: 'Layout Gallery', ko: '레이아웃 갤러리', ja: 'レイアウトギャラリー', zh: '布局库',
    es: 'Galería de diseños', fr: 'Galerie de mises en page', de: 'Layoutgalerie',
  },
  'slide.masterEdit': {
    en: 'Edit Slide Master', ko: '슬라이드 마스터 편집', ja: 'スライドマスターを編集', zh: '编辑幻灯片母版',
    es: 'Editar patrón de diapositivas', fr: 'Modifier le masque', de: 'Folienmaster bearbeiten',
  },
  'slide.masterSlides': {
    en: 'Master Slides', ko: '슬라이드 마스터', ja: 'スライドマスター', zh: '幻灯片母版',
    es: 'Patrón de diapositivas', fr: 'Masque de diapositive', de: 'Folienmaster',
  },
  'slide.presTimer': {
    en: 'Presentation Timer', ko: '발표 타이머', ja: 'プレゼンタイマー', zh: '演示计时器',
    es: 'Temporizador de presentación', fr: 'Minuteur de présentation', de: 'Präsentations-Timer',
  },
  'slide.presenterView': {
    en: 'Presenter View', ko: '발표자 보기', ja: 'プレゼンター表示', zh: '演示者视图',
    es: 'Vista del presentador', fr: 'Mode présentateur', de: 'Referentenansicht',
  },
  'slide.printHandout': {
    en: 'Print Handout', ko: '유인물 인쇄', ja: '配布資料の印刷', zh: '打印讲义',
    es: 'Imprimir folleto', fr: 'Imprimer le prospectus', de: 'Handout drucken',
  },
  'slide.rehearse': {
    en: 'Rehearse Timings', ko: '시간 리허설', ja: 'タイミングのリハーサル', zh: '排练计时',
    es: 'Ensayar intervalos', fr: 'Répéter le minutage', de: 'Zeiten proben',
  },
  'slide.sendBackward': {
    en: 'Send Backward', ko: '뒤로 보내기', ja: '背面へ移動', zh: '下移一层',
    es: 'Enviar atrás', fr: 'Reculer', de: 'Eine Ebene nach hinten',
  },
  'slide.shapeLib': {
    en: 'Shape Library', ko: '도형 라이브러리', ja: '図形ライブラリ', zh: '形状库',
    es: 'Biblioteca de formas', fr: 'Bibliothèque de formes', de: 'Formbibliothek',
  },
  'slide.smartGuides': {
    en: 'Toggle Smart Guides', ko: '스마트 가이드 표시/숨기기', ja: 'スマートガイド切替', zh: '切换智能参考线',
    es: 'Guías inteligentes', fr: 'Guides intelligents', de: 'Intelligente Hilfslinien',
  },
  'slide.sorter': {
    en: 'Slide Sorter', ko: '슬라이드 정렬', ja: 'スライド一覧', zh: '幻灯片浏览',
    es: 'Clasificador de diapositivas', fr: 'Trieuse de diapositives', de: 'Foliensortierung',
  },
  'slide.speakerView': {
    en: 'Speaker View', ko: '발표자 보기', ja: 'スピーカービュー', zh: '演讲者视图',
    es: 'Vista del ponente', fr: 'Mode intervenants', de: 'Sprecheransicht',
  },
  'slide.ungroup': {
    en: 'Ungroup', ko: '그룹 해제', ja: 'グループ解除', zh: '取消组合',
    es: 'Desagrupar', fr: 'Dégrouper', de: 'Gruppierung aufheben',
  },
  'slide.viewToggle': {
    en: 'Toggle View', ko: '보기 전환', ja: '表示切替', zh: '切换视图',
    es: 'Alternar vista', fr: 'Basculer la vue', de: 'Ansicht wechseln',
  },

  // --- Markdown toolbar (additional) ---
  'tip.snippets': {
    en: 'Snippet Library', ko: '스니펫 라이브러리', ja: 'スニペットライブラリ', zh: '代码片段库',
    es: 'Biblioteca de fragmentos', fr: 'Bibliothèque d\'extraits', de: 'Snippet-Bibliothek',
  },
  'tip.zenMode': {
    en: 'Zen/Focus Mode', ko: '집중 모드', ja: '集中モード', zh: '专注模式',
    es: 'Modo zen/enfoque', fr: 'Mode zen/concentration', de: 'Zen-/Fokusmodus',
  },
  'tip.shortcuts': {
    en: 'Keyboard Shortcuts', ko: '키보드 단축키', ja: 'キーボードショートカット', zh: '键盘快捷键',
    es: 'Atajos de teclado', fr: 'Raccourcis clavier', de: 'Tastaturkürzel',
  },
};
