// OfficeLink SL — Internationalization (i18n)
// 30+ languages sorted by internet user count
// Searchable overlay modal + IP-based language recommendation

const LANG_KEY = 'marklink-lang';
const LANG_ASKED_KEY = 'marklink-lang-asked';

// Languages sorted by approximate internet user count
// Each entry: label (native), flag, english name, searchTerms (for overlay search)
const LANGUAGES = {
  en: { label: 'English', flag: '🇺🇸', english: 'English', searchTerms: 'english 영어 英语 英語 inglés anglais' },
  zh: { label: '中文', flag: '🇨🇳', english: 'Chinese', searchTerms: 'chinese 중국어 中文 chino chinois' },
  hi: { label: 'हिन्दी', flag: '🇮🇳', english: 'Hindi', searchTerms: 'hindi 힌디어 印地语 ヒンディー語 hindú' },
  es: { label: 'Español', flag: '🇪🇸', english: 'Spanish', searchTerms: 'spanish 스페인어 西班牙语 スペイン語 español espagnol' },
  ar: { label: 'العربية', flag: '🇸🇦', english: 'Arabic', searchTerms: 'arabic 아랍어 阿拉伯语 アラビア語 árabe arabe العربية', rtl: true },
  fr: { label: 'Français', flag: '🇫🇷', english: 'French', searchTerms: 'french 프랑스어 法语 フランス語 francés français' },
  pt: { label: 'Português', flag: '🇧🇷', english: 'Portuguese', searchTerms: 'portuguese 포르투갈어 葡萄牙语 ポルトガル語 portugués portugais' },
  bn: { label: 'বাংলা', flag: '🇧🇩', english: 'Bengali', searchTerms: 'bengali bangla 벵골어 孟加拉语 ベンガル語' },
  ru: { label: 'Русский', flag: '🇷🇺', english: 'Russian', searchTerms: 'russian 러시아어 俄语 ロシア語 ruso russe русский' },
  id: { label: 'Bahasa Indonesia', flag: '🇮🇩', english: 'Indonesian', searchTerms: 'indonesian 인도네시아어 印尼语 インドネシア語 indonesio indonésien' },
  ur: { label: 'اردو', flag: '🇵🇰', english: 'Urdu', searchTerms: 'urdu 우르두어 乌尔都语 ウルドゥー語', rtl: true },
  ja: { label: '日本語', flag: '🇯🇵', english: 'Japanese', searchTerms: 'japanese 일본어 日语 japonés japonais 日本語' },
  de: { label: 'Deutsch', flag: '🇩🇪', english: 'German', searchTerms: 'german 독일어 德语 ドイツ語 alemán allemand deutsch' },
  sw: { label: 'Kiswahili', flag: '🇹🇿', english: 'Swahili', searchTerms: 'swahili 스와힐리어 斯瓦希里语 スワヒリ語 suajili' },
  te: { label: 'తెలుగు', flag: '🇮🇳', english: 'Telugu', searchTerms: 'telugu 텔루구어 泰卢固语 テルグ語' },
  mr: { label: 'मराठी', flag: '🇮🇳', english: 'Marathi', searchTerms: 'marathi 마라티어 马拉地语 マラーティー語' },
  ta: { label: 'தமிழ்', flag: '🇮🇳', english: 'Tamil', searchTerms: 'tamil 타밀어 泰米尔语 タミル語' },
  tr: { label: 'Türkçe', flag: '🇹🇷', english: 'Turkish', searchTerms: 'turkish 터키어 土耳其语 トルコ語 turco turc' },
  ko: { label: '한국어', flag: '🇰🇷', english: 'Korean', searchTerms: 'korean 한국어 韩语 韓国語 coreano coréen' },
  vi: { label: 'Tiếng Việt', flag: '🇻🇳', english: 'Vietnamese', searchTerms: 'vietnamese 베트남어 越南语 ベトナム語 vietnamita vietnamien' },
  tl: { label: 'Filipino', flag: '🇵🇭', english: 'Filipino', searchTerms: 'filipino tagalog 필리핀어 菲律宾语 フィリピン語' },
  th: { label: 'ภาษาไทย', flag: '🇹🇭', english: 'Thai', searchTerms: 'thai 태국어 泰语 タイ語 tailandés thaï ภาษาไทย' },
  it: { label: 'Italiano', flag: '🇮🇹', english: 'Italian', searchTerms: 'italian 이탈리아어 意大利语 イタリア語 italiano italien' },
  fa: { label: 'فارسی', flag: '🇮🇷', english: 'Persian', searchTerms: 'persian farsi 페르시아어 波斯语 ペルシア語 persa', rtl: true },
  pl: { label: 'Polski', flag: '🇵🇱', english: 'Polish', searchTerms: 'polish 폴란드어 波兰语 ポーランド語 polaco polonais' },
  uk: { label: 'Українська', flag: '🇺🇦', english: 'Ukrainian', searchTerms: 'ukrainian 우크라이나어 乌克兰语 ウクライナ語' },
  ms: { label: 'Bahasa Melayu', flag: '🇲🇾', english: 'Malay', searchTerms: 'malay 말레이어 马来语 マレー語 malayo malais' },
  my: { label: 'မြန်မာဘာသာ', flag: '🇲🇲', english: 'Burmese', searchTerms: 'burmese myanmar 미얀마어 缅甸语 ビルマ語' },
  km: { label: 'ខ្មែរ', flag: '🇰🇭', english: 'Khmer', searchTerms: 'khmer cambodian 크메르어 高棉语 クメール語' },
  am: { label: 'አማርኛ', flag: '🇪🇹', english: 'Amharic', searchTerms: 'amharic 암하라어 阿姆哈拉语 アムハラ語' },
  ha: { label: 'Hausa', flag: '🇳🇬', english: 'Hausa', searchTerms: 'hausa 하우사어 豪萨语 ハウサ語' },
  yo: { label: 'Yorùbá', flag: '🇳🇬', english: 'Yoruba', searchTerms: 'yoruba 요루바어 约鲁巴语 ヨルバ語' },
  ne: { label: 'नेपाली', flag: '🇳🇵', english: 'Nepali', searchTerms: 'nepali 네팔어 尼泊尔语 ネパール語' },
  si: { label: 'සිංහල', flag: '🇱🇰', english: 'Sinhala', searchTerms: 'sinhala sinhalese 싱할라어 僧伽罗语 シンハラ語' },
  nl: { label: 'Nederlands', flag: '🇳🇱', english: 'Dutch', searchTerms: 'dutch 네덜란드어 荷兰语 オランダ語 holandés néerlandais' },
};

