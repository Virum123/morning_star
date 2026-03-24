import re

with open('ui/mac_fallback.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Background fix for settings
html = html.replace('.dashboard-side-card {', '.dashboard-side-card, .settings-card {')
html = html.replace(
    '.settings-card {\n      padding: 18px;\n      border-radius: 22px;\n      background: var(--panel-strong);\n      border: 1px solid var(--line);\n    }',
    '.settings-card { padding: 32px; border-radius: 24px; background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow); }'
)
html = html.replace('box-sizing: border-box; }', 'box-sizing: border-box; }\n    .form-group { margin-bottom: 24px; }\n    .form-group label { display: block; margin-bottom: 8px; font-weight: 700; color: var(--text-primary); font-size: 15px; }\n    .form-group select, .form-group input { width: 100%; padding: 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--input-bg); color: var(--text-primary); font-size: 15px; font-weight: 600; }\n    .settings-title { font-size: 26px; font-weight: 800; margin-bottom: 28px; }')

# 2. Add language array and dicts
js_injection = """
const i18n = {
  ko: { dash: '대시보드', tasks: '할 일', files: '파일', settings: '설정', total: '전체 할 일', comp: '달성함', remain: '남은 일정', noTask: '오늘 일정 없음', markComplete: '완료하기', markDone: '오늘 완료!', todayTasks: '오늘의 할 일', clean: '일정이 비어있습니다!', help: '새로운 일정은 파일 → 내일 탭에서 추가해 주세요.', prog: '오늘의 진행률', streak: '연속 달성일', insp: '오늘의 한 마디', theme: '화면 테마', lang: '언어 (Language)', save: '설정 저장', saving: '저장 중...', profile: '이름 (프로필)', morning: '좋은 아침입니다', afternoon: '좋은 오후입니다', evening: '좋은 저녁입니다', night: '평안한 밤 되세요', plan: '오늘 계획하신 일정입니다.', done: '완료' },
  en: { dash: 'Dashboard', tasks: 'Tasks', files: 'Files', settings: 'Settings', total: 'Total Tasks', comp: 'Completed', remain: 'Remaining', noTask: 'No tasks today', markComplete: 'Mark Today Complete', markDone: 'Today Marked!', todayTasks: 'Today\\'s Tasks', clean: 'Your slate is clean!', help: 'Add tasks for tomorrow in the Files → Tomorrow tab.', prog: 'Today\\'s Progress', streak: 'Streak', insp: 'Daily Inspiration', theme: 'Appearance', lang: 'Language', save: 'Save Settings', saving: 'Saving...', profile: 'Profile (Name)', morning: 'Good Morning', afternoon: 'Good Afternoon', evening: 'Good Evening', night: 'Good Night', plan: 'Here\\'s what you have planned for today.', done: 'done' },
  jp: { dash: 'ダッシュボード', tasks: 'タスク', files: 'ファイル', settings: '設定', total: '全タスク', comp: '完了', remain: '残り', noTask: '今日の予定なし', markComplete: '今日を完了にする', markDone: '今日完了！', todayTasks: '今日のタスク', clean: '予定はありません！', help: '明日のタスクはファイル → 明日タブで追加してください。', prog: '今日の進捗', streak: '連続達成日数', insp: '今日の一言', theme: 'テーマ', lang: '言語 (Language)', save: '設定を保存', saving: '保存中...', profile: 'プロフィール', morning: 'おはようございます', afternoon: 'こんにちは', evening: 'こんばんは', night: 'おやすみなさい', plan: '今日の予定はこちらです。', done: '完了' }
};
let currentLang = 'ko';
function t(key) { return i18n[currentLang][key] || key; }

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.innerText = t(el.getAttribute('data-i18n'));
  });
  if(typeof updateDashboardTexts === 'function') updateDashboardTexts();
  if(typeof updateGreeting === 'function') updateGreeting();
}
"""

html = html.replace('function getDynamicThemePhase(date = new Date()) {', js_injection + '\nfunction getDynamicThemePhase(date = new Date()) {')

# 3. Modify initTheme to detect language
init_theme_patch = """
          const nextTheme = config.theme || 'light';
          currentLang = config.language || 'ko';
          AppConfig.nickname = config.nickname || 'Alex';
          applyTranslations();
          const selLang = document.getElementById('settings-language');
          if(selLang) selLang.value = currentLang;
          const selTheme = document.getElementById('settings-theme');
          if(selTheme) selTheme.value = nextTheme;
          const inpNick = document.getElementById('settings-nickname');
          if(inpNick) inpNick.value = AppConfig.nickname;
"""
html = html.replace("const nextTheme = config.theme || 'light';", init_theme_patch)

# 4. Settings HTML rewrite
new_settings = """
      <div class="view" id="view-settings">
        <div class="settings-card" style="max-width: 500px; margin: 0 auto; margin-top: 40px;">
          <h2 class="settings-title" data-i18n="settings">설정</h2>
          
          <div class="form-group">
            <label data-i18n="profile">이름 (프로필)</label>
            <input type="text" id="settings-nickname" value="Alex">
          </div>

          <div class="form-group">
            <label data-i18n="theme">화면 테마</label>
            <select id="settings-theme">
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
              <option value="dynamic">Time Adaptive</option>
            </select>
          </div>

          <div class="form-group">
            <label data-i18n="lang">언어 (Language)</label>
            <select id="settings-language">
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="jp">日本語</option>
            </select>
          </div>
          
          <button class="btn btn-primary" id="btn-save-settings" data-i18n="save" style="width: 100%; padding: 16px; font-size: 16px; border-radius: 12px; margin-top: 10px;">설정 저장</button>
        </div>
      </div>
"""
import re
html = re.sub(r'<div class="view" id="view-settings">.*?</button>\s*</div>\s*</div>', new_settings, html, flags=re.DOTALL)

# 5. Save settings JS binding
save_js = """
      const btnSave = document.getElementById('btn-save-settings');
      if (btnSave) {
        btnSave.addEventListener('click', async () => {
          if (!Api) return;
          btnSave.innerText = t('saving');
          const tVal = document.getElementById('settings-theme').value;
          const lVal = document.getElementById('settings-language').value;
          const nVal = document.getElementById('settings-nickname').value;
          currentLang = lVal;
          AppConfig.nickname = nVal;
          await Api.save_config({ theme: tVal, language: lVal, nickname: nVal });
          applyThemeMode(tVal);
          applyTranslations();
          setTimeout(() => { btnSave.innerText = t('save'); }, 600);
        });
      }
"""
html = html.replace("document.getElementById('nav-settings').addEventListener", save_js + "\n      document.getElementById('nav-settings').addEventListener")

# 6. Apply data-i18n to hardcoded HTML text
replacements = [
    ('>Dashboard<', ' data-i18n="dash">Dashboard<'),
    ('>Tasks<', ' data-i18n="tasks">Tasks<'),
    ('>Files<', ' data-i18n="files">Files<'),
    ('span>Settings<', 'span data-i18n="settings">Settings<'),
    ('>Total Tasks<', ' data-i18n="total">Total Tasks<'),
    ('>Completed<', ' data-i18n="comp">Completed<'),
    ('>Remaining<', ' data-i18n="remain">Remaining<'),
    (">Today's Progress<", " data-i18n=\"prog\">Today's Progress<"),
    ('>Streak<', ' data-i18n="streak">Streak<'),
    ('>Daily Inspiration<', ' data-i18n="insp">Daily Inspiration<'),
    (">Today's Tasks<", " data-i18n=\"todayTasks\">Today's Tasks<"),
    (">Your slate is clean!<", ' data-i18n="clean">Your slate is clean!<'),
]
for o, n in replacements:
    html = html.replace(o, n)

html = html.replace('>Add tasks for tomorrow in the <strong>Files → Tomorrow</strong> tab.<', ' data-i18n="help">Add tasks for tomorrow in the Files → Tomorrow tab.<')

# 7. Greeting injection
greeting_func = """function updateGreeting() {
      const h = new Date().getHours();
      let g = t('morning');
      if (h >= 12 && h < 17) g = t('afternoon');
      else if (h >= 17 && h < 21) g = t('evening');
      else if (h >= 21 || h < 5) g = t('night');
      const greetingEl = document.getElementById('header-greeting');
      if(greetingEl) greetingEl.innerText = `${g}, ${AppConfig.nickname}!`;
      const descEl = document.getElementById('header-desc');
      if(descEl) descEl.innerText = t('plan');
    }"""
html = html.replace('window.addEventListener(\'pywebviewready\'', greeting_func + '\n    window.addEventListener(\'pywebviewready\'')
html = html.replace('document.getElementById(\'header-greeting\').innerText = `${g}, ${AppConfig.nickname}!`;', 'updateGreeting();')


with open('ui/mac_fallback.html', 'w', encoding='utf-8') as f:
    f.write(html)
