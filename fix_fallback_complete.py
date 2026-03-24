import re

with open('ui/mac_fallback.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Background fix for settings
html = html.replace('.dashboard-side-card {', '.dashboard-side-card, .settings-card {')
html = html.replace(
    '.settings-card {\n      padding: 18px;\n      border-radius: 22px;\n      background: var(--panel-strong);\n      border: 1px solid var(--line);\n    }',
    '.settings-card { padding: 32px; border-radius: 24px; background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow); }'
)
if "box-sizing: border-box; }\n    .form-group" not in html:
    html = html.replace('box-sizing: border-box; }', 'box-sizing: border-box; }\n    .form-group { margin-bottom: 24px; }\n    .form-group label { display: block; margin-bottom: 8px; font-weight: 700; color: var(--text-primary); font-size: 15px; }\n    .form-group select, .form-group input { width: 100%; padding: 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--input-bg); color: var(--text-primary); font-size: 15px; font-weight: 600; }\n    .settings-heading { font-size: 26px; font-weight: 800; margin-bottom: 8px; }')

# 2. Add language array and dicts
js_injection = """
const i18n = {
  ko: { dash: '대시보드', tasks: '할 일', files: '파일', settings: '설정', total: '전체 할 일', comp: '달성함', remain: '남은 일정', noTask: '오늘 일정 없음', markComplete: '완료하기', markDone: '오늘 완료!', todayTasks: '오늘의 할 일', clean: '일정이 비어있습니다!', help: '새로운 일정은 파일 → 내일 탭에서 추가해 주세요.', prog: '오늘의 진행률', streak: '연속 달성일', insp: '오늘의 한 마디', theme: '화면 테마', lang: '언어 (Language)', save: '설정 저장', saving: '저장 중...', profile: '이름 (프로필)', morning: '좋은 아침입니다', afternoon: '좋은 오후입니다', evening: '좋은 저녁입니다', night: '평안한 밤 되세요', plan: '오늘 계획하신 일정입니다.', done: '완료', targetTimes: '알림 목표 시간', targetTimesHelper: '앱이 화면에 알림을 표시할 기준 시간입니다.',
        dashOverview: '오늘의 요약', dashOverviewCopy: '오늘의 할 일 달성률과 남은 항목을 한눈에 확인하세요.', dashFiles: '오늘의 타스크 파일', dashFilesCopy: '추가된 각 파일 내의 체크리스트 진척도를 보여줍니다.', targetInfo: '목표 설정 시간: ', todayFiles: '오늘의 파일', todayFilesCopy: '오늘 진행 예정인 파일들',
        tasksTitle: '할 일 체크리스트', tasksCopy: '체크박스를 클릭하여 오늘 진행 상황을 체크하세요!',
        filesTmlTitle: '내일의 할 일', filesTmlCopy: '여기에 추가된 파일은 내일 날짜로 자동으로 넘어갑니다.', filesTmlEmpty: '내일 일정이 없습니다.', filesHisTitle: '지난 작업 기록', filesHisCopy: '이전 날짜별로 완료된 작업 기록을 확인할 수 있습니다.', filesHisEmpty: '기록이 없습니다.', filesTodTitle: '오늘의 일정', filesTodCopy: '오늘 진행 중인 파일들입니다.', filesTodEmpty: '파일이 없습니다.',
        dropTitle: '.md 파일을 여기로 드래그 앤 드롭 하세요', dropCopy: '또는 여기를 클릭해서 직접 추가할 수 있습니다.'
  },
  en: { dash: 'Dashboard', tasks: 'Tasks', files: 'Files', settings: 'Settings', total: 'Total Tasks', comp: 'Completed', remain: 'Remaining', noTask: 'No tasks today', markComplete: 'Mark Today Complete', markDone: 'Today Marked!', todayTasks: 'Today\\'s Tasks', clean: 'Your slate is clean!', help: 'Add tasks for tomorrow in the Files → Tomorrow tab.', prog: 'Today\\'s Progress', streak: 'Streak', insp: 'Daily Inspiration', theme: 'Appearance', lang: 'Language', save: 'Save Settings', saving: 'Saving...', profile: 'Profile (Name)', morning: 'Good Morning', afternoon: 'Good Afternoon', evening: 'Good Evening', night: 'Good Night', plan: 'Here\\'s what you have planned for today.', done: 'done', targetTimes: 'Target Times', targetTimesHelper: 'App will display tasks automatically after these times.',
        dashOverview: 'Daily Overview', dashOverviewCopy: 'A quick snapshot of today\\'s completion progress.', dashFiles: 'Today\\'s Task Files', dashFilesCopy: 'Shows checklist progress inside each of your scheduled task files.', targetInfo: 'Target times: ', todayFiles: 'Today files', todayFilesCopy: 'Files scheduled for today',
        tasksTitle: 'Tasks', tasksCopy: 'Toggle checklist items just like the existing app.',
        filesTmlTitle: 'Tasks for Tomorrow', filesTmlCopy: 'Files added here will automatically move to \\'Today\\' on the next calendar day.', filesTmlEmpty: 'No files.', filesHisTitle: 'Task History', filesHisCopy: 'Past tasks are grouped by date so you can review previous plans.', filesHisEmpty: 'No history yet.', filesTodTitle: 'Tasks for Today', filesTodCopy: 'Current active tasks. You can also add extra files directly to today.', filesTodEmpty: 'No files.',
        dropTitle: 'Drag and drop .md files here', dropCopy: 'Or click to add a file directly'
  },
  jp: { dash: 'ダッシュボード', tasks: 'タスク', files: 'ファイル', settings: '設定', total: '全タスク', comp: '完了', remain: '残り', noTask: '今日の予定なし', markComplete: '今日を完了にする', markDone: '今日完了！', todayTasks: '今日のタスク', clean: '予定はありません！', help: '明日のタスクはファイル → 明日タブで追加してください。', prog: '今日の進捗', streak: '連続達成日数', insp: '今日の一言', theme: 'テーマ', lang: '言語 (Language)', save: '設定を保存', saving: '保存中...', profile: 'プロフィール', morning: 'おはようございます', afternoon: 'こんにちは', evening: 'こんばんは', night: 'おやすみなさい', plan: '今日の予定はこちらです。', done: '完了', targetTimes: '目標時間', targetTimesHelper: 'この時間以降にタスクが自動で表示されます。',
        dashOverview: '今日の概要', dashOverviewCopy: '今日のタスク完了状況のスナップショット。', dashFiles: '今日のタスクファイル', dashFilesCopy: 'スケジュールされた各タスクファイル内の進捗を表示します。', targetInfo: '設定時間: ', todayFiles: '今日のファイル', todayFilesCopy: '今日のファイル数',
        tasksTitle: 'タスク', tasksCopy: 'チェックボックスをクリックして進行状況を管理！',
        filesTmlTitle: '明日のタスク', filesTmlCopy: 'ここに追加されたファイルは翌日に「今日」へ移動します。', filesTmlEmpty: 'ファイルなし。', filesHisTitle: 'タスク履歴', filesHisCopy: '日付ごとにグループ化された過去のタスク。', filesHisEmpty: '履歴なし。', filesTodTitle: '今日のタスク', filesTodCopy: '現在進行中のタスク。直接追加も可能です。', filesTodEmpty: 'ファイルなし。',
        dropTitle: '.mdファイルをここにドラッグ＆ドロップ', dropCopy: 'またはクリックしてファイルを追加'
  }
};
let currentLang = 'ko';
function t(key) { return i18n[currentLang][key] || key; }

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.innerText = t(el.getAttribute('data-i18n'));
  });
  if(typeof renderStats === 'function') renderStats();
  if(typeof renderFiles === 'function') renderFiles();
  if(typeof updateGreeting === 'function') updateGreeting();
  const btn = document.getElementById('save-settings');
  if(btn) btn.innerText = t('save');
}
"""

if "const i18n =" not in html:
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
if "currentLang = config.language" not in html:
    # Need to find the exact place to hook. Let's hook into window.addEventListener("pywebviewready") -> initialization
    html = html.replace(
      'state.config = parsed;',
      'state.config = parsed;\n' + init_theme_patch
    )

# 4. Inject Language Selector UI
lang_html = """
            <section class="settings-group form-group">
              <h2 class="settings-heading" data-i18n="lang">Language</h2>
              <select class="settings-theme-select" id="settings-language">
                <option value="ko">한국어</option>
                <option value="en">English</option>
                <option value="jp">日本語</option>
              </select>
            </section>
"""
if "settings-language" not in html:
    html = html.replace(
        '</select>\n            </section>',
        '</select>\n            </section>\n' + lang_html
    )

# Wrap settings sections in .settings-card for background styling
if '<div class="settings-card">' not in html:
    html = html.replace('<div class="settings-panel">', '<div class="settings-panel"><div class="settings-card" style="max-width:600px; margin:0 auto;">')
    html = html.replace('</div>\n        </div>\n      </section>\n    </main>', '</div></div>\n        </div>\n      </section>\n    </main>')

# 5. Fix collectTimes target bug!
html = html.replace('document.querySelectorAll(".time-row")', 'document.querySelectorAll(".settings-time-row")')

# 6. Apply data-i18n to hardcoded HTML text dynamically!
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
    ('>Profile<', ' data-i18n="profile">Profile<'),
    ('>Appearance<', ' data-i18n="theme">Appearance<'),
    ('>Target Times<', ' data-i18n="targetTimes">Target Times<'),
    ('Save Settings<', 'Save Settings<'),
    (">Daily Overview<", ' data-i18n="dashOverview">Daily Overview<'),
    (">A quick snapshot of today's completion progress.<", " data-i18n=\"dashOverviewCopy\">A quick snapshot of today's completion progress.<"),
    (">Today's Task Files<", " data-i18n=\"dashFiles\">Today's Task Files<"),
    (">The same structure as the original dashboard, optimized for macOS fallback mode.<", ' data-i18n="dashFilesCopy">The same structure as the original dashboard, optimized for macOS fallback mode.<'),
    (">Here is what you have planned for today.<", ' data-i18n="plan">Here is what you have planned for today.<'),
    ('<h2 class="section-title">Tasks</h2>', '<h2 class="section-title" data-i18n="tasksTitle">Tasks</h2>'),
    ('<p class="section-copy">Toggle checklist items just like the existing app.</p>', '<p class="section-copy" data-i18n="tasksCopy">Toggle checklist items just like the existing app.</p>'),
]
for o, n in replacements:
    html = html.replace(o, n)