// Country code → language code mapping (for IP-based detection)
const COUNTRY_LANG_MAP = {
  US: 'en', GB: 'en', AU: 'en', CA: 'en', NZ: 'en', IE: 'en', ZA: 'en',
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh',
  IN: 'hi', BD: 'bn', PK: 'ur', NP: 'ne', LK: 'si',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', PE: 'es', VE: 'es', CL: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es',
  SA: 'ar', AE: 'ar', EG: 'ar', IQ: 'ar', MA: 'ar', DZ: 'ar', SD: 'ar', YE: 'ar', SY: 'ar', TN: 'ar', JO: 'ar', LY: 'ar', LB: 'ar', OM: 'ar', KW: 'ar', QA: 'ar', BH: 'ar',
  FR: 'fr', BE: 'fr', CH: 'fr', SN: 'fr', CI: 'fr', ML: 'fr', BF: 'fr', NE: 'fr', TD: 'fr', GN: 'fr', RW: 'fr', CD: 'fr', CM: 'fr', MG: 'fr', HT: 'fr',
  BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  ID: 'id', MY: 'ms',
  JP: 'ja', KR: 'ko',
  DE: 'de', AT: 'de',
  TZ: 'sw', KE: 'sw', UG: 'sw',
  TR: 'tr', VN: 'vi', TH: 'th', PH: 'tl',
  IT: 'it', IR: 'fa', PL: 'pl', UA: 'uk', NL: 'nl',
  MM: 'my', KH: 'km', ET: 'am', NG: 'ha',
};