html = html.replace('>App will display tasks automatically after these times. Click the time row and adjust hour, minute, and AM/PM below it.<', ' data-i18n="targetTimesHelper">App will display tasks automatically after these times. Click the time row and adjust hour, minute, and AM/PM below it.<')

# 7. Add language save to existing saveSettings
if 'language: $id("settings-language").value' not in html:
    html = html.replace(
        'theme: $id("settings-theme").value,',
        'theme: $id("settings-theme").value,\n        language: $id("settings-language").value,'
    )
    html = html.replace(
        'applyTheme(nextConfig.theme);',
        'applyTheme(nextConfig.theme);\n        currentLang = nextConfig.language;\n        applyTranslations();'
    )

# 8. Greeting injection removed as it's directly implemented in HTML now.

# 9. Modify getFilesMeta to use t()
getFilesMeta_patch = """function getFilesMeta() {
      if (state.activeFilesTab === "tomorrow") {
        return {
          title: t('filesTmlTitle'),
          copy: t('filesTmlCopy'),
          empty: t('filesTmlEmpty'),
          dropTitle: t('dropTitle'),
          dropCopy: t('dropCopy'),
        };
      }
      if (state.activeFilesTab === "yesterday") {
        return {
          title: t('filesHisTitle'),
          copy: t('filesHisCopy'),
          empty: t('filesHisEmpty'),
          dropTitle: "",
          dropCopy: "",
        };
      }
      return {
        title: t('filesTodTitle'),
        copy: t('filesTodCopy'),
        empty: t('filesTodEmpty'),
        dropTitle: t('dropTitle'),
        dropCopy: t('dropCopy'),
      };
    }"""
if 'function getFilesMeta() {' in html:
    # Use re.sub to replace the original function completely
    html = re.sub(r'function getFilesMeta\(\).*?return \{.*?\};\n    \}', getFilesMeta_patch, html, flags=re.DOTALL)

# 10. Update renderStats bindings
if 'label: "Today files"' in html:
    html = html.replace('label: "Today files"', 'label: t("todayFiles")')
    html = html.replace('sub: "Files scheduled for today"', 'sub: t("todayFilesCopy")')
    html = html.replace('label: "Completion"', 'label: t("comp")')
    html = html.replace('label: "Streak"', 'label: t("streak")')
    html = html.replace('sub: "Days fully completed"', 'sub: ""')

if 'Update top pill' not in html:
    html = html.replace('`Wake times: ${times}`', "`${t('targetInfo')}: ${times}`")

with open('ui/mac_fallback.html', 'w', encoding='utf-8') as f:
    f.write(html)