// Translation dictionary: key → { lang: text }
// Falls back: currentLang → en → key
const T = {
  // Tab names (universal)
  'tab.document': { en: 'Document' },
  'tab.sheet': { en: 'Sheet' },
  'tab.slide': { en: 'Slide' },
  'tab.pdf': { en: 'PDF' },
  'tab.markdown': { en: 'Markdown' },

  // Toolbar tooltips
  'tip.open': {
    en: 'Open file', ko: '파일 열기', ja: 'ファイルを開く', zh: '打开文件',
    es: 'Abrir archivo', fr: 'Ouvrir un fichier', pt: 'Abrir arquivo',
    de: 'Datei öffnen', ru: 'Открыть файл', ar: 'فتح ملف',
    hi: 'फ़ाइल खोलें', bn: 'ফাইল খুলুন', id: 'Buka file', tr: 'Dosya aç',
    vi: 'Mở tệp', th: 'เปิดไฟล์', tl: 'Buksan ang file', it: 'Apri file',
    pl: 'Otwórz plik', uk: 'Відкрити файл', ms: 'Buka fail', sw: 'Fungua faili',
    fa: 'باز کردن فایل', ur: 'فائل کھولیں', ne: 'फाइल खोल्नुहोस्',
    ta: 'கோப்பைத் திற', te: 'ఫైల్ తెరవండి', mr: 'फाइल उघडा',
    my: 'ဖိုင်ဖွင့်ပါ', km: 'បើកឯកសារ', am: 'ፋይል ክፈት',
    ha: 'Buɗe fayil', yo: 'Ṣí fáìlì', si: 'ගොනුව විවෘත කරන්න', nl: 'Bestand openen',
  },
  'tip.save': {
    en: 'Save', ko: '저장하기', ja: '保存', zh: '保存',
    es: 'Guardar', fr: 'Enregistrer', pt: 'Salvar',
    de: 'Speichern', ru: 'Сохранить', ar: 'حفظ',
    hi: 'सहेजें', bn: 'সংরক্ষণ করুন', id: 'Simpan', tr: 'Kaydet',
    vi: 'Lưu', th: 'บันทึก', tl: 'I-save', it: 'Salva',
    pl: 'Zapisz', uk: 'Зберегти', ms: 'Simpan', sw: 'Hifadhi',
    fa: 'ذخیره', ur: 'محفوظ کریں', ne: 'सुरक्षित गर्नुहोस्',
    ta: 'சேமி', te: 'సేవ్ చేయి', mr: 'जतन करा',
    my: 'သိမ်းဆည်းပါ', km: 'រក្សាទុក', am: 'አስቀምጥ',
    ha: 'Ajiye', yo: 'Fipamọ́', si: 'සුරකින්න', nl: 'Opslaan',
  },
  'tip.bold': {
    en: 'Bold', ko: '굵게', ja: '太字', zh: '加粗',
    es: 'Negrita', fr: 'Gras', pt: 'Negrito',
    de: 'Fett', ru: 'Жирный', ar: 'غامق',
    hi: 'बोल्ड', id: 'Tebal', tr: 'Kalın', vi: 'Đậm', th: 'ตัวหนา',
    it: 'Grassetto', pl: 'Pogrubienie', uk: 'Жирний', sw: 'Nene',
  },
  'tip.italic': {
    en: 'Italic', ko: '기울임', ja: '斜体', zh: '斜体',
    es: 'Cursiva', fr: 'Italique', pt: 'Itálico',
    de: 'Kursiv', ru: 'Курсив', ar: 'مائل',
    hi: 'इटैलिक', id: 'Miring', tr: 'İtalik', vi: 'Nghiêng', th: 'ตัวเอียง',
    it: 'Corsivo', pl: 'Kursywa', uk: 'Курсив', sw: 'Italiki',
  },
  'tip.heading': {
    en: 'Heading', ko: '제목', ja: '見出し', zh: '标题',
    es: 'Encabezado', fr: 'Titre', pt: 'Título',
    de: 'Überschrift', ru: 'Заголовок', ar: 'عنوان',
    hi: 'शीर्षक', id: 'Judul', tr: 'Başlık', vi: 'Tiêu đề', th: 'หัวข้อ',
    it: 'Intestazione', pl: 'Nagłówek', uk: 'Заголовок',
  },
  'tip.code': {
    en: 'Code', ko: '코드', ja: 'コード', zh: '代码',
    es: 'Código', fr: 'Code', pt: 'Código',
    de: 'Code', ru: 'Код', ar: 'كود',
    hi: 'कोड', id: 'Kode', tr: 'Kod', vi: 'Mã', th: 'โค้ด',
    it: 'Codice', pl: 'Kod', uk: 'Код',
  },
  'tip.list': {
    en: 'List', ko: '목록', ja: 'リスト', zh: '列表',
    es: 'Lista', fr: 'Liste', pt: 'Lista',
    de: 'Liste', ru: 'Список', ar: 'قائمة',
    hi: 'सूची', id: 'Daftar', tr: 'Liste', vi: 'Danh sách', th: 'รายการ',
    it: 'Elenco', pl: 'Lista', uk: 'Список',
  },
  'tip.link': {
    en: 'Link', ko: '링크', ja: 'リンク', zh: '链接',
    es: 'Enlace', fr: 'Lien', pt: 'Link',
    de: 'Link', ru: 'Ссылка', ar: 'رابط',
    hi: 'लिंक', id: 'Tautan', tr: 'Bağlantı', vi: 'Liên kết', th: 'ลิงก์',
    it: 'Collegamento', pl: 'Łącze', uk: 'Посилання',
  },
  'tip.table': {
    en: 'Table', ko: '표', ja: 'テーブル', zh: '表格',
    es: 'Tabla', fr: 'Tableau', pt: 'Tabela',
    de: 'Tabelle', ru: 'Таблица', ar: 'جدول',
    hi: 'तालिका', id: 'Tabel', tr: 'Tablo', vi: 'Bảng', th: 'ตาราง',
    it: 'Tabella', pl: 'Tabela', uk: 'Таблиця',
  },
  'tip.sidebar': {
    en: 'Toggle Sidebar', ko: '사이드바 열기/닫기', ja: 'サイドバー切替', zh: '切换侧边栏',
    es: 'Barra lateral', fr: 'Barre latérale', pt: 'Barra lateral',
    de: 'Seitenleiste', ru: 'Боковая панель', ar: 'الشريط الجانبي',
    hi: 'साइडबार', id: 'Bilah sisi', tr: 'Kenar çubuğu', vi: 'Thanh bên', th: 'แถบด้านข้าง',
  },
  'tip.export': {
    en: 'Export', ko: '내보내기', ja: 'エクスポート', zh: '导出',
    es: 'Exportar', fr: 'Exporter', pt: 'Exportar',
    de: 'Exportieren', ru: 'Экспорт', ar: 'تصدير',
    hi: 'निर्यात', id: 'Ekspor', tr: 'Dışa aktar', vi: 'Xuất', th: 'ส่งออก',
    it: 'Esporta', pl: 'Eksportuj', uk: 'Експорт',
  },
  'tip.install': {
    en: 'Install App', ko: '앱 설치', ja: 'アプリをインストール', zh: '安装应用',
    es: 'Instalar App', fr: 'Installer', pt: 'Instalar App',
    de: 'App installieren', ru: 'Установить', ar: 'تثبيت التطبيق',
    hi: 'ऐप इंस्टॉल करें', id: 'Instal Aplikasi', tr: 'Uygulamayı Yükle', vi: 'Cài đặt ứng dụng',
    th: 'ติดตั้งแอป', it: 'Installa App', pl: 'Zainstaluj', uk: 'Встановити додаток',
    sw: 'Sakinisha App',
  },
  'tip.feedback': {
    en: 'Feedback', ko: '의견 보내기', ja: 'フィードバック', zh: '反馈',
    es: 'Comentarios', fr: 'Avis', pt: 'Feedback',
    de: 'Feedback', ru: 'Отзыв', ar: 'ملاحظات',
    hi: 'प्रतिक्रिया', id: 'Masukan', tr: 'Geri bildirim', vi: 'Phản hồi',
    th: 'ข้อเสนอแนะ', it: 'Feedback', pl: 'Opinia', uk: 'Відгук',
    sw: 'Maoni',
  },
  'tip.fullscreen': {
    en: 'Fullscreen', ko: '전체 화면', ja: '全画面', zh: '全屏',
    es: 'Pantalla completa', fr: 'Plein écran', pt: 'Tela cheia',
    de: 'Vollbild', ru: 'Полный экран', ar: 'ملء الشاشة',
    hi: 'पूर्ण स्क्रीन', id: 'Layar penuh', tr: 'Tam ekran', vi: 'Toàn màn hình',
    th: 'เต็มจอ', it: 'Schermo intero', pl: 'Pełny ekran', uk: 'Повний екран',
    sw: 'Skrini kamili',
  },
  'tip.theme': {
    en: 'Toggle Theme', ko: '테마 전환', ja: 'テーマ切替', zh: '切换主题',
    es: 'Cambiar tema', fr: 'Changer le thème', pt: 'Alternar tema',
    de: 'Design wechseln', ru: 'Сменить тему', ar: 'تبديل السمة',
    hi: 'थीम बदलें', id: 'Ubah tema', tr: 'Tema değiştir', vi: 'Đổi giao diện', th: 'เปลี่ยนธีม',
  },
  'tip.lang': {
    en: 'Change Language', ko: '언어 변경', ja: '言語変更', zh: '更改语言',
    es: 'Cambiar idioma', fr: 'Changer la langue', pt: 'Mudar idioma',
    de: 'Sprache ändern', ru: 'Сменить язык', ar: 'تغيير اللغة',
    hi: 'भाषा बदलें', id: 'Ubah bahasa', tr: 'Dil değiştir', vi: 'Đổi ngôn ngữ', th: 'เปลี่ยนภาษา',
    sw: 'Badilisha lugha', tl: 'Palitan ang wika',
  },

  'tip.tutorial': {
    en: 'View app tutorial again', ko: '앱 사용법 다시 보기', ja: 'チュートリアルを再表示',
    zh: '重新查看教程', es: 'Ver tutorial de nuevo', fr: 'Revoir le tutoriel',
    hi: 'ट्यूटोरियल फिर से देखें', ar: 'عرض البرنامج التعليمي مرة أخرى',
    id: 'Lihat tutorial lagi', tr: 'Eğitimi tekrar gör', vi: 'Xem lại hướng dẫn',
    th: 'ดูบทเรียนอีกครั้ง', pt: 'Rever tutorial', de: 'Tutorial erneut ansehen',
    ru: 'Просмотреть руководство снова', sw: 'Tazama mafunzo tena',
  },

  // AI button & panel
  'tip.ai': {
    en: 'AI Assistant — Free AI running on your PC\nAnalyze, translate, summarize without cloud\nNo monthly subscription unlike ChatGPT/Claude',
    ko: 'AI 어시스턴트 — 내 PC에서 무료로 동작하는 AI\n클라우드 전송 없이 문서 분석, 번역, 요약 가능\nChatGPT/Claude와 달리 월 구독료 없음',
    ja: 'AIアシスタント — PCで無料で動作するAI\nクラウド送信なしで文書分析・翻訳・要約\nChatGPT/Claudeと違い月額料金なし',
    zh: 'AI助手 — 在您的电脑上免费运行的AI\n无需云端即可分析、翻译、总结文档\n不像ChatGPT/Claude需要月费',
    es: 'Asistente AI — IA gratuita en tu PC\nAnaliza, traduce, resume sin nube\nSin suscripción mensual como ChatGPT/Claude',
    fr: 'Assistant IA — IA gratuite sur votre PC\nAnalysez, traduisez, résumez sans cloud\nSans abonnement mensuel comme ChatGPT/Claude',
    pt: 'Assistente IA — IA gratuita no seu PC\nAnalise, traduza, resuma sem nuvem\nSem assinatura mensal como ChatGPT/Claude',
    hi: 'AI सहायक — आपके PC पर मुफ्त AI\nक्लाउड के बिना विश्लेषण, अनुवाद, सारांश\nChatGPT/Claude जैसी मासिक सदस्यता नहीं',
    ar: 'مساعد ذكاء اصطناعي — ذكاء اصطناعي مجاني على جهازك\nتحليل وترجمة وتلخيص بدون سحابة\nبدون اشتراك شهري مثل ChatGPT/Claude',
    de: 'KI-Assistent — Kostenlose KI auf Ihrem PC\nAnalysieren, übersetzen, zusammenfassen ohne Cloud\nKein monatliches Abo wie ChatGPT/Claude',
    ru: 'ИИ-ассистент — Бесплатный ИИ на вашем ПК\nАнализ, перевод, резюме без облака\nБез ежемесячной подписки как ChatGPT/Claude',
    id: 'Asisten AI — AI gratis di PC Anda\nAnalisis, terjemah, ringkas tanpa cloud\nTanpa langganan bulanan seperti ChatGPT/Claude',
    tr: 'AI Asistanı — PC\'nizde ücretsiz AI\nBulut olmadan analiz, çeviri, özet\nChatGPT/Claude gibi aylık abonelik yok',
    vi: 'Trợ lý AI — AI miễn phí trên PC của bạn\nPhân tích, dịch, tóm tắt không cần đám mây\nKhông phí hàng tháng như ChatGPT/Claude',
    th: 'ผู้ช่วย AI — AI ฟรีบน PC ของคุณ\nวิเคราะห์ แปล สรุปโดยไม่ต้องใช้คลาวด์\nไม่มีค่าสมาชิกรายเดือนเหมือน ChatGPT/Claude',
    sw: 'Msaidizi wa AI — AI bure kwenye PC yako\nChanganua, tafsiri, fupisha bila wingu\nHakuna ada ya kila mwezi kama ChatGPT/Claude',
  },

  // AI context buttons
  'ai.ctx.doc': {
    en: 'Send current Document content to AI.\nUse for summary, proofreading, translation.',
    ko: '현재 Document 탭의 내용을 AI에게 전달합니다.\n문서 요약, 교정, 번역 등에 활용하세요.',
    ja: '現在のDocumentの内容をAIに送信します。\n要約・校正・翻訳などに活用してください。',
    zh: '将当前Document内容发送给AI。\n用于摘要、校对、翻译等。',
    es: 'Enviar contenido del Document al AI.\nÚsalo para resumen, corrección, traducción.',
    fr: 'Envoyer le contenu du Document à l\'IA.\nUtilisez pour résumer, corriger, traduire.',
  },
  'ai.ctx.sheet': {
    en: 'Send current Sheet data to AI.\nUse for data analysis, formula suggestions.',
    ko: '현재 Sheet 탭의 데이터를 AI에게 전달합니다.\n데이터 분석, 수식 추천 등에 활용하세요.',
    ja: '現在のSheetデータをAIに送信します。\nデータ分析・数式提案などに活用してください。',
    zh: '将当前Sheet数据发送给AI。\n用于数据分析、公式建议等。',
    es: 'Enviar datos de Sheet al AI.\nÚsalo para análisis de datos, sugerencias de fórmulas.',
    fr: 'Envoyer les données Sheet à l\'IA.\nUtilisez pour l\'analyse de données, suggestions de formules.',
  },
  'ai.ctx.pdf': {
    en: 'Send loaded PDF content to AI.\nVision model can analyze formulas/tables/images.',
    ko: '로드된 PDF 내용을 AI에게 전달합니다.\nVision 모델 사용 시 수식/표/이미지도 분석 가능.',
    ja: '読み込んだPDFの内容をAIに送信します。\nVisionモデルで数式・表・画像も分析可能。',
    zh: '将已加载的PDF内容发送给AI。\nVision模型可分析公式/表格/图片。',
    es: 'Enviar contenido PDF al AI.\nEl modelo Vision puede analizar fórmulas/tablas/imágenes.',
    fr: 'Envoyer le contenu PDF à l\'IA.\nLe modèle Vision peut analyser formules/tableaux/images.',
  },
  'ai.ctx.selection': {
    en: 'Send selected text to AI.\nUse when you want to ask about a specific part.',
    ko: '현재 드래그로 선택한 텍스트를 AI에게 전달합니다.\n특정 부분만 질문하고 싶을 때 사용하세요.',
    ja: '選択したテキストをAIに送信します。\n特定の部分について質問したい時に使用。',
    zh: '将选中的文本发送给AI。\n用于询问特定部分。',
    es: 'Enviar texto seleccionado al AI.\nÚsalo cuando quieras preguntar sobre una parte específica.',
    fr: 'Envoyer le texte sélectionné à l\'IA.\nUtilisez pour poser des questions sur une partie spécifique.',
  },
  'ai.input.placeholder': {
    en: 'Ask AI anything — analysis, translation, summary, formulas...',
    ko: 'AI에게 질문하세요 — 문서 분석, 번역, 요약, 수식 등',
    ja: 'AIに質問 — 文書分析、翻訳、要約、数式など',
    zh: '向AI提问 — 文档分析、翻译、摘要、公式等',
    es: 'Pregunta al AI — análisis, traducción, resumen, fórmulas...',
    fr: 'Demandez à l\'IA — analyse, traduction, résumé, formules...',
    pt: 'Pergunte ao AI — análise, tradução, resumo, fórmulas...',
    hi: 'AI से कुछ भी पूछें — विश्लेषण, अनुवाद, सारांश, सूत्र...',
    ar: 'اسأل الذكاء الاصطناعي — تحليل، ترجمة، ملخص، صيغ...',
    id: 'Tanya AI apa saja — analisis, terjemahan, ringkasan, rumus...',
    tr: 'AI\'ya herhangi bir şey sorun — analiz, çeviri, özet, formüller...',
    vi: 'Hỏi AI bất kỳ điều gì — phân tích, dịch, tóm tắt, công thức...',
    th: 'ถาม AI ได้ทุกอย่าง — วิเคราะห์ แปล สรุป สูตร...',
    sw: 'Uliza AI chochote — uchambuzi, tafsiri, muhtasari, fomula...',
  },
  'ai.send': {
    en: 'Send message (also press Enter)', ko: '메시지 전송 (Enter키로도 전송 가능)',
    ja: 'メッセージ送信（Enterキーでも送信可能）', zh: '发送消息（也可按Enter发送）',
    es: 'Enviar mensaje (también presiona Enter)', fr: 'Envoyer le message (aussi avec Entrée)',
  },
  'ai.insert': {
    en: 'Insert AI\'s last response into the current document.',
    ko: 'AI의 마지막 답변을 현재 편집 중인 문서에 삽입합니다.',
    ja: 'AIの最後の回答を現在編集中の文書に挿入します。',
    zh: '将AI的最后回答插入到当前文档中。',
    es: 'Insertar la última respuesta del AI en el documento actual.',
    fr: 'Insérer la dernière réponse de l\'IA dans le document actuel.',
  },
  'ai.sessions': {
    en: 'Save, load, or fork chat sessions.\nManage multiple conversation topics separately.',
    ko: '대화 기록을 저장/불러오기/복사(Fork)할 수 있습니다.\n여러 주제의 대화를 따로 관리하세요.',
    ja: '会話履歴の保存・読み込み・フォーク（コピー）ができます。\n複数のトピックを別々に管理しましょう。',
    zh: '保存、加载或分支(Fork)聊天会话。\n分别管理多个对话主题。',
    es: 'Guardar, cargar o bifurcar sesiones de chat.\nGestiona múltiples temas de conversación por separado.',
    fr: 'Sauvegarder, charger ou dupliquer des sessions de chat.\nGérez plusieurs sujets de conversation séparément.',
  },
  'ai.setup': {
    en: 'Install AI engine (Ollama) and manage models.\nStart here if this is your first time.',
    ko: 'AI 엔진(Ollama) 설치 및 AI 모델 관리.\n처음 사용 시 여기서 설치를 시작하세요.',
    ja: 'AIエンジン（Ollama）のインストールとモデル管理。\n初めての方はここから始めてください。',
    zh: '安装AI引擎(Ollama)并管理模型。\n首次使用请从这里开始。',
    es: 'Instalar motor AI (Ollama) y gestionar modelos.\nComienza aquí si es tu primera vez.',
    fr: 'Installer le moteur IA (Ollama) et gérer les modèles.\nCommencez ici si c\'est votre première fois.',
  },
  'ai.clear': {
    en: 'Clear all messages in this chat.\nUse when starting a new topic.',
    ko: '현재 대화 내용을 모두 지웁니다.\n새로운 주제로 대화를 시작할 때 사용하세요.',
    ja: '現在の会話内容をすべて消去します。\n新しいトピックで会話を始める時に使用。',
    zh: '清除当前所有聊天内容。\n开始新话题时使用。',
    es: 'Borrar todos los mensajes del chat.\nÚsalo para iniciar un nuevo tema.',
    fr: 'Effacer tous les messages du chat.\nUtilisez pour démarrer un nouveau sujet.',
  },

  // Session modal
  'session.load': {
    en: 'Load this conversation.\nCurrent chat is auto-saved.',
    ko: '이 대화를 불러옵니다.\n현재 대화는 자동 저장됩니다.',
    ja: 'この会話を読み込みます。\n現在の会話は自動保存されます。',
    zh: '加载此对话。\n当前聊天会自动保存。',
    es: 'Cargar esta conversación.\nEl chat actual se guarda automáticamente.',
    fr: 'Charger cette conversation.\nLe chat actuel est sauvegardé automatiquement.',
  },
  'session.fork': {
    en: 'Copy this conversation to a new session.\nThe original stays intact. Continue the\ncopy in a different direction.',
    ko: '이 대화를 복사해서 새 대화를 만듭니다.\n원본은 그대로 유지되며, 복사본에서\n다른 방향으로 이어갈 수 있습니다.',
    ja: 'この会話をコピーして新しい会話を作ります。\n元の会話はそのまま保持され、コピーで\n別の方向に続けることができます。',
    zh: '复制此对话创建新会话。\n原始对话保持不变，可以在\n副本中朝不同方向继续。',
    es: 'Copiar esta conversación a una nueva sesión.\nLa original se mantiene intacta. Continúa\nla copia en una dirección diferente.',
    fr: 'Copier cette conversation dans une nouvelle session.\nL\'original reste intact. Continuez la\ncopie dans une direction différente.',
  },
  'session.delete': {
    en: 'Delete this conversation.\nThis cannot be undone.',
    ko: '이 대화를 삭제합니다.\n삭제 후 복구할 수 없습니다.',
    ja: 'この会話を削除します。\n削除後は復元できません。',
    zh: '删除此对话。\n删除后无法恢复。',
    es: 'Eliminar esta conversación.\nNo se puede deshacer.',
    fr: 'Supprimer cette conversation.\nCette action est irréversible.',
  },

  // AI Tab features
  'ai.features.title': {
    en: 'What can AI do?', ko: 'AI로 무엇을 할 수 있나요?', ja: 'AIでできること',
    zh: 'AI能做什么？', es: '¿Qué puede hacer la IA?', fr: 'Que peut faire l\'IA ?',
    pt: 'O que a IA pode fazer?', hi: 'AI क्या कर सकता है?', ar: 'ماذا يمكن للذكاء الاصطناعي أن يفعل؟',
    de: 'Was kann KI?', ru: 'Что может ИИ?', id: 'Apa yang bisa dilakukan AI?',
    tr: 'AI ne yapabilir?', vi: 'AI có thể làm gì?', th: 'AI ทำอะไรได้บ้าง?', sw: 'AI inaweza kufanya nini?',
  },
  'ai.feat.write': {
    en: 'Write & Edit', ko: '작성 & 편집', ja: '作成・編集', zh: '写作和编辑',
    es: 'Escribir y editar', fr: 'Écrire et éditer', de: 'Schreiben & Bearbeiten',
    ru: 'Написание и редактирование', id: 'Menulis & Mengedit', tr: 'Yaz & Düzenle',
    vi: 'Viết & Chỉnh sửa', th: 'เขียนและแก้ไข', ar: 'كتابة وتحرير', hi: 'लिखें और संपादित करें',
  },
  'ai.feat.write.desc': {
    en: 'Draft, proofread, and improve documents', ko: '문서 작성, 교정, 개선',
    ja: '文書の作成・校正・改善', zh: '起草、校对和改进文档',
    es: 'Redactar, corregir y mejorar documentos', fr: 'Rédiger, relire et améliorer des documents',
  },
  'ai.feat.translate': {
    en: 'Translate', ko: '번역', ja: '翻訳', zh: '翻译',
    es: 'Traducir', fr: 'Traduire', de: 'Übersetzen', ru: 'Перевод',
    id: 'Terjemah', tr: 'Çevir', vi: 'Dịch', th: 'แปล', ar: 'ترجمة', hi: 'अनुवाद',
  },
  'ai.feat.translate.desc': {
    en: 'Translate text between 30+ languages', ko: '30개 이상 언어 간 번역',
    ja: '30以上の言語間で翻訳', zh: '在30多种语言之间翻译',
    es: 'Traducir texto entre más de 30 idiomas', fr: 'Traduire du texte entre plus de 30 langues',
  },
  'ai.feat.analyze': {
    en: 'Analyze', ko: '분석', ja: '分析', zh: '分析',
    es: 'Analizar', fr: 'Analyser', de: 'Analysieren', ru: 'Анализ',
    id: 'Analisis', tr: 'Analiz', vi: 'Phân tích', th: 'วิเคราะห์', ar: 'تحليل', hi: 'विश्लेषण',
  },
  'ai.feat.analyze.desc': {
    en: 'Summarize, extract data, suggest formulas', ko: '요약, 데이터 추출, 수식 추천',
    ja: '要約・データ抽出・数式提案', zh: '总结、提取数据、建议公式',
    es: 'Resumir, extraer datos, sugerir fórmulas', fr: 'Résumer, extraire des données, suggérer des formules',
  },
  'ai.feat.vision': {
    en: 'Vision (PDF)', ko: '비전 (PDF)', ja: 'ビジョン（PDF）', zh: '视觉（PDF）',
    es: 'Visión (PDF)', fr: 'Vision (PDF)',
  },
  'ai.feat.vision.desc': {
    en: 'Analyze formulas, tables, and images in PDFs', ko: 'PDF 내 수식, 표, 이미지 분석',
    ja: 'PDFの数式・表・画像を分析', zh: '分析PDF中的公式、表格和图像',
    es: 'Analizar fórmulas, tablas e imágenes en PDFs', fr: 'Analyser les formules, tableaux et images des PDF',
  },
  'ai.feat.privacy': {
    en: '100% Private', ko: '100% 프라이버시', ja: '100%プライベート', zh: '100%隐私',
    es: '100% Privado', fr: '100% Privé', de: '100% Privat', ru: '100% Приватность',
    ar: 'خصوصية 100%', hi: '100% निजी',
  },
  'ai.feat.privacy.desc': {
    en: 'Everything runs locally — your data never leaves your PC',
    ko: '모든 처리가 내 PC에서 — 데이터가 외부로 전송되지 않습니다',
    ja: 'すべてローカルで動作 — データがPCから外に出ません',
    zh: '一切在本地运行 — 您的数据永远不会离开您的电脑',
    es: 'Todo funciona localmente — tus datos nunca salen de tu PC',
    fr: 'Tout fonctionne localement — vos données ne quittent jamais votre PC',
  },
  'ai.tab.setup': {
    en: 'Install & Setup AI', ko: 'AI 설치 및 설정', ja: 'AIのインストールと設定',
    zh: '安装和设置AI', es: 'Instalar y configurar IA', fr: 'Installer et configurer l\'IA',
    de: 'KI installieren & einrichten', ru: 'Установка и настройка ИИ',
    id: 'Instal & Atur AI', tr: 'AI Kur & Ayarla', vi: 'Cài đặt AI', th: 'ติดตั้ง AI',
    ar: 'تثبيت وإعداد الذكاء الاصطناعي', hi: 'AI इंस्टॉल करें',
  },
  'ai.tab.sessions': {
    en: 'Chat Sessions', ko: '대화 기록', ja: 'チャット履歴', zh: '聊天记录',
    es: 'Sesiones de chat', fr: 'Sessions de chat', de: 'Chat-Sitzungen',
    ru: 'Сессии чата', id: 'Sesi Obrolan', tr: 'Sohbet Oturumları',
    vi: 'Phiên trò chuyện', th: 'เซสชันแชท', ar: 'جلسات المحادثة', hi: 'चैट सत्र',
  },

  // Language picker overlay
  'lang.title': {
    en: 'Choose Your Language', ko: '언어 선택', ja: '言語を選択', zh: '选择语言',
    es: 'Elige tu idioma', fr: 'Choisissez votre langue', pt: 'Escolha seu idioma',
    de: 'Sprache wählen', ru: 'Выберите язык', ar: 'اختر لغتك',
    hi: 'अपनी भाषा चुनें', id: 'Pilih bahasa Anda', tr: 'Dilinizi seçin',
    vi: 'Chọn ngôn ngữ', th: 'เลือกภาษาของคุณ', sw: 'Chagua lugha yako',
    tl: 'Piliin ang iyong wika',
  },
  'lang.search': {
    en: 'Search in any language (e.g. 한국어, 日本語, Español)...', ko: '아무 언어로 검색 (예: Korean, 日本語)...', ja: 'どの言語でも検索 (例: 한국어, English)...',
    zh: '用任何语言搜索 (如: 한국어, English)...', es: 'Buscar en cualquier idioma...', fr: 'Rechercher dans n\'importe quelle langue...',
    hi: 'किसी भी भाषा में खोजें...', ar: 'ابحث بأي لغة...', id: 'Cari dalam bahasa apa pun...',
    tr: 'Herhangi bir dilde ara...', vi: 'Tìm bằng bất kỳ ngôn ngữ nào...', th: 'ค้นหาด้วยภาษาใดก็ได้...',
    pt: 'Pesquisar idioma...', de: 'Sprache suchen...', ru: 'Поиск языка...',
    sw: 'Tafuta lugha...', tl: 'Maghanap ng wika...',
  },
  'lang.recommend': {
    en: 'We detected you might prefer:',
    ko: '이 언어를 사용하시는 것 같습니다:',
    ja: 'この言語がお好みかもしれません:',
    zh: '我们检测到您可能更喜欢:',
    es: 'Detectamos que podría preferir:',
    fr: 'Nous avons détecté que vous pourriez préférer :',
    hi: 'हमने पाया कि आप शायद पसंद करें:',
    ar: 'اكتشفنا أنك قد تفضل:',
    id: 'Kami mendeteksi Anda mungkin lebih suka:',
    tr: 'Tercih edebileceğinizi tespit ettik:',
    vi: 'Chúng tôi phát hiện bạn có thể thích:',
    th: 'เราตรวจพบว่าคุณอาจชอบ:',
    pt: 'Detectamos que você pode preferir:',
    de: 'Wir haben erkannt, dass Sie möglicherweise bevorzugen:',
    ru: 'Мы определили, что вы, возможно, предпочитаете:',
    sw: 'Tuligundua unaweza kupendelea:',
  },
  'lang.switch': {
    en: 'Switch to', ko: '전환', ja: '切り替え', zh: '切换到',
    es: 'Cambiar a', fr: 'Passer à', pt: 'Mudar para',
    hi: 'बदलें', ar: 'التبديل إلى', id: 'Beralih ke',
  },
  'lang.keepEnglish': {
    en: 'Keep English', ko: '영어 유지', ja: '英語のまま', zh: '保持英语',
    es: 'Mantener inglés', fr: 'Garder l\'anglais',
  },
};

let currentLang = 'en'; // Default: English
const changeListeners = [];

/**
 * Initialize i18n — English default, detect via IP for recommendation
 */
export function initI18n() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && LANGUAGES[saved]) {
    currentLang = saved;
    applyTranslations();
    applyDirection(saved);
  } else {
    // Default to English
    currentLang = 'en';
    applyTranslations();
    applyDirection('en');
    // Try IP-based detection for recommendation
    detectLanguageByIP();
  }
}

/**
 * Detect user's language via IP geolocation (free API)
 * Shows recommendation overlay if non-English
 */
async function detectLanguageByIP() {
  // Don't ask again if user already chose
  if (localStorage.getItem(LANG_ASKED_KEY)) return;

  try {
    // Try browser language first (instant, no network)
    const browserLang = navigator.language?.substring(0, 2) || 'en';
    let detectedLang = LANGUAGES[browserLang] ? browserLang : null;

    // Try IP-based detection
    if (!detectedLang) {
      try {
        const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          const countryCode = data.country_code;
          detectedLang = COUNTRY_LANG_MAP[countryCode] || null;
        }
      } catch { /* IP detection failed, use browser lang */ }
    }

    // If detected language is English or unknown, skip
    if (!detectedLang || detectedLang === 'en') {
      localStorage.setItem(LANG_ASKED_KEY, '1');
      return;
    }

    // Show recommendation overlay
    showLanguageRecommendation(detectedLang);
  } catch {
    // Silent fail — just use English
  }
}

/**
 * Show a small overlay recommending detected language
 */
function showLanguageRecommendation(langCode) {
  const langInfo = LANGUAGES[langCode];
  if (!langInfo) return;

  const overlay = document.createElement('div');
  overlay.className = 'lang-recommend-overlay';
  overlay.innerHTML = `
    <div class="lang-recommend-card">
      <div class="lang-recommend-text">
        <span class="lang-recommend-flag">${langInfo.flag}</span>
        <span>${t('lang.recommend')}</span>
      </div>
      <div class="lang-recommend-actions">
        <button class="lang-recommend-btn primary" data-lang="${langCode}">
          ${langInfo.flag} ${langInfo.label}
        </button>
        <button class="lang-recommend-btn secondary" data-lang="en">
          🇺🇸 Keep English
        </button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('.lang-recommend-btn');
    if (!btn) return;
    const lang = btn.dataset.lang;
    setLang(lang);
    localStorage.setItem(LANG_ASKED_KEY, '1');
    overlay.remove();
  });

  document.body.appendChild(overlay);

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (overlay.parentNode) {
      localStorage.setItem(LANG_ASKED_KEY, '1');
      overlay.remove();
    }
  }, 15000);
}

/**
 * Get current language code
 */
export function getLang() {
  return currentLang;
}

/**
 * Get all available languages
 */
export function getLanguages() {
  return LANGUAGES;
}

/**
 * Translate a key to current language
 */
export function t(key) {
  const entry = T[key];
  if (!entry) return key;
  return entry[currentLang] || entry.en || key;
}

/**
 * Switch language
 */
export function setLang(lang) {
  if (!LANGUAGES[lang]) return;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  applyTranslations();
  applyDirection(lang);
  changeListeners.forEach(fn => fn(lang));
}

/**
 * Apply RTL/LTR direction based on language
 */
function applyDirection(lang) {
  const info = LANGUAGES[lang];
  const isRtl = info?.rtl === true;
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  document.documentElement.classList.toggle('rtl', isRtl);
}

/**
 * Register a callback for language changes
 */
export function onLangChange(fn) {
  changeListeners.push(fn);
}

/**
 * Apply translations to all elements with data-i18n attributes
 */
function applyTranslations() {
  // Translate title attributes (tooltips)
  document.querySelectorAll('[data-tip]').forEach(el => {
    const key = el.dataset.tip;
    const val = t(key);
    if (val !== key) el.title = val;
  });

  // Translate text content
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.dataset.t;
    const val = t(key);
    if (val !== key) el.textContent = val;
  });

  // Translate placeholder
  document.querySelectorAll('[data-placeholder]').forEach(el => {
    const key = el.dataset.placeholder;
    const val = t(key);
    if (val !== key) el.placeholder = val;
  });

  // Update lang-btn display
  const langBtn = document.getElementById('lang-btn');
  if (langBtn) {
    const info = LANGUAGES[currentLang];
    if (info) langBtn.textContent = `${info.flag} ${info.label}`;
  }
}

/**
 * Show language picker overlay modal
 */
export function showLanguagePicker() {
  // Remove existing
  document.querySelector('.lang-picker-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'lang-picker-overlay';

  const langEntries = Object.entries(LANGUAGES);

  overlay.innerHTML = `
    <div class="lang-picker-modal">
      <div class="lang-picker-header">
        <h2>${t('lang.title')}</h2>
        <button class="lang-picker-close">&times;</button>
      </div>
      <div class="lang-picker-search-wrap">
        <input type="text" class="lang-picker-search" placeholder="${t('lang.search')}" autofocus>
      </div>
      <div class="lang-picker-grid">
        ${langEntries.map(([code, info]) => `
          <button class="lang-picker-item ${code === currentLang ? 'active' : ''}" data-lang="${code}">
            <span class="lang-picker-flag">${info.flag}</span>
            <span class="lang-picker-label">${info.label}</span>
            <span class="lang-picker-english">${info.english}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  // Close handlers
  const close = () => overlay.remove();
  overlay.querySelector('.lang-picker-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Search handler
  const searchInput = overlay.querySelector('.lang-picker-search');
  const items = () => overlay.querySelectorAll('.lang-picker-item');

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim();
    items().forEach(item => {
      const code = item.dataset.lang;
      const info = LANGUAGES[code];
      const haystack = `${info.label} ${info.english} ${info.searchTerms}`.toLowerCase();
      item.style.display = (!query || haystack.includes(query)) ? '' : 'none';
    });
  });

  // Language selection
  overlay.addEventListener('click', (e) => {
    const item = e.target.closest('.lang-picker-item');
    if (!item) return;
    setLang(item.dataset.lang);
    close();
  });

  // Keyboard: Escape to close
  const keyHandler = (e) => {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', keyHandler); }
  };
  document.addEventListener('keydown', keyHandler);

  document.body.appendChild(overlay);
  searchInput.focus();
}
